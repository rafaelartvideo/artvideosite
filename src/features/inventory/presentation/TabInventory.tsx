import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle, Edit2, List, Package, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { deleteInventoryItem, getInventoryItem, listInventoryItems, listInventoryMovements, recordInventoryMovement, saveInventoryItem, setInventoryItemActive } from "../infrastructure/inventory.repository";
import { AdminButton, AdminCard, AdminIconButton, AdminPage, BtnPrimary, BtnSecondary, InternalBackButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { cn } from "@/shared/domain/formatters";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, FInput, FTextarea, FToggle, FCurrencyInput } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";

type TabInventoryProps = {
  onBack?: () => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

export function TabInventory({ onBack, routeResourceId, routeSubpage, onRouteChange }: TabInventoryProps) {
  const { user, hasPermission } = useAuth();
  const canView = hasPermission("inventory.view");
  const canViewTable = hasPermission("inventory.table.view");
  const canViewDetails = hasPermission("inventory.details.view");
  const canCreate = hasPermission("inventory.create");
  const canEdit = hasPermission("inventory.update");
  const canDelete = hasPermission("inventory.delete");
  const canToggleActive = hasPermission("inventory.toggle_active");
  const canViewMovements = hasPermission("inventory.movements.view");
  const canCreateMovements = hasPermission("inventory.movements.create");
  const showName = hasPermission("inventory.table.name");
  const showSku = hasPermission("inventory.table.sku");
  const showUnit = hasPermission("inventory.table.unit");
  const showQuantity = hasPermission("inventory.table.quantity");
  const showMinQuantity = hasPermission("inventory.table.min_quantity");
  const showPurchasePrice = hasPermission("inventory.table.purchase_price");
  const showSalePrice = hasPermission("inventory.table.sale_price");
  const showStatus = hasPermission("inventory.table.status");
  const showActions = hasPermission("inventory.table.actions");
  const queryClient = useQueryClient();
  const itemsQuery = useQuery({ queryKey: queryKeys.inventory.lists(), queryFn: listInventoryItems, enabled: canView && (canViewTable || canViewDetails || canCreate || canEdit || canViewMovements || canCreateMovements) });
  const items = itemsQuery.data ?? [];
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", sku: "", description: "", unit: "un", quantity: "0", min_quantity: "0", purchase_price: "", sale_price: "", is_active: true });
  const [history, setHistory] = useState<any[]>([]);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [movementForm, setMovementForm] = useState({ type: "in", quantity: "", reason: "", service_order_id: "" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => { if (itemsQuery.error) setToast({ msg: `Erro ao carregar estoque: ${itemsQuery.error instanceof Error ? itemsQuery.error.message : String(itemsQuery.error)}`, type: "error" }); }, [itemsQuery.error]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const refreshInventory = () => queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });

  const openNew = () => { if (!canCreate) return; setSelectedItem(null); setForm({ id: "", name: "", sku: "", description: "", unit: "un", quantity: "0", min_quantity: "0", purchase_price: "", sale_price: "", is_active: true }); setHistoryOpen(false); setRecordOpen(true); };
  const openEdit = (item: any) => { if (!(canViewDetails && canEdit)) return; setSelectedItem(item); setForm({ id: item.id, name: item.name || "", sku: item.sku || "", description: item.description || "", unit: item.unit || "un", quantity: String(Number(item.quantity ?? 0)), min_quantity: String(Number(item.min_quantity ?? 0)), purchase_price: item.purchase_price == null ? "" : String(item.purchase_price), sale_price: item.sale_price == null ? "" : String(item.sale_price), is_active: item.is_active !== false }); setHistoryOpen(false); setRecordOpen(true); };
  const closePage = () => { setRecordOpen(false); setHistoryOpen(false); setSelectedItem(null); onRouteChange?.(null, null); };
  const openNewPage = () => canCreate && (onRouteChange ? onRouteChange("new", null) : openNew());
  const openEditPage = (item: any) => canViewDetails && canEdit && (onRouteChange ? onRouteChange(item.id, "edit") : openEdit(item));
  const openHistory = async (item: any) => { if (!canViewMovements) return; setSelectedItem(item); setRecordOpen(false); try { setHistory(await listInventoryMovements(item.id)); setHistoryOpen(true); } catch (error) { setToast({ msg: `Erro ao carregar histórico: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); setHistory([]); } };
  const openHistoryPage = (item: any) => canViewMovements && (onRouteChange ? onRouteChange(item.id, "history") : void openHistory(item));
  const openMovement = (item: any) => { if (!canCreateMovements) return; setSelectedItem(item); setMovementForm({ type: "in", quantity: "", reason: "", service_order_id: "" }); setHistoryOpen(false); setRecordOpen(false); };
  const openMovementPage = (item: any) => canCreateMovements && (onRouteChange ? onRouteChange(item.id, "move") : openMovement(item));

  useEffect(() => {
    if (!routeResourceId) { if (recordOpen || historyOpen || selectedItem) { setRecordOpen(false); setHistoryOpen(false); setSelectedItem(null); } return; }
    if (routeResourceId === "new") { if (canCreate && !recordOpen) openNew(); return; }
    const item = items.find(entry => entry.id === routeResourceId);
    if (!item) return;
    if (routeSubpage === "edit") { if (canViewDetails && canEdit && (!recordOpen || selectedItem?.id !== item.id)) openEdit(item); return; }
    if (routeSubpage === "history") { if (canViewMovements && (!historyOpen || selectedItem?.id !== item.id)) void openHistory(item); return; }
    if (routeSubpage === "move") { if (canCreateMovements && (recordOpen || historyOpen || selectedItem?.id !== item.id)) openMovement(item); }
  }, [routeResourceId, routeSubpage, items, recordOpen, historyOpen, selectedItem?.id, canCreate, canViewDetails, canEdit, canViewMovements, canCreateMovements]);

  const saveItem = async () => { const canSave = selectedItem ? canEdit : canCreate; if (!canSave) return; if (!form.name.trim()) { setToast({ msg: "Informe o nome do item do estoque.", type: "error" }); return; } const purchasePrice = form.purchase_price.trim() === "" ? null : Number(form.purchase_price); const salePrice = form.sale_price.trim() === "" ? null : Number(form.sale_price); if ((purchasePrice !== null && (!Number.isFinite(purchasePrice) || purchasePrice < 0)) || (salePrice !== null && (!Number.isFinite(salePrice) || salePrice < 0))) { setToast({ msg: "Informe valores de compra e venda válidos e não negativos.", type: "error" }); return; } try { await saveInventoryItem({ name: form.name.trim(), sku: form.sku.trim() || null, description: form.description.trim() || null, unit: form.unit.trim() || "un", quantity: Number(form.quantity || 0), min_quantity: Number(form.min_quantity || 0), purchase_price: purchasePrice, sale_price: salePrice, is_active: form.is_active }, selectedItem?.id); setToast({ msg: selectedItem ? "Item atualizado." : "Item cadastrado.", type: "success" }); closePage(); await refreshInventory(); } catch (error) { setToast({ msg: `Erro ao salvar item: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); } };
  const formatCurrency = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  const toggleActive = async (item: any) => { if (!canToggleActive) return; const next = !item.is_active; try { await setInventoryItemActive(item.id, next); setToast({ msg: next ? "Item ativado." : "Item desativado.", type: "success" }); await refreshInventory(); } catch (error) { setToast({ msg: `Erro ao alterar status: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); } };
  const deleteItem = async (item: any) => { if (!canDelete) return; try { await deleteInventoryItem(item.id); setToast({ msg: "Item excluído do estoque.", type: "success" }); await refreshInventory(); } catch (error) { setToast({ msg: `Erro ao excluir item: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); } };
  const saveMovement = async () => {
    if (!selectedItem || !canCreateMovements) return;
    const quantity = Number(movementForm.quantity || 0); if (!Number.isFinite(quantity) || quantity <= 0) { setToast({ msg: "Informe uma quantidade válida para a movimentação.", type: "error" }); return; }
    let currentItem; try { currentItem = await getInventoryItem(selectedItem.id); } catch (error) { setToast({ msg: `Não foi possível validar o item: ${supabaseErrorMessage(error)}`, type: "error" }); return; }
    if (!currentItem) { setToast({ msg: "O item do estoque não foi encontrado.", type: "error" }); return; }
    if (currentItem.is_active === false) { setToast({ msg: "O item está inativo e não pode receber movimentações.", type: "error" }); return; }
    const current = Number(currentItem.quantity ?? 0); const movementType = movementForm.type === "in" ? "IN" : movementForm.type === "out" ? "OUT" : movementForm.type === "adjust" ? "ADJUST" : null;
    if (!movementType) { setToast({ msg: "Tipo de movimentação inválido.", type: "error" }); return; }
    let nextQuantity = current; if (movementType === "IN") nextQuantity = current + quantity; if (movementType === "OUT") { if (current < quantity) { setToast({ msg: `Estoque insuficiente para saída: há ${current} unidade(s) disponíveis.`, type: "error" }); return; } nextQuantity = current - quantity; } if (movementType === "ADJUST") nextQuantity = quantity;
    try { await recordInventoryMovement({ inventory_item_id: selectedItem.id, movement_type: movementType, quantity, reason: movementForm.reason.trim() || "Movimentação manual", created_by: user?.id || null, service_order_id: movementForm.service_order_id || null }, selectedItem.id, nextQuantity); setToast({ msg: "Movimentação registrada com sucesso.", type: "success" }); setMovementForm({ type: "in", quantity: "", reason: "", service_order_id: "" }); closePage(); await refreshInventory(); }
    catch (error) { setToast({ msg: `Erro na movimentação: ${supabaseErrorMessage(error)}`, type: "error" }); }
  };

  if (!canView) return null;
  const routePageReady = recordOpen || historyOpen || (selectedItem && routeSubpage === "move");
  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {!routeResourceId && <><PageHeader title="Estoque" subtitle="Controle de itens, quantidade mínima e movimentações do almoxarifado" actions={<div className="flex items-center gap-2">{onBack && <InternalBackButton onBack={onBack} />}{canCreate && <AdminButton onClick={openNewPage} className="text-xs"><Plus size={14} /> Novo item</AdminButton>}</div>} />
    {canViewTable && <AdminCard>{itemsQuery.isPending ? <LoadingState /> : items.length === 0 ? <EmptyState icon={Package} title="Nenhum item em estoque" message="Cadastre um item para começar a controlar o inventário." /> : <><div className="overflow-x-auto"><table className="min-w-[980px]"><thead><tr>{showName && <th className="text-left">Nome</th>}{showSku && <th className="text-left">SKU</th>}{showUnit && <th className="text-left">Unidade</th>}{showQuantity && <th className="text-left">Quantidade</th>}{showMinQuantity && <th className="text-left">Mínimo</th>}{showPurchasePrice && <th className="text-left">Compra</th>}{showSalePrice && <th className="text-left">Venda</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedItems.map((item: any) => { const quantity = Number(item.quantity ?? 0); const minQuantity = Number(item.min_quantity ?? 0); const lowStock = quantity <= minQuantity; const isEmpty = quantity === 0; return <tr key={item.id}>{showName && <td><div className="font-semibold text-[#0d1b2e]">{item.name}</div>{item.description && <div className="max-w-sm break-words text-[11px] leading-relaxed text-[#5a6a82]">{item.description}</div>}</td>}{showSku && <td className="font-mono text-xs text-[#5a6a82]">{item.sku || "—"}</td>}{showUnit && <td className="text-xs text-[#5a6a82]">{item.unit || "un"}</td>}{showQuantity && <td><span className={cn("text-sm font-bold", isEmpty ? "text-red-700" : lowStock ? "text-amber-700" : "text-[#0d1b2e]")}>{quantity}</span>{isEmpty && <span className="ml-2 text-[10px] font-bold uppercase text-red-700">Sem estoque</span>}{!isEmpty && lowStock && <span className="ml-2 text-[10px] font-bold uppercase text-amber-700">Baixo</span>}</td>}{showMinQuantity && <td className="text-xs text-[#5a6a82]">{minQuantity}</td>}{showPurchasePrice && <td className="text-xs text-[#5a6a82]">{formatCurrency(item.purchase_price)}</td>}{showSalePrice && <td className="text-xs text-[#5a6a82]">{formatCurrency(item.sale_price)}</td>}{showStatus && <td><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", item.is_active !== false ? "bg-green-100 text-green-700" : "bg-[#f5f7fa] text-[#5a6a82]")}>{item.is_active !== false ? "Ativo" : "Inativo"}</span></td>}{showActions && <td><div className="flex justify-end gap-1">{canViewDetails && canEdit && <AdminIconButton ariaLabel="Editar item" title="Editar" onClick={() => openEditPage(item)}><Edit2 size={14} /></AdminIconButton>}{canToggleActive && <AdminIconButton ariaLabel={item.is_active !== false ? "Desativar item" : "Ativar item"} title={item.is_active !== false ? "Desativar" : "Ativar"} onClick={() => toggleActive(item)}>{item.is_active !== false ? <CheckCircle size={14} /> : <AlertCircle size={14} />}</AdminIconButton>}{canDelete && <AdminIconButton ariaLabel="Excluir item" title="Excluir" variant="danger" onClick={() => void deleteItem(item)}><Trash2 size={14} /></AdminIconButton>}{canViewMovements && <AdminIconButton ariaLabel="Movimentações" title="Movimentações" onClick={() => openHistoryPage(item)}><List size={14} /></AdminIconButton>}{canCreateMovements && <AdminIconButton ariaLabel="Movimentar item" title="Movimentar item" onClick={() => openMovementPage(item)}>+</AdminIconButton>}</div></td>}</tr>; })}</tbody></table></div><PaginationBar page={safePage} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} /></>}</AdminCard>}</>}
    {routeResourceId && !routePageReady && <AdminCard className="p-8"><LoadingState /></AdminCard>}
    {recordOpen && <AdminPage open={true} onClose={closePage} breadcrumb="Operação > Estoque" title={selectedItem ? "Editar item" : "Novo item"} subtitle="Cadastro do item em estoque" maxW="max-w-xl"><div className="space-y-4 p-4 sm:p-5"><FInput label="Nome" required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} /><FInput label="SKU" value={form.sku} onChange={(e: any) => setForm({ ...form, sku: e.target.value })} /><FInput label="Unidade" value={form.unit} onChange={(e: any) => setForm({ ...form, unit: e.target.value })} /><FInput label="Quantidade" type="number" min="0" value={form.quantity} onChange={(e: any) => setForm({ ...form, quantity: e.target.value })} /><FInput label="Quantidade mínima" type="number" min="0" value={form.min_quantity} onChange={(e: any) => setForm({ ...form, min_quantity: e.target.value })} /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FCurrencyInput label="Valor de compra" value={form.purchase_price} onChange={(e: any) => setForm({ ...form, purchase_price: e.target.value })} /><FCurrencyInput label="Valor de venda" value={form.sale_price} onChange={(e: any) => setForm({ ...form, sale_price: e.target.value })} /></div><FTextarea label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={3} /><FToggle label="Item ativo" checked={form.is_active} onChange={value => setForm({ ...form, is_active: value })} /></div><div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={closePage}>Cancelar</BtnSecondary>{(selectedItem ? canEdit : canCreate) && <BtnPrimary onClick={saveItem}>{selectedItem ? "Salvar" : "Cadastrar"}</BtnPrimary>}</div></AdminPage>}
    {selectedItem && !recordOpen && !historyOpen && canCreateMovements && routeSubpage === "move" && <AdminPage open={true} onClose={closePage} breadcrumb="Operação > Estoque" title={`Movimentação — ${selectedItem.name}`} subtitle="Entrada, saída e ajuste de quantidade" maxW="max-w-xl"><div className="space-y-4 p-4 sm:p-5"><div className="grid gap-3 text-sm sm:grid-cols-2"><AdminCard className="bg-[#f8fafc] p-4 shadow-none"><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Quantidade atual</p><p className="mt-1 text-lg font-black text-[#0d1b2e]">{Number(selectedItem.quantity ?? 0)}</p></AdminCard><AdminCard className="bg-[#f8fafc] p-4 shadow-none"><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Mínimo</p><p className="mt-1 text-lg font-black text-[#0d1b2e]">{Number(selectedItem.min_quantity ?? 0)}</p></AdminCard></div><div><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Tipo</label><AdminSelect value={movementForm.type} onValueChange={type => setMovementForm({ ...movementForm, type })} options={[{ value: "in", label: "Entrada" }, { value: "out", label: "Saída" }, { value: "adjust", label: "Ajuste" }]} className="text-xs" ariaLabel="Tipo de movimentação" /></div><FInput label="Quantidade" type="number" min="1" value={movementForm.quantity} onChange={(e: any) => setMovementForm({ ...movementForm, quantity: e.target.value })} /><FInput label="Motivo" value={movementForm.reason} onChange={(e: any) => setMovementForm({ ...movementForm, reason: e.target.value })} /><FInput label="OS relacionada (opcional)" value={movementForm.service_order_id} onChange={(e: any) => setMovementForm({ ...movementForm, service_order_id: e.target.value })} /></div><div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={closePage}>Cancelar</BtnSecondary><BtnPrimary onClick={saveMovement}>Registrar</BtnPrimary></div></AdminPage>}
    {historyOpen && selectedItem && canViewMovements && <AdminPage open={true} onClose={closePage} breadcrumb="Operação > Estoque" title={`Histórico — ${selectedItem.name}`} subtitle="Movimentações do item" maxW="max-w-2xl"><div className="p-4 sm:p-5">{history.length === 0 ? <p className="text-sm text-[#5a6a82]">Nenhuma movimentação registrada para este item.</p> : <div className="space-y-3">{history.map((entry: any) => <AdminCard key={entry.id} className="bg-[#f8fafc] p-4 shadow-none"><div className="flex items-center justify-between gap-3"><span className="text-xs font-bold uppercase text-[#5a6a82]">{entry.movement_type}</span><span className={cn("text-xs font-bold", String(entry.movement_type).toUpperCase() === "OUT" ? "text-red-600" : String(entry.movement_type).toUpperCase() === "IN" ? "text-green-600" : "text-amber-600")}>{String(entry.movement_type).toUpperCase() === "OUT" ? "-" : String(entry.movement_type).toUpperCase() === "IN" ? "+" : "~"}{Number(entry.quantity || 0)}</span></div><div className="mt-2 break-words text-sm text-[#0d1b2e]">{entry.reason || "Movimentação manual"}</div><div className="mt-2 grid gap-2 text-[11px] text-[#5a6a82] sm:grid-cols-2"><div><span className="font-bold">Data:</span> {entry.created_at ? new Date(entry.created_at).toLocaleString("pt-BR") : "—"}</div><div><span className="font-bold">Usuário:</span> {entry.created_by_profile?.full_name || "—"}</div><div><span className="font-bold">OS:</span> {entry.service_order?.os_number || "—"}</div><div><span className="font-bold">Quantidade:</span> {Number(entry.quantity || 0)}</div></div></AdminCard>)}</div>}</div></AdminPage>}
  </div>;
}

function supabaseErrorMessage(error: unknown) { if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message || "Erro desconhecido"); return error instanceof Error ? error.message : String(error || "Erro desconhecido"); }
