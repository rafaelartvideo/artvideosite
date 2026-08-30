import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Edit2, List, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminBackContext } from "@/features/admin-shell/application/AdminNavigationContext";
import {
  deleteServiceType,
  getServiceTypeSituationLinks,
  loadServiceTypesConfiguration,
  saveServiceType,
  setServiceTypeActive,
} from "../infrastructure/service-types.repository";
import {
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  ConfirmDialog,
  EmptyState,
  FInput,
  FTextarea,
  FToggle,
  LoadingState,
  PageHeader,
  StatusBadge,
  Toast,
} from "@/shared/admin/AdminPrimitives";

export function ServiceTypesAdminPanel({ onBack }: { onBack: () => void }) {
  return <AdminBackContext.Provider value={onBack}><ServiceTypesAdminPanelContent /></AdminBackContext.Provider>;
}

function ServiceTypesAdminPanelContent() {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ title: "", description: "", forecast_days: "", is_active: true, selectedSituations: [] as Array<{ situation_id: string; use_default_hours: boolean; sla_hours: string }> });
  const [situations, setSituations] = useState<any[]>([]);
  const [situationLinks, setSituationLinks] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const configuration = await loadServiceTypesConfiguration();
      setItems(configuration.serviceTypes);
      setSituations(configuration.situations);
      setSituationLinks(configuration.links);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao carregar tipos: ${message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditItem(null);
    setForm({ title: "", description: "", forecast_days: "", is_active: true, selectedSituations: [] });
    setFormOpen(true);
  };

  const openEdit = async (item: any) => {
    setEditItem(item);
    try {
      const links = await getServiceTypeSituationLinks(item.id);
      setForm({
        title: item.title || "",
        description: item.description || "",
        forecast_days: item.forecast_days == null ? "" : String(item.forecast_days),
        is_active: item.is_active !== false,
        selectedSituations: links.map((link) => ({
          situation_id: link.situation_id,
          use_default_hours: link.use_default_hours !== false,
          sla_hours: link.sla_hours == null ? "" : String(link.sla_hours),
        })),
      });
      setFormOpen(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao carregar situações do tipo: ${message}`, type: "error" });
    }
  };

  const save = async () => {
    if (!(editItem ? hasPermission("service_types.edit") : hasPermission("service_types.create"))) return;
    if (!form.title.trim()) {
      setToast({ msg: "Informe o título do tipo de atendimento.", type: "error" });
      return;
    }

    const selectedSituations = [...form.selectedSituations].sort((left, right) => situations.findIndex(item => item.id === left.situation_id) - situations.findIndex(item => item.id === right.situation_id));
    if (selectedSituations.length === 0) {
      setToast({ msg: "Selecione pelo menos uma situação para o tipo de atendimento.", type: "error" });
      return;
    }
    for (const selected of selectedSituations) {
      const situation = situations.find(item => item.id === selected.situation_id);
      if (selected.use_default_hours) {
        const hours = Number(situation?.hours);
        if (!Number.isFinite(hours) || hours <= 0) {
          setToast({ msg: "Uma das situações selecionadas não possui horas padrão.", type: "error" });
          return;
        }
      } else {
        const hours = Number(selected.sla_hours);
        if (!Number.isFinite(hours) || hours <= 0) {
          setToast({ msg: "Informe um novo prazo válido para todas as situações personalizadas.", type: "error" });
          return;
        }
      }
    }

    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      forecast_days: form.forecast_days ? Number(form.forecast_days) : null,
      is_active: form.is_active,
    };
    try {
      await saveServiceType({
        serviceTypeId: editItem?.id,
        payload,
        sortOrder: items.length,
        selectedSituations,
      });
      setFormOpen(false);
      setToast({ msg: editItem ? "Tipo atualizado." : "Tipo criado.", type: "success" });
      await load();
    } catch (error) {
      setToast({ msg: `Erro ao salvar tipo: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (item: any) => {
    if (!hasPermission("service_types.edit")) return;
    try {
      await setServiceTypeActive(item.id, !item.is_active);
      await load();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao atualizar tipo: ${message}`, type: "error" });
    }
  };

  const remove = async (id: string) => {
    if (!hasPermission("service_types.delete")) return;
    try {
      await deleteServiceType(id);
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
          message="Excluir este tipo de atendimento? OS relacionadas ficarão sem tipo."
          onConfirm={() => {
            setDelId(null);
            void remove(delId);
          }}
          onCancel={() => setDelId(null)}
        />
      )}

      <PageHeader
        title="Tipos de Atendimento"
        subtitle="Configuração dos tipos utilizados nas ordens de serviço"
        actions={hasPermission("service_types.create") ? <BtnPrimary onClick={openNew}><Plus size={15} /> Novo tipo</BtnPrimary> : null}
      />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <EmptyState
            icon={List}
            title="Nenhum tipo cadastrado"
            message="Crie tipos para disponibilizá-los na Nova OS."
            onAdd={hasPermission("service_types.create") ? openNew : undefined}
            addLabel="Novo tipo"
          />
        ) : (
          <div className="divide-y divide-[#0d1b2e]/5">
            {items.map(item => (
              <div key={item.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-bold text-[#0d1b2e]">{item.title}</p>
                  <p className="text-xs text-[#5a6a82] truncate">
                    {item.description || "Sem descrição"}
                    {item.forecast_days != null && ` · ${item.forecast_days} dia(s)`}
                    {(() => {
                      const links = situationLinks.filter(link => link.service_type_id === item.id);
                      const totalHours = links.reduce((total, link) => {
                        const situation = situations.find(current => current.id === link.situation_id);
                        const hours = Number(link.use_default_hours ? situation?.hours : link.sla_hours);
                        return Number.isFinite(hours) && hours > 0 ? total + hours : total;
                      }, 0);
                      return links.length ? ` · ${links.length} situações · SLA total teórico: ${totalHours} horas` : " · Nenhuma situação configurada";
                    })()}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <StatusBadge status={item.is_active ? "Ativo" : "Inativo"} />
                  {hasPermission("service_types.edit") && (
                    <>
                      <button type="button" onClick={() => openEdit(item)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] rounded-lg" title="Editar"><Edit2 size={14} /></button>
                      <button type="button" onClick={() => toggle(item)} className="p-1.5 text-[#5a6a82] hover:text-amber-600 rounded-lg" title={item.is_active ? "Desativar" : "Ativar"}>{item.is_active ? <CheckCircle size={14} /> : <AlertCircle size={14} />}</button>
                    </>
                  )}
                  {hasPermission("service_types.delete") && (
                    <button type="button" onClick={() => setDelId(item.id)} className="p-1.5 text-[#5a6a82] hover:text-red-500 rounded-lg" title="Excluir"><Trash2 size={14} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AdminPage
        open={formOpen}
        onClose={() => setFormOpen(false)}
        breadcrumb="Operação > Tipos de Atendimento"
        title={editItem ? "Editar tipo de atendimento" : "Novo tipo de atendimento"}
        subtitle="Preencha os dados do tipo"
        maxW="max-w-xl"
      >
        <div className="p-5 space-y-4">
          <FInput label="Título" required value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} />
          <FTextarea label="Descrição" value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={3} />
          <FInput label="Previsão em dias" type="number" min="0" value={form.forecast_days} onChange={(e: any) => setForm({ ...form, forecast_days: e.target.value })} />
          <div className="space-y-3">
            <div>
              <p className="text-sm font-bold text-[#0d1b2e]">Situações e SLA</p>
              <p className="mt-1 text-xs text-[#5a6a82]">Selecione as situações permitidas e configure o prazo máximo de cada etapa.</p>
            </div>
            <div className="columns-1 sm:columns-2 gap-3">
            {situations.map(situation => {
              const selected = form.selectedSituations.find(item => item.situation_id === situation.id);
              const defaultHours = Number(situation.hours);
              const hasDefaultHours = Number.isFinite(defaultHours) && defaultHours > 0;
              return <div key={situation.id} className="mb-3 w-full break-inside-avoid rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3">
                <label className="flex items-center gap-2 text-sm font-semibold text-[#0d1b2e]">
                  <input type="checkbox" checked={Boolean(selected)} onChange={event => setForm(current => ({ ...current, selectedSituations: event.target.checked ? [...current.selectedSituations, { situation_id: situation.id, use_default_hours: hasDefaultHours, sla_hours: "" }] : current.selectedSituations.filter(item => item.situation_id !== situation.id) }))} />
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: situation.color || "#0057e7" }} />
                  <span>{situation.name}</span>
                  {hasDefaultHours && <span className="text-xs font-normal text-[#5a6a82]">({defaultHours} horas)</span>}
                </label>
                {!hasDefaultHours && <p className="mt-1 ml-6 text-xs text-amber-700">Esta situação não possui horas padrão</p>}
                {selected && <div className="mt-3 ml-6 space-y-2 text-xs text-[#0d1b2e]">
                  <p className="font-bold">Horas:</p>
                  <label className="flex items-center gap-2"><input type="radio" checked={selected.use_default_hours} disabled={!hasDefaultHours} onChange={() => setForm(current => ({ ...current, selectedSituations: current.selectedSituations.map(item => item.situation_id === situation.id ? { ...item, use_default_hours: true, sla_hours: "" } : item) }))} /> Manter padrão ({situation.hours == null ? "—" : `${situation.hours} horas`})</label>
                  <label className="flex items-center gap-2"><input type="radio" checked={!selected.use_default_hours} onChange={() => setForm(current => ({ ...current, selectedSituations: current.selectedSituations.map(item => item.situation_id === situation.id ? { ...item, use_default_hours: false } : item) }))} /> Definir novo prazo</label>
                  {!selected.use_default_hours && <FInput label="Prazo em horas" type="number" min="0.01" step="0.5" placeholder="Ex.: 8" value={selected.sla_hours} onChange={(e: any) => setForm(current => ({ ...current, selectedSituations: current.selectedSituations.map(item => item.situation_id === situation.id ? { ...item, sla_hours: e.target.value } : item) }))} />}
                </div>}
              </div>;
            })}
            </div>
          </div>
          <FToggle label="Tipo ativo" checked={form.is_active} onChange={is_active => setForm({ ...form, is_active })} />
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>
          {(editItem ? hasPermission("service_types.edit") : hasPermission("service_types.create")) && (
            <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>
          )}
        </div>
      </AdminPage>
    </div>
  );
}
