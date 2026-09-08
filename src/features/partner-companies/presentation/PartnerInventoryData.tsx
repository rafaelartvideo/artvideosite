import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Edit2, Eraser, History, MapPin, Package, Plus, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  deleteInventoryItem,
  getInventoryItem,
  listInventoryItems,
  listInventoryMovements,
  recordInventoryMovement,
  saveInventoryItem,
  setInventoryItemActive,
} from "@/features/inventory/infrastructure/inventory.repository";
import { AdminButton, AdminCard, AdminDialog, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FCurrencyInput, FInput, FIntegerInput, FSelect, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { cn, formatCurrency, formatDateTime, formatNumber } from "@/shared/domain/formatters";
import { supabaseErrorMessage } from "@/shared/infrastructure/media.repository";

type AccessMode = "read" | "manage";
type InventoryForm = {
  name: string;
  sku: string;
  description: string;
  unit: "un" | "cx";
  conversion_factor: string;
  quantity: string;
  min_quantity: string;
  purchase_price: string;
  sale_price: string;
  storage_shelf: string;
  storage_level: string;
  storage_compartment: string;
  is_active: boolean;
};

type MovementForm = { type: "in" | "out" | "adjust"; quantity: string; reason: string };

const emptyForm = (): InventoryForm => ({
  name: "",
  sku: "",
  description: "",
  unit: "un",
  conversion_factor: "1",
  quantity: "0",
  min_quantity: "0",
  purchase_price: "",
  sale_price: "",
  storage_shelf: "",
  storage_level: "",
  storage_compartment: "",
  is_active: true,
});

const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");
const unitLabel = (unit?: string | null) => unit === "cx" ? "cx" : "un";
const conversionFactor = (item: any) => Math.max(1, Number(item?.conversion_factor ?? 1) || 1);
const storageAddress = (item: any) => [
  item?.storage_shelf ? `Estante ${item.storage_shelf}` : "",
  item?.storage_level ? `Prateleira ${item.storage_level}` : "",
  item?.storage_compartment ? `Compartimento ${item.storage_compartment}` : "",
].filter(Boolean).join(" · ");

function movementLabel(value: unknown) {
  const type = String(value || "").toLowerCase();
  if (type === "in") return "Entrada";
  if (type === "out") return "Saída";
  if (type === "adjust") return "Ajuste";
  if (type === "use") return "Uso em OS";
  return String(value || "Movimentação");
}

function formFromItem(item: any): InventoryForm {
  return {
    name: item?.name || "",
    sku: item?.sku || "",
    description: item?.description || "",
    unit: item?.unit === "cx" ? "cx" : "un",
    conversion_factor: String(item?.unit === "cx" ? conversionFactor(item) : 1),
    quantity: String(Number(item?.quantity ?? 0)),
    min_quantity: String(Number(item?.min_quantity ?? 0)),
    purchase_price: item?.purchase_price == null ? "" : String(item.purchase_price),
    sale_price: item?.sale_price == null ? "" : String(item.sale_price),
    storage_shelf: item?.storage_shelf || "",
    storage_level: item?.storage_level || "",
    storage_compartment: item?.storage_compartment || "",
    is_active: item?.is_active !== false,
  };
}

export function PartnerInventoryData({ organizationId, accessMode }: { organizationId: string; accessMode: AccessMode }) {
  const { user, hasPermission } = useAuth();
  const canViewDetails = hasPermission("inventory.details.view");
  const canCreate = accessMode === "manage" && hasPermission("inventory.create");
  const canEdit = accessMode === "manage" && hasPermission("inventory.update");
  const canToggle = accessMode === "manage" && hasPermission("inventory.toggle_active");
  const canDelete = accessMode === "manage" && hasPermission("inventory.delete");
  const canViewMovements = hasPermission("inventory.movements.view");
  const canMove = accessMode === "manage" && hasPermission("inventory.movements.create");

  const itemsQuery = useQuery({
    queryKey: [...queryKeys.inventory.lists(), organizationId],
    queryFn: () => listInventoryItems(organizationId),
    enabled: Boolean(organizationId),
  });
  const items = itemsQuery.data ?? [];

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [nameSearch, setNameSearch] = useState("");
  const [skuSearch, setSkuSearch] = useState("");
  const [addressSearch, setAddressSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [detailItem, setDetailItem] = useState<any>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [form, setForm] = useState<InventoryForm>(emptyForm);
  const [savingItem, setSavingItem] = useState(false);
  const [movementItem, setMovementItem] = useState<any>(null);
  const [movementForm, setMovementForm] = useState<MovementForm>({ type: "in", quantity: "", reason: "" });
  const [savingMovement, setSavingMovement] = useState(false);
  const [historyItem, setHistoryItem] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    setDetailItem(null);
    setEditingItem(null);
    setMovementItem(null);
    setHistoryItem(null);
    setPage(1);
  }, [organizationId]);

  useEffect(() => {
    if (!itemsQuery.error) return;
    setToast({ msg: `Erro ao carregar estoque: ${supabaseErrorMessage(itemsQuery.error)}`, type: "error" });
  }, [itemsQuery.error]);

  const filtered = useMemo(() => items.filter((item: any) => {
    if (nameSearch && !normalize(item.name).includes(normalize(nameSearch))) return false;
    if (skuSearch && !normalize(item.sku).includes(normalize(skuSearch))) return false;
    if (addressSearch && !normalize(`${storageAddress(item)} ${item.storage_shelf || ""} ${item.storage_level || ""} ${item.storage_compartment || ""}`).includes(normalize(addressSearch))) return false;
    return true;
  }), [items, nameSearch, skuSearch, addressSearch]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasFilters = Boolean(nameSearch || skuSearch || addressSearch);

  useEffect(() => setPage(1), [nameSearch, skuSearch, addressSearch]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const clearFilters = () => {
    setNameSearch("");
    setSkuSearch("");
    setAddressSearch("");
    setPage(1);
  };

  const openNew = () => {
    if (!canCreate) return;
    setEditingItem(null);
    setForm(emptyForm());
  };

  const openEdit = (item: any) => {
    if (!canEdit) return;
    setEditingItem(item);
    setForm(formFromItem(item));
  };

  const saveItem = async () => {
    const canSave = editingItem ? canEdit : canCreate;
    if (!canSave || savingItem) return;
    if (!form.name.trim()) { setToast({ msg: "Informe o nome do item.", type: "error" }); return; }
    const factor = form.unit === "cx" ? Number(form.conversion_factor) : 1;
    const initialQuantity = Number(form.quantity || 0);
    const minQuantity = Number(form.min_quantity || 0);
    const purchasePrice = form.purchase_price === "" ? null : Number(form.purchase_price);
    const salePrice = form.sale_price === "" ? null : Number(form.sale_price);
    if (!Number.isInteger(factor) || factor < 1) { setToast({ msg: "Informe quantas unidades existem em cada caixa.", type: "error" }); return; }
    if (!editingItem && (!Number.isInteger(initialQuantity) || initialQuantity < 0)) { setToast({ msg: "Informe uma quantidade inicial inteira e não negativa.", type: "error" }); return; }
    if (!Number.isInteger(minQuantity) || minQuantity < 0) { setToast({ msg: "Informe uma quantidade mínima inteira e não negativa.", type: "error" }); return; }
    if ((purchasePrice !== null && (!Number.isFinite(purchasePrice) || purchasePrice < 0)) || (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 0))) { setToast({ msg: "Informe preços válidos e não negativos.", type: "error" }); return; }

    const commonPayload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      description: form.description.trim() || null,
      unit: form.unit,
      conversion_factor: factor,
      min_quantity: minQuantity,
      purchase_price: purchasePrice,
      sale_price: salePrice,
      storage_shelf: form.storage_shelf.trim() || null,
      storage_level: form.storage_level.trim() || null,
      storage_compartment: form.storage_compartment.trim() || null,
      is_active: form.is_active,
    };
    const payload = editingItem ? commonPayload : { ...commonPayload, quantity: initialQuantity };

    setSavingItem(true);
    try {
      await saveInventoryItem(payload, editingItem?.id, organizationId);
      setToast({ msg: editingItem ? "Item atualizado." : "Item cadastrado.", type: "success" });
      setEditingItem(null);
      setForm(emptyForm());
      await itemsQuery.refetch();
    } catch (error) {
      setToast({ msg: `Erro ao salvar item: ${supabaseErrorMessage(error)}`, type: "error" });
    } finally {
      setSavingItem(false);
    }
  };

  const toggleActive = async (item: any) => {
    if (!canToggle) return;
    try {
      await setInventoryItemActive(item.id, item.is_active === false, organizationId);
      setToast({ msg: item.is_active === false ? "Item ativado." : "Item desativado.", type: "success" });
      await itemsQuery.refetch();
    } catch (error) {
      setToast({ msg: `Erro ao alterar status: ${supabaseErrorMessage(error)}`, type: "error" });
    }
  };

  const removeItem = async (item: any) => {
    if (!canDelete) return;
    try {
      await deleteInventoryItem(item.id, organizationId);
      setDetailItem(null);
      setToast({ msg: "Item excluído do estoque.", type: "success" });
      await itemsQuery.refetch();
    } catch (error) {
      setToast({ msg: `Erro ao excluir item: ${supabaseErrorMessage(error)}`, type: "error" });
    }
  };

  const openMovement = (item: any) => {
    if (!canMove) return;
    setMovementItem(item);
    setMovementForm({ type: "in", quantity: "", reason: "" });
  };

  const saveMovement = async () => {
    if (!movementItem || !canMove || savingMovement) return;
    const quantity = Number(movementForm.quantity || 0);
    if (!Number.isInteger(quantity) || quantity <= 0) { setToast({ msg: "Informe uma quantidade inteira maior que zero.", type: "error" }); return; }

    setSavingMovement(true);
    try {
      const currentItem = await getInventoryItem(movementItem.id, organizationId);
      if (!currentItem) throw new Error("Item não encontrado nesta empresa.");
      if (currentItem.is_active === false) throw new Error("O item está inativo e não pode receber movimentações.");
      const current = Number(currentItem.quantity ?? 0);
      const movementType = movementForm.type === "in" ? "IN" : movementForm.type === "out" ? "OUT" : "ADJUST";
      let nextQuantity = current;
      if (movementType === "IN") nextQuantity = current + quantity;
      if (movementType === "OUT") {
        if (current < quantity) throw new Error(`Estoque insuficiente. Disponível: ${formatNumber(current)} ${unitLabel(currentItem.unit)}.`);
        nextQuantity = current - quantity;
      }
      if (movementType === "ADJUST") nextQuantity = quantity;

      await recordInventoryMovement({
        inventory_item_id: movementItem.id,
        movement_type: movementType,
        quantity,
        reason: movementForm.reason.trim() || "Movimentação manual",
        created_by: user?.id || null,
        service_order_id: null,
      }, movementItem.id, nextQuantity, organizationId);

      setMovementItem(null);
      setMovementForm({ type: "in", quantity: "", reason: "" });
      setToast({ msg: "Movimentação registrada com sucesso.", type: "success" });
      await itemsQuery.refetch();
    } catch (error) {
      setToast({ msg: `Erro na movimentação: ${supabaseErrorMessage(error)}`, type: "error" });
    } finally {
      setSavingMovement(false);
    }
  };

  const openHistory = async (item: any) => {
    if (!canViewMovements) return;
    setHistoryItem(item);
    setHistory([]);
    setHistoryLoading(true);
    try {
      setHistory(await listInventoryMovements(item.id, organizationId));
    } catch (error) {
      setToast({ msg: `Erro ao carregar histórico: ${supabaseErrorMessage(error)}`, type: "error" });
    } finally {
      setHistoryLoading(false);
    }
  };

  const showActions = canViewDetails || canEdit || canMove || canViewMovements || canToggle || canDelete;

  return <div className="min-w-0 space-y-4">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <h4 className="text-base font-black text-[#0d1b2e]">Estoque</h4>
        <p className="mt-0.5 text-xs text-[#5a6a82]">Itens e movimentações da empresa selecionada.</p>
      </div>
      {canCreate && <AdminButton size="sm" onClick={openNew}><Plus size={14} /><span className="hidden sm:inline">Novo item</span></AdminButton>}
    </div>

    <AdminSearchPanel title="Buscar estoque">
      <div className="grid gap-3 md:grid-cols-3">
        <FInput label="Nome" value={nameSearch} onChange={(e: any) => setNameSearch(e.target.value)} placeholder="Digite o nome da peça" />
        <FInput label="SKU" value={skuSearch} onChange={(e: any) => setSkuSearch(e.target.value)} placeholder="Digite o SKU" />
        <FInput label="Endereço" value={addressSearch} onChange={(e: any) => setAddressSearch(e.target.value)} placeholder="Estante, prateleira ou compartimento" />
      </div>
      {hasFilters && <div className="mt-3 flex justify-end"><AdminButton variant="danger" size="sm" onClick={clearFilters} className="bg-white text-red-600 hover:bg-red-50"><Eraser size={14} /> Limpar filtros</AdminButton></div>}
    </AdminSearchPanel>

    <AdminCard>
      {itemsQuery.isPending ? <LoadingState /> : filtered.length === 0 ? <EmptyState icon={Package} title={items.length ? "Nenhum item encontrado" : "Nenhum item em estoque"} message={items.length ? "Ajuste os filtros para encontrar o item." : "Não há itens cadastrados nesta empresa."} /> : <>
        <div className="divide-y divide-[#0d1b2e]/8 md:hidden">
          {paged.map((item: any) => {
            const quantity = Number(item.quantity ?? 0);
            const minQuantity = Number(item.min_quantity ?? 0);
            return <article key={item.id} className="space-y-3 p-4">
              <button type="button" onClick={() => canViewDetails && setDetailItem(item)} className="flex w-full items-start justify-between gap-3 text-left">
                <div className="min-w-0"><p className="break-words text-sm font-black text-[#0d1b2e]">{item.name}</p><p className="mt-1 font-mono text-[10px] font-semibold text-[#5a6a82]">SKU {item.sku || "—"}</p></div>
                <StatusBadge status={item.is_active !== false ? "Ativo" : "Inativo"} />
              </button>
              {storageAddress(item) && <div className="flex items-start gap-2 rounded-lg bg-[#f5f7fa] px-3 py-2 text-xs font-semibold text-[#34445b]"><MapPin size={14} className="mt-0.5 shrink-0 text-[#0057e7]" /><span>{storageAddress(item)}</span></div>}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Quantidade</p><p className={cn("mt-1 font-black", quantity <= 0 ? "text-red-700" : quantity <= minQuantity ? "text-amber-700" : "text-emerald-700")}>{formatNumber(quantity)} {unitLabel(item.unit)}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Mínimo</p><p className="mt-1 font-bold text-[#0d1b2e]">{formatNumber(minQuantity)} {unitLabel(item.unit)}</p></div>
              </div>
              {showActions && <div className="flex flex-wrap justify-end gap-2 border-t border-[#0d1b2e]/8 pt-3">
                {canViewDetails && <AdminButton variant="secondary" size="sm" onClick={() => setDetailItem(item)}>Detalhes</AdminButton>}
                {canEdit && <AdminIconButton ariaLabel="Editar item" onClick={() => openEdit(item)}><Edit2 size={15} /></AdminIconButton>}
                {canMove && <AdminIconButton ariaLabel="Movimentar estoque" onClick={() => openMovement(item)}><ArrowLeftRight size={15} /></AdminIconButton>}
                {canViewMovements && <AdminIconButton ariaLabel="Histórico de movimentações" onClick={() => void openHistory(item)}><History size={15} /></AdminIconButton>}
              </div>}
            </article>;
          })}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[900px]">
            <thead><tr><th className="text-left">Nome</th><th className="text-left">SKU</th><th className="text-left">Endereço</th><th className="text-left">Quantidade</th><th className="text-left">Mínimo</th><th className="text-left">Venda</th><th className="text-left">Status</th>{showActions && <th className="text-right">Ações</th>}</tr></thead>
            <tbody>{paged.map((item: any) => <tr key={item.id} onClick={() => canViewDetails && setDetailItem(item)}>
              <td><p className="font-semibold text-[#0d1b2e]">{item.name}</p>{item.description && <p className="max-w-xs truncate text-[11px] text-[#5a6a82]">{item.description}</p>}</td>
              <td className="font-mono text-xs text-[#5a6a82]">{item.sku || "—"}</td>
              <td className="text-xs text-[#5a6a82]">{storageAddress(item) || "—"}</td>
              <td className="font-black text-[#0d1b2e]">{formatNumber(item.quantity)} {unitLabel(item.unit)}</td>
              <td className="text-xs text-[#5a6a82]">{formatNumber(item.min_quantity)} {unitLabel(item.unit)}</td>
              <td className="text-xs font-semibold text-[#0d1b2e]">{formatCurrency(item.sale_price)}</td>
              <td><StatusBadge status={item.is_active !== false ? "Ativo" : "Inativo"} /></td>
              {showActions && <td onClick={event => event.stopPropagation()}><div className="flex justify-end gap-1.5">
                {canViewDetails && <AdminButton variant="secondary" size="sm" onClick={() => setDetailItem(item)}>Detalhes</AdminButton>}
                {canEdit && <AdminIconButton ariaLabel="Editar item" onClick={() => openEdit(item)}><Edit2 size={15} /></AdminIconButton>}
                {canMove && <AdminIconButton ariaLabel="Movimentar estoque" onClick={() => openMovement(item)}><ArrowLeftRight size={15} /></AdminIconButton>}
                {canViewMovements && <AdminIconButton ariaLabel="Histórico de movimentações" onClick={() => void openHistory(item)}><History size={15} /></AdminIconButton>}
              </div></td>}
            </tr>)}</tbody>
          </table>
        </div>
        <PaginationBar page={safePage} pageSize={pageSize} totalItems={filtered.length} onPageChange={setPage} onPageSizeChange={next => { setPageSize(next); setPage(1); }} defaultPageSize={5} />
      </>}
    </AdminCard>

    <AdminDialog open={Boolean(detailItem)} onClose={() => setDetailItem(null)} title={detailItem?.name || "Detalhes do item"} description="Informações do estoque desta empresa." footer={detailItem && <div className="flex flex-wrap justify-end gap-2">
      {canToggle && <AdminButton variant="secondary" onClick={() => void toggleActive(detailItem)}>{detailItem.is_active !== false ? "Desativar" : "Ativar"}</AdminButton>}
      {canDelete && <AdminButton variant="danger" onClick={() => void removeItem(detailItem)}>Excluir</AdminButton>}
      {canEdit && <AdminButton onClick={() => { const item = detailItem; setDetailItem(null); openEdit(item); }}><Edit2 size={14} /> Editar</AdminButton>}
    </div>}>
      {detailItem && <div className="grid gap-4 sm:grid-cols-2">
        <Info label="Nome" value={detailItem.name || "—"} />
        <Info label="SKU" value={detailItem.sku || "—"} />
        <Info label="Status" value={detailItem.is_active !== false ? "Ativo" : "Inativo"} />
        <Info label="Unidade" value={`${unitLabel(detailItem.unit)}${detailItem.unit === "cx" ? ` · ${conversionFactor(detailItem)} un/cx` : ""}`} />
        <Info label="Quantidade" value={`${formatNumber(detailItem.quantity)} ${unitLabel(detailItem.unit)}`} />
        <Info label="Quantidade mínima" value={`${formatNumber(detailItem.min_quantity)} ${unitLabel(detailItem.unit)}`} />
        <Info label="Preço de compra" value={formatCurrency(detailItem.purchase_price)} />
        <Info label="Preço de venda" value={formatCurrency(detailItem.sale_price)} />
        <div className="sm:col-span-2"><Info label="Endereço no estoque" value={storageAddress(detailItem) || "—"} /></div>
        {detailItem.description && <div className="sm:col-span-2"><Info label="Descrição" value={detailItem.description} /></div>}
      </div>}
    </AdminDialog>

    <AdminDialog open={canCreate && !editingItem && form.name === "" && false} onClose={() => undefined} title="" description=""><div /></AdminDialog>
    <AdminDialog
      open={Boolean(editingItem) || (canCreate && form !== null && !editingItem && form.__new === true)}
      onClose={() => { setEditingItem(null); setForm(emptyForm()); }}
      title={editingItem ? "Editar item" : "Novo item"}
      description={editingItem ? "Atualize os dados do item desta empresa." : "Cadastre um novo item diretamente no estoque desta empresa."}
      footer={<div className="flex justify-end gap-2"><AdminButton variant="secondary" onClick={() => { setEditingItem(null); setForm(emptyForm()); }}>Cancelar</AdminButton><AdminButton loading={savingItem} onClick={() => void saveItem()}>Salvar</AdminButton></div>}
    >
      <InventoryFormFields form={form} setForm={setForm} editing={Boolean(editingItem)} />
    </AdminDialog>

    <AdminDialog
      open={Boolean(movementItem)}
      onClose={() => setMovementItem(null)}
      title={movementItem ? `Movimentar · ${movementItem.name}` : "Movimentar estoque"}
      description={movementItem ? `Saldo atual: ${formatNumber(movementItem.quantity)} ${unitLabel(movementItem.unit)}.` : undefined}
      footer={<div className="flex justify-end gap-2"><AdminButton variant="secondary" onClick={() => setMovementItem(null)}>Cancelar</AdminButton><AdminButton loading={savingMovement} onClick={() => void saveMovement()}>Registrar</AdminButton></div>}
    >
      <div className="space-y-4">
        <FSelect label="Tipo" value={movementForm.type} options={[{ value: "in", label: "Entrada" }, { value: "out", label: "Saída" }, { value: "adjust", label: "Ajuste de saldo" }]} onChange={(e: any) => setMovementForm(current => ({ ...current, type: e.target.value }))} />
        <FIntegerInput label={movementForm.type === "adjust" ? "Novo saldo" : "Quantidade"} value={movementForm.quantity} onChange={(e: any) => setMovementForm(current => ({ ...current, quantity: e.target.value }))} />
        <FTextarea label="Motivo" value={movementForm.reason} onChange={(e: any) => setMovementForm(current => ({ ...current, reason: e.target.value }))} placeholder="Motivo da movimentação" />
      </div>
    </AdminDialog>

    <AdminDialog open={Boolean(historyItem)} onClose={() => setHistoryItem(null)} title={historyItem ? `Movimentações · ${historyItem.name}` : "Movimentações"} description="Histórico do item nesta empresa." className="max-w-2xl">
      {historyLoading ? <LoadingState /> : history.length === 0 ? <p className="text-sm text-[#5a6a82]">Nenhuma movimentação registrada.</p> : <div className="divide-y divide-[#0d1b2e]/8">
        {history.map((movement: any) => <div key={movement.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="text-sm font-black text-[#0d1b2e]">{movementLabel(movement.movement_type)} · {formatNumber(movement.quantity)} {movement.display_unit || unitLabel(historyItem?.unit)}</p><p className="mt-1 text-xs text-[#5a6a82]">{movement.reason || "Sem motivo informado"}</p>{movement.service_order?.os_number && <p className="mt-1 text-[11px] font-semibold text-[#0057e7]">OS #{movement.service_order.os_number}</p>}</div>
          <div className="shrink-0 text-xs text-[#5a6a82] sm:text-right"><p>{formatDateTime(movement.created_at)}</p><p className="mt-1">{movement.created_by_profile?.full_name || "Sistema"}</p></div>
        </div>)}
      </div>}
    </AdminDialog>
  </div>;
}

function InventoryFormFields({ form, setForm, editing }: { form: InventoryForm; setForm: React.Dispatch<React.SetStateAction<InventoryForm>>; editing: boolean }) {
  const patch = (key: keyof InventoryForm, value: any) => setForm(current => ({ ...current, [key]: value }));
  return <div className="grid gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2"><FInput label="Nome" required value={form.name} onChange={(e: any) => patch("name", e.target.value)} /></div>
    <FInput label="SKU" value={form.sku} onChange={(e: any) => patch("sku", e.target.value)} />
    <FSelect label="Unidade" value={form.unit} options={[{ value: "un", label: "Unidade" }, { value: "cx", label: "Caixa" }]} onChange={(e: any) => patch("unit", e.target.value)} />
    {form.unit === "cx" && <FIntegerInput label="Unidades por caixa" value={form.conversion_factor} onChange={(e: any) => patch("conversion_factor", e.target.value)} />}
    {!editing && <FIntegerInput label="Quantidade inicial" value={form.quantity} onChange={(e: any) => patch("quantity", e.target.value)} />}
    <FIntegerInput label="Quantidade mínima" value={form.min_quantity} onChange={(e: any) => patch("min_quantity", e.target.value)} />
    <FCurrencyInput label="Preço de compra" value={form.purchase_price} onChange={(e: any) => patch("purchase_price", e.target.value)} />
    <FCurrencyInput label="Preço de venda" value={form.sale_price} onChange={(e: any) => patch("sale_price", e.target.value)} />
    <FInput label="Estante" value={form.storage_shelf} onChange={(e: any) => patch("storage_shelf", e.target.value)} />
    <FInput label="Prateleira" value={form.storage_level} onChange={(e: any) => patch("storage_level", e.target.value)} />
    <FInput label="Compartimento" value={form.storage_compartment} onChange={(e: any) => patch("storage_compartment", e.target.value)} />
    <div className="sm:col-span-2"><FTextarea label="Descrição" value={form.description} onChange={(e: any) => patch("description", e.target.value)} /></div>
    <div className="sm:col-span-2"><FToggle label="Item ativo" description="Itens inativos ficam bloqueados para novas movimentações." checked={form.is_active} onChange={value => patch("is_active", value)} /></div>
  </div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</p><p className="mt-1 break-words text-sm font-semibold text-[#0d1b2e]">{value}</p></div>;
}
