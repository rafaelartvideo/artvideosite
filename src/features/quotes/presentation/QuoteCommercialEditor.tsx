import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { AdminButton, AdminDialog, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { FCurrencyInput, FInput, FTextarea, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { cn, formatCurrency } from "@/shared/domain/formatters";
import { CatalogResults, NumberStepper } from "@/features/orders/presentation/OrderCommercialControls";
import type { OrderCatalogOption } from "@/features/orders/infrastructure/order-commercial-items.repository";
import {
  searchQuoteCatalog,
  type InternalQuoteDraft,
  type QuoteLineDraft,
} from "../infrastructure/internal-quotes.repository";

type Category = "product" | "service";
type Props = {
  organizationId: string;
  items: QuoteLineDraft[];
  onItemsChange: (items: QuoteLineDraft[]) => void;
  draft: InternalQuoteDraft;
  onDraftChange: (key: keyof InternalQuoteDraft, value: string | number) => void;
  disabled: boolean;
};

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}
const sumItem = (item: QuoteLineDraft) => item.quantity * numeric(item.unit_price) + numeric(item.additional_cost);

function QuoteCatalogInput({
  category, organizationId, onAdd, disabled,
}: {
  category: Category;
  organizationId: string;
  onAdd: (option: OrderCatalogOption, quantity: number, unitPrice: number) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<OrderCatalogOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<OrderCatalogOption | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (disabled || !open || search.trim().length < 2 || selected) {
      setOptions([]);
      setLoading(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void searchQuoteCatalog(organizationId, category, search)
        .then(rows => { if (active) setOptions(rows as OrderCatalogOption[]); })
        .catch(() => { if (active) setOptions([]); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [organizationId, category, search, open, selected, disabled]);

  const label = category === "product" ? "produto" : "serviço";
  const choose = (option: OrderCatalogOption) => {
    setSelected(option);
    setSearch(option.name);
    setPrice(String(option.price ?? 0));
    setOpen(false);
  };
  const add = () => {
    if (!selected) return;
    onAdd(selected, Math.max(1, Math.trunc(numeric(quantity))), numeric(price));
    setSearch("");
    setSelected(null);
    setPrice("");
    setQuantity("1");
    setOptions([]);
  };
  return <div className="space-y-3">
    <div>
      <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        {label === "produto" ? "Produto" : "Serviço"}
      </label>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
        <input className={cn(INPUT,"pl-9 pr-9")} value={search} disabled={disabled}
          placeholder={category === "product" ? "Busque no estoque por nome" : "Busque no catálogo de serviços"}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onChange={event => { setSearch(event.target.value); setSelected(null); setOpen(true); }} />
        <CatalogResults open={open && !selected && search.trim().length >= 2} loading={loading}
          options={options} formatCurrency={formatCurrency} onSelect={choose}
          emptyLabel={"Nenhum " + label + " encontrado."} fourRows={category === "service"}/>
      </div>
    </div>
    <div className="grid grid-cols-[95px_minmax(0,1fr)_auto] items-end gap-2 sm:grid-cols-[110px_minmax(0,1fr)_auto]">
      <NumberStepper label="Quantidade" integer min={1} value={quantity} disabled={!selected || disabled}
        onChange={setQuantity}/>
      <FCurrencyInput label="Preço unitário" placeholder="R$ 0,00" value={price}
        onChange={(event: any) => setPrice(event.target.value)} disabled={!selected || disabled}/>
      <BtnPrimary onClick={add} className="h-[42px] px-2 sm:px-3" disabled={!selected || disabled || !quantity.trim()}>
        <Plus size={15}/> Adicionar
      </BtnPrimary>
    </div>
    {selected && <p className="text-[10px] leading-relaxed text-muted-foreground">
      {category === "product"
        ? "Produto previsto no orçamento. Nenhuma peça será retirada do estoque nesta etapa."
        : selected.price_at_completion ? "Serviço com preço a definir: estabeleça o valor desta proposta."
        : "O valor inicial vem do cadastro; o orçamento pode ter um valor negociado."}
    </p>}
  </div>;
}

export function QuoteCommercialEditor({ organizationId, items, onItemsChange, draft, onDraftChange, disabled }: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customPrice, setCustomPrice] = useState("0");

  const productTotal = useMemo(() => items.filter(item => item.item_type === "product").reduce((sum, item) => sum + sumItem(item),0), [items]);
  const serviceTotal = useMemo(() => items.filter(item => item.item_type !== "product").reduce((sum, item) => sum + sumItem(item),0), [items]);
  const subtotal = productTotal + serviceTotal;
  const discountValue = numeric(draft.discount_value);
  const discount = draft.discount_type === "percentage" ? subtotal * Math.min(discountValue,100) / 100 : discountValue;
  const total = Math.max(0, subtotal - discount);

  const addCatalogItem = (category: Category, option: OrderCatalogOption, quantity: number, unitPrice: number) => {
    onItemsChange([...items, {
      item_type: category,
      general_service_id: category === "service" ? option.id : null,
      inventory_item_id: category === "product" ? option.id : null,
      title_snapshot: option.name,
      description_snapshot: option.description || "",
      quantity,
      unit_price: unitPrice,
      additional_cost: 0,
    }]);
  };
  const updateItem = (index: number, patch: Partial<QuoteLineDraft>) =>
    onItemsChange(items.map((item,i) => i === index ? { ...item, ...patch } : item));
  const addCustom = () => {
    if (!customName.trim()) return;
    onItemsChange([...items, {
      item_type: "custom_service", general_service_id: null, inventory_item_id: null,
      title_snapshot: customName.trim(), description_snapshot: customDescription.trim(),
      quantity: 1, unit_price: numeric(customPrice), additional_cost: 0,
    }]);
    setCustomOpen(false);setCustomName("");setCustomDescription("");setCustomPrice("0");
  };

  return <>
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Incluir produto" className="relative !overflow-visible">
        <QuoteCatalogInput category="product" organizationId={organizationId}
          disabled={disabled} onAdd={(item,quantity,price) => addCatalogItem("product",item,quantity,price)}/>
      </Section>
      <Section title="Incluir serviço" className="relative !overflow-visible">
        <QuoteCatalogInput category="service" organizationId={organizationId}
          disabled={disabled} onAdd={(item,quantity,price) => addCatalogItem("service",item,quantity,price)}/>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
          <p className="text-[10px] text-muted-foreground">Serviços sem preço também podem entrar no orçamento.</p>
          <AdminButton variant="secondary" className="h-10 shrink-0 px-4" disabled={disabled} onClick={() => setCustomOpen(true)}>
            <Plus size={15}/> Avulso
          </AdminButton>
        </div>
      </Section>
    </div>

    <Section title={<span className="inline-flex items-center gap-2">Itens do orçamento
      <span className="inline-flex min-w-6 items-center justify-center rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary">{items.length}</span>
    </span>} flush>
      {items.length === 0 ? <div className="p-5 text-sm text-muted-foreground">Nenhum produto ou serviço foi adicionado ao orçamento.</div>
        : <div className="grid min-w-0 gap-3 p-3 sm:gap-4 sm:p-4">{items.map((item,index) =>
          <article key={index} className="group min-w-0 overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40 hover:bg-muted/15">
            <div className="min-w-0 p-3.5 sm:p-4">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{item.item_type === "product" ? "Produto" : "Serviço"}</p>
                  <p className="break-words text-sm font-bold text-foreground">{item.title_snapshot}</p>
                  {item.description_snapshot && <p className="mt-1 break-words text-xs text-muted-foreground">{item.description_snapshot}</p>}
                </div>
                <strong className="inline-flex min-h-9 shrink-0 items-center rounded-lg border border-border bg-muted/45 px-3 text-sm font-black text-emerald-700">
                  {formatCurrency(sumItem(item))}
                </strong>
                {!disabled && <button type="button" title="Remover item" aria-label={"Remover " + item.title_snapshot}
                  className="rounded-lg border border-red-500/25 p-2 text-red-600 hover:bg-red-500/10"
                  onClick={() => onItemsChange(items.filter((_,i) => i !== index))}><Trash2 size={15}/></button>}
              </div>
              <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3 border-t border-border/60 pt-3">
                <div className="w-[100px]">
                  <NumberStepper label="Quantidade" value={String(item.quantity)} integer min={1} disabled={disabled}
                    onChange={value => updateItem(index,{quantity:Math.max(1,Math.trunc(numeric(value)))})}/>
                </div>
                <div className="w-[155px]">
                  <FCurrencyInput label="Preço unitário" value={String(item.unit_price)} disabled={disabled}
                    onChange={(event: any) => updateItem(index,{unit_price:numeric(event.target.value)})}/>
                </div>
                <div className="w-[155px]">
                  <FCurrencyInput label="Custo adicional" value={String(item.additional_cost)} disabled={disabled}
                    onChange={(event: any) => updateItem(index,{additional_cost:numeric(event.target.value)})}/>
                </div>
              </div>
              {!disabled && <div className="mt-3">
                <FInput label="Descrição do item" value={item.description_snapshot}
                  onChange={(event: any) => updateItem(index,{description_snapshot:event.target.value})}/>
              </div>}
            </div>
          </article>
        )}</div>}
    </Section>

    <Section title="Resumo do orçamento">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          {([
            ["Total produtos", productTotal],
            ["Total serviços", serviceTotal],
            ["Subtotal", subtotal],
            ["Desconto", -discount],
          ] as const).map(([label,value]) => <div key={label} className="flex items-center justify-between gap-4 border-b border-border py-2 text-sm">
            <span className="text-muted-foreground">{label}</span><strong>{formatCurrency(value)}</strong>
          </div>)}
          <div className="flex items-center justify-between gap-3 pt-2"><strong>Total do orçamento</strong>
            <strong className="text-lg font-black text-primary">{formatCurrency(total)}</strong>
          </div>
        </div>
        <div className="border border-border bg-muted/35 p-4">
          <p className="mb-3 text-xs font-black uppercase tracking-wider">Desconto</p>
          <div className="grid gap-3">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tipo</label>
              <select className={cn(INPUT,"w-full")} value={draft.discount_type} disabled={disabled}
                onChange={event => onDraftChange("discount_type",event.target.value)}>
                <option value="amount">Valor (R$)</option><option value="percentage">Percentual (%)</option>
              </select>
            </div>
            {draft.discount_type === "amount" ?
              <FCurrencyInput label="Valor do desconto" value={String(draft.discount_value)} disabled={disabled}
                onChange={(event: any) => onDraftChange("discount_value",numeric(event.target.value))}/>
              : <FInput label="Porcentagem (%)" type="number" min="0" max="100" step="0.01"
                disabled={disabled} value={draft.discount_value}
                onChange={(event: any) => onDraftChange("discount_value",numeric(event.target.value))}/>}
          </div>
        </div>
      </div>
      <div className="mt-4">
        <FInput type="date" label="Validade do orçamento" value={draft.valid_until} disabled={disabled}
          onChange={(event: any) => onDraftChange("valid_until",event.target.value)}/>
      </div>
    </Section>

    <AdminDialog open={customOpen} onClose={() => setCustomOpen(false)} title="Serviço Avulso" description="Adicionar um serviço personalizado ao orçamento">
      <div className="space-y-3">
        <FInput label="Nome do serviço" required value={customName} onChange={(event:any) => setCustomName(event.target.value)}/>
        <FTextarea label="Descrição" rows={3} value={customDescription} onChange={(event:any) => setCustomDescription(event.target.value)}/>
        <FCurrencyInput label="Preço unitário" value={customPrice} onChange={(event:any) => setCustomPrice(event.target.value)}/>
        <div className="flex justify-end gap-2"><BtnSecondary onClick={() => setCustomOpen(false)}>Cancelar</BtnSecondary>
          <BtnPrimary disabled={!customName.trim()} onClick={addCustom}>Adicionar serviço</BtnPrimary></div>
      </div>
    </AdminDialog>
  </>;
}
