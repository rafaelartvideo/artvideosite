import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle, Edit2, List, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminBackContext } from "@/features/admin-shell/application/AdminNavigationContext";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { deleteServiceType, loadServiceTypesConfiguration, saveServiceType, setServiceTypeActive } from "../infrastructure/service-types.repository";
import { AdminButton, AdminCard, AdminIconButton, AdminPage, BtnPrimary, BtnSecondary, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { ConfirmDialog, EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FHoursInput, FInput, FIntegerInput, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { formatDurationHours, formatNumber } from "@/shared/domain/formatters";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import { RadioGroup, RadioGroupItem } from "@/shared/ui/primitives/radio-group";

type ServiceTypesAdminPanelProps = {
  onBack: () => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

export function ServiceTypesAdminPanel(props: ServiceTypesAdminPanelProps) {
  return <AdminBackContext.Provider value={props.onBack}><ServiceTypesAdminPanelContent {...props} /></AdminBackContext.Provider>;
}

function ServiceTypesAdminPanelContent({ routeResourceId, routeSubpage, onRouteChange }: ServiceTypesAdminPanelProps) {
  const { hasPermission } = useAuth();
  const canView = hasPermission("service_types.view");
  const canViewTable = hasPermission("service_types.table.view");
  const canViewDetails = hasPermission("service_types.details.view");
  const canCreate = hasPermission("service_types.create");
  const canEdit = hasPermission("service_types.edit");
  const canDelete = hasPermission("service_types.delete");
  const canToggleActive = hasPermission("service_types.toggle_active");
  const canManageSla = hasPermission("service_types.sla.manage");
  const showType = hasPermission("service_types.table.type");
  const showDescription = hasPermission("service_types.table.description");
  const showForecast = hasPermission("service_types.table.forecast");
  const showSla = hasPermission("service_types.table.sla");
  const showStatus = hasPermission("service_types.table.status");
  const showActions = hasPermission("service_types.table.actions");
  const queryClient = useQueryClient();
  const configurationQuery = useQuery({ queryKey: queryKeys.serviceTypes.configuration(), queryFn: loadServiceTypesConfiguration, enabled: canView });
  const items = configurationQuery.data?.serviceTypes ?? [];
  const situations = configurationQuery.data?.situations ?? [];
  const situationLinks = configurationQuery.data?.links ?? [];
  const loading = configurationQuery.isPending;
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ title: "", description: "", forecast_days: "", is_active: true, selectedSituations: [] as Array<{ situation_id: string; use_default_hours: boolean; sla_hours: string }> });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => { if (configurationQuery.error) setToast({ msg: `Erro ao carregar tipos: ${configurationQuery.error instanceof Error ? configurationQuery.error.message : String(configurationQuery.error)}`, type: "error" }); }, [configurationQuery.error]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = useMemo(() => items.slice((safePage - 1) * pageSize, safePage * pageSize), [items, safePage, pageSize]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.serviceTypes.all });

  const openNew = () => { if (!canCreate) return; setEditItem(null); setForm({ title: "", description: "", forecast_days: "", is_active: true, selectedSituations: [] }); setFormOpen(true); };
  const openEdit = (item: any) => {
    if (!(canViewDetails && canEdit)) return;
    setEditItem(item);
    const links = situationLinks.filter(link => link.service_type_id === item.id);
    setForm({ title: item.title || "", description: item.description || "", forecast_days: item.forecast_days == null ? "" : String(item.forecast_days), is_active: item.is_active !== false, selectedSituations: links.map(link => ({ situation_id: link.situation_id, use_default_hours: link.use_default_hours !== false, sla_hours: link.sla_hours == null ? "" : String(link.sla_hours) })) });
    setFormOpen(true);
  };
  const closeForm = () => { if (saving) return; setFormOpen(false); onRouteChange?.(null, null); };
  const openNewPage = () => canCreate && (onRouteChange ? onRouteChange("new", null) : openNew());
  const openEditPage = (item: any) => canViewDetails && canEdit && (onRouteChange ? onRouteChange(item.id, "edit") : openEdit(item));

  useEffect(() => {
    if (!routeResourceId) { if (formOpen) setFormOpen(false); return; }
    if (routeResourceId === "new") { if (canCreate && (!formOpen || editItem)) openNew(); return; }
    if (routeSubpage !== "edit" || !(canViewDetails && canEdit) || editItem?.id === routeResourceId) return;
    const item = items.find(entry => entry.id === routeResourceId);
    if (item) openEdit(item);
  }, [routeResourceId, routeSubpage, items, formOpen, editItem?.id, canCreate, canViewDetails, canEdit, situationLinks]);

  const save = async () => {
    if (!(editItem ? canEdit : canCreate)) return;
    if (!form.title.trim()) { setToast({ msg: "Informe o título do tipo de atendimento.", type: "error" }); return; }
    const forecastDays = form.forecast_days === "" ? null : Number(form.forecast_days);
    if (forecastDays !== null && (!Number.isInteger(forecastDays) || forecastDays < 0)) { setToast({ msg: "A previsão deve ser informada em dias inteiros e não negativos.", type: "error" }); return; }
    const selectedSituations = [...form.selectedSituations].sort((left, right) => situations.findIndex(item => item.id === left.situation_id) - situations.findIndex(item => item.id === right.situation_id));
    if (selectedSituations.length === 0) { setToast({ msg: "Selecione pelo menos uma situação para o tipo de atendimento.", type: "error" }); return; }
    for (const selected of selectedSituations) {
      const situation = situations.find(item => item.id === selected.situation_id);
      if (selected.use_default_hours) { const hours = Number(situation?.hours); if (!Number.isFinite(hours) || hours <= 0) { setToast({ msg: "Uma das situações selecionadas não possui horas padrão.", type: "error" }); return; } }
      else { const hours = Number(selected.sla_hours); if (!Number.isFinite(hours) || hours <= 0) { setToast({ msg: "Informe um novo prazo válido para todas as situações personalizadas.", type: "error" }); return; } }
    }
    setSaving(true);
    try {
      await saveServiceType({ serviceTypeId: editItem?.id, payload: { title: form.title.trim(), description: form.description.trim() || null, forecast_days: forecastDays, is_active: form.is_active }, sortOrder: items.length, selectedSituations });
      setFormOpen(false); onRouteChange?.(null, null); setToast({ msg: editItem ? "Tipo atualizado." : "Tipo criado.", type: "success" }); await refresh();
    } catch (error) { setToast({ msg: `Erro ao salvar tipo: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); }
    finally { setSaving(false); }
  };
  const toggle = async (item: any) => { if (!canToggleActive) return; try { await setServiceTypeActive(item.id, !item.is_active); await refresh(); } catch (error) { setToast({ msg: `Erro ao atualizar tipo: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); } };
  const remove = async (id: string) => { if (!canDelete) return; try { await deleteServiceType(id); await refresh(); } catch (error) { setToast({ msg: `Não foi possível excluir: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); } };
  const slaSummary = (item: any) => { const links = situationLinks.filter(link => link.service_type_id === item.id); const totalHours = links.reduce((total, link) => { const situation = situations.find(current => current.id === link.situation_id); const hours = Number(link.use_default_hours ? situation?.hours : link.sla_hours); return Number.isFinite(hours) && hours > 0 ? total + hours : total; }, 0); return { count: links.length, totalHours }; };

  if (!canView) return null;
  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {delId && <ConfirmDialog message="Excluir este tipo de atendimento? OS relacionadas ficarão sem tipo." onConfirm={() => remove(delId).finally(() => setDelId(null))} onCancel={() => setDelId(null)} />}
    {!routeResourceId && <><PageHeader title="Tipos de Atendimento" subtitle="Configuração dos tipos utilizados nas ordens de serviço" actions={canCreate ? <AdminButton onClick={openNewPage} className="text-xs"><Plus size={15} /> Novo tipo</AdminButton> : null} />
    {canViewTable && <AdminCard>{loading ? <LoadingState /> : items.length === 0 ? <EmptyState icon={List} title="Nenhum tipo cadastrado" message="Crie tipos para disponibilizá-los na Nova OS." onAdd={canCreate ? openNewPage : undefined} addLabel="Novo tipo" /> : <><div className="overflow-x-auto"><table className="min-w-[820px]"><thead><tr>{showType && <th className="text-left">Tipo de atendimento</th>}{showDescription && <th className="text-left">Descrição</th>}{showForecast && <th className="text-left">Previsão</th>}{showSla && <th className="text-left">SLA</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedItems.map(item => { const summary = slaSummary(item); const forecast = Number(item.forecast_days); return <tr key={item.id}>{showType && <td><p className="font-bold text-[#0d1b2e]">{item.title}</p></td>}{showDescription && <td><p className="max-w-sm break-words text-xs leading-relaxed text-[#5a6a82]">{item.description || "Sem descrição"}</p></td>}{showForecast && <td className="text-xs text-[#5a6a82]">{item.forecast_days == null ? "Não informada" : `${formatNumber(forecast, { maximumFractionDigits: 0 })} ${forecast === 1 ? "dia" : "dias"}`}</td>}{showSla && <td className="text-xs text-[#5a6a82]">{summary.count ? `${summary.count} ${summary.count === 1 ? "situação" : "situações"} · ${formatDurationHours(summary.totalHours)}` : "Não configurado"}</td>}{showStatus && <td><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></td>}{showActions && <td><div className="flex items-center justify-end gap-1">{canViewDetails && canEdit && <AdminIconButton ariaLabel="Editar tipo" title="Editar" onClick={() => openEditPage(item)}><Edit2 size={14} /></AdminIconButton>}{canToggleActive && <AdminIconButton ariaLabel={item.is_active ? "Desativar tipo" : "Ativar tipo"} title={item.is_active ? "Desativar" : "Ativar"} onClick={() => toggle(item)}>{item.is_active ? <CheckCircle size={14} /> : <AlertCircle size={14} />}</AdminIconButton>}{canDelete && <AdminIconButton ariaLabel="Excluir tipo" title="Excluir" variant="danger" onClick={() => setDelId(item.id)}><Trash2 size={14} /></AdminIconButton>}</div></td>}</tr>; })}</tbody></table></div><PaginationBar page={safePage} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} /></>}</AdminCard>}</>}
    {routeResourceId && !formOpen && <AdminCard className="p-8"><LoadingState /></AdminCard>}
    <AdminPage open={formOpen} onClose={closeForm} breadcrumb="Operação > Tipos de Atendimento" title={editItem ? "Editar tipo de atendimento" : "Novo tipo de atendimento"} subtitle="Preencha os dados do tipo" maxW="max-w-xl">
      <div className="space-y-5 p-5">
        <AdminCard className="p-5 shadow-none"><div className="grid gap-4 md:grid-cols-2"><FInput label="Título" required disabled={saving} value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} /><FIntegerInput label="Previsão em dias" disabled={saving} value={form.forecast_days} onChange={(e: any) => setForm({ ...form, forecast_days: e.target.value })} /><div className="md:col-span-2"><FTextarea label="Descrição" disabled={saving} value={form.description} onChange={(e: any) => setForm({ ...form, description: e.target.value })} rows={3} /></div></div></AdminCard>
        <AdminCard className={canManageSla ? "p-5 shadow-none" : "p-5 opacity-60 shadow-none"}><div className="mb-4"><p className="text-sm font-bold text-[#0d1b2e]">Situações e SLA</p><p className="mt-1 break-words text-xs leading-relaxed text-[#5a6a82]">Selecione as situações permitidas e configure o prazo máximo de cada etapa.</p>{!canManageSla && <p className="mt-1 text-xs font-semibold text-amber-700">Sem permissão para alterar o SLA.</p>}</div><div className="columns-1 gap-3 sm:columns-2">{situations.map(situation => { const selected = form.selectedSituations.find(item => item.situation_id === situation.id); const defaultHours = Number(situation.hours); const hasDefaultHours = Number.isFinite(defaultHours) && defaultHours > 0; return <AdminCard key={situation.id} className="mb-3 w-full break-inside-avoid bg-[#f8fafc] p-3 shadow-none"><label className="flex cursor-default items-center gap-2 text-sm font-semibold text-[#0d1b2e]"><Checkbox disabled={!canManageSla || saving} checked={Boolean(selected)} onCheckedChange={checked => canManageSla && !saving && setForm(current => ({ ...current, selectedSituations: checked === true ? [...current.selectedSituations, { situation_id: situation.id, use_default_hours: hasDefaultHours, sla_hours: "" }] : current.selectedSituations.filter(item => item.situation_id !== situation.id) }))} /><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: situation.color || "#0057e7" }} /><span className="min-w-0 break-words">{situation.name}</span>{hasDefaultHours && <span className="text-xs font-normal text-[#5a6a82]">({formatDurationHours(defaultHours)})</span>}</label>{!hasDefaultHours && <p className="ml-6 mt-1 break-words text-xs text-amber-700">Esta situação não possui horas padrão</p>}{selected && <div className="ml-6 mt-3 space-y-2 text-xs text-[#0d1b2e]"><p className="font-bold">Horas:</p><RadioGroup disabled={!canManageSla || saving} value={selected.use_default_hours ? "default" : "custom"} onValueChange={value => canManageSla && !saving && setForm(current => ({ ...current, selectedSituations: current.selectedSituations.map(item => item.situation_id === situation.id ? { ...item, use_default_hours: value === "default", ...(value === "default" ? { sla_hours: "" } : {}) } : item) }))} className="gap-2"><label className="flex cursor-default items-center gap-2"><RadioGroupItem value="default" disabled={!hasDefaultHours || !canManageSla || saving} /> Manter padrão ({hasDefaultHours ? formatDurationHours(defaultHours) : "—"})</label><label className="flex cursor-default items-center gap-2"><RadioGroupItem value="custom" disabled={!canManageSla || saving} /> Definir novo prazo</label></RadioGroup>{!selected.use_default_hours && <FHoursInput label="Prazo em horas" placeholder="00:00" disabled={!canManageSla || saving} value={selected.sla_hours} onChange={(e: any) => canManageSla && !saving && setForm(current => ({ ...current, selectedSituations: current.selectedSituations.map(item => item.situation_id === situation.id ? { ...item, sla_hours: e.target.value } : item) }))} />}</div>}</AdminCard>; })}</div></AdminCard>
        <FToggle label="Tipo ativo" checked={form.is_active} disabled={saving} onChange={is_active => setForm({ ...form, is_active })} />
      </div>
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-5 py-4"><BtnSecondary onClick={closeForm} disabled={saving}>Cancelar</BtnSecondary>{(editItem ? canEdit : canCreate) && <BtnPrimary onClick={save} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}</div>
    </AdminPage>
  </div>;
}