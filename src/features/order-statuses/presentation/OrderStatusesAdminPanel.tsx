import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle, Edit2, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminBackContext } from "@/features/admin-shell/application/AdminNavigationContext";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  deleteOrderStatus,
  listOrderStatuses,
  saveOrderStatus,
} from "../infrastructure/order-statuses.repository";
import {
  AdminButton,
  AdminCard,
  AdminIconButton,
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  PageHeader,
} from "@/shared/ui/admin/AdminLayout";
import {
  ConfirmDialog,
  EmptyState,
  LoadingState,
  Toast,
} from "@/shared/ui/admin/AdminFeedback";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";

export function OrderStatusesAdminPanel({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  if (!hasPermission("order_statuses.view")) return null;

  return (
    <AdminBackContext.Provider value={onBack}>
      <OrderStatusesAdminPanelContent />
    </AdminBackContext.Provider>
  );
}

function OrderStatusesAdminPanelContent() {
  const { hasPermission } = useAuth();
  const canViewTable = hasPermission("order_statuses.table.view");
  const canCreate = hasPermission("order_statuses.create");
  const canEdit = hasPermission("order_statuses.edit");
  const canDelete = hasPermission("order_statuses.delete");
  const queryClient = useQueryClient();
  const statusesQuery = useQuery({ queryKey: queryKeys.orderStatuses.lists(), queryFn: listOrderStatuses, enabled: canViewTable });
  const items = statusesQuery.data ?? [];
  const loading = statusesQuery.isPending;
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", color: "#0057e7", sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => {
    if (!statusesQuery.error) return;
    const message = statusesQuery.error instanceof Error ? statusesQuery.error.message : String(statusesQuery.error);
    setToast({ msg: `Erro ao carregar status: ${message}`, type: "error" });
  }, [statusesQuery.error]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.orderStatuses.all });

  const openNew = () => { if (!canCreate) return; setEditItem(null); setForm({ name: "", color: "#0057e7", sort_order: items.length }); setFormOpen(true); };
  const openEdit = (item: any) => { if (!canEdit) return; setEditItem(item); setForm({ name: item.name || "", color: item.color || "#0057e7", sort_order: item.sort_order || 0 }); setFormOpen(true); };

  const save = async () => {
    if (!(editItem ? canEdit : canCreate)) return;
    if (!form.name.trim()) { setToast({ msg: "Informe o nome do status.", type: "error" }); return; }
    if (!isHexColor(form.color)) { setToast({ msg: "Informe uma cor HEX válida no formato #RRGGBB.", type: "error" }); return; }

    setSaving(true);
    const payload = { name: form.name.trim(), color: form.color.trim().toUpperCase(), sort_order: Number(form.sort_order) };
    try {
      await saveOrderStatus(payload, editItem?.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSaving(false);
      setToast({ msg: `Erro ao salvar status: ${message}`, type: "error" });
      return;
    }
    setSaving(false);
    setFormOpen(false);
    setToast({ msg: editItem ? "Status atualizado." : "Status criado.", type: "success" });
    await refresh();
  };

  const remove = async (id: string) => {
    if (!canDelete) return;
    try { await deleteOrderStatus(id); await refresh(); }
    catch (error) { const message = error instanceof Error ? error.message : String(error); setToast({ msg: `Não foi possível excluir: ${message}`, type: "error" }); }
  };

  return (
    <div className="min-w-0 space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Excluir este status? O histórico relacionado pode impedir a exclusão." onConfirm={() => { setDelId(null); void remove(delId); }} onCancel={() => setDelId(null)} />}

      <PageHeader title="Status da OS" subtitle="Status principais utilizados pelas ordens de serviço" actions={canCreate ? <AdminButton onClick={openNew} className="text-xs"><Plus size={15} /> Novo status</AdminButton> : null} />

      {canViewTable && <AdminCard>
        {loading ? <LoadingState /> : items.length === 0 ? (
          <EmptyState icon={CheckCircle} title="Nenhum status cadastrado" message="Cadastre o primeiro status da OS." onAdd={canCreate ? openNew : undefined} addLabel="Novo status" />
        ) : <>
          <div className="overflow-x-auto">
            <table className="min-w-[560px]">
              <thead><tr>
                <th className="text-left">Status</th>
                <th className="text-left">Cor</th>
                <th className="text-left">Ordem</th>
                <th className="text-right">Ações</th>
              </tr></thead>
              <tbody>{pagedItems.map(item => (
                <tr key={item.id}>
                  <td><div className="flex items-center gap-3"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color || "#0057e7" }} /><span className="font-bold text-[#0d1b2e]">{item.name}</span></div></td>
                  <td className="font-mono text-xs text-[#5a6a82]">{item.color || "#0057E7"}</td>
                  <td className="text-xs text-[#5a6a82]">{item.sort_order}</td>
                  <td><div className="flex justify-end gap-1">
                    {canEdit && <AdminIconButton ariaLabel="Editar status" title="Editar" onClick={() => openEdit(item)}><Edit2 size={14} /></AdminIconButton>}
                    {canDelete && <AdminIconButton ariaLabel="Excluir status" title="Excluir" variant="danger" onClick={() => setDelId(item.id)}><Trash2 size={14} /></AdminIconButton>}
                  </div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <PaginationBar page={safePage} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
        </>}
      </AdminCard>}

      <AdminPage open={formOpen} onClose={() => setFormOpen(false)} breadcrumb="Operação > Status da OS" title={editItem ? "Editar status" : "Novo status"} subtitle="Configure o status da OS">
        <div className="space-y-4 p-4 sm:p-5">
          <FInput label="Nome" required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} />
          <FInput label="Cor" type="color" value={form.color} onChange={(e: any) => setForm({ ...form, color: e.target.value })} />
          <FInput label="Ordem" type="number" min="0" value={form.sort_order} onChange={(e: any) => setForm({ ...form, sort_order: Number(e.target.value) })} />
        </div>
        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5">
          <BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>
          {(editItem ? canEdit : canCreate) && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}
        </div>
      </AdminPage>
    </div>
  );
}

function isHexColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

/* OSSituationsView moved to features/orders/presentation/TabOrders. */
