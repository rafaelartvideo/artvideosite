import { useEffect, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { AdminDialog, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import {
  addMyTechnicianOrderItem, removeMyTechnicianOrderProduct, searchMyTechnicianOrderCatalog,
  type TechnicianCatalogOption, type TechnicianOrderItem,
} from "../infrastructure/technician-tasks.repository";

type ItemType = "service" | "product";

type Props = {
  orderId: string;
  items: TechnicianOrderItem[];
  canAddService: boolean;
  canAddProduct: boolean;
  canRemoveProduct: boolean;
  blocked: boolean;
  onChanged: () => void;
  onFeedback: (message: string, kind: "success" | "error") => void;
  inline?: boolean;
};

export function TechnicianOrderItemsSection({
  orderId, items, canAddService, canAddProduct, canRemoveProduct, blocked,
  onChanged, onFeedback, inline = false,
}: Props) {
  const [catalogType, setCatalogType] = useState<ItemType | null>(null);
  const [catalog, setCatalog] = useState<TechnicianCatalogOption[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCatalog, setSelectedCatalog] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const showError = (message: string) => notifyAdmin(message, "error");
  const [removing, setRemoving] = useState<TechnicianOrderItem | null>(null);

  const loadCatalog = async (type: ItemType, term: string) => {
    setLoading(true);
    /* Feedback exibido pelo toast global. */
    try {
      const result = await searchMyTechnicianOrderCatalog(orderId, type, term);
      setCatalog(result);
    } catch (error) {
      setCatalog([]);
      showError(systemErrorMessage(error, "Não foi possível consultar o catálogo."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!catalogType) return;
    let cancelled = false;
    setCatalog([]);
    setSelectedCatalog(null);
    setSearch("");
    setQuantity("1");
    /* Feedback exibido pelo toast global. */
    setLoading(true);
    void searchMyTechnicianOrderCatalog(orderId, catalogType, "")
      .then(result => { if (!cancelled) setCatalog(result); })
      .catch(error => {
        if (!cancelled) showError(systemErrorMessage(error, "Não foi possível consultar o catálogo."));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [orderId, catalogType]);

  const addItem = async () => {
    if (!catalogType || !selectedCatalog || busy || blocked) return;
    const count = Number(quantity);
    if (!Number.isInteger(count) || count < 1 || count > 99) {
      showError("Informe uma quantidade inteira de 1 a 99.");
      return;
    }
    setBusy(true);
    /* Feedback exibido pelo toast global. */
    try {
      await addMyTechnicianOrderItem(orderId, catalogType, selectedCatalog, count);
      setCatalogType(null);
      onFeedback(catalogType === "service" ? "Serviço incluído e atribuído a você." : "Produto incluído na OS.", "success");
      onChanged();
    } catch (error) {
      showError(systemErrorMessage(error, "Não foi possível adicionar o item."));
    } finally {
      setBusy(false);
    }
  };

  const removeProduct = async () => {
    if (!removing || busy || blocked || removing.type !== "product") return;
    setBusy(true);
    /* Feedback exibido pelo toast global. */
    try {
      await removeMyTechnicianOrderProduct(orderId, removing.id);
      setRemoving(null);
      onFeedback("Produto removido da OS.", "success");
      onChanged();
    } catch (error) {
      showError(systemErrorMessage(error, "Não foi possível remover o produto."));
    } finally {
      setBusy(false);
    }
  };

  return <>
    {inline ? <div className="border-t border-border/70 pt-4"><p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Produtos e serviços da OS</p>
      <div className="space-y-4">
        {!blocked && (canAddService || canAddProduct) && <div className="flex flex-wrap gap-2">
          {canAddService && <BtnSecondary disabled={busy} onClick={() => setCatalogType("service")}>Adicionar serviço</BtnSecondary>}
          {canAddProduct && <BtnSecondary disabled={busy} onClick={() => setCatalogType("product")}>Adicionar produto</BtnSecondary>}
        </div>}
        {items.length ? <div className="divide-y divide-border">
          {items.map(item => <div key={item.id}
            className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold text-foreground">{item.title}</p>
              
              <p className="mt-1 text-xs text-muted-foreground">{item.type === "product" ? "Produto" : "Serviço"} · Qtd. {item.quantity}</p>
            </div>
            {!blocked && canRemoveProduct && item.type === "product" && <BtnSecondary
              disabled={busy} onClick={() => { /* Feedback exibido pelo toast global. */ setRemoving(item); }}>Remover</BtnSecondary>}
          </div>)}
        </div> : <p className="text-sm text-muted-foreground">Nenhum produto ou serviço cadastrado na OS.</p>}
      </div>
    </div> : <Section title="Produtos e serviços da OS">      <div className="space-y-4">
        {!blocked && (canAddService || canAddProduct) && <div className="flex flex-wrap gap-2">
          {canAddService && <BtnSecondary disabled={busy} onClick={() => setCatalogType("service")}>Adicionar serviço</BtnSecondary>}
          {canAddProduct && <BtnSecondary disabled={busy} onClick={() => setCatalogType("product")}>Adicionar produto</BtnSecondary>}
        </div>}
        {items.length ? <div className="divide-y divide-border">
          {items.map(item => <div key={item.id}
            className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold text-foreground">{item.title}</p>
              
              <p className="mt-1 text-xs text-muted-foreground">{item.type === "product" ? "Produto" : "Serviço"} · Qtd. {item.quantity}</p>
            </div>
            {!blocked && canRemoveProduct && item.type === "product" && <BtnSecondary
              disabled={busy} onClick={() => { /* Feedback exibido pelo toast global. */ setRemoving(item); }}>Remover</BtnSecondary>}
          </div>)}
        </div> : <p className="text-sm text-muted-foreground">Nenhum produto ou serviço cadastrado na OS.</p>}
      </div>
    </Section>}

    <AdminDialog open={Boolean(catalogType)} onClose={() => { if (!busy) setCatalogType(null); }}
      title={catalogType === "service" ? "Adicionar serviço" : "Adicionar produto"}
      description="Os valores do catálogo são tratados no banco e não são exibidos nesta tela."
      footer={<div className="flex flex-wrap justify-end gap-2">
        <BtnSecondary disabled={busy} onClick={() => setCatalogType(null)}>Cancelar</BtnSecondary>
        <BtnPrimary loading={busy} disabled={busy || !selectedCatalog || blocked} onClick={() => void addItem()}>Adicionar</BtnPrimary>
      </div>}>
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1"><FInput label="Buscar no catálogo" value={search}
            placeholder="Digite o nome" maxLength={100} onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter" && catalogType) { event.preventDefault(); void loadCatalog(catalogType, search); }
            }}/></div>
          <BtnSecondary disabled={loading || busy || !catalogType} onClick={() => { if (catalogType) void loadCatalog(catalogType, search); }}>Buscar</BtnSecondary>
        </div>
        {loading ? <p className="text-sm text-muted-foreground">Consultando itens...</p> : !catalog.length
          ? <p className="text-sm text-muted-foreground">Nenhum item disponível.</p>
          : <div className="max-h-60 divide-y divide-border overflow-y-auto border border-border">
            {catalog.map(option => <button key={option.id} type="button"
              aria-pressed={selectedCatalog === option.id} onClick={() => setSelectedCatalog(option.id)}
              className={"flex w-full cursor-pointer px-3 py-3 text-left text-sm font-medium hover:bg-muted " +
                (selectedCatalog === option.id ? "bg-primary/10 text-primary" : "text-foreground")}>
              {option.name}
            </button>)}
          </div>}
        <FInput label="Quantidade" type="number" min={1} max={99} step={1}
          value={quantity} onChange={(event: ChangeEvent<HTMLInputElement>) => setQuantity(event.target.value)}/>
        
      </div>
    </AdminDialog>

    <AdminDialog open={Boolean(removing)} onClose={() => { if (!busy) setRemoving(null); }}
      title="Remover produto" description={removing?.title || ""}
      footer={<div className="flex justify-end gap-2">
        <BtnSecondary disabled={busy} onClick={() => setRemoving(null)}>Cancelar</BtnSecondary>
        <BtnPrimary loading={busy} disabled={busy || blocked} onClick={() => void removeProduct()}>Remover produto</BtnPrimary>
      </div>}>
      <p className="text-sm text-foreground">O produto será removido da OS e os totais comerciais serão recalculados. Esta operação não finaliza o serviço.</p>
      
    </AdminDialog>
  </>;
}
