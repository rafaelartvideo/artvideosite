import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle,
  Edit2,
  List,
  Package,
  Plus,
  Trash2,
} from "lucide-react";
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
} from "../infrastructure/inventory.repository";
import {
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  cn,
  EmptyState,
  FInput,
  FTextarea,
  FToggle,
  INPUT,
  InternalBackButton,
  LoadingState,
  PageHeader,
  Toast,
} from "@/shared/admin/AdminPrimitives";

export function TabInventory({ onBack }: { onBack: () => void }) {
  const { user, hasPermission } = useAuth();
  const canViewInventory = hasPermission("inventory.view");
  const canCreateInventory = hasPermission("inventory.create");
  const canEditInventory = hasPermission("inventory.update");
  const canDeleteInventory = hasPermission("inventory.delete");
  const canManageInventory = canViewInventory || canCreateInventory || canEditInventory || canDeleteInventory;
  const queryClient = useQueryClient();
  const itemsQuery = useQuery({
    queryKey: queryKeys.inventory.lists(),
    queryFn: listInventoryItems,
    enabled: canManageInventory,
  });
  const items = itemsQuery.data ?? [];
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", sku: "", description: "", unit: "un", quantity: "0", min_quantity: "0", purchase_price: "", sale_price: "", is_active: true });
  const [history, setHistory] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [movementForm, setMovementForm] = useState({ type: "in", quantity: "", reason: "", service_order_id: "" });

  useEffect(() => {
    if (!itemsQuery.error) return;
    const message = itemsQuery.error instanceof Error
      ? itemsQuery.error.message
      : String(itemsQuery.error);
    setToast({ msg: `Erro ao carregar estoque: ${message}`, type: "error" });
  }, [itemsQuery.error]);

  const refreshInventory = () => queryClient.invalidateQueries({
    queryKey: queryKeys.inventory.all,
  });

  const openNew = () => {
    setSelectedItem(null);
    setForm({ id: "", name: "", sku: "", description: "", unit: "un", quantity: "0", min_quantity: "0", purchase_price: "", sale_price: "", is_active: true });
    setRecordOpen(true);
  };

  const openEdit = (item: any) => {
    setSelectedItem(item);
    setForm({
      id: item.id,
      name: item.name || "",
      sku: item.sku || "",
      description: item.description || "",
      unit: item.unit || "un",
      quantity: String(Number(item.quantity ?? 0)),
      min_quantity: String(Number(item.min_quantity ?? 0)),
      purchase_price: item.purchase_price == null ? "" : String(item.purchase_price),
      sale_price: item.sale_price == null ? "" : String(item.sale_price),
      is_active: item.is_active !== false,
    });
    setRecordOpen(true);
  };

  const saveItem = async () => {
    const canSaveItem = selectedItem ? canEditInventory : canCreateInventory;
    if (!canSaveItem) {
      setToast({ msg: "Você não possui permissão para gerenciar o estoque.", type: "error" });
      return;
    }
    if (!form.name.trim()) {
      setToast({ msg: "Informe o nome do item do estoque.", type: "error" });
      return;
    }
    const purchasePrice = form.purchase_price.trim() === "" ? null : Number(form.purchase_price);
    const salePrice = form.sale_price.trim() === "" ? null : Number(form.sale_price);
    if ((purchasePrice !== null && (!Number.isFinite(purchasePrice) || purchasePrice < 0)) || (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 0))) {
      setToast({ msg: "Informe valores de compra e venda válidos e não negativos.", type: "error" });
      return;
    }
    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      description: form.description.trim() || null,
      unit: form.unit.trim() || "un",
      quantity: Number(form.quantity || 0),
      min_quantity: Number(form.min_quantity || 0),
      purchase_price: purchasePrice,
      sale_price: salePrice,
      is_active: form.is_active,
    };

    try {
      await saveInventoryItem(payload, selectedItem?.id);
      setToast({ msg: selectedItem ? "Item atualizado." : "Item cadastrado.", type: "success" });
      setRecordOpen(false);
      await refreshInventory();
    } catch (error) {
      setToast({ msg: `Erro ao salvar item: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    }
  };

  const formatCurrency = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  const toggleActive = async (item: any) => {
    if (!canEditInventory) {
      setToast({ msg: "Você não possui permissão para alterar o status do item.", type: "error" });
      return;
    }
    const next = !item.is_active;
    try {
      await setInventoryItemActive(item.id, next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao alterar status: ${message}`, type: "error" });
      return;
    }
    setToast({ msg: next ? "Item ativado." : "Item desativado.", type: "success" });
    await refreshInventory();
  };

  const deleteItem = async (item: any) => {
    if (!canDeleteInventory) {
      setToast({ msg: "Você não possui permissão para excluir itens do estoque.", type: "error" });
      return;
    }
    try {
      await deleteInventoryItem(item.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao excluir item: ${message}`, type: "error" });
      return;
    }
    setToast({ msg: "Item excluído do estoque.", type: "success" });
    await refreshInventory();
  };

  const openHistory = async (item: any) => {
    setSelectedItem(item);
    try {
      setHistory(await listInventoryMovements(item.id));
      setHistoryOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao carregar histórico: ${message}`, type: "error" });
      setHistory([]);
    }
  };

  const saveMovement = async () => {
    if (!selectedItem) return;
    if (!canEditInventory) {
      setToast({ msg: "Você não possui permissão para movimentar o estoque.", type: "error" });
      return;
    }
    const quantity = Number(movementForm.quantity || 0);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setToast({ msg: "Informe uma quantidade válida para a movimentação.", type: "error" });
      return;
    }
    let currentItem;
    try {
      currentItem = await getInventoryItem(selectedItem.id);
    } catch (error) {
      setToast({ msg: `Não foi possível validar o item: ${supabaseErrorMessage(error)}`, type: "error" });
      return;
    }
    if (!currentItem) {
      setToast({ msg: "O item do estoque não foi encontrado.", type: "error" });
      return;
    }
    if (currentItem.is_active === false) {
      setToast({ msg: "O item está inativo e não pode receber movimentações.", type: "error" });
      return;
    }
    const current = Number(currentItem.quantity ?? 0);
    const movementType = movementForm.type === "in" ? "IN" : movementForm.type === "out" ? "OUT" : movementForm.type === "adjust" ? "ADJUST" : null;
    if (!movementType) {
      setToast({ msg: "Tipo de movimentação inválido.", type: "error" });
      return;
    }
    let nextQuantity = current;
    if (movementType === "IN") nextQuantity = current + quantity;
    if (movementType === "OUT") {
      if (current < quantity) {
        setToast({ msg: `Estoque insuficiente para saída: há ${current} unidade(s) disponíveis.`, type: "error" });
        return;
      }
      nextQuantity = current - quantity;
    }
    if (movementType === "ADJUST") {
      nextQuantity = quantity;
    }

    const insertPayload = {
      inventory_item_id: selectedItem.id,
      movement_type: movementType,
      quantity,
      reason: movementForm.reason.trim() || "Movimentação manual",
      created_by: user?.id || null,
      service_order_id: movementForm.service_order_id || null,
    };

    try {
      await recordInventoryMovement(insertPayload, selectedItem.id, nextQuantity);
      setToast({ msg: "Movimentação registrada com sucesso.", type: "success" });
      setHistoryOpen(false);
      setSelectedItem(null);
      setMovementForm({ type: "in", quantity: "", reason: "", service_order_id: "" });
      await refreshInventory();
    } catch (error) {
      setToast({ msg: `Erro na movimentação: ${supabaseErrorMessage(error)}`, type: "error" });
    }
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      <PageHeader title="Estoque" subtitle="Controle de itens, quantidade mínima e movimentações do almoxarifado" actions={
        <div className="flex items-center gap-2">
          <InternalBackButton onBack={onBack} />
          {canCreateInventory && <BtnPrimary onClick={openNew}><Plus size={14} /> Novo item</BtnPrimary>}
        </div>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {itemsQuery.isPending ? <LoadingState /> : items.length === 0 ? (
          <EmptyState icon={Package} title="Nenhum item em estoque" message="Cadastre um item para começar a controlar o inventário." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-left">Unidade</th>
                  <th className="px-4 py-3 text-left">Quantidade</th>
                  <th className="px-4 py-3 text-left">Mínimo</th>
                  <th className="px-4 py-3 text-left">Compra</th>
                  <th className="px-4 py-3 text-left">Venda</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {items.map((item: any) => {
                  const quantity = Number(item.quantity ?? 0);
                  const minQuantity = Number(item.min_quantity ?? 0);
                  const lowStock = quantity <= minQuantity;
                  const isEmpty = quantity === 0;
                  return (
                    <tr key={item.id} className="hover:bg-[#f8fafc]/80">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-[#0d1b2e]">{item.name}</div>
                        {item.description && <div className="text-[11px] text-[#5a6a82]">{item.description}</div>}
                      </td>
                      <td className="px-4 py-3.5 text-xs font-mono text-[#5a6a82]">{item.sku || "—"}</td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{item.unit || "un"}</td>
                      <td className="px-4 py-3.5">
                        <span className={cn("font-bold text-sm", isEmpty ? "text-red-700" : lowStock ? "text-amber-700" : "text-[#0d1b2e]")}>{quantity}</span>
                        {isEmpty && <span className="ml-2 text-[10px] uppercase font-bold text-red-700">Sem estoque</span>}
                        {!isEmpty && lowStock && <span className="ml-2 text-[10px] uppercase font-bold text-amber-700">Baixo</span>}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{minQuantity}</td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{formatCurrency(item.purchase_price)}</td>
                      <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{formatCurrency(item.sale_price)}</td>
                      <td className="px-4 py-3.5"><span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", item.is_active !== false ? "bg-green-100 text-green-700" : "bg-[#f5f7fa] text-[#5a6a82]")}>{item.is_active !== false ? "Ativo" : "Inativo"}</span></td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-2">
                          {canEditInventory && <button type="button" onClick={() => openEdit(item)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Editar"><Edit2 size={14} /></button>}
                          {canEditInventory && <button type="button" onClick={() => toggleActive(item)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 rounded-lg" title={item.is_active !== false ? "Desativar" : "Ativar"}>{item.is_active !== false ? <CheckCircle size={14} /> : <AlertCircle size={14} />}</button>}
                          {canDeleteInventory && <button type="button" onClick={() => void deleteItem(item)} className="p-1.5 text-[#5a6a82] hover:text-red-600 rounded-lg" title="Excluir"><Trash2 size={14} /></button>}
                          <button type="button" onClick={() => openHistory(item)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Movimentações"><List size={14} /></button>
                          {canEditInventory && <button type="button" onClick={() => { setSelectedItem(item); setMovementForm({ type: "in", quantity: "", reason: "", service_order_id: "" }); setHistoryOpen(false); setRecordOpen(false); }} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Movimentar item">+</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recordOpen && (
        <AdminPage open={true} onClose={() => setRecordOpen(false)} breadcrumb="Operação > Estoque" title={selectedItem ? "Editar item" : "Novo item"} subtitle="Cadastro do item em estoque" maxW="max-w-xl">
          <div className="p-5 space-y-4">
            <FInput label="Nome" required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} />
            <FInput label="SKU" value={form.sku} onChange={(e: any) => setForm({ ...form, sku: e.target.value })} />
            <FInput label="Unidade" value={form.unit} onChange={(e: any) => setForm({ ...form, unit: e.target.value })} />
            <FInput label="Quantidade" type="number" min="0" value={form.quantity} onChange={(e: any) => setForm({ ...form, quantity: e.target.value })} />
            <FInput label="Quantidade mínima" type="number" min="0" value={form.min_quantity} onChange={(e: any) => setForm({ ...form, min_quantity: e.target.value })} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FInput label="Valor de compra" type="number" min="0" step="0.01" value={form.purchase_price} onChange={(e: any) => setForm({ ...form, purchase_price: e.target.value })} />
              <FInput label="Valor de venda" type="number" min="0" step="0.01" value={form.sale_price} onChange={(e: any) => setForm({ ...form, sale_price: e.target.value })} />
            </div>
            <FTextarea label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={3} />
            <FToggle label="Item ativo" checked={form.is_active} onChange={(value) => setForm({ ...form, is_active: value })} />
          </div>
          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
            <BtnSecondary onClick={() => setRecordOpen(false)}>Cancelar</BtnSecondary>
            {(selectedItem ? canEditInventory : canCreateInventory) && <BtnPrimary onClick={saveItem}>{selectedItem ? "Salvar" : "Cadastrar"}</BtnPrimary>}
          </div>
        </AdminPage>
      )}

      {selectedItem && !recordOpen && (
        <AdminPage open={true} onClose={() => setSelectedItem(null)} breadcrumb="Operação > Estoque" title={`Movimentação — ${selectedItem.name}`} subtitle="Entrada, saída e ajuste de quantidade" maxW="max-w-xl">
          <div className="p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] p-3">
                <p className="text-[10px] uppercase text-[#5a6a82] font-bold">Quantidade atual</p>
                <p className="mt-1 text-lg font-black text-[#0d1b2e]">{Number(selectedItem.quantity ?? 0)}</p>
              </div>
              <div className="rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] p-3">
                <p className="text-[10px] uppercase text-[#5a6a82] font-bold">Mínimo</p>
                <p className="mt-1 text-lg font-black text-[#0d1b2e]">{Number(selectedItem.min_quantity ?? 0)}</p>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">Tipo</label>
              <select value={movementForm.type} onChange={(e: any) => setMovementForm({ ...movementForm, type: e.target.value })} className={cn(INPUT, "text-xs")}>
                <option value="in">Entrada</option>
                <option value="out">Saída</option>
                <option value="adjust">Ajuste</option>
              </select>
            </div>
            <FInput label="Quantidade" type="number" min="1" value={movementForm.quantity} onChange={(e: any) => setMovementForm({ ...movementForm, quantity: e.target.value })} />
            <FInput label="Motivo" value={movementForm.reason} onChange={(e: any) => setMovementForm({ ...movementForm, reason: e.target.value })} />
            <FInput label="OS relacionada (opcional)" value={movementForm.service_order_id} onChange={(e: any) => setMovementForm({ ...movementForm, service_order_id: e.target.value })} />
          </div>
          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
            <BtnSecondary onClick={() => setSelectedItem(null)}>Cancelar</BtnSecondary>
            {canEditInventory && <BtnPrimary onClick={saveMovement}>Registrar</BtnPrimary>}
          </div>
        </AdminPage>
      )}

      {historyOpen && selectedItem && (
        <AdminPage open={true} onClose={() => { setHistoryOpen(false); setSelectedItem(null); }} breadcrumb="Operação > Estoque" title={`Histórico — ${selectedItem.name}`} subtitle="Movimentações do item" maxW="max-w-2xl">
          <div className="p-5">
            {history.length === 0 ? (
              <p className="text-sm text-[#5a6a82]">Nenhuma movimentação registrada para este item.</p>
            ) : (
              <div className="space-y-3">
                {history.map((entry: any) => (
                  <div key={entry.id} className="rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold uppercase text-[#5a6a82]">{entry.movement_type}</span>
                      <span className={cn("text-xs font-bold", entry.movement_type === "out" ? "text-red-600" : entry.movement_type === "in" ? "text-green-600" : "text-amber-600")}>{entry.movement_type === "out" ? "-" : entry.movement_type === "in" ? "+" : "~"}{Number(entry.quantity || 0)}</span>
                    </div>
                    <div className="mt-2 text-sm text-[#0d1b2e]">{entry.reason || "Movimentação manual"}</div>
                    <div className="mt-2 grid sm:grid-cols-2 gap-2 text-[11px] text-[#5a6a82]">
                      <div><span className="font-bold">Data:</span> {entry.created_at ? new Date(entry.created_at).toLocaleString("pt-BR") : "—"}</div>
                      <div><span className="font-bold">Usuário:</span> {entry.created_by_profile?.full_name || "—"}</div>
                      <div><span className="font-bold">OS:</span> {entry.service_order?.os_number || "—"}</div>
                      <div><span className="font-bold">Quantidade:</span> {Number(entry.quantity || 0)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </AdminPage>
      )}
    </div>
  );
}

/* ─────────────────────────── TAB: CUSTOMERS ─────────────────────────── */
