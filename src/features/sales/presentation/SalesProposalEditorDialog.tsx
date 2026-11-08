import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CalendarDays, FileText, Plus, Search, Trash2, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { SalesQuickCustomerDialog } from "./SalesQuickCustomerDialog";
import { searchSalesCustomers, searchSalesProducts } from "../infrastructure/sales.repository";
import { saveSalesProposal, type SalesProposalDetail } from "../infrastructure/sales-proposals.repository";
import { localSalesDate, parseSalesMoney } from "../domain/sales-payment-schedule";

type ProposalItem = {
  productId: string;
  name: string;
  sku?: string | null;
  price: number;
  quantity: number;
};

type ProposalCartItem = {
  product: { product_id: string; name: string; sku?: string | null; price?: number | null };
  quantity: number;
};

export function SalesProposalEditorDialog({
  organizationId, initial, cartItems = [], onClose, onSaved,
}: {
  organizationId: string;
  initial?: SalesProposalDetail | null;
  cartItems?: ProposalCartItem[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { hasPermission } = useAuth();
  const [quickCustomerOpen,setQuickCustomerOpen]=useState(false);
  const [customer, setCustomer] = useState<{ id: string; name: string; document?: string | null } | null>(
    initial ? { id: initial.customer_id, name: initial.customer_name_snapshot,
      document: initial.customer_document_snapshot } : null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productDebounced, setProductDebounced] = useState("");
  const [validUntil, setValidUntil] = useState(initial?.valid_until || localSalesDate(7));
  const [discountInput, setDiscountInput] = useState(initial?.discount_amount
    ? String(initial.discount_amount).replace(".", ",") : "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [lines, setLines] = useState<ProposalItem[]>(() => initial
    ? initial.items.map(item => ({
        productId: item.product_id, name: item.name, sku: item.sku,
        price: Number(item.unit_price), quantity: Number(item.quantity),
      }))
    : cartItems.map(item => ({
        productId: item.product.product_id,name: item.product.name,sku: item.product.sku,
        price: Number(item.product.price || 0),quantity: item.quantity,
      })));
  const [errorText, setErrorText] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const canDiscount = hasPermission("sales.discount");

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 260);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const timer = window.setTimeout(() => setProductDebounced(productSearch), 260);
    return () => window.clearTimeout(timer);
  }, [productSearch]);

  const customerQuery = useQuery({
    queryKey: ["sales",organizationId,"customers",debouncedSearch],
    queryFn: () => searchSalesCustomers(organizationId,debouncedSearch),
    enabled: Boolean(organizationId && !customer && (debouncedSearch.length===0 || debouncedSearch.length>=2)),
    staleTime: 30_000,
  });
  const productQuery = useQuery({
    queryKey: ["sales",organizationId,"proposal-products",productDebounced],
    queryFn: () => searchSalesProducts(organizationId,productDebounced,15),
    enabled: Boolean(organizationId && productDebounced.trim().length>=2),
    staleTime: 30_000,
  });

  const subtotal = useMemo(() => lines.reduce((sum,item) =>
    sum+Number(item.price||0)*item.quantity,0),[lines]);
  const discount = parseSalesMoney(discountInput);
  const total = Math.round((subtotal-(Number.isFinite(discount)?discount:0))*100)/100;

  const addProduct = (product: {product_id:string;name:string;sku?:string|null;price?:number|null}) => {
    const price=Number(product.price || 0);
    if (!Number.isFinite(price) || price<=0) {
      setErrorText("Este produto não possui preço válido.");
      return;
    }
    setLines(previous => {
      const existing=previous.find(item=>item.productId===product.product_id);
      if(existing) return previous.map(item=>item.productId===product.product_id
        ? {...item,price}:item);
      if(previous.length>=80) return previous;
      return [...previous,{productId:product.product_id,name:product.name,sku:product.sku,
        price,quantity:1}];
    });
    setProductSearch("");
    setProductDebounced("");
    setErrorText(null);
  };

  const invalid = (() => {
    if(!customer) return "Selecione um cliente para a proposta.";
    if(!lines.length) return "Inclua pelo menos um produto.";
    if(lines.length>80 || lines.some(item=>!Number.isSafeInteger(item.quantity) || item.quantity<1 ||
      item.quantity>9999 || !Number.isFinite(item.price) || item.price<=0))
      return "Confira as quantidades e os produtos da proposta.";
    if(!validUntil || validUntil<localSalesDate() || validUntil>localSalesDate(365))
      return "Defina validade entre hoje e os próximos 365 dias.";
    if(!Number.isFinite(discount) || discount<0 || discount>=subtotal)
      return "Desconto deve ser inferior ao subtotal.";
    if(discount>0 && !canDiscount) return "Você não possui permissão para aplicar desconto.";
    return null;
  })();

  const mutation = useMutation({
    mutationFn: () => saveSalesProposal(organizationId,{
      idempotencyKey:key,
      proposalId:initial?.id || null,
      customerId:customer!.id,
      validUntil,discount,notes:notes.trim(),
      items:lines.map(line=>({productId:line.productId,quantity:line.quantity,expectedUnitPrice:line.price})),
    }),
    onSuccess: saved => onSaved("Proposta #"+saved.proposal_number+
      (initial ? " atualizada." : " criada. Envie ao cliente e registre a resposta.")),
    onError: error => setErrorText(systemErrorMessage(error,"Não foi possível salvar a proposta.")),
  });

  return <><AdminDialog open onClose={() => !mutation.isPending && onClose()}
    title={initial ? "Renegociar proposta #"+initial.proposal_number : "Nova proposta comercial"}
    description="Escolha o cliente, os produtos e a validade. Nenhuma movimentação de estoque ou Financeiro será feita."
    className="w-[calc(100vw-1.25rem)] max-w-3xl"
    bodyClassName="max-h-[min(76dvh,740px)] overflow-y-auto"
    footer={<div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
      <AdminButton size="sm" variant="secondary" disabled={mutation.isPending}
        onClick={onClose}>Cancelar</AdminButton>
      <AdminButton size="sm" disabled={Boolean(invalid)||mutation.isPending}
        loading={mutation.isPending}
        onClick={()=>{setErrorText(null);if(!invalid)mutation.mutate();}}>
        {initial?"Salvar renegociação":"Criar proposta"}
      </AdminButton>
    </div>}>
    <div className="min-w-0 space-y-5">
      <section className="space-y-2">
