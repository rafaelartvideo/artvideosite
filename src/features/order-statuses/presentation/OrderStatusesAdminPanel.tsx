import { useEffect, useState } from "react";
import { CheckCircle, Edit2, List, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminBackContext } from "@/features/admin-shell/application/AdminNavigationContext";
import {
  deleteOrderStatus,
  listOrderStatuses,
  saveOrderStatus,
} from "../infrastructure/order-statuses.repository";
import {
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  ConfirmDialog,
  EmptyState,
  FInput,
  FToggle,
  InternalBackButton,
  LoadingState,
  PageHeader,
  Toast,
} from "@/shared/admin/AdminPrimitives";

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
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", color: "#0057e7", sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await listOrderStatuses());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao carregar status: ${message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditItem(null);
    setForm({ name: "", color: "#0057e7", sort_order: items.length });
    setFormOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ name: item.name || "", color: item.color || "#0057e7", sort_order: item.sort_order || 0 });
    setFormOpen(true);
  };

  const save = async () => {
    if (!(editItem ? hasPermission("orders.update") : hasPermission("orders.update"))) return;
    if (!form.name.trim()) {
      setToast({ msg: "Informe o nome do status.", type: "error" });
      return;
    }
    if (!isHexColor(form.color)) {
      setToast({ msg: "Informe uma cor HEX válida no formato #RRGGBB.", type: "error" });
      return;
    }

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
    load();
  };

  const remove = async (id: string) => {
    if (!hasPermission("orders.delete")) return;
    try {
      await deleteOrderStatus(id);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Não foi possível excluir: ${message}`, type: "error" });
    }
  };

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {delId && (
        <ConfirmDialog
          message="Excluir este status? O histórico relacionado pode impedir a exclusão."
          onConfirm={() => {
            setDelId(null);
            void remove(delId);
          }}
          onCancel={() => setDelId(null)}
        />
      )}

      <PageHeader
        title="Status da OS"
        subtitle="Status principais utilizados pelas ordens de serviço"
        actions={hasPermission("orders.update") ? <BtnPrimary onClick={openNew}><Plus size={15} /> Novo status</BtnPrimary> : null}
      />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title="Nenhum status cadastrado"
            message="Cadastre o primeiro status da OS."
            onAdd={hasPermission("orders.update") ? openNew : undefined}
            addLabel="Novo status"
          />
        ) : (
          <div className="divide-y divide-[#0d1b2e]/5">
            {items.map(item => (
              <div key={item.id} className="px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color || "#0057e7" }} />
                  <div>
                    <p className="font-bold text-[#0d1b2e]">{item.name}</p>
                    <p className="text-xs text-[#5a6a82]">Ordem {item.sort_order}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  {hasPermission("orders.update") && <button type="button" onClick={() => openEdit(item)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Editar"><Edit2 size={14} /></button>}
                  {hasPermission("orders.delete") && <button type="button" onClick={() => setDelId(item.id)} className="p-1.5 text-[#5a6a82] hover:text-red-500 rounded-lg" title="Excluir"><Trash2 size={14} /></button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
}/* OSSituationsView moved to features/orders/presentation/TabOrders. */
