import { useEffect, useState, type ChangeEvent } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { AdminDialog, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import {
  addMyTechnicianOrderItem, removeMyTechnicianOrderProduct, searchMyTechnicianOrderCatalog,
  type TechnicianCatalogOption, type TechnicianOrderItem,
} from "../infrastructure/technician-tasks.repository";

type Props = {
  mode: "services" | "products";
  orderId: string;
  items: TechnicianOrderItem[];
  canAddService: boolean;
  canAddProduct: boolean;
  canRemoveProduct: boolean;
  blocked: boolean;
  onChanged: () => void;
  onFeedback: (message: string, kind: "success" | "error") => void;
};

function QuantityStepper({ value, onChange, disabled }: {
  value: string; onChange: (value: string) => void; disabled: boolean;
}) {
  const number = Number(value);
  return <div className="flex h-10 min-w-0 overflow-hidden rounded-lg border border-border bg-muted/55 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
    <input aria-label="Quantidade" inputMode="numeric" value={value} disabled={disabled}
      onChange={event => onChange(event.target.value.replace(/\D/g, ""))}
      className="min-w-0 flex-1 bg-transparent px-3 text-sm text-foreground outline-none" />
    <div className="flex w-8 shrink-0 flex-col border-l border-border">
      <button type="button" tabIndex={-1} disabled={disabled || number >= 99}
        aria-label="Aumentar quantidade" onClick={() => onChange(String(Math.min(99, (number || 0) + 1)))}
        className="flex flex-1 items-center justify-center border-b border-border text-muted-foreground hover:bg-muted disabled:opacity-40"><ChevronUp size={12} /></button>
      <button type="button" tabIndex={-1} disabled={disabled || number <= 1}
        aria-label="Diminuir quantidade" onClick={() => onChange(String(Math.max(1, (number || 1) - 1)))}
        className="flex flex-1 items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-40"><ChevronDown size={12} /></button>
    </div>
  </div>;
}

export function TechnicianOrderItemsSection({
  mode, orderId, items, canAddService, canAddProduct, canRemoveProduct, blocked, onChanged, onFeedback,
}: Props) {
  const [serviceOpen, setServiceOpen] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceOptions, setServiceOptions] = useState<TechnicianCatalogOption[]>([]);
  const [selectedService, setSelectedService] = useState<TechnicianCatalogOption | null>(null);
  const [serviceQuantity, setServiceQuantity] = useState("1");
  const [serviceLoading, setServiceLoading] = useState(false);

  const [productSearch, setProductSearch] = useState("");
  const [productOptions, setProductOptions] = useState<TechnicianCatalogOption[]>([]);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<TechnicianCatalogOption | null>(null);
  const [productQuantity, setProductQuantity] = useState("1");
  const [productLoading, setProductLoading] = useState(false);

  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<TechnicianOrderItem | null>(null);
  const showError = (error: unknown, fallback: string) =>
    notifyAdmin(systemErrorMessage(error, fallback), "error");

  useEffect(() => {
    if (!serviceOpen) return;
    let cancelled = false;
    setServiceLoading(true);
    const timeout = window.setTimeout(() => {
      void searchMyTechnicianOrderCatalog(orderId, "service", serviceSearch).then(result => {
        if (!cancelled) setServiceOptions(result);
      }).catch(error => {
        if (!cancelled) { setServiceOptions([]); showError(error, "Não foi possível buscar serviços."); }
      }).finally(() => { if (!cancelled) setServiceLoading(false); });
    }, serviceSearch ? 200 : 0);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [orderId, serviceOpen, serviceSearch]);

  useEffect(() => {
    if (mode !== "products" || !productSearchOpen || selectedProduct) return;
    let cancelled = false;
    setProductLoading(true);
    const timeout = window.setTimeout(() => {
      void searchMyTechnicianOrderCatalog(orderId, "product", productSearch).then(result => {
        if (!cancelled) setProductOptions(result);
      }).catch(error => {
        if (!cancelled) { setProductOptions([]); showError(error, "Não foi possível buscar produtos."); }
      }).finally(() => { if (!cancelled) setProductLoading(false); });
    }, productSearch ? 200 : 0);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [orderId, mode, productSearchOpen, productSearch, selectedProduct]);

  const addItem = async (type: "service" | "product", catalogId: string | undefined, quantityText: string) => {
    if (!catalogId || busy || blocked) return;
    const quantity = Number(quantityText);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      notifyAdmin("Informe uma quantidade inteira de 1 a 99.", "error");
      return;
    }
    setBusy(true);
    try {
      await addMyTechnicianOrderItem(orderId, type, catalogId, quantity);
      if (type === "service") {
        setServiceOpen(false);
        setSelectedService(null);
        setServiceSearch("");
        setServiceQuantity("1");
      } else {
        setSelectedProduct(null);
        setProductSearch("");
        setProductQuantity("1");
        setProductSearchOpen(false);
      }
      onFeedback(type === "service" ? "Serviço adicionado e atribuído a você." : "Produto incluído na OS.", "success");
      onChanged();
    } catch (error) {
      showError(error, "Não foi possível adicionar o item.");
    } finally { setBusy(false); }
  };

  const removeProduct = async () => {
    if (!removing || busy || blocked || removing.type !== "product") return;
    setBusy(true);
    try {
      await removeMyTechnicianOrderProduct(orderId, removing.id);
      setRemoving(null);
      onFeedback("Produto removido da OS.", "success");
      onChanged();
    } catch (error) {
      showError(error, "Não foi possível remover o produto.");
    } finally { setBusy(false); }
  };

  if (mode === "services") return <>
    {canAddService && !blocked && <BtnSecondary disabled={busy}
      onClick={() => {
        setServiceSearch(""); setServiceOptions([]); setSelectedService(null);
        setServiceQuantity("1"); setServiceOpen(true);
      }}>Adicionar novo</BtnSecondary>}
    <AdminDialog open={serviceOpen} onClose={() => { if (!busy) setServiceOpen(false); }}
      title="Adicionar serviço" description="Selecione um serviço do catálogo para esta OS."
      footer={<div className="flex justify-end gap-2">
        <BtnSecondary onClick={() => setServiceOpen(false)} disabled={busy}>Cancelar</BtnSecondary>
        <BtnPrimary onClick={() => void addItem("service", selectedService?.id, serviceQuantity)}
          disabled={busy || blocked || !selectedService} loading={busy}>Adicionar</BtnPrimary>
      </div>}>
      <div className="space-y-4">
        <FInput label="Buscar serviço" value={serviceSearch}
          placeholder="Nome do serviço" onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setServiceSearch(event.target.value); setSelectedService(null);
          }} />
        <div className="max-h-60 min-h-32 overflow-y-auto rounded-lg border border-border">
          {serviceLoading ? <p className="p-4 text-center text-xs text-muted-foreground">Buscando serviços...</p>
            : !serviceOptions.length ? <p className="p-4 text-center text-xs text-muted-foreground">Nenhum serviço encontrado.</p>
            : serviceOptions.map(option => <button key={option.id} type="button"
              aria-pressed={selectedService?.id === option.id}
              onClick={() => setSelectedService(option)}
              className={"block w-full border-b border-border px-4 py-3 text-left text-sm font-medium last:border-0 hover:bg-muted " +
                (selectedService?.id === option.id ? "bg-primary/10 text-primary" : "text-foreground")}>
              {option.name}
            </button>)}
        </div>
        <div className="max-w-32">
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">Quantidade</label>
          <QuantityStepper value={serviceQuantity} onChange={setServiceQuantity} disabled={busy} />
        </div>
      </div>
    </AdminDialog>
  </>;

  const products = items.filter(item => item.type === "product");
  return <>
    <Section title={<span className="inline-flex items-center gap-2">
      Produtos
      <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">{products.length}</span>
    </span>}>
      <div className="space-y-4">
        {canAddProduct && !blocked && <div className="space-y-3">
          <div className="max-w-2xl">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Produto</label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={productSearch}
                onFocus={() => setProductSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setProductSearchOpen(false), 120)}
                onChange={event => {
                  setProductSearch(event.target.value);
                  setSelectedProduct(null);
                  setProductSearchOpen(true);
                }}
                placeholder="Busque no estoque por nome ou SKU"
                className={INPUT + " pl-9"} />
            </div>
            {productSearchOpen && !selectedProduct && <div className="max-h-56 overflow-y-auto border border-border bg-popover shadow-sm">
              {productLoading ? <p className="p-3 text-center text-xs text-muted-foreground">Buscando produtos...</p>
                : !productOptions.length ? <p className="p-3 text-center text-xs text-muted-foreground">Nenhum produto encontrado.</p>
                : productOptions.map(option => <button key={option.id} type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => { setSelectedProduct(option); setProductSearch(option.name); setProductSearchOpen(false); }}
                  className="block w-full border-b border-border px-3 py-3 text-left text-sm font-semibold text-foreground last:border-0 hover:bg-primary/10">
                  {option.name}
                </button>)}
            </div>}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-28">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Quantidade</label>
              <QuantityStepper value={productQuantity} onChange={setProductQuantity} disabled={busy} />
            </div>
            <BtnPrimary disabled={busy || !selectedProduct} loading={busy}
              onClick={() => void addItem("product", selectedProduct?.id, productQuantity)}>Adicionar produto</BtnPrimary>
          </div>
        </div>}
        {products.length ? <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {products.map(item => <div key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 p-3 sm:p-4">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-bold text-foreground">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">Qtd. {item.quantity}</p>
            </div>
            {!blocked && canRemoveProduct && <BtnSecondary disabled={busy}
              onClick={() => setRemoving(item)}>Remover</BtnSecondary>}
          </div>)}
        </div> : <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum produto adicionado à OS.
        </p>}
      </div>
    </Section>
    <AdminDialog open={Boolean(removing)} onClose={() => { if (!busy) setRemoving(null); }}
      title="Remover produto" description={removing?.title || ""}
      footer={<div className="flex justify-end gap-2">
        <BtnSecondary disabled={busy} onClick={() => setRemoving(null)}>Cancelar</BtnSecondary>
        <BtnPrimary disabled={busy || blocked} loading={busy} onClick={() => void removeProduct()}>Remover produto</BtnPrimary>
      </div>}>
      <p className="text-sm text-foreground">O produto será removido da OS e os totais serão recalculados. Esta operação não finaliza o serviço.</p>
    </AdminDialog>
  </>;
}
