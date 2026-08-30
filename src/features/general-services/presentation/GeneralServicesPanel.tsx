import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Edit2, Plus, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminBackContext } from "@/features/admin-shell/application/AdminNavigationContext";
import {
  createGeneralService,
  getGeneralServices,
  setGeneralServiceActive,
  updateGeneralService,
} from "@/lib/queries";
import {
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  EmptyState,
  FInput,
  FToggle,
  InternalBackButton,
  LoadingState,
  PageHeader,
  Section,
  StatusBadge,
  Toast,
} from "@/app/admin/shared";

export function GeneralServicesPanel({ onBack }: { onBack: () => void }) {
  return <AdminBackContext.Provider value={onBack}><GeneralServicesPanelContent onBack={onBack} /></AdminBackContext.Provider>;
}

function GeneralServicesPanelContent({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
    const load = async () => { setLoading(true); const { data, error } = await getGeneralServices(); if (error) { console.error("[ADMIN] general services load error:", error); setToast({ msg: `Erro ao carregar serviços gerais: ${error.message}`, type: "error" }); } else setItems(data || []); setLoading(false); };
  useEffect(() => { load(); }, []);
  const openNew = () => { setEditItem(null); setName(""); setActive(true); setFormOpen(true); };
  const openEdit = (item: any) => { setEditItem(item); setName(item.name || ""); setActive(item.is_active !== false); setFormOpen(true); };
  const canCreate = hasPermission("general_services.create");
  const canEdit = hasPermission("general_services.edit");
  const save = async () => { if (!(editItem ? canEdit : canCreate)) return; if (!name.trim()) { setToast({ msg: "Informe o nome do serviço.", type: "error" }); return; } setSaving(true); const result = editItem ? await updateGeneralService(editItem.id, { name: name.trim(), is_active: active }) : await createGeneralService({ name: name.trim(), is_active: active, sort_order: items.length }); setSaving(false); if (result.error) { console.error("[ADMIN] general service save error:", result.error); setToast({ msg: `Erro ao salvar serviço geral: ${result.error.message}`, type: "error" }); return; } setFormOpen(false); setToast({ msg: editItem ? "Serviço geral atualizado." : "Serviço geral criado.", type: "success" }); load(); };
  const toggle = async (item: any) => { if (!canEdit) return; const result = await setGeneralServiceActive(item.id, !item.is_active); if (result.error) { console.error("[ADMIN] general service toggle error:", result.error); setToast({ msg: `Erro ao atualizar serviço: ${result.error.message}`, type: "error" }); return; } load(); };
  return <div className="space-y-5"><InternalBackButton onBack={onBack} />{toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}<PageHeader title="Serviços Gerais" subtitle="Serviços técnicos internos utilizados na operação" actions={canCreate ? <BtnPrimary onClick={openNew}><Plus size={16} /> Novo serviço</BtnPrimary> : null} /><div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">{loading ? <LoadingState /> : items.length === 0 ? <EmptyState icon={Wrench} title="Nenhum serviço geral cadastrado" message="Cadastre um serviço técnico interno." onAdd={canCreate ? openNew : undefined} addLabel="Novo serviço" /> : <div className="divide-y divide-[#0d1b2e]/5">{items.map(item => <div key={item.id} className="flex items-center justify-between px-5 py-4 hover:bg-[#f8fafc]"><div><p className="font-bold text-[#0d1b2e]">{item.name}</p><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></div><div className="flex gap-1">{canEdit && <><button onClick={() => openEdit(item)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Editar"><Edit2 size={15} /></button><button onClick={() => toggle(item)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 rounded-lg" title={item.is_active ? "Desativar" : "Ativar"}>{item.is_active ? <CheckCircle size={15} /> : <AlertCircle size={15} />}</button></>}</div></div>)}</div>}</div><AdminPage open={formOpen} onClose={() => setFormOpen(false)} breadcrumb="Operação > Serviços Gerais" title={editItem ? editItem.name : "Novo serviço"} subtitle="Cadastro de serviço técnico interno"><div className="p-5"><Section title="Serviço geral"><FInput label="Nome do serviço" required value={name} onChange={(e: any) => setName(e.target.value)} /><div className="mt-4"><FToggle label="Serviço ativo" checked={active} onChange={setActive} /></div></Section></div><div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3"><BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>{(editItem ? canEdit : canCreate) && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}</div></AdminPage></div>;
}
