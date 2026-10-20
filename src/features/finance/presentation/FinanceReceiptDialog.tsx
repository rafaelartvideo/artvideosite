import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Printer, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FSelect, FTextarea, FCurrencyInput } from "@/shared/ui/admin/AdminFormControls";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { printGeneralFinancialReceipt, type GeneralReceiptA4 } from "@/features/pdv/domain/pdv-a4-receipt";

type ReceiptDirection = "received" | "paid";
type ReceiptItem = { description: string; quantity: string; unit_price: string };
type Registration = { id:string; name:string; document:string|null };
type OrderRecord = { id:string; os_number:string };

export function FinanceReceiptDialog({ open, onClose }: {open:boolean; onClose:()=>void}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const [direction,setDirection] = useState<ReceiptDirection>("received");
  const [registrationKind,setRegistrationKind] = useState<"entity"|"employee">("entity");
  const [registrationSearch,setRegistrationSearch] = useState("");
  const [registrationId,setRegistrationId] = useState("");
  const [osSearch,setOsSearch] = useState("");
  const [orderId,setOrderId] = useState("");
  const [entryId,setEntryId] = useState("");
  const [description,setDescription] = useState("");
  const [items,setItems] = useState<ReceiptItem[]>([{description:"",quantity:"1",unit_price:""}]);
  const [paymentMethod,setPaymentMethod] = useState("");
  const [notes,setNotes] = useState("");
  const [saving,setSaving] = useState(false);
  const [lastReceipt,setLastReceipt] = useState<GeneralReceiptA4|null>(null);
  const [error,setError] = useState("");

  const canIssue = hasPermission(direction === "received" ? "finance.receivables.create" : "finance.payables.create");
  const registrationsQuery = useQuery({
    queryKey: ["finance","receipt","registrations",organizationId,registrationKind,registrationSearch],
    enabled: open && Boolean(organizationId),
    queryFn: async (): Promise<Registration[]> => {
      const term = registrationSearch.trim().replaceAll("%","");
      if (registrationKind === "employee") {
        let query = supabase.from("employees").select("id,full_name,cpf").eq("organization_id",organizationId).eq("is_active",true).order("full_name").limit(40);
        if (term) query = query.ilike("full_name",`%${term}%`);
        const {data,error}=await query;
        if(error) throw error;
        return (data||[]).map(item=>({id:item.id,name:item.full_name||"Sem nome",document:item.cpf||null}));
      }
      let query = supabase.from("entities").select("id,name,trade_name,document").eq("organization_id",organizationId).eq("is_active",true).order("name").limit(40);
      if(term) query = query.or(`name.ilike.%${term}%,trade_name.ilike.%${term}%,document.ilike.%${term}%`);
      const {data,error}=await query;
      if(error) throw error;
      return (data||[]).map(item=>({id:item.id,name:item.trade_name||item.name||"Sem nome",document:item.document||null}));
    },
  });
  const ordersQuery = useQuery({
    queryKey: ["finance","receipt","orders",organizationId,osSearch],
    enabled: open && Boolean(organizationId),
    queryFn: async (): Promise<OrderRecord[]> => {
      let query = supabase.from("service_orders").select("id,os_number").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(30);
      if (osSearch.trim()) query=query.ilike("os_number",`%${osSearch.trim().replaceAll("%","")}%`);
      const {data,error}=await query;
      if(error) throw error;
      return (data||[]).map(item=>({id:item.id,os_number:item.os_number||""}));
    },
  });
  const entriesQuery = useQuery({
    queryKey: ["finance","receipt","entries",organizationId,direction],
    enabled: open && Boolean(organizationId),
    queryFn: async () => {
      const {data,error}=await supabase.from("financial_entries").select("id,description,original_amount").eq("organization_id",organizationId).eq("entry_type",direction==="received"?"receivable":"payable").order("created_at",{ascending:false}).limit(30);
      if(error) throw error;
      return data||[];
    },
  });
  const issuedQuery = useQuery({
    queryKey: ["finance","receipt","issued",organizationId],
    enabled: open && Boolean(organizationId),
    queryFn: async () => {
      const {data,error}=await supabase.from("financial_receipts").select("*").eq("organization_id",organizationId).order("issued_at",{ascending:false}).limit(10);
      if(error) throw error;
      return data||[];
    },
  });
  const total = useMemo(()=>Math.round(items.reduce((sum,item)=>sum+Math.round(Number(item.quantity||0)*Number(item.unit_price||0)*100)/100,0)*100)/100,[items]);
  const registration = registrationsQuery.data?.find(item=>item.id===registrationId);
  const order = ordersQuery.data?.find(item=>item.id===orderId);
  const updateItem = (index:number,change:Partial<ReceiptItem>) => setItems(current=>current.map((item,i)=>i===index?{...item,...change}:item));
  const reset = () => {
    setRegistrationId(""); setRegistrationSearch(""); setOrderId(""); setOsSearch(""); setEntryId("");
    setDescription(""); setItems([{description:"",quantity:"1",unit_price:""}]); setPaymentMethod("");setNotes("");setError("");
  };
  const close = () => { if (!saving) {reset();onClose();} };

  const issue = async () => {
    setError("");
    if(!canIssue) {setError("Você não tem permissão para emitir este recibo.");return;}
    if(!registrationId) {setError("Selecione um cadastro ou funcionário.");return;}
    if(!description.trim()) {setError("Informe o motivo do recibo.");return;}
    if(items.some(item=>item.description.trim().length<2 || !Number.isFinite(Number(item.quantity)) || Number(item.quantity)<=0 || !Number.isFinite(Number(item.unit_price)) || Number(item.unit_price)<=0) || total<=0) {
      setError("Informe itens com descrição, quantidade e valores válidos.");return;
    }
    // Reserva a janela no clique do usuário; abrir depois de aguardar o Supabase seria bloqueado pelo navegador.
    const printWindow = window.open("", "_blank", "width=960,height=830");
    setSaving(true);
    try {
      const {data,error:rpcError}=await supabase.rpc("issue_financial_receipt_v1",{
        p_organization_id:organizationId,
        p_payload:{
          direction,entity_id:registrationKind==="entity"?registrationId:null,
          employee_id:registrationKind==="employee"?registrationId:null,
          service_order_id:orderId||null,financial_entry_id:entryId||null,
          description:description.trim(),payment_method_name:paymentMethod.trim()||null,
          notes:notes.trim()||null,
          items:items.map(item=>({description:item.description.trim(),quantity:Number(item.quantity),unit_price:Number(item.unit_price)})),
        },
      });
      if(rpcError)throw rpcError;
      const receipt={...(data as GeneralReceiptA4),service_order_number:order?.os_number||null};
      setLastReceipt(receipt);
      void queryClient.invalidateQueries({queryKey:["finance","receipt","issued",organizationId]});
      notifyAdmin("Recibo emitido e registrado com sucesso.","success");
      try {printGeneralFinancialReceipt(receipt,printWindow);} catch (printError) {
        notifyAdmin(systemErrorMessage(printError,"Recibo emitido. Use Imprimir novamente."),"error");
      }
      reset();
    } catch(err) { try { printWindow?.close(); } catch { /* Ignora bloqueio do navegador */ } setError(systemErrorMessage(err,"Não foi possível emitir o recibo."));}
    finally {setSaving(false);}
  };

  if(!open)return null;
  return <AdminDialog
    open onClose={close} title="Gerar recibo" description="Recibo não fiscal, independente de caixa e PDV."
    className="max-w-4xl"
    footer={<div className="flex flex-wrap justify-end gap-2">
      <AdminButton variant="secondary" onClick={close} disabled={saving}>Fechar</AdminButton>
      {lastReceipt && <AdminButton variant="secondary" onClick={()=>printGeneralFinancialReceipt(lastReceipt)}><Printer size={15}/> Reimprimir último</AdminButton>}
      <AdminButton onClick={issue} loading={saving} disabled={!canIssue} loadingText="Emitindo..."><Printer size={15}/> Emitir recibo</AdminButton>
    </div>}>
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <FSelect label="Tipo de recibo" required value={direction} options={[{value:"received",label:"Valor recebido pela empresa"},{value:"paid",label:"Valor pago pela empresa"}]}
          onChange={(event:any)=>{setDirection(event.target.value);setEntryId("");}} />
        <FSelect label="Vincular a" required value={registrationKind} options={[{value:"entity",label:"Cadastro (cliente / fornecedor / parceiro)"},{value:"employee",label:"Funcionário"}]}
          onChange={(event:any)=>{setRegistrationKind(event.target.value);setRegistrationId("");setRegistrationSearch("");}}/>
        <FInput label="Buscar cadastro" value={registrationSearch} placeholder={registrationKind==="employee"?"Nome do funcionário":"Nome ou CPF/CNPJ"} onChange={(event:any)=>{setRegistrationSearch(event.target.value);setRegistrationId("");}}/>
        <FSelect label={registrationsQuery.isFetching?"Buscando...":"Pessoa vinculada"} required value={registrationId}
          options={[{value:"",label:"Selecione o cadastro"},...(registrationsQuery.data||[]).map(item=>({value:item.id,label:item.document?`${item.name} · ${item.document}`:item.name}))]}
          onChange={(event:any)=>setRegistrationId(event.target.value)}/>
        <FInput label="Buscar OS (opcional)" value={osSearch} placeholder="Número da OS" onChange={(event:any)=>{setOsSearch(event.target.value);setOrderId("");}}/>
        <FSelect label="Ordem de serviço" value={orderId} options={[{value:"",label:"Sem OS vinculada"},...(ordersQuery.data||[]).map(item=>({value:item.id,label:`OS ${item.os_number}`}))]} onChange={(event:any)=>setOrderId(event.target.value)}/>
        <div className="sm:col-span-2"><FSelect label="Lançamento financeiro (opcional)" value={entryId}
          options={[{value:"",label:"Recibo avulso, sem título vinculado"},...(entriesQuery.data||[]).map(item=>({value:item.id,label:`${item.description} · ${formatCurrency(item.original_amount)}`}))]}
          onChange={(event:any)=>setEntryId(event.target.value)}/></div>
      </div>
      {registration && <p className="text-xs text-muted-foreground">Vinculado a: <strong>{registration.name}</strong> {registration.document||""}</p>}
      <FInput label="Motivo / descrição" required value={description} placeholder="Ex.: Pagamento de entrega ao motoboy" onChange={(event:any)=>setDescription(event.target.value)}/>
      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold text-foreground">Itens do recibo</h3>
          <AdminButton size="sm" variant="secondary" onClick={()=>setItems(current=>[...current,{description:"",quantity:"1",unit_price:""}])} disabled={items.length>=30}><Plus size={14}/> Adicionar</AdminButton>
        </div>
        {items.map((item,index)=><div key={index} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_90px_150px_auto]">
          <FInput label={`Descrição ${index+1}`} required value={item.description} onChange={(event:any)=>updateItem(index,{description:event.target.value})} placeholder="Produto, serviço ou despesa"/>
          <FInput label="Qtd." type="number" min="0.01" step="0.01" value={item.quantity} onChange={(event:any)=>updateItem(index,{quantity:event.target.value})}/>
          <FCurrencyInput label="Valor unit." value={item.unit_price} onChange={(event:any)=>updateItem(index,{unit_price:event.target.value})}/>
          <AdminButton size="sm" variant="secondary" disabled={items.length===1} onClick={()=>setItems(current=>current.filter((_,i)=>i!==index))}><Trash2 size={15}/></AdminButton>
        </div>)}
        <div className="flex justify-between rounded-lg border border-border p-3 text-sm font-bold"><span>Total declarado</span><span>{formatCurrency(total)}</span></div>
      </div>
      <FInput label="Forma de pagamento utilizada (opcional)" value={paymentMethod} placeholder="Ex.: PIX, dinheiro, transferência" onChange={(event:any)=>setPaymentMethod(event.target.value)}/>
      <FTextarea label="Observações" value={notes} onChange={(event:any)=>setNotes(event.target.value)}/>
      <p className="text-xs text-muted-foreground">Ao emitir, você registra uma declaração de valor já pago ou recebido. Não será criada venda, nota fiscal, baixa ou movimentação de caixa.</p>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
      {issuedQuery.data?.length ? <details className="border-t border-border pt-3"><summary className="cursor-pointer text-sm font-semibold">Últimos recibos emitidos</summary>
        <div className="mt-3 space-y-2">{issuedQuery.data.map(item=><div key={item.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 text-xs">
          <span>REC-FIN-{String(item.receipt_number).padStart(6,"0")} · {item.counterpart_name} · {formatCurrency(item.total_amount)}</span>
          <AdminButton variant="secondary" size="sm" onClick={()=>printGeneralFinancialReceipt(item as GeneralReceiptA4)}><Printer size={13}/> Imprimir</AdminButton>
        </div>)}</div>
      </details> : null}
    </div>
  </AdminDialog>;
}
