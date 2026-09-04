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

export function OrderStatusesAdminPanel({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  if (!hasPermission("orders.view")) return null;

  return (
    <AdminBackContext.Provider value={onBack}>
      <OrderStatusesAdminPanelContent />
    </AdminBackContext.Provider>
  );
}

function OrderStatusesAdminPanelContent() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const statusesQuery = useQuery({ queryKey: queryKeys.orderStatuses.lists(), queryFn: listOrderStatuses });
  const items = statusesQuery.data ?? [];
  const loading = statusesQuery.isPending;
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", color: "#0057e7", sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!statusesQuery.error) return;
    const message = statusesQuery.error instanceof Error ? statusesQuery.error.message : String(statusesQuery.error);
    setToast({ msg: `Erro ao carregar status: ${message}`, type: "error" });
  }, [statusesQuery.error]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.orderStatuses.all });

  const openNew = () => { setEditItem(null); setForm({ name: "", color: "#0057e7", sort_order: items.length }); setFormOpen(true); };
  const openEdit = (item: any) => { setEditItem(item); setForm({ name: item.name || "", color: item.color || "#0057e7", sort_order: item.sort_order || 0 }); setFormOpen(true); };

  const save = async () => {
    if (!hasPermission("orders.update")) return;
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
    if (!hasPermission("orders.delete")) return;
    try { await deleteOrderStatus(id); await refresh(); }
    catch (error) { const message = error instanceof Error ? error.message : String(error); setToast({ msg: `Não foi possível excluir: ${message}`, type: "error" }); }
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && <ConfirmDialog message="Excluir este status? O histórico relacionado pode impedir a exclusão." onConfirm={() => { setDelId(null); void remove(delId); }} onCancel={() => setDelId(null)} />}

      <PageHeader title="Status da OS" subtitle="Status principais utilizados pelas ordens de serviço" actions={hasPermission("orders.update") ? <AdminButton onClick={openNew} className="text-xs"><Plus size={15} /> Novo status</AdminButton> : null} />

      <AdminCard>
        {loading ? <LoadingState /> : items.length === 0 ? (
          <EmptyState icon={CheckCircle} title="Nenhum status cadastrado" message="Cadastre o primeiro status da OS." onAdd={hasPermission("orders.update") ? openNew : undefined} addLabel="Novo status" />
        ) : (
          <div className="divide-y divide-[#0d1b2e]/5">
            {items.map(item => (
              <div key={item.id} className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color || "#0057e7" }} />
                  <div><p className="font-bold text-[#0d1b2e]">{item.name}</p><p className="text-xs text-[#5a6a82]">Ordem {item.sort_order}</p></div>
                </div>
                <div className="flex gap-1">
                  {hasPermission("orders.update") && <AdminIconButton ariaLabel="Editar status" title="Editar" onClick={() => openEdit(item)}><Edit2 size={14} /></AdminIconButton>}
                  {hasPermission("orders.delete") && <AdminIconButton ariaLabel="Excluir status" title="Excluir" variant="danger" onClick={() => setDelId(item.id)}><Trash2 size={14} /></AdminIconButton>}
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminCard>

      <AdminPage open={formOpen} onClose={() => setFormOpen(false)} breadcrumb="Operação > Status da OS" title={editItem ? "Editar status" : "Novo status"} subtitle="Configure o status da OS">
        <div className="p-5 space-y-4">
          <FInput label="Nome" required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} />
          <FInput label="Cor" type="color" value={form.color} onChange={(e: any) => setForm({ ...form, color: e.target.value })} />
          <FInput label="Ordem" type="number" min="0" value={form.sort_order} onChange={(e: any) => setForm({ ...form, sort_order: Number(e.target.value) })} />
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>
          {hasPermission("orders.update") && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}
        </div>
      </AdminPage>
    </div>
  );
}

function isHexColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

/* OSSituationsView moved to features/orders/presentation/TabOrders. */
