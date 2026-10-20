import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ClipboardCheck, PackageOpen, Receipt, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";

type CaseType="cancellation"|"exchange"|"return";
type CaseStatus="open"|"in_review"|"approved"|"rejected"|"closed";
export type StoreSoldLine={lineKey:string;title:string;quantity:number};
type ReceiptRow={
 id:string;line_key:string;product_name:string;quantity:number;
 inspection_status:"pending"|"inspected";condition:string|null;
 restocked_quantity:number;inspection_note:string|null;received_at:string;inspected_at:string|null;
};
type RefundRow={
 id:string;amount:number;provider:string;provider_reference:string;
 refunded_at:string;created_at:string;notes:string|null;
};
const field="min-h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
const conditionLabels={
 sealed:"Lacrado e em boas condições",open:"Aberto, mas em boas condições",
 damaged:"Danificado",defective:"Com defeito",
};
type Condition=keyof typeof conditionLabels;

function InspectedReceipt({receipt,canRestock,onSaved}:{
 receipt:ReceiptRow;canRestock:boolean;onSaved:()=>Promise<void>;
}){
 const [condition,setCondition]=useState<Condition>("open");
 const [restock,setRestock]=useState(0);
 const [note,setNote]=useState("");
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const submit=async(e:FormEvent)=>{
  e.preventDefault();
  if(saving||!canRestock||note.trim().length<10)return;
  setError("");setSaving(true);
  const {error:issue}=await supabase.rpc("artvideo_store_inspect_return_v1",{
   p_receipt_id:receipt.id,p_condition:condition,
   p_restock_quantity:restock,p_note:note.trim(),
  });
  if(issue)setError(systemErrorMessage(issue));
  else await onSaved();
  setSaving(false);
 };
 if(receipt.inspection_status==="inspected")return <div className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs">
  <p className="font-bold text-emerald-700 dark:text-emerald-300">Inspeção registrada</p>
  <p className="mt-1 text-muted-foreground">Estado: {conditionLabels[(receipt.condition||"open") as Condition]||receipt.condition}
    {" · "}Devolvidas ao estoque: <strong>{receipt.restocked_quantity} de {receipt.quantity}</strong></p>
  {receipt.inspection_note&&<p className="mt-1 whitespace-pre-wrap">{receipt.inspection_note}</p>}
  {receipt.inspected_at&&<p className="mt-1 text-muted-foreground">{new Date(receipt.inspected_at).toLocaleString("pt-BR")}</p>}
 </div>;
 if(!canRestock)return <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
  Aguardando avaliação por usuário com permissão de movimentações do estoque.
 </p>;
 const canAddStock=condition==="sealed"||condition==="open";
 return <form onSubmit={e=>void submit(e)} className="mt-3 space-y-3 rounded-md border border-border bg-muted/20 p-3">
  <h5 className="text-xs font-bold">Avaliar produto recebido</h5>
  <label className="block text-xs font-bold">Condição do produto
   <select className={field+" mt-1.5"} value={condition} onChange={e=>{
      const next=e.target.value as Condition;setCondition(next);
      if(next==="damaged"||next==="defective")setRestock(0);
    }}>
    {Object.entries(conditionLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
   </select>
  </label>
  <label className="block text-xs font-bold">Unidades aptas a voltar ao estoque
   <input className={field+" mt-1.5"} type="number" min={0} max={canAddStock?receipt.quantity:0}
    step={1} value={canAddStock?restock:0} disabled={!canAddStock}
    onChange={e=>setRestock(Math.min(receipt.quantity,Math.max(0,Number(e.target.value)||0)))}/>
  </label>
  {!canAddStock&&<p className="text-xs text-amber-700 dark:text-amber-300">
   Itens danificados ou defeituosos não voltam ao estoque disponível.
  </p>}
  <label className="block text-xs font-bold">Laudo / observação da avaliação *
   <textarea className={field+" mt-1.5 min-h-24 resize-y"} value={note} maxLength={1000} minLength={10}
    required onChange={e=>setNote(e.target.value)}
    placeholder="Descreva o estado físico, os testes realizados e o destino do produto."/>
  </label>
  <p className="text-[11px] text-muted-foreground">
   {restock>0?"Ao confirmar, essas unidades serão adicionadas ao estoque e a entrada será registrada no histórico.":"A avaliação será salva sem entrada no estoque."}
   {" "}Esta decisão não pode ser repetida para o mesmo recebimento.
  </p>
  {error&&<p role="alert" className="text-xs text-red-600">{error}</p>}
  <button type="submit" disabled={saving||note.trim().length<10}
   className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
   {saving?"Salvando avaliação...":"Concluir avaliação"}
  </button>
 </form>;
}

export function StoreReturnOperations({caseId,caseType,caseStatus,items,canManage,orderTotal,onChange}:{
 caseId:string;caseType:CaseType;caseStatus:CaseStatus;
 items:StoreSoldLine[];canManage:boolean;orderTotal:number;
 onChange?:()=>void;
}){
 const {hasPermission}=useAuth();
 const canRestock=canManage&&hasPermission("inventory.movements.create");
 const [receipts,setReceipts]=useState<ReceiptRow[]>([]);
 const [refunds,setRefunds]=useState<RefundRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [feedback,setFeedback]=useState("");
 const [receiving,setReceiving]=useState(false);
 const [line,setLine]=useState(items[0]?.lineKey||"");
 const [quantity,setQuantity]=useState(1);
 const [refundMode,setRefundMode]=useState(false);
 const [amount,setAmount]=useState("");
 const [provider,setProvider]=useState<"getpay_link"|"getnet_checkout"|"mercado_pago"|"other">("other");
 const [reference,setReference]=useState("");
 const [date,setDate]=useState("");
 const [notes,setNotes]=useState("");
 const [confirmed,setConfirmed]=useState(false);
 const [saving,setSaving]=useState(false);
 const refresh=useCallback(async()=>{
   setLoading(true);setError("");
   const [rr,rf]=await Promise.all([
    supabase.from("artvideo_store_return_receipts")
     .select("id,line_key,product_name,quantity,inspection_status,condition,restocked_quantity,inspection_note,received_at,inspected_at")
     .eq("case_id",caseId).order("received_at",{ascending:true}),
    supabase.from("artvideo_store_refund_records")
     .select("id,amount,provider,provider_reference,refunded_at,created_at,notes")
     .eq("case_id",caseId).order("created_at",{ascending:false}),
   ]);
   if(rr.error||rf.error)setError(systemErrorMessage(rr.error||rf.error));
   else {setReceipts((rr.data||[]) as ReceiptRow[]);setRefunds((rf.data||[]) as RefundRow[]);}
   setLoading(false);
 },[caseId]);
 useEffect(()=>{void refresh();},[refresh]);

 const selectedLine=items.find(item=>item.lineKey===line)||items[0];
 const available=items.filter(item=>!receipts.some(r=>r.line_key===item.lineKey));
 const isPhysical=caseType==="exchange"||caseType==="return";
 const totalRefunded=refunds.reduce((v,r)=>v+Number(r.amount),0);
 const receive=async(e:FormEvent)=>{
  e.preventDefault();if(!canManage||saving||!selectedLine||quantity<1)return;
  setSaving(true);setError("");setFeedback("");
  const {error:issue}=await supabase.rpc("artvideo_store_receive_return_v1",{
    p_case_id:caseId,p_line_key:line,p_quantity:quantity,
  });
  if(issue)setError(systemErrorMessage(issue));
  else{setReceiving(false);setFeedback("Produto recebido. Agora registre a avaliação.");await refresh();onChange?.();}
  setSaving(false);
 };
 const saveRefund=async(e:FormEvent)=>{
  e.preventDefault();
  const value=Number(amount.replace(",","."));
  if(!canManage||saving||!confirmed||!Number.isFinite(value)||value<=0||!date)return;
  setError("");setFeedback("");setSaving(true);
  const iso=new Date(date).toISOString();
  const {error:issue}=await supabase.rpc("artvideo_store_record_refund_v1",{
    p_case_id:caseId,p_amount:value,p_provider:provider,
    p_reference:reference.trim(),p_refunded_at:iso,p_notes:notes.trim()||null,
  });
  if(issue)setError(systemErrorMessage(issue));
  else{
   setFeedback("Comprovante de reembolso registrado. Nenhuma cobrança ou estorno foi executado no sistema.");
   setRefundMode(false);setAmount("");setReference("");setDate("");setNotes("");setConfirmed(false);
   await refresh();onChange?.();
  }
  setSaving(false);
 };
 return <div className="mt-4 space-y-3 border-t border-border pt-4">
  <h4 className="flex items-center gap-2 text-xs font-extrabold"><ClipboardCheck size={17} className="text-primary"/> Operação do pós-venda</h4>
  {error&&<p role="alert" className="rounded-md bg-red-500/5 p-3 text-xs text-red-600">{error}</p>}
  {feedback&&<p role="status" className="rounded-md bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</p>}
  {loading?<p className="text-xs text-muted-foreground">Carregando os registros da operação...</p>:<>
   {isPhysical&&<section className="space-y-3 rounded-md bg-muted/30 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <h5 className="flex items-center gap-2 text-xs font-bold"><PackageOpen size={16}/> Recebimento e avaliação</h5>
     {caseStatus==="approved"&&canManage&&available.length>0&&!receiving&&<button type="button"
      onClick={()=>{setReceiving(true);setLine(available[0].lineKey);setQuantity(1);}}
      className="rounded-md border border-primary/30 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10">Receber produto</button>}
    </div>
    {!receipts.length&&<p className="text-xs text-muted-foreground">
     Nenhum produto devolvido foi recebido nesta solicitação.
    </p>}
    {receipts.map(receipt=><div key={receipt.id} className="rounded-md border border-border bg-background p-3">
      <p className="text-xs font-bold">{receipt.product_name}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
       Recebido: {receipt.quantity} un. · {new Date(receipt.received_at).toLocaleString("pt-BR")}
      </p>
      <InspectedReceipt receipt={receipt} canRestock={canRestock}
        onSaved={async()=>{setFeedback("Inspeção concluída e movimentação de estoque registrada quando aplicável.");await refresh();onChange?.();}}/>
    </div>)}
    {receiving&&caseStatus==="approved"&&<form onSubmit={e=>void receive(e)}
      className="space-y-3 rounded-md border border-border bg-background p-3">
      <label className="block text-xs font-bold">Produto da compra *
       <select className={field+" mt-1.5"} value={line} onChange={e=>{setLine(e.target.value);setQuantity(1);}}>
        {available.map(item=><option key={item.lineKey} value={item.lineKey}>{item.title} — vendido: {item.quantity} un.</option>)}
       </select>
      </label>
      <label className="block text-xs font-bold">Quantidade física recebida *
       <input type="number" min={1} max={selectedLine?.quantity||1} step={1}
        className={field+" mt-1.5"} value={quantity}
        onChange={e=>setQuantity(Math.max(1,Math.min(selectedLine?.quantity||1,Number(e.target.value)||1)))}/>
      </label>
      <p className="text-[11px] text-muted-foreground">
       O recebimento não devolve a mercadoria ao estoque. Ela precisará ser avaliada primeiro.
      </p>
      <div className="flex gap-2">
       <button type="submit" disabled={saving||!selectedLine} className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">{saving?"Salvando...":"Confirmar recebimento"}</button>
       <AdminButton variant="secondary" size="sm" onClick={()=>setReceiving(false)} disabled={saving}>Voltar</AdminButton>
      </div>
     </form>}
    {caseStatus==="approved"&&receipts.some(r=>r.inspection_status==="pending")&&
      <p className="text-[11px] text-amber-700 dark:text-amber-300">
       Existe produto aguardando inspeção. O atendimento não poderá ser concluído até a avaliação.
      </p>}
   </section>}

   <section className="space-y-3 rounded-md bg-muted/30 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
     <h5 className="flex items-center gap-2 text-xs font-bold"><Receipt size={16}/> Reembolsos confirmados</h5>
     {canManage&&["approved","closed"].includes(caseStatus)&&totalRefunded<orderTotal&&!refundMode&&
       <button type="button" onClick={()=>setRefundMode(true)}
        className="rounded-md border border-primary/30 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10">
        Registrar reembolso
       </button>}
    </div>
    {refunds.length?refunds.map(refund=><div key={refund.id} className="rounded-md border border-border bg-background p-3">
      <div className="flex flex-wrap justify-between gap-2 text-xs">
        <strong className="text-emerald-700 dark:text-emerald-300">{formatCurrency(refund.amount)}</strong>
        <span className="text-muted-foreground">{new Date(refund.refunded_at).toLocaleString("pt-BR")}</span>
      </div>
      <p className="mt-1 break-all text-[11px] text-muted-foreground">
       {({getpay_link:"GetPay",getnet_checkout:"Getnet Checkout",mercado_pago:"Mercado Pago (histórico)",other:"Outro provedor"} as Record<string,string>)[refund.provider]||refund.provider} · Comprovante {refund.provider_reference}
      </p>
      {refund.notes&&<p className="mt-1 whitespace-pre-wrap text-xs">{refund.notes}</p>}
    </div>):<p className="text-xs text-muted-foreground">Nenhum reembolso confirmado foi registrado neste atendimento.</p>}
    {refundMode&&<form onSubmit={e=>void saveRefund(e)} className="space-y-3 rounded-md border border-border bg-background p-3">
      <p className="flex items-start gap-2 rounded-md bg-amber-500/5 p-2 text-[11px] text-amber-700 dark:text-amber-300">
       <ShieldAlert size={16} className="shrink-0"/>
       Registre somente depois de confirmar que o estorno já ocorreu no provedor. Esta tela não realiza reembolsos.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
       <label className="block text-xs font-bold">Valor efetivamente reembolsado (R$) *
        <input type="text" inputMode="decimal" className={field+" mt-1.5"} required
         value={amount} onChange={e=>setAmount(e.target.value.replace(/[^0-9.,]/g,""))} placeholder="0,00"/>
       </label>
       <label className="block text-xs font-bold">Provedor
        <select value={provider} className={field+" mt-1.5"} onChange={e=>setProvider(e.target.value as "getpay_link"|"getnet_checkout"|"mercado_pago"|"other")}>
         <option value="getpay_link">GetPay</option>
          <option value="getnet_checkout">Getnet Checkout</option>
          <option value="other">Outro provedor</option>
          <option value="mercado_pago">Mercado Pago (histórico)</option>
        </select>
       </label>
       <label className="block text-xs font-bold">Referência de reembolso do provedor *
        <input type="text" className={field+" mt-1.5"} required minLength={6} maxLength={160}
         value={reference} onChange={e=>setReference(e.target.value)}
         placeholder="ID da transação de estorno"/>
       </label>
       <label className="block text-xs font-bold">Data e hora da confirmação *
        <input type="datetime-local" className={field+" mt-1.5"} required value={date}
         onChange={e=>setDate(e.target.value)}/>
       </label>
      </div>
      <label className="block text-xs font-bold">Observações (opcional)
       <textarea className={field+" mt-1.5 min-h-20 resize-y"} maxLength={1000}
        value={notes} onChange={e=>setNotes(e.target.value)}/>
      </label>
      <label className="flex cursor-pointer items-start gap-2 text-xs">
       <input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-blue-600"/>
       Confirmei o reembolso no provedor e conferi o valor e a referência.
      </label>
      <p className="text-[11px] text-muted-foreground">Valor total desta compra: {formatCurrency(orderTotal)}. O servidor impede registros que ultrapassem o valor original do pedido.</p>
      <div className="flex gap-2">
       <button type="submit" disabled={saving||!confirmed||!amount||reference.trim().length<6||!date}
        className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
         {saving?"Registrando...":"Salvar comprovante"}
       </button>
       <AdminButton variant="secondary" size="sm" disabled={saving} onClick={()=>setRefundMode(false)}>Voltar</AdminButton>
      </div>
     </form>}
   </section>
  </>}
 </div>;
}