<div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><UserRound size={16}/> Cliente</h3>
          {hasPermission("sales.quick_customer")&&<button type="button" onClick={()=>setQuickCustomerOpen(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
            <Plus size={14}/> Novo cliente
          </button>}
        </div>
        {customer ? <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{customer.name}</p>
            {customer.document && <p className="text-xs text-muted-foreground">{customer.document}</p>}
          </div>
          <button type="button" className="text-xs font-semibold text-primary"
            onClick={()=>{setCustomer(null);setSearch("");}}>Alterar</button>
        </div> : <>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
            <input value={search} onChange={event=>setSearch(event.target.value)}
              placeholder="Pesquisar nome, CPF ou WhatsApp"
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"/>
          </div>
          <div className="max-h-36 overflow-y-auto rounded-lg border border-border">
            {customerQuery.isPending?<LoadingState text="Buscando clientes..."/>:customerQuery.isError
              ?<p className="p-3 text-xs text-destructive">Não foi possível consultar os clientes.</p>
              :(customerQuery.data||[]).map(entry=><button type="button" key={entry.id}
                onClick={()=>setCustomer({id:entry.id,name:entry.name,document:entry.document})}
                className="block w-full border-b border-border p-2 text-left text-sm hover:bg-muted">
                <span className="block font-semibold">{entry.name}</span>
                {entry.document&&<span className="text-xs text-muted-foreground">{entry.document}</span>}
              </button>)}
          </div>
        </>}
      </section>

      <section className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><FileText size={16}/> Produtos</h3>
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <input value={productSearch} onChange={event=>setProductSearch(event.target.value)}
            placeholder="Adicionar produto por nome, SKU ou código"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"/>
        </div>
        {productDebounced.trim().length>=2 && <div className="max-h-36 overflow-y-auto rounded-lg border border-border">
          {productQuery.isPending?<LoadingState text="Buscando produtos..."/>:productQuery.isError
            ?<p className="p-3 text-xs text-destructive">Não foi possível carregar produtos.</p>
            :(productQuery.data||[]).length?(productQuery.data||[]).map(product=>
              <button type="button" key={product.product_id} onClick={()=>addProduct(product)}
                className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-left text-xs hover:bg-muted">
                <span className="min-w-0 truncate">{product.name}</span>
                <span className="shrink-0 font-semibold">{formatCurrency(product.price||0)} <Plus size={13} className="inline"/></span>
              </button>):<p className="p-3 text-xs text-muted-foreground">Nenhum produto encontrado.</p>}
        </div>}
        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {lines.length===0?<p className="p-4 text-center text-xs text-muted-foreground">Nenhum produto selecionado.</p>
            :lines.map(line=><div key={line.productId}
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-3 sm:grid-cols-[minmax(0,1fr)_96px_100px_36px]">
              <div className="col-span-2 min-w-0 sm:col-span-1">
                <p className="break-words text-sm font-semibold">{line.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatCurrency(line.price)} cada</p>
              </div>
              <label className="flex min-w-0 flex-col gap-1 text-xs">
                <span className="font-semibold text-muted-foreground">Quantidade</span>
                <input type="number" min={1} max={9999} step={1} value={line.quantity}
                  onChange={event=>setLines(current=>current.map(item=>item.productId===line.productId
                    ?{...item,quantity:Number(event.target.value)}:item))}
                  className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-2 text-right"/>
              </label>
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground sm:hidden">Subtotal</p>
                <strong className="text-sm tabular-nums">{formatCurrency(line.price*line.quantity)}</strong>
              </div>
              <button type="button" aria-label={"Remover "+line.name}
                onClick={()=>setLines(current=>current.filter(item=>item.productId!==line.productId))}
                className="col-span-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border text-xs font-semibold text-destructive sm:col-span-1 sm:w-9"
              ><Trash2 size={15}/><span className="sm:sr-only">Remover</span></button>
            </div>)}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-xs font-semibold"><CalendarDays size={14}/> Validade da proposta</span>
          <input type="date" value={validUntil} min={localSalesDate()} max={localSalesDate(365)}
            onChange={event=>setValidUntil(event.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"/>
        </label>
        <label className="space-y-1.5">
          <span className="block text-xs font-semibold">Desconto (R$)</span>
          <input inputMode="decimal" value={discountInput} placeholder="0,00"
            disabled={!canDiscount} onChange={event=>setDiscountInput(event.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm disabled:opacity-60"/>
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="block text-xs font-semibold">Observações e condições comerciais</span>
        <textarea value={notes} rows={3} maxLength={1000}
          onChange={event=>setNotes(event.target.value)}
          placeholder="Prazo estimado, instalação, retirada, condições negociadas..."
          className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm"/>
      </label>
      <div className="space-y-1.5 rounded-lg border border-border bg-muted/25 p-3">
        <div className="flex justify-between gap-2 text-xs"><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
        <div className="flex justify-between gap-2 text-xs"><span>Desconto</span><strong>{formatCurrency(Number.isFinite(discount)?discount:0)}</strong></div>
        <div className="flex justify-between gap-2 border-t border-border pt-2 text-sm">
          <strong>Total proposto</strong><strong className="tabular-nums">{formatCurrency(Math.max(0,total))}</strong>
        </div>
      </div>
      {initial && <p className="text-xs text-muted-foreground">
        Se um preço mudou no Estoque, selecione novamente o produto na busca acima para atualizar o valor antes de salvar.
      </p>}
      {invalid && <p className="text-xs text-muted-foreground">{invalid}</p>}
      {errorText && <p role="alert" className="text-xs text-destructive">{errorText}</p>}
    </div>
  </AdminDialog>
  {quickCustomerOpen&&<SalesQuickCustomerDialog organizationId={organizationId}
    onClose={()=>setQuickCustomerOpen(false)}
    onSaved={saved=>{
      setCustomer({id:saved.id,name:saved.name,document:saved.document});
      setQuickCustomerOpen(false);
      setSearch("");
      setErrorText(null);
    }}/>}
  </>;
}
