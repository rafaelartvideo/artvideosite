import { useEffect, useState } from "react";
import { Edit2, List, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  cn,
  ConfirmDialog,
  EmptyState,
  FInput,
  FToggle,
  InternalBackButton,
  isHexColor,
  LoadingState,
  PageHeader,
  slugify,
  Toast,
} from "@/shared/admin/AdminPrimitives";
import {
  createOrderSituation,
  deleteOrderSituation,
  listOrderSituations,
  updateOrderSituation,
} from "../infrastructure/order-situations.repository";

export function OSSituationsView({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  if (!hasPermission("orders.view")) return null;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", color: "", hours: "", is_active: true, sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const load = async () => { setLoading(true); const { data } = await listOrderSituations(); setItems(data || []); setLoading(false); };
  useEffect(() => { load(); }, []);
  const openNew = () => { setEditItem(null); setForm({ name: "", slug: "", color: "", hours: "", is_active: true, sort_order: items.length }); setDrawerOpen(true); };
  const openEdit = (item: any) => { setEditItem(item); setForm({ name: item.name || "", slug: item.slug || "", color: item.color || "", hours: item.hours == null ? "" : String(item.hours), is_active: item.is_active, sort_order: item.sort_order }); setDrawerOpen(true); };
  const save = async () => {
    if (!hasPermission("orders.update")) return;
    if (!form.name.trim()) { setToast({ msg: "Informe o nome da situação.", type: "error" }); return; }
    if (form.color && !isHexColor(form.color)) { setToast({ msg: "Informe uma cor HEX válida no formato #RRGGBB.", type: "error" }); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), slug: form.slug.trim() || editItem?.slug?.trim() || slugify(form.name), color: form.color.trim().toUpperCase() || null, hours: form.hours === "" ? null : Number(form.hours), is_active: form.is_active, sort_order: Number(form.sort_order) };
    const { error } = editItem ? await updateOrderSituation(editItem.id, payload) : await createOrderSituation(payload);
    setSaving(false);
    if (error) { setToast({ msg: `Erro: ${error.message}`, type: "error" }); return; }
    setDrawerOpen(false); load();
  };
  const remove = async (id: string) => { if (!hasPermission("orders.delete")) return; await deleteOrderSituation(id); load(); };
  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {delId && <ConfirmDialog message="Remover esta situação?" onConfirm={() => { setDelId(null); void remove(delId); }} onCancel={() => setDelId(null)} />}
    <PageHeader title="Situações da OS" subtitle="Etapas de progresso das ordens de serviço" actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("orders.update") && <button onClick={openNew} className="flex items-center gap-1.5 text-xs text-white font-bold bg-[#0057e7] px-3 py-2 rounded-lg hover:bg-[#0046c0] transition-colors"><Plus size={13} /> Nova Situação</button>}</div>} />
    <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">{loading ? <LoadingState /> : items.length === 0 ? <EmptyState icon={List} title="Nenhuma situação" message="Crie situações para acompanhar as etapas das OS." /> : <table className="w-full text-sm"><tbody className="divide-y divide-[#0d1b2e]/5">{items.map(item => <tr key={item.id} className="hover:bg-[#f8fafc]/80"><td className="px-4 py-3 text-[#5a6a82] text-xs font-mono">{item.sort_order}</td><td className="px-4 py-3"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color || "#0057e7" }} /><div><p className="font-semibold text-[#0d1b2e]">{item.name}</p><p className="text-xs text-[#5a6a82]">{item.hours == null ? "Horas não informadas" : `${item.hours} hora(s)`}{item.slug ? ` · ${item.slug}` : ""}</p></div></div></td><td className="px-4 py-3"><span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", item.is_active ? "bg-green-100 text-green-700" : "bg-[#f5f7fa] text-[#5a6a82]")}>{item.is_active ? "Ativa" : "Inativa"}</span></td><td className="px-4 py-3"><div className="flex gap-2 justify-end">{hasPermission("orders.update") && <button onClick={() => openEdit(item)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] hover:bg-[#e8eef8] rounded-lg"><Edit2 size={14} /></button>}{hasPermission("orders.delete") && <button onClick={() => setDelId(item.id)} className="p-1.5 text-[#5a6a82] hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>}</div></td></tr>)}</tbody></table>}</div>
    {drawerOpen && <AdminPage open={true} onClose={() => setDrawerOpen(false)} breadcrumb="Situações da OS" title={editItem ? "Editar situação" : "Nova situação"} maxW="max-w-md"><div className="p-5 space-y-4"><FInput label="Nome" value={form.name} required onChange={(e: any) => setForm({ ...form, name: e.target.value })} /><FInput label="Slug" value={form.slug} onChange={(e: any) => setForm({ ...form, slug: e.target.value })} /><FInput label="Cor" type="color" value={form.color || "#0057e7"} onChange={(e: any) => setForm({ ...form, color: e.target.value })} /><FInput label="Horas" type="number" min="0" value={form.hours} onChange={(e: any) => setForm({ ...form, hours: e.target.value })} /><FInput label="Ordem de exibição" type="number" min="0" value={form.sort_order} onChange={(e: any) => setForm({ ...form, sort_order: Number(e.target.value) })} /><FToggle label="Situação ativa" checked={form.is_active} onChange={is_active => setForm({ ...form, is_active })} /></div><div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3"><BtnSecondary onClick={() => setDrawerOpen(false)}>Cancelar</BtnSecondary>{hasPermission("orders.update") && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}</div></AdminPage>}
  </div>;
}
