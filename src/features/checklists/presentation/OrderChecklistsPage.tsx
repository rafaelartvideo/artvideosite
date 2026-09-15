import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Image as ImageIcon, LockKeyhole, Plus, RotateCcw, Save } from "lucide-react";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { AdminButton, AdminCard, AdminCardHeader, AdminPage, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { getPublicStorageUrl } from "@/shared/infrastructure/media.repository";
import type { OrderChecklistItem, OrderChecklistStage } from "../domain/checklist";
import { checklistProgress, checklistStageProgress, isChecklistFailure } from "../domain/checklist";
import { completeOrderChecklistStage, ensureOrderChecklist, reopenOrderChecklistStage, saveOrderChecklistItemAnswer, uploadAndAttachOrderChecklistPhoto } from "../infrastructure/checklists.repository";

export function OrderChecklistsPage({ open, order, canManage, canReopen, onClose }: { open: boolean; order: any; canManage: boolean; canReopen: boolean; onClose: () => void; }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.checklists.order(order?.id || "none"), queryFn: () => ensureOrderChecklist(order.id), enabled: open && Boolean(order?.id) });
  const [busyStageId, setBusyStageId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const checklist = query.data;
  const progress = checklistProgress(checklist);
  const firstPendingIndex = useMemo(() => checklist?.stages.findIndex(stage => stage.status !== "completed") ?? -1, [checklist]);
  const activeIndex = firstPendingIndex < 0 ? Math.max(0, (checklist?.stages.length || 1) - 1) : firstPendingIndex;

  useEffect(() => {
    if (!checklist?.stages.length) return;
    const selectedIndex = checklist.stages.findIndex(stage => stage.id === selectedStageId);
    if (selectedIndex < 0 || selectedIndex > activeIndex) setSelectedStageId(checklist.stages[activeIndex]?.id || null);
  }, [checklist, activeIndex, selectedStageId]);

  const selectedIndex = Math.max(0, checklist?.stages.findIndex(stage => stage.id === selectedStageId) ?? activeIndex);
  const selectedStage = checklist?.stages[selectedIndex] || checklist?.stages[activeIndex];
  const refresh = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.checklists.order(order.id) }), queryClient.invalidateQueries({ queryKey: queryKeys.orders.all })]); };

  const completeStage = async (stage: OrderChecklistStage) => {
    setBusyStageId(stage.id);
    try { await completeOrderChecklistStage(stage.id); await refresh(); setSelectedStageId(null); setToast({ msg: `Etapa ${stage.name_snapshot} concluída. Avançando para a próxima etapa.`, type: "success" }); }
    catch (error) { setToast({ msg: error instanceof Error ? error.message : String(error), type: "error" }); }
    finally { setBusyStageId(null); }
  };
  const reopenStage = async (stage: OrderChecklistStage) => {
    setBusyStageId(stage.id);
    try { await reopenOrderChecklistStage(stage.id); await refresh(); setSelectedStageId(stage.id); setToast({ msg: `Etapa ${stage.name_snapshot} reaberta.`, type: "success" }); }
    catch (error) { setToast({ msg: error instanceof Error ? error.message : String(error), type: "error" }); }
    finally { setBusyStageId(null); }
  };

  if (!open) return null;
  return <AdminPage open onClose={onClose} breadcrumb={`Ordens de Serviço > ${order?.os_number || "OS"} > Checklists`} title="Checklists da OS" subtitle={checklist ? `${checklist.profile_name_snapshot} • versão ${checklist.profile_version_snapshot}` : "Checklist técnico do equipamento"} maxW="max-w-4xl">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <div className="space-y-4 p-5">
      {query.isPending ? <LoadingState text="Preparando checklist da OS..." /> : query.error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{query.error instanceof Error ? query.error.message : String(query.error)}</div> : !checklist ? <EmptyState icon={ClipboardCheck} title="Este equipamento não possui checklist" message="Vincule um Perfil de Checklist ao tipo de equipamento em Operação > Equipamentos." /> : <>
        <div className="rounded-xl border border-[#0057e7]/15 bg-[#eef5ff]/60 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-[#5b6d86]">Progresso geral</p><p className="mt-1 text-xl font-black text-[#0d1b2e]">{progress.answered}/{progress.total} itens respondidos</p></div><StatusBadge status={checklist.status === "completed" ? "Concluído" : checklist.status === "in_progress" ? "Em andamento" : "Pendente"} /></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[#0057e7] transition-all" style={{ width: `${progress.percentage}%` }} /></div></div>

        <nav aria-label="Etapas do checklist" className="overflow-x-auto rounded-2xl border border-[#0d1b2e]/10 bg-white p-3">
          <div className="flex min-w-max items-center">
            {checklist.stages.map((stage, index) => {
              const completed = stage.status === "completed";
              const current = index === activeIndex && !completed;
              const locked = index > activeIndex;
              const selected = stage.id === selectedStage?.id;
              return <div key={stage.id} className="flex items-center">
                <button type="button" disabled={locked} onClick={() => setSelectedStageId(stage.id)} className={`group flex min-w-[120px] flex-col items-center rounded-xl px-3 py-2 text-center transition ${selected ? "bg-[#eef5ff]" : "hover:bg-[#f8fafc]"} ${locked ? "cursor-not-allowed opacity-45" : ""}`}>
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-black ${completed ? "border-emerald-500 bg-emerald-500 text-white" : current ? "border-[#0057e7] bg-[#0057e7] text-white" : "border-[#cbd5e1] bg-white text-[#64748b]"}`}>{completed ? <Check size={17} /> : locked ? <LockKeyhole size={14} /> : index + 1}</span>
                  <strong className={`mt-2 max-w-[130px] text-xs ${current || selected ? "text-[#0057e7]" : "text-[#0d1b2e]"}`}>{stage.name_snapshot}</strong>
                  <span className="mt-0.5 text-[10px] font-semibold text-[#7a8aa0]">{completed ? "Concluída" : current ? "Etapa atual" : "Bloqueada"}</span>
                </button>
                {index < checklist.stages.length - 1 && <div className={`h-0.5 w-8 ${completed ? "bg-emerald-400" : "bg-[#dbe3ed]"}`} />}
              </div>;
            })}
          </div>
        </nav>

        {selectedStage && (() => {
          const stage = selectedStage; const stageProgress = checklistStageProgress(stage); const completed = stage.status === "completed"; const isCurrent = selectedIndex === activeIndex; const editable = canManage && !completed && isCurrent;
          return <AdminCard className={isCurrent ? "ring-2 ring-[#0057e7]/20" : ""}>
            <AdminCardHeader title={stage.name_snapshot} subtitle={stage.situation_name_snapshot ? `Situação: ${stage.situation_name_snapshot}` : completed ? "Etapa concluída" : "Etapa atual do checklist"} actions={<StatusBadge status={completed ? "Concluído" : isCurrent ? "Em andamento" : "Pendente"} />} />
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between text-xs text-[#5a6a82]"><span>{stageProgress.answered}/{stageProgress.total} respondidos</span><span>{stageProgress.percentage}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[#e8edf4]"><div className="h-full rounded-full bg-[#0057e7]" style={{ width: `${stageProgress.percentage}%` }} /></div>
              <div className="overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white">{stage.items.map((item, index) => <OrderChecklistItemEditor key={item.id} item={item} number={index + 1} checklistId={checklist.id} order={order} disabled={!editable} onChanged={refresh} onError={message => setToast({ msg: message, type: "error" })} onSuccess={message => setToast({ msg: message, type: "success" })} />)}</div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#0d1b2e]/8 pt-3">
                <div>{selectedIndex > 0 && <AdminButton variant="secondary" onClick={() => setSelectedStageId(checklist.stages[selectedIndex - 1].id)}><ChevronLeft size={15} /> Anterior</AdminButton>}</div>
                <div className="flex gap-2">{completed && canReopen && selectedIndex === activeIndex - 1 && <AdminButton variant="secondary" disabled={busyStageId === stage.id} onClick={() => void reopenStage(stage)}><RotateCcw size={14} /> Reabrir etapa</AdminButton>}{!completed && isCurrent && canManage && <BtnPrimary disabled={busyStageId === stage.id} onClick={() => void completeStage(stage)}><CheckCircle2 size={15} /> {busyStageId === stage.id ? "Validando..." : checklist.stages[selectedIndex + 1] ? "Concluir e avançar" : "Concluir checklist"} {checklist.stages[selectedIndex + 1] && <ChevronRight size={15} />}</BtnPrimary>}</div>
              </div>
            </div>
          </AdminCard>;
        })()}
      </>}
    </div>
    <div className="sticky bottom-0 border-t border-[#0d1b2e]/8 bg-white px-5 py-4"><BtnSecondary onClick={onClose}>Voltar para a OS</BtnSecondary></div>
  </AdminPage>;
}

function OrderChecklistItemEditor({ item, number, checklistId, order, disabled, onChanged, onError, onSuccess }: { item: OrderChecklistItem; number: number; checklistId: string; order: any; disabled: boolean; onChanged: () => Promise<void>; onError: (message: string) => void; onSuccess: (message: string) => void; }) {
  const [responseCode, setResponseCode] = useState(item.response_code || "");
  const [responseText, setResponseText] = useState(item.response_text || "");
  const [responseNumber, setResponseNumber] = useState(item.response_number == null ? "" : String(item.response_number));
  const [observation, setObservation] = useState(item.observation || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    setResponseCode(item.response_code || "");
    setResponseText(item.response_text || "");
    setResponseNumber(item.response_number == null ? "" : String(item.response_number));
    setObservation(item.observation || "");
  }, [item.id, item.response_code, item.response_text, item.response_number, item.observation]);

  const save = async () => {
    const normalizedNumber = responseNumber === "" ? null : Number(responseNumber.replace(",", "."));
    if (item.response_type_snapshot === "number" && responseCode !== "na" && responseNumber !== "" && !Number.isFinite(normalizedNumber)) {
      onError("Informe um valor numérico válido.");
      return;
    }
    setSaving(true);
    try {
      await saveOrderChecklistItemAnswer({
        itemId: item.id,
        responseCode: responseCode || null,
        responseText: responseCode === "na" ? null : responseText || null,
        responseNumber: responseCode === "na" ? null : normalizedNumber,
        observation: observation || null,
      });
      await onChanged();
      onSuccess("Resposta do checklist salva.");
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file?: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadAndAttachOrderChecklistPhoto({ organizationId: order.organization_id, serviceOrderId: order.id, checklistId, itemId: item.id, file });
      await onChanged();
      onSuccess("Foto adicionada ao checklist e aos documentos da OS.");
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };

  const isNA = responseCode === "na";
  const failure = isChecklistFailure({ response_type_snapshot: item.response_type_snapshot, response_code: responseCode || null });
  const showObservation = item.observation_requirement_snapshot !== "none" || Boolean(observation) || failure;
  const requiredObservation = item.observation_requirement_snapshot === "required" || (item.observation_requirement_snapshot === "required_on_failure" && failure);
  const requiredPhoto = item.photo_requirement_snapshot === "required" || (item.photo_requirement_snapshot === "required_on_failure" && failure);
  const photoEnabled = item.photo_requirement_snapshot !== "none";

  return <div className="border-b border-[#0d1b2e]/8 px-3 py-3 last:border-b-0 sm:px-4">
    <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-bold text-[#0d1b2e]">{number}. {item.title_snapshot}{item.is_required_snapshot && <span className="ml-1 text-red-500">*</span>}</p>
          {item.source_kind === "equipment_extra" && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">Específico</span>}
        </div>

        {(item.response_type_snapshot === "conformity" || item.response_type_snapshot === "yes_no" || item.response_type_snapshot === "confirmation") && <div className="mt-2 flex flex-wrap items-center gap-2">
          {answerOptions(item).map(option => <button key={option.value} type="button" disabled={disabled} onClick={() => setResponseCode(option.value)} className={`h-9 rounded-lg border px-3 text-xs font-bold transition ${responseCode === option.value ? "border-[#0057e7] bg-[#eef5ff] text-[#0057e7]" : "border-[#0d1b2e]/12 bg-white text-[#52647c] hover:border-[#0057e7]/35 hover:text-[#0057e7]"} disabled:opacity-60`}>{option.label}</button>)}
          {item.allow_na_snapshot && <button type="button" disabled={disabled} onClick={() => setResponseCode(isNA ? "" : "na")} className={`h-9 rounded-lg border px-3 text-xs font-bold ${isNA ? "border-slate-500 bg-slate-100 text-slate-700" : "border-[#0d1b2e]/12 bg-white text-[#52647c]"} disabled:opacity-60`}>N/A</button>}
        </div>}

        {item.response_type_snapshot === "text" && <div className="mt-2"><FTextarea label="Resposta" disabled={disabled || isNA} value={responseText} onChange={(event: any) => setResponseText(event.target.value)} /></div>}
        {item.response_type_snapshot === "number" && <div className="mt-2 max-w-xs"><FInput label="Valor" disabled={disabled || isNA} type="text" inputMode="decimal" value={responseNumber} onChange={(event: any) => setResponseNumber(event.target.value)} /></div>}
        {item.description_snapshot && <p className="mt-1.5 text-xs leading-5 text-[#6b7c93]"><span className="font-bold text-[#52647c]">Orientação:</span> {item.description_snapshot}</p>}
      </div>

      {photoEnabled && !disabled && <div className="flex items-center justify-end gap-2 sm:self-center">
        <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[#0057e7]/25 bg-[#eef5ff]/70 text-[#0057e7] transition hover:bg-[#e2eeff]" title="Tirar foto" aria-label="Tirar foto"><Camera size={16} /><input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; void upload(file); event.currentTarget.value = ""; }} /></label>
        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[#0057e7]/25 bg-white px-3 text-xs font-bold text-[#0057e7] transition hover:bg-[#eef5ff]"><Plus size={15} /> Foto<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; void upload(file); event.currentTarget.value = ""; }} /></label>
      </div>}
    </div>

    {item.media.length > 0 && <div className="mt-2.5"><div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#6b7c93]">Fotos{requiredPhoto && <span className="text-red-500">*</span>}</div><div className="flex flex-wrap gap-2">{item.media.map(link => link.media && <a key={link.id} href={getPublicStorageUrl(link.media.bucket_id, link.media.storage_path)} target="_blank" rel="noreferrer" className="group relative h-16 w-16 overflow-hidden rounded-lg border border-[#0d1b2e]/10 bg-[#f5f7fa]"><img src={getPublicStorageUrl(link.media.bucket_id, link.media.storage_path)} alt={link.media.file_name || "Foto do checklist"} className="h-full w-full object-cover" /><span className="absolute inset-0 hidden items-center justify-center bg-black/35 text-white group-hover:flex"><ImageIcon size={16} /></span></a>)}</div></div>}

    {showObservation && <div className="mt-3"><FTextarea label={`Observação${requiredObservation ? " *" : ""}`} disabled={disabled} value={observation} onChange={(event: any) => setObservation(event.target.value)} placeholder={failure ? "Descreva a não conformidade encontrada" : "Observação do item"} /></div>}

    {!disabled && <div className="mt-3 flex justify-end"><AdminButton className="h-9" onClick={() => void save()} disabled={saving}><Save size={14} /> {saving ? "Salvando..." : "Salvar"}</AdminButton></div>}
  </div>;
}

function answerOptions(item: OrderChecklistItem) {
  if (item.response_type_snapshot === "conformity") return [{ value: "ok", label: "Conforme" }, { value: "not_ok", label: "Não conforme" }];
  if (item.response_type_snapshot === "yes_no") return [{ value: "yes", label: "Sim" }, { value: "no", label: "Não" }];
  return [{ value: "confirmed", label: "Confirmar" }];
}
