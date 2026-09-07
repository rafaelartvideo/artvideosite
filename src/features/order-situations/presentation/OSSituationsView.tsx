import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, List, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { AdminButton, AdminCard, AdminIconButton, AdminPage, BtnPrimary, BtnSecondary, InternalBackButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { cn, formatDurationHours } from "@/shared/domain/formatters";
import { ConfirmDialog, EmptyState, isHexColor, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FHoursInput, FInput, FIntegerInput, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import { createOrderSituation, deleteOrderSituation, listOrderSituations, updateOrderSituation } from "../infrastructure/order-situations.repository";

type OSSituationsViewProps = {
  onBack: () => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

export function OSSituationsView({ onBack, routeResourceId, routeSubpage, onRouteChange }: OSSituationsViewProps) {
  const { hasPermission } = useAuth();
  const canView = hasPermission("situations.view");
  const canViewTable = hasPermission("situations.table.view");
  const canCreate = hasPermission("situations.create");
  const canEdit = hasPermission("situations.edit");
  const canDelete = hasPermission("situations.delete");
  const showSortOrder = hasPermission("situations.table.sort_order");
  const showSituation = hasPermission("situations.table.situation");
  const showSla = hasPermission("situations.table.sla");
  const showStatus = hasPermission("situations.table.status");
  const showActions = hasPermission("situations.table.actions");
  const queryClient = useQueryClient();
  const situationsQuery = useQuery({ queryKey: queryKeys.orderSituations.lists(), queryFn: listOrderSituations, enabled: canView && (canViewTable || canCreate || canEdit) });
  const items = situationsQuery.data ?? [];
  const loading = situationsQuery.isPending;
  const [editItem, setEditItem] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ name: "", color: "", hours: "", is_active: true, sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => { if (situationsQuery.error) setToast({ msg: `Erro ao carregar situações: ${situationsQuery.error instanceof Error ? situationsQuery.error.message : String(situationsQuery.error)}`, type: "error" }); }, [situationsQuery.error]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.orderSituations.all });

  const openNew = () => { if (!canCreate) return; setEditItem(null); setForm({ name: "", color: "", hours: "", is_active: true, sort_order: items.length }); setDrawerOpen(true); };
  const openEdit = (item: any) => { if (!canEdit) return; setEditItem(item); setForm({ name: item.name || "", color: item.color || "", hours: item.hours == null ? "" : String(item.hours), is_active: item.is_active, sort_order: item.sort_order }); setDrawerOpen(true); };
  const closeEditor = () => { if (saving) return; setDrawerOpen(false); onRouteChange?.(null, null); };
  const openNewPage = () => canCreate && (onRouteChange ? onRouteChange("new", null) : openNew());
  const openEditPage = (item: any) => canEdit && (onRouteChange ? onRouteChange(item.id, "edit") : openEdit(item));

  useEffect(() => {
    if (!routeResourceId) { if (drawerOpen) setDrawerOpen(false); return; }
    if (routeResourceId === "new") { if (canCreate && (!drawerOpen || editItem)) openNew(); return; }
    if (routeSubpage !== "edit" || !canEdit || editItem?.id === routeResourceId) return;
    const item = items.find(entry => entry.id === routeResourceId);
    if (item) openEdit(item);
  }, [routeResourceId, routeSubpage, items, drawerOpen, editItem?.id, canCreate, canEdit]);

  const save = async () => {
    if (!(editItem ? canEdit : canCreate)) return;
    if (!form.name.trim()) { setToast({ msg: "Informe o nome da situação.", type: "error" }); return; }
    if (form.color && !isHexColor(form.color)) { setToast({ msg: "Informe uma cor HEX válida no formato #RRGGBB.", type: "error" }); return; }
    if (form.hours !== "" && (!Number.isFinite(Number(form.hours)) || Number(form.hours) < 0)) { setToast({ msg: "Informe um prazo de SLA válido.", type: "error" }); return; }
    if (!Number.isInteger(Number(form.sort_order)) || Number(form.sort_order) < 0) { setToast({ msg: "A ordem de exibição deve ser um número inteiro maior ou igual a zero.", type: "error" }); return; }
    setSaving(true);
    try {
      const slug = await generateUniqueSlug("order_situations", form.name, editItem?.id);
      const payload = { name: form.name.trim(), slug, color: form.color.trim().toUpperCase() || null, hours: form.hours === "" ? null : Number(form.hours), is_active: form.is_active, sort_order: Number(form.sort_order) };
      if (editItem) await updateOrderSituation(editItem.id, payload); else await createOrderSituation(payload);
      setDrawerOpen(false); onRouteChange?.(null, null); setToast({ msg: editItem ? "Situação atualizada." : "Situação criada.", type: "success" }); await refresh();
    } catch (error) { setToast({ msg: `Erro ao salvar situação: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); }
    finally { setSaving(false); }
  };
  const remove = async (id: string) => { if (!canDelete) return; try { await deleteOrderSituation(id); await refresh(); } catch (error) { setToast({ msg: `Não foi possível remover a situação: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); } };

  if (!canView) return null;
  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {delId && <ConfirmDialog message="Remover esta situação?" onConfirm={() => remove(delId).finally(() => setDelId(null))} onCancel={() => setDelId(null)} />}
    {!routeResourceId && <><PageHeader title="Situações da OS" subtitle="Etapas de progresso das ordens de serviço" actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{canCreate && <AdminButton onClick={openNewPage} className="text-xs"><Plus size={13} /> Nova Situação</AdminButton>}</div>} />
    {canViewTable && <AdminCard>{loading ? <LoadingState /> : items.length === 0 ? <EmptyState icon={List} title="Nenhuma situação" message="Crie situações para acompanhar as etapas das OS." /> : <><div className="overflow-x-auto"><table className="min-w-[660px]"><thead><tr>{showSortOrder && <th className="text-left">Ordem</th>}{showSituation && <th className="text-left">Situação</th>}{showSla && <th className="text-left">Prazo</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedItems.map(item => <tr key={item.id}>{showSortOrder && <td className="font-mono text-xs text-[#5a6a82]">{item.sort_order}</td>}{showSituation && <td><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color || "#0057e7" }} /><span className="font-semibold text-[#0d1b2e]">{item.name}</span></div></td>}{showSla && <td className="text-xs text-[#5a6a82]">{item.hours == null ? "Não informado" : formatDurationHours(item.hours)}</td>}{showStatus && <td><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", item.is_active ? "bg-green-100 text-green-700" : "bg-[#f5f7fa] text-[#5a6a82]")}>{item.is_active ? "Ativa" : "Inativa"}</span></td>}{showActions && <td><div className="flex justify-end gap-1">{canEdit && <AdminIconButton ariaLabel="Editar situação" title="Editar" onClick={() => openEditPage(item)}><Edit2 size={14} /></AdminIconButton>}{canDelete && <AdminIconButton ariaLabel="Excluir situação" title="Excluir" variant="danger" onClick={() => setDelId(item.id)}><Trash2 size={14} /></AdminIconButton>}</div></td>}</tr>)}</tbody></table></div><PaginationBar page={safePage} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} /></>}</AdminCard>}</>}
    {routeResourceId && !drawerOpen && <AdminCard className="p-8"><LoadingState /></AdminCard>}
    {drawerOpen && <AdminPage open={true} onClose={closeEditor} breadcrumb="Situações da OS" title={editItem ? "Editar situação" : "Nova situação"} maxW="max-w-md"><div className="space-y-4 p-4 sm:p-5"><FInput label="Nome" disabled={saving} value={form.name} required onChange={(e: any) => setForm({ ...form, name: e.target.value })} /><FInput label="Cor" type="color" disabled={saving} value={form.color || "#0057e7"} onChange={(e: any) => setForm({ ...form, color: e.target.value })} /><FHoursInput label="Horas" disabled={saving} value={form.hours} onChange={(e: any) => setForm({ ...form, hours: e.target.value })} /><FIntegerInput label="Ordem de exibição" disabled={saving} value={form.sort_order} onChange={(e: any) => setForm({ ...form, sort_order: Number(e.target.value || 0) })} /><FToggle label="Situação ativa" disabled={saving} checked={form.is_active} onChange={is_active => setForm({ ...form, is_active })} /></div><div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={closeEditor} disabled={saving}>Cancelar</BtnSecondary>{(editItem ? canEdit : canCreate) && <BtnPrimary onClick={save} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}</div></AdminPage>}
  </div>;
}
