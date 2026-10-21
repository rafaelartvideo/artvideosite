import { useEffect, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { AdminButton, AdminDialog, AdminIconButton, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect, FCurrencyInput, FInput, FTextarea, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { cn, formatCurrency } from "@/shared/domain/formatters";
import { LoadingSpinner, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { CatalogResults, NumberStepper } from "./OrderCommercialControls";
import { searchOrderProducts, searchOrderServices, type OrderCatalogOption } from "../infrastructure/order-commercial-items.repository";
import type { OrderQuoteDraft, OrderQuoteItem } from "../infrastructure/order-quote.repository";

function positiveInteger(value: unknown) {
  const valueNumber = Math.trunc(Number(value || 0));
  return Number.isFinite(valueNumber) ? Math.max(1, valueNumber) : 1;
}
function nonNegativeNumber(value: unknown) {
  const valueNumber = Number(value || 0);
  return Number.isFinite(valueNumber) ? Math.max(0, valueNumber) : 0;
}
export const quoteItemTotal = (item: OrderQuoteItem) =>
  positiveInteger(item.quantity) * nonNegativeNumber(item.unit_price) + nonNegativeNumber(item.additional_cost);

function QuoteItemPicker({ orderId, category, onAdd, disabled, onCustomClick }: {
  orderId: string;
  category: "product" | "service";
  onAdd: (option: OrderCatalogOption, quantity: number, unitPrice: number) => void;
  disabled: boolean;
  onCustomClick?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<OrderCatalogOption[]>([]);
  const [selected, setSelected] = useState<OrderCatalogOption | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (disabled || !searchOpen || selected || !orderId) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const results = await (category === "product"
          ? searchOrderProducts(orderId, search) : searchOrderServices(orderId, search));
        if (!cancelled) setOptions(results);
      } catch (error) {
        if (!cancelled) notifyAdmin(systemErrorMessage(error,
          category === "product" ? "Não foi possível buscar produtos." : "Não foi possível buscar serviços."), "error");
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [disabled, searchOpen, selected, orderId, search, category]);

  const select = (option: OrderCatalogOption) => {
    if (category === "product" && option.stock != null && option.stock <= 0) {
      notifyAdmin(option.name + " está sem estoque disponível e não pode ser adicionado à OS.", "error");
      setSelected(null);
      return;
    }
    setSelected(option);
    setSearch(option.name);
    setPrice(category === "service" ? String(option.price ?? 0) : option.price == null ? "" : String(option.price));
    setQuantity("1");
    setSearchOpen(false);
  };
  const add = () => {
    if (!selected) return;
    if (category === "product" && selected.stock != null && selected.stock < positiveInteger(quantity)) {
      notifyAdmin("Quantidade maior que o estoque disponível deste produto.", "error");
      return;
    }
    if (price.trim() === "") {
      notifyAdmin("Informe o preço unitário do produto.", "error");
      return;
    }
    onAdd(selected, positiveInteger(quantity), nonNegativeNumber(price));
    setSelected(null); setSearch(""); setPrice(""); setQuantity("1"); setSearchOpen(false);
    notifyAdmin(category === "product" ? "Produto adicionado ao orçamento." : "Serviço adicionado ao orçamento.", "success");
  };

  const isService = category === "service";
  const fixedPrice = isService || selected?.price != null && selected.price > 0;
  return <Section title={isService ? "Incluir serviço" : "Incluir produto"}
    className={cn("relative !overflow-visible", searchOpen && !selected ? "z-30" : "z-0")}>
    <div className="space-y-3">
      <div>
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {isService ? "Serviço" : "Produto"}
        </label>
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <input value={search}
            disabled={disabled}
            onFocus={() => { setSearchOpen(true); if (isService && !selected) setSearching(true); }}
            onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
            onChange={event => { setSearch(event.target.value); setSelected(null); setSearchOpen(true); if (isService) setSearching(true); }}
            placeholder={isService ? "Busque no catálogo de serviços" : "Busque no estoque por nome ou SKU"}
            className={cn(INPUT,"pl-9",isService&&"pr-10")}
            aria-label={isService ? "Buscar serviço" : "Buscar produto"}
            aria-expanded={searchOpen && !selected}/>
          {isService && searching && searchOpen && !selected && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <LoadingSpinner size="sm"/></span>}
          <CatalogResults
            contained
            open={searchOpen && !selected}
            fourRows={isService}
            loading={searching}
            options={options}
            emptyLabel={isService ? "Nenhum serviço encontrado." : "Nenhum produto encontrado."}
            formatCurrency={formatCurrency}
            onSelect={select}
            isUnavailable={isService ? undefined : option => option.stock != null && option.stock <= 0}
            unavailableLabel={isService ? undefined : () => "Sem estoque"}
            onUnavailable={isService ? undefined : option => notifyAdmin(option.name + " está sem estoque disponível e não pode ser adicionado à OS.","error")}
          />
        </div>
      </div>
      <div className={cn("grid items-end gap-2 sm:gap-3",isService
        ? "grid-cols-[84px_minmax(0,1fr)_auto] sm:grid-cols-[110px_minmax(0,1fr)_auto]"
        : "grid-cols-1 sm:grid-cols-[110px_minmax(0,1fr)_auto]")}>
        <NumberStepper label="Quantidade" value={quantity} min={1} step={1} integer
          disabled={!selected || disabled} onChange={setQuantity}/>
        <FCurrencyInput label="Preço unitário" placeholder="R$ 0,00" value={price}
          onChange={(event:any) => setPrice(event.target.value)}
          disabled={!selected || disabled || Boolean(fixedPrice)}/>
        <BtnPrimary className="h-[42px] self-end px-2 sm:px-3"
          disabled={!selected || disabled || price.trim() === ""}
          onClick={add}><Plus size={15}/> Adicionar</BtnPrimary>
      </div>
      {selected && (isService ? <p className="text-[10px] leading-relaxed text-muted-foreground">
        {selected.price_at_completion
          ? "Valor a definir na conclusão da OS."
          : selected.price == null || selected.price === 0
            ? "Serviço sem preço cadastrado; a inclusão não exige valor."
            : "Valor fixado no cadastro do serviço."}
      </p> : <p className="pb-1 text-[10px] text-muted-foreground">
        Estoque atual: {selected.stock ?? 0} {selected.unit}. Produto previsto no orçamento, sem reserva nem baixa do estoque. A disponibilidade será conferida na aprovação.
      </p>)}
      {isService && !disabled && <div className="flex items-center justify-between gap-3 border-t border-border pb-1 pt-3">
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Serviços sem preço podem ser adicionados normalmente. Os demais seguem o valor definido no cadastro.
        </p>
        <AdminButton variant="secondary" onClick={onCustomClick} className="h-10 shrink-0 px-4">
          <Plus size={15}/> Avulso
        </AdminButton>
      </div>}
    </div>
  </Section>;
}

export function OrderQuoteCommercialEditor({orderId,draft,onChange,disabled}: {
  orderId: string;
  draft: OrderQuoteDraft;
  onChange: (next: OrderQuoteDraft) => void;
  disabled: boolean;
}) {
  const [customOpen,setCustomOpen]=useState(false);
  const [customName,setCustomName]=useState("");
  const [customDescription,setCustomDescription]=useState("");
  const [customQuantity,setCustomQuantity]=useState("1");
  const [customPrice,setCustomPrice]=useState("");
  const patch=(value:Partial<OrderQuoteDraft>)=>onChange({...draft,...value});
  const add=(category:"product"|"service",option:OrderCatalogOption,quantity:number,price:number)=>{
    patch({items:[...draft.items,{
      item_type:category,title_snapshot:option.name,description_snapshot:option.description||"",
      quantity,unit_price:price,additional_cost:0,
      general_service_id:category==="service"?option.id:null,
      inventory_item_id:category==="product"?option.id:null,
      catalog_price_fixed:category==="service"||option.price!=null&&option.price>0,
    }]});
  };
  const updateItem=(index:number,value:Partial<OrderQuoteItem>)=>
    patch({items:draft.items.map((item,i)=>i===index?{...item,...value}:item)});
  const products=draft.items.filter(i=>i.item_type==="product").reduce((v,i)=>v+quoteItemTotal(i),0);
  const services=draft.items.filter(i=>i.item_type!=="product").reduce((v,i)=>v+quoteItemTotal(i),0);
  const subtotal=products+services;
  const discount=draft.discount_type==="percentage"?subtotal*nonNegativeNumber(draft.discount_value)/100:nonNegativeNumber(draft.discount_value);

  return <div className="space-y-4">
    {!disabled && <div className="grid gap-4 lg:grid-cols-2">
      <QuoteItemPicker orderId={orderId} category="product" onAdd={(o,q,p)=>add("product",o,q,p)} disabled={disabled}/>
      <QuoteItemPicker orderId={orderId} category="service" onAdd={(o,q,p)=>add("service",o,q,p)} disabled={disabled} onCustomClick={()=>setCustomOpen(true)}/>
    </div>}
    <Section title={<span className="inline-flex items-center gap-2">Itens do orçamento
      <span className="inline-flex min-w-6 items-center justify-center rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">{draft.items.length}</span>
    </span>} flush>
      {draft.items.length === 0
        ? <div className="flex min-h-24 items-center justify-center p-5 text-center text-sm text-muted-foreground">
          Nenhum produto ou serviço foi adicionado a este orçamento.
        </div>
        : <div className="grid min-w-0 gap-3 p-3 sm:gap-4 sm:p-4">
          {draft.items.map((item,index)=>{
            const fixedPrice = item.item_type==="service" ||
              item.catalog_price_fixed === true || (item.item_type==="product" && Boolean(item.inventory_item_id) && item.catalog_price_fixed !== false);
            return <article key={index} aria-label={item.title_snapshot}
              className="group min-w-0 overflow-hidden rounded-xl border border-border bg-card transition-colors duration-200 hover:border-primary/40 hover:bg-muted/15 focus-within:border-primary/50">
              <div className="min-w-0 p-3.5 sm:p-4">
                <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                  <div className="min-w-0 flex-1 flex-wrap items-start gap-x-5 gap-y-2">
                    <div className="min-w-[150px] flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {item.item_type==="product"?"Produto":item.item_type==="custom_service"?"Serviço Avulso":"Serviço"}
                      </p>
                      <strong className="block break-words text-sm">{item.title_snapshot}</strong>
                    </div>
                    <strong className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-lg border border-border bg-muted/45 px-3 py-1.5 text-sm font-black text-emerald-700 dark:text-emerald-300">
                      {formatCurrency(quoteItemTotal(item))}
                    </strong>
                  </div>
                  {!disabled&&<AdminIconButton ariaLabel={"Remover "+item.title_snapshot} variant="danger"
                    onClick={()=>{
                      patch({items:draft.items.filter((_,i)=>i!==index)});
                      notifyAdmin("Item removido do orçamento.","success");
                    }}><Trash2 size={14}/></AdminIconButton>}
                </div>
                <div className="mt-4 flex min-w-0 flex-col gap-3 border-t border-border/60 pt-3 lg:flex-row lg:items-center lg:gap-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">Quantidade:</span>
                      <div className="w-[94px]">
                        <NumberStepper ariaLabel="Quantidade" value={String(item.quantity)} min={1} step={1}
                          integer disabled={disabled}
                          onChange={next=>updateItem(index,{quantity:positiveInteger(next)})}/>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">Preço unitário:</span>
                      <div className="w-[132px]">
                        {fixedPrice ? <div className={cn(INPUT,"flex min-h-[38px] items-center bg-muted text-sm font-semibold text-muted-foreground")}>
                          {formatCurrency(nonNegativeNumber(item.unit_price))}
                        </div> : <FCurrencyInput aria-label="Preço unitário" placeholder="R$ 0,00"
                          disabled={disabled} value={String(item.unit_price)}
                          onChange={(e:any)=>updateItem(index,{unit_price:nonNegativeNumber(e.target.value)})}/>}
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">Custo adicional:</span>
                      <div className="w-[132px]">
                        <FCurrencyInput aria-label="Custo adicional" placeholder="R$ 0,00" disabled={disabled}
                          value={String(item.additional_cost)}
                          onChange={(e:any)=>updateItem(index,{additional_cost:nonNegativeNumber(e.target.value)})}/>
                      </div>
                    </div>
                  </div>
                </div>
                {item.item_type==="custom_service"&&<div className="mt-3"><FInput label="Descrição"
                  disabled={disabled} value={item.description_snapshot} onChange={(e:any)=>
                    updateItem(index,{description_snapshot:e.target.value})}/></div>}
              </div>
            </article>;
          })}
        </div>}
    </Section>
    {draft.items.some(item=>item.item_type==="product") && <p className="text-xs text-muted-foreground">Produtos no orçamento são apenas previstos: não ficam reservados, não congelam o saldo e não geram baixa no estoque antes da aprovação e do fluxo de peças.</p>}
    <Section title="Resumo do orçamento">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          {([["Total produtos",products],["Total serviços",services],["Subtotal",subtotal],["Desconto",-discount]] as const)
            .map(([label,value])=><div className="flex items-center justify-between gap-4 border-b border-border py-2 text-sm" key={label}>
              <span className="text-muted-foreground">{label}</span><strong>{formatCurrency(value)}</strong></div>)}
          <div className="flex justify-between pt-2 text-sm font-bold">
            <span>Total do orçamento</span><strong className="text-lg font-black text-primary">{formatCurrency(Math.max(0,subtotal-discount))}</strong></div>
        </div>
        <div className="border border-border bg-muted/35 p-4">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.12em]">Desconto</p>
          <div className="grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)] lg:grid-cols-1">
            <div><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tipo</label>
              <AdminSelect value={draft.discount_type} disabled={disabled}
                onValueChange={type=>patch({discount_type:type==="percentage"?"percentage":"amount",discount_value:0})}
                options={[{value:"percentage",label:"Percentual (%)"},{value:"amount",label:"Valor (R$)"}]}/>
            </div>
            {draft.discount_type==="amount"
              ? <FCurrencyInput label="Valor do desconto" value={String(draft.discount_value)}
                  disabled={disabled} placeholder="R$ 0,00"
                  onChange={(e:any)=>patch({discount_value:nonNegativeNumber(e.target.value)})}/>
              : <NumberStepper label="Percentual (%)" value={String(draft.discount_value)}
                  min={0} max={100} step={1} disabled={disabled}
                  onChange={value=>patch({discount_value:Math.min(100,nonNegativeNumber(value))})}/>}
          </div>
        </div>
      </div>
      <div className="mt-4 space-y-1.5"><FInput type="date" label="Validade da proposta"
        value={draft.valid_until||""} disabled={disabled}
        onChange={(e:any)=>patch({valid_until:e.target.value||null})}/>
        <p className="text-xs text-muted-foreground">Prazo máximo estimado para análise e aprovação: 3 dias.</p>
      </div>
    </Section>

    <AdminDialog open={customOpen}
      onClose={()=>setCustomOpen(false)}
      title="Serviço Avulso"
      description="Este serviço ficará vinculado somente a este orçamento e não será salvo no catálogo de serviços."
      className="max-w-xl"
      footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BtnSecondary onClick={()=>setCustomOpen(false)}>Cancelar</BtnSecondary>
        <BtnPrimary disabled={!customName.trim()||customPrice.trim()===""}
          onClick={()=>{
            patch({items:[...draft.items,{
              item_type:"custom_service",inventory_item_id:null,general_service_id:null,
              title_snapshot:customName.trim(),description_snapshot:customDescription.trim(),
              quantity:positiveInteger(customQuantity),unit_price:nonNegativeNumber(customPrice),
              additional_cost:0,catalog_price_fixed:false,
            }]});
            setCustomOpen(false);setCustomName("");setCustomDescription("");setCustomPrice("");setCustomQuantity("1");
            notifyAdmin("Serviço Avulso adicionado ao orçamento.","success");
          }}>Adicionar serviço</BtnPrimary>
      </div>}>
      <div className="space-y-4">
        <FInput label="Nome do serviço" required value={customName}
          onChange={(e:any)=>setCustomName(e.target.value)} placeholder="Ex.: Ajuste de conector"/>
        <FTextarea label="Descrição" rows={4} value={customDescription}
          onChange={(e:any)=>setCustomDescription(e.target.value)}
          placeholder="Descreva o que será executado nesta OS"/>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberStepper label="Quantidade" value={customQuantity} min={1} step={1} integer
            onChange={setCustomQuantity}/>
          <FCurrencyInput label="Preço unitário" placeholder="R$ 0,00" required
            value={customPrice} onChange={(e:any)=>setCustomPrice(e.target.value)}/>
        </div>
      </div>
    </AdminDialog>
  </div>;
}
