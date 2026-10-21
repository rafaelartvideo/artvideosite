import { useEffect, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { BtnPrimary, BtnSecondary, Section, AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { AdminFieldLabel, RequiredFieldLabel, FCurrencyInput, FInput, FIntegerInput, FTextarea, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { cn, formatCurrency } from "@/shared/domain/formatters";
import { LoadingSpinner } from "@/shared/ui/admin/AdminFeedback";
import { searchOrderProducts, searchOrderServices, type OrderCatalogOption } from "../infrastructure/order-commercial-items.repository";
import type { OrderQuoteDraft, OrderQuoteItem } from "../infrastructure/order-quote.repository";

function money(value: unknown): number {
  const result=Number(value || 0);
  return Number.isFinite(result) && result>=0 ? result : 0;
}
export const quoteItemTotal = (item: OrderQuoteItem) => money(item.quantity)*money(item.unit_price)+money(item.additional_cost);

function QuoteItemPicker({ orderId, category, onAdd, disabled }: {
  orderId: string;category: "product" | "service";
  onAdd: (option: OrderCatalogOption,quantity:number,unitPrice:number) => void;
  disabled: boolean;
}) {
  const [search,setSearch]=useState("");
  const [options,setOptions]=useState<OrderCatalogOption[]>([]);
  const [selected,setSelected]=useState<OrderCatalogOption|null>(null);
  const [quantity,setQuantity]=useState("1");
  const [price,setPrice]=useState("");
  const [open,setOpen]=useState(false);
  const [loading,setLoading]=useState(false);
  useEffect(()=>{
    if(disabled||!open||selected){setOptions([]);setLoading(false);return;}
    let active=true;
    const timer=window.setTimeout(()=>{
      setLoading(true);
      void (category==="product"?searchOrderProducts(orderId,search):searchOrderServices(orderId,search))
        .then(results=>{if(active)setOptions(results);})
        .catch(()=>{if(active)setOptions([]);})
        .finally(()=>{if(active)setLoading(false);});
    },300);
    return ()=>{active=false;window.clearTimeout(timer);};
  },[orderId,category,search,selected,open,disabled]);
  const add=()=>{
    if(!selected || !Number.isInteger(Number(quantity)) || Number(quantity)<1)return;
    onAdd(selected,Number(quantity),money(price));
    setSearch("");setSelected(null);setOptions([]);setPrice("");setQuantity("1");setOpen(false);
  };
  return <div className="space-y-3">
    <div>
      <AdminFieldLabel label={category==="product"?"Produto":"Serviço"} />
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
        <input className={cn(INPUT,"pl-9 pr-9")} value={search} disabled={disabled}
          placeholder={category==="product"?"Busque no estoque por nome ou SKU":"Busque no catálogo de serviços"}
          onFocus={()=>setOpen(true)} onBlur={()=>window.setTimeout(()=>setOpen(false),120)}
          onChange={event=>{setSearch(event.target.value);setSelected(null);setOpen(true);}}/>
        {open&&!selected&&<div role="listbox" aria-busy={loading} className={cn("absolute inset-x-0 top-[calc(100%+4px)] z-50 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover shadow-lg",category==="service"?"max-h-[224px]":"max-h-56")}>
          {loading?<div className="flex h-14 items-center justify-center"><LoadingSpinner size="sm"/></div>:
            options.length?options.map(option=><button type="button" key={option.id}
              onMouseDown={event=>event.preventDefault()}
              onClick={()=>{
                setSelected(option);setSearch(option.name);setPrice(String(option.price??0));setOpen(false);
              }} className={cn("flex w-full cursor-default justify-between gap-3 border-b border-border px-3 text-left transition-colors last:border-b-0 hover:bg-primary-soft",category==="service"?"h-14 items-center py-2":"items-start py-3")}>
              <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{option.name}</strong>
                {option.description&&<span className="block truncate text-xs text-muted-foreground">{option.description}</span>}
                {category==="product"&&option.stock!=null&&<span className="block text-[10px] text-muted-foreground">Estoque: {option.stock} {option.unit}</span>}
              </span>
              <span className="shrink-0 text-xs font-bold text-primary">{option.price_at_completion?"Definir valor":option.price==null?"Sem preço":formatCurrency(option.price)}</span>
            </button>):<p className="p-3 text-xs text-muted-foreground">Nenhum resultado encontrado.</p>}
        </div>}
      </div>
    </div>
    <div className="grid grid-cols-[90px_minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[110px_minmax(0,1fr)_auto] sm:gap-3">
      <FIntegerInput label="Quantidade" required value={quantity} min={1} disabled={!selected||disabled}
        onChange={(event:any)=>setQuantity(event.target.value)}/>
      <FCurrencyInput label="Preço unitário" required value={price} placeholder="R$ 0,00" disabled={!selected||disabled}
        onChange={(event:any)=>setPrice(event.target.value)}/>
      <BtnPrimary className="h-[42px] self-end px-2 sm:px-3" disabled={!selected||disabled} onClick={add}><Plus size={15}/> Adicionar</BtnPrimary>
    </div>
    {selected&&<p className="text-[10px] text-muted-foreground">Item previsto na proposta. Ainda não será cobrado ou movimentado no estoque da OS.</p>}
  </div>;
}

export function OrderQuoteCommercialEditor({orderId,draft,onChange,disabled}:{
  orderId:string;draft:OrderQuoteDraft;onChange:(next:OrderQuoteDraft)=>void;disabled:boolean;
}) {
  const [customOpen,setCustomOpen]=useState(false);
  const [customName,setCustomName]=useState("");
  const [customDescription,setCustomDescription]=useState("");
  const [customPrice,setCustomPrice]=useState("0");
  const patch=(value:Partial<OrderQuoteDraft>)=>onChange({...draft,...value});
  const add=(category:"product"|"service",option:OrderCatalogOption,quantity:number,price:number)=>{
    patch({items:[...draft.items,{
      item_type:category,title_snapshot:option.name,description_snapshot:option.description||"",
      quantity,unit_price:price,additional_cost:0,
      general_service_id:category==="service"?option.id:null,
      inventory_item_id:category==="product"?option.id:null,
    }]});
  };
  const updateItem=(index:number,value:Partial<OrderQuoteItem>)=>
    patch({items:draft.items.map((item,i)=>i===index?{...item,...value}:item)});
  const products=draft.items.filter(i=>i.item_type==="product").reduce((v,i)=>v+quoteItemTotal(i),0);
  const services=draft.items.filter(i=>i.item_type!=="product").reduce((v,i)=>v+quoteItemTotal(i),0);
  const subtotal=products+services;
  const discount=draft.discount_type==="percentage"?subtotal*money(draft.discount_value)/100:money(draft.discount_value);
  return <div className="space-y-4">
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Incluir produto" className="relative z-20 !overflow-visible"><QuoteItemPicker orderId={orderId} category="product" onAdd={(o,q,p)=>add("product",o,q,p)} disabled={disabled}/></Section>
      <Section title="Incluir serviço" className="relative z-20 !overflow-visible">
        <QuoteItemPicker orderId={orderId} category="service" onAdd={(o,q,p)=>add("service",o,q,p)} disabled={disabled}/>
        {!disabled&&<div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3"><p className="text-xs text-muted-foreground">Serviços sem preço e avulsos são permitidos.</p>
          <AdminButton variant="secondary" onClick={()=>setCustomOpen(true)}><Plus size={15}/> Avulso</AdminButton></div>}
      </Section>
    </div>
    <Section title={<span className="inline-flex items-center gap-2"><RequiredFieldLabel label="Itens do orçamento" required />
      <span className="inline-flex min-w-6 justify-center rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-xs font-bold text-primary">{draft.items.length}</span></span>} flush>
      {!draft.items.length?<p className="p-5 text-sm text-muted-foreground">Nenhum produto ou serviço incluído.</p>:
        <div className="grid gap-3 p-3 sm:p-4">{draft.items.map((item,index)=><article key={index}
          className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{item.item_type==="product"?"Produto":"Serviço"}</p>
              <strong className="block break-words text-sm">{item.title_snapshot}</strong></div>
            <strong className="rounded-lg border border-border bg-muted/45 px-3 py-2 text-sm text-emerald-700">{formatCurrency(quoteItemTotal(item))}</strong>
            {!disabled&&<button type="button" onClick={()=>patch({items:draft.items.filter((_,i)=>i!==index)})}
              aria-label={"Remover "+item.title_snapshot} className="rounded-lg p-2 text-red-600 hover:bg-red-500/10"><Trash2 size={17}/></button>}
          </div>
          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
            <FIntegerInput label="Quantidade" required min={1} value={String(item.quantity)} disabled={disabled}
              onChange={(e:any)=>updateItem(index,{quantity:Number(e.target.value)||1})}/>
            <FCurrencyInput label="Preço unitário" required disabled={disabled} value={String(item.unit_price)}
              onChange={(e:any)=>updateItem(index,{unit_price:money(e.target.value)})}/>
            <FCurrencyInput label="Custo adicional" disabled={disabled} value={String(item.additional_cost)}
              onChange={(e:any)=>updateItem(index,{additional_cost:money(e.target.value)})}/>
          </div>
          <div className="mt-3"><FInput label="Descrição" disabled={disabled} value={item.description_snapshot}
            onChange={(e:any)=>updateItem(index,{description_snapshot:e.target.value})}/></div>
        </article>)}</div>}
    </Section>
    <Section title="Resumo do orçamento">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
          {([["Total produtos",products],["Total serviços",services],["Subtotal",subtotal],["Desconto",-discount]] as const)
            .map(([label,value])=><div className="flex justify-between border-b border-border py-2 text-sm" key={label}>
              <span className="text-muted-foreground">{label}</span><strong>{formatCurrency(value)}</strong></div>)}
          <div className="flex justify-between pt-2 text-sm font-bold"><span>Total</span><strong className="text-lg text-primary">{formatCurrency(Math.max(0,subtotal-discount))}</strong></div>
        </div>
        <div className="border border-border bg-muted/35 p-4">
          <p className="mb-3 text-xs font-black uppercase tracking-wide">Desconto</p>
          <label className="mb-1.5 block text-[11px] font-bold uppercase text-muted-foreground">Tipo</label>
          <select className={INPUT} value={draft.discount_type} disabled={disabled}
            onChange={e=>patch({discount_type:e.target.value==="percentage"?"percentage":"amount"})}>
            <option value="amount">Valor (R$)</option><option value="percentage">Percentual (%)</option>
          </select>
          <div className="mt-3">{draft.discount_type==="amount"?
            <FCurrencyInput label="Valor do desconto" disabled={disabled} value={String(draft.discount_value)}
              onChange={(e:any)=>patch({discount_value:money(e.target.value)})}/>:
            <FInput label="Percentual (%)" type="number" min="0" max="100" step="0.01"
              disabled={disabled} value={draft.discount_value}
              onChange={(e:any)=>patch({discount_value:money(e.target.value)})}/>}</div>
        </div>
      </div>
      <div className="mt-4"><FInput type="date" label="Validade da proposta" value={draft.valid_until||""} disabled={disabled}
        onChange={(e:any)=>patch({valid_until:e.target.value||null})}/></div>
    </Section>
    <AdminDialog open={customOpen} onClose={()=>setCustomOpen(false)} title="Serviço Avulso" description="Serviço específico para esta proposta">
      <div className="space-y-3">
        <FInput label="Nome do serviço" required value={customName} onChange={(e:any)=>setCustomName(e.target.value)}/>
        <FTextarea label="Descrição" rows={3} value={customDescription} onChange={(e:any)=>setCustomDescription(e.target.value)}/>
        <FCurrencyInput label="Preço unitário" value={customPrice} onChange={(e:any)=>setCustomPrice(e.target.value)}/>
        <div className="flex justify-end gap-2"><BtnSecondary onClick={()=>setCustomOpen(false)}>Cancelar</BtnSecondary>
          <BtnPrimary disabled={!customName.trim()} onClick={()=>{
            patch({items:[...draft.items,{item_type:"custom_service",inventory_item_id:null,general_service_id:null,
              title_snapshot:customName.trim(),description_snapshot:customDescription.trim(),
              quantity:1,unit_price:money(customPrice),additional_cost:0}]});
            setCustomOpen(false);setCustomName("");setCustomDescription("");setCustomPrice("0");
          }}>Adicionar serviço</BtnPrimary></div>
      </div>
    </AdminDialog>
  </div>;
}
