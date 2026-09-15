import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Image as ImageIcon,
  LockKeyhole,
  Plus,
  RotateCcw,
  Save,
  UserRoundCheck,
} from "lucide-react";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { AdminButton, AdminPage, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { getPublicStorageUrl } from "@/shared/infrastructure/media.repository";
import type { OrderChecklistItem, OrderChecklistStage } from "../domain/checklist";
import { checklistProgress, checklistStageProgress, isChecklistFailure } from "../domain/checklist";
import {
  completeOrderChecklistStage,
  ensureOrderChecklist,
  reopenOrderChecklistStage,
  saveOrderChecklistItemAnswer,
  uploadAndAttachOrderChecklistPhoto,
} from "../infrastructure/checklists.repository";

const auditDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatAuditDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : auditDateFormatter.format(date);
}

export function OrderChecklistsPage({
  open,
  order,
  canManage,
  canReopen,
  onClose,
}: {
  open: boolean;
  order: any;
  canManage: boolean;
  canReopen: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.checklists.order(order?.id || "none"),
    queryFn: () => ensureOrderChecklist(order.id),
    enabled: open && Boolean(order?.id),
  });
  const [busyStageId, setBusyStageId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const checklist = query.data;
  const progress = checklistProgress(checklist);
  const firstPendingIndex = useMemo(
    () => checklist?.stages.findIndex(stage => stage.status !== "completed") ?? -1,
    [checklist],
  );
  const lastStageIndex = Math.max(0, (checklist?.stages.length || 1) - 1);
  const activeIndex = firstPendingIndex < 0 ? lastStageIndex : firstPendingIndex;
  const maxAccessibleIndex = firstPendingIndex < 0 ? lastStageIndex : activeIndex;
  const reopenableIndex = firstPendingIndex < 0 ? lastStageIndex : firstPendingIndex - 1;

  useEffect(() => {
    if (!checklist?.stages.length) return;
    const index = checklist.stages.findIndex(stage => stage.id === selectedStageId);
    if (index < 0 || index > maxAccessibleIndex) {
      setSelectedStageId(checklist.stages[activeIndex]?.id || null);
    }
  }, [checklist, activeIndex, maxAccessibleIndex, selectedStageId]);

  const rawSelectedIndex = checklist?.stages.findIndex(stage => stage.id === selectedStageId) ?? -1;
  const selectedIndex = rawSelectedIndex >= 0 ? rawSelectedIndex : activeIndex;
  const selectedStage = checklist?.stages[selectedIndex] || checklist?.stages[activeIndex];

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.checklists.order(order.id) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
    ]);
  };

  const completeStage = async (stage: OrderChecklistStage) => {
    setBusyStageId(stage.id);
    try {
      await completeOrderChecklistStage(stage.id);
      await refresh();
      setSelectedStageId(null);
      setToast({
        msg: checklist?.stages[selectedIndex + 1]
          ? `Etapa ${stage.name_snapshot} concluída. Avançando para a próxima etapa.`
          : `Etapa ${stage.name_snapshot} concluída. Checklist finalizado.`,
        type: "success",
      });
    } catch (error) {
      setToast({ msg: error instanceof Error ? error.message : String(error), type: "error" });
    } finally {
      setBusyStageId(null);
    }
  };

  const reopenStage = async (stage: OrderChecklistStage) => {
    setBusyStageId(stage.id);
    try {
      await reopenOrderChecklistStage(stage.id);
      await refresh();
      setSelectedStageId(stage.id);
      setToast({ msg: `Etapa ${stage.name_snapshot} reaberta.`, type: "success" });
    } catch (error) {
      setToast({ msg: error instanceof Error ? error.message : String(error), type: "error" });
    } finally {
      setBusyStageId(null);
    }
  };

  if (!open) return null;

  return (
    <AdminPage
      open
      onClose={onClose}
      breadcrumb={`Ordens de Serviço > ${order?.os_number || "OS"} > Checklists`}
      title="Checklists da OS"
      subtitle={checklist ? `${checklist.profile_name_snapshot} • versão ${checklist.profile_version_snapshot}` : "Checklist técnico do equipamento"}
      maxW="max-w-7xl"
    >
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="px-4 py-5 sm:px-6 lg:px-8">
        {query.isPending ? (
          <LoadingState text="Preparando checklist da OS..." />
        ) : query.error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {query.error instanceof Error ? query.error.message : String(query.error)}
          </div>
        ) : !checklist ? (
          <EmptyState
            icon={ClipboardCheck}
            title="Este equipamento não possui checklist"
            message="Vincule um Perfil de Checklist ao tipo de equipamento em Operação > Equipamentos."
          />
        ) : (
          <div className="min-w-0">
            <section className="border-b border-[#0d1b2e]/10 pb-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-[#5b6d86]">Progresso geral</p>
                    <StatusBadge status={checklist.status === "completed" ? "Concluído" : checklist.status === "in_progress" ? "Em andamento" : "Pendente"} />
                  </div>
                  <p className="mt-1 text-sm font-semibold text-[#52647c]">{progress.answered} de {progress.total} itens respondidos</p>
                  {checklist.completed_at && (
                    <p className="mt-1 text-xs text-[#6b7c93]">
                      Concluído por <strong className="font-bold text-[#34445b]">{checklist.completed_by_name || "Usuário"}</strong>
                      {formatAuditDate(checklist.completed_at) && <> • {formatAuditDate(checklist.completed_at)}</>}
                    </p>
                  )}
                </div>
                <span className="text-2xl font-black tracking-tight text-[#0d1b2e]">{progress.percentage}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8edf4]">
                <div className="h-full rounded-full bg-[#0057e7] transition-all" style={{ width: `${progress.percentage}%` }} />
              </div>
            </section>

            <nav aria-label="Etapas do checklist" className="overflow-x-auto border-b border-[#0d1b2e]/10">
              <div className="flex min-w-max py-5">
                {checklist.stages.map((stage, index) => {
                  const completed = stage.status === "completed";
                  const current = index === activeIndex && !completed;
                  const locked = index > maxAccessibleIndex;
                  const selected = stage.id === selectedStage?.id;
                  return (
                    <div key={stage.id} className="relative flex w-[176px] shrink-0 justify-center">
                      {index < checklist.stages.length - 1 && (
                        <span
                          aria-hidden="true"
                          className={`absolute left-[calc(50%+18px)] right-[calc(-50%+18px)] top-[18px] h-px ${completed ? "bg-emerald-400" : "bg-[#d7dee8]"}`}
                        />
                      )}
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => setSelectedStageId(stage.id)}
                        className={`relative z-10 flex w-[150px] flex-col items-center text-center transition-opacity ${locked ? "cursor-not-allowed opacity-45" : "opacity-100"}`}
                      >
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-xs font-black transition ${completed
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : current
                              ? "border-[#0057e7] bg-[#0057e7] text-white"
                              : selected
                                ? "border-[#0057e7] bg-white text-[#0057e7] ring-4 ring-[#0057e7]/8"
                                : "border-[#cbd5e1] bg-white text-[#64748b]"}`}
                        >
                          {completed ? <Check size={17} /> : locked ? <LockKeyhole size={14} /> : index + 1}
                        </span>
                        <strong className={`mt-2 max-w-[150px] text-xs leading-4 ${current || selected ? "text-[#0057e7]" : "text-[#0d1b2e]"}`}>
                          {stage.name_snapshot}
                        </strong>
                        <span className="mt-0.5 text-[10px] font-semibold text-[#7a8aa0]">
                          {completed ? "Concluída" : current ? "Etapa atual" : "Bloqueada"}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </nav>

            {selectedStage && (() => {
              const stage = selectedStage;
              const stageProgress = checklistStageProgress(stage);
              const completed = stage.status === "completed";
              const isCurrent = selectedIndex === activeIndex && !completed;
              const editable = canManage && !completed && isCurrent;
              const canGoNext = selectedIndex < maxAccessibleIndex;
              const canReopenSelected = completed && canReopen && selectedIndex === reopenableIndex && reopenableIndex >= 0;
              const stageAudit = stage.status === "reopened" && stage.reopened_at
                ? <>Reaberta por <strong className="font-bold text-[#34445b]">{stage.reopened_by_name || "Usuário"}</strong>{formatAuditDate(stage.reopened_at) && <> • {formatAuditDate(stage.reopened_at)}</>}</>
                : completed && stage.completed_at
                  ? <>Concluída por <strong className="font-bold text-[#34445b]">{stage.completed_by_name || "Usuário"}</strong>{formatAuditDate(stage.completed_at) && <> • {formatAuditDate(stage.completed_at)}</>}</>
                  : null;

              return (
                <section className="min-w-0">
                  <header className="border-b border-[#0d1b2e]/10 py-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-xl font-black tracking-tight text-[#0d1b2e]">{stage.name_snapshot}</h2>
                          <StatusBadge status={completed ? "Concluído" : isCurrent ? "Em andamento" : "Pendente"} />
                        </div>
                        <p className="mt-1 text-sm text-[#5a6a82]">
                          {stage.situation_name_snapshot ? `Situação: ${stage.situation_name_snapshot}` : completed ? "Etapa concluída" : "Etapa atual do checklist"}
                        </p>
                        {stageAudit && <p className="mt-1.5 text-xs text-[#6b7c93]">{stageAudit}</p>}
                      </div>

                      <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
                        {selectedIndex > 0 && (
                          <AdminButton variant="secondary" onClick={() => setSelectedStageId(checklist.stages[selectedIndex - 1].id)}>
                            <ChevronLeft size={15} /> Anterior
                          </AdminButton>
                        )}
                        {completed && canGoNext && (
                          <AdminButton variant="secondary" onClick={() => setSelectedStageId(checklist.stages[selectedIndex + 1].id)}>
                            Próxima <ChevronRight size={15} />
                          </AdminButton>
                        )}
                        {canReopenSelected && (
                          <AdminButton
                            variant="secondary"
                            disabled={busyStageId === stage.id}
                            onClick={() => void reopenStage(stage)}
                          >
                            <RotateCcw size={14} /> Reabrir etapa
                          </AdminButton>
                        )}
                        {!completed && isCurrent && canManage && (
                          <BtnPrimary disabled={busyStageId === stage.id} onClick={() => void completeStage(stage)}>
                            <CheckCircle2 size={15} />
                            {busyStageId === stage.id ? "Validando..." : checklist.stages[selectedIndex + 1] ? "Concluir e avançar" : "Concluir checklist"}
                            {checklist.stages[selectedIndex + 1] && <ChevronRight size={15} />}
                          </BtnPrimary>
                        )}
                      </div>
                    </div>
                  </header>

                  <div className="border-b border-[#0d1b2e]/10 py-4">
                    <div className="mb-2 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.1em] text-[#718096]">Progresso da etapa</p>
                        <p className="mt-0.5 text-xs font-semibold text-[#52647c]">{stageProgress.answered} de {stageProgress.total} respondidos</p>
                      </div>
                      <span className="text-lg font-black text-[#0d1b2e]">{stageProgress.percentage}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[#e8edf4]">
                      <div className="h-full rounded-full bg-[#0057e7] transition-all" style={{ width: `${stageProgress.percentage}%` }} />
                    </div>
                  </div>

                  <div className="divide-y divide-[#0d1b2e]/8">
                    {stage.items.map((item, index) => (
                      <OrderChecklistItemEditor
                        key={item.id}
                        item={item}
                        number={index + 1}
                        checklistId={checklist.id}
                        order={order}
                        disabled={!editable}
                        onChanged={refresh}
                        onError={message => setToast({ msg: message, type: "error" })}
                        onSuccess={message => setToast({ msg: message, type: "success" })}
                      />
                    ))}
                  </div>
                </section>
              );
            })()}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-[#0d1b2e]/8 bg-white/95 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <BtnSecondary onClick={onClose}>Voltar para a OS</BtnSecondary>
      </div>
    </AdminPage>
  );
}

function OrderChecklistItemEditor({
  item,
  number,
  checklistId,
  order,
  disabled,
  onChanged,
  onError,
  onSuccess,
}: {
  item: OrderChecklistItem;
  number: number;
  checklistId: string;
  order: any;
  disabled: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
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
      await uploadAndAttachOrderChecklistPhoto({
        organizationId: order.organization_id,
        serviceOrderId: order.id,
        checklistId,
        itemId: item.id,
        file,
      });
      await onChanged();
      onSuccess("Foto adicionada ao checklist e disponível em Documentos > Checklist.");
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

  return (
    <div className="py-5 sm:px-1">
      <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-[#0d1b2e]">
              {number}. {item.title_snapshot}
              {item.is_required_snapshot && <span className="ml-1 text-red-500">*</span>}
            </p>
            {item.source_kind === "equipment_extra" && (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700">Específico</span>
            )}
          </div>

          {(item.response_type_snapshot === "conformity" || item.response_type_snapshot === "yes_no" || item.response_type_snapshot === "confirmation") && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {answerOptions(item).map(option => (
                <button
                  key={option.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setResponseCode(option.value)}
                  className={`h-9 rounded-lg border px-3 text-xs font-bold transition ${responseCode === option.value
                    ? "border-[#0057e7] bg-[#eef5ff] text-[#0057e7]"
                    : "border-[#0d1b2e]/12 bg-white text-[#52647c] hover:border-[#0057e7]/35 hover:text-[#0057e7]"} disabled:opacity-60`}
                >
                  {option.label}
                </button>
              ))}
              {item.allow_na_snapshot && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setResponseCode(isNA ? "" : "na")}
                  className={`h-9 rounded-lg border px-3 text-xs font-bold ${isNA
                    ? "border-slate-500 bg-slate-100 text-slate-700"
                    : "border-[#0d1b2e]/12 bg-white text-[#52647c]"} disabled:opacity-60`}
                >
                  N/A
                </button>
              )}
            </div>
          )}

          {item.response_type_snapshot === "text" && (
            <div className="mt-2 max-w-3xl">
              <FTextarea label="Resposta" disabled={disabled || isNA} value={responseText} onChange={(event: any) => setResponseText(event.target.value)} />
            </div>
          )}
          {item.response_type_snapshot === "number" && (
            <div className="mt-2 max-w-xs">
              <FInput label="Valor" disabled={disabled || isNA} type="text" inputMode="decimal" value={responseNumber} onChange={(event: any) => setResponseNumber(event.target.value)} />
            </div>
          )}
          {item.description_snapshot && (
            <p className="mt-1.5 text-xs leading-5 text-[#6b7c93]">
              <span className="font-bold text-[#52647c]">Orientação:</span> {item.description_snapshot}
            </p>
          )}

          {item.answered_at && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[#718096]">
              <UserRoundCheck size={13} className="shrink-0 text-[#0057e7]" />
              <span>
                Respondido por <strong className="font-bold text-[#45566d]">{item.answered_by_name || "Usuário"}</strong>
                {formatAuditDate(item.answered_at) && <> • {formatAuditDate(item.answered_at)}</>}
              </span>
            </div>
          )}
        </div>

        {photoEnabled && !disabled && (
          <div className="flex items-center justify-end gap-2 md:self-center">
            <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[#0057e7]/25 bg-[#eef5ff]/70 text-[#0057e7] transition hover:bg-[#e2eeff]" title="Tirar foto" aria-label="Tirar foto">
              <Camera size={16} />
              <input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; void upload(file); event.currentTarget.value = ""; }} />
            </label>
            <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[#0057e7]/25 bg-white px-3 text-xs font-bold text-[#0057e7] transition hover:bg-[#eef5ff]">
              <Plus size={15} /> Foto
              <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; void upload(file); event.currentTarget.value = ""; }} />
            </label>
          </div>
        )}
      </div>

      {item.media.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-[#6b7c93]">
            Fotos{requiredPhoto && <span className="text-red-500">*</span>}
          </div>
          <div className="flex flex-wrap gap-2">
            {item.media.map(link => link.media && (
              <a
                key={link.id}
                href={getPublicStorageUrl(link.media.bucket_id, link.media.storage_path)}
                target="_blank"
                rel="noreferrer"
                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-[#0d1b2e]/10 bg-[#f5f7fa]"
              >
                <img src={getPublicStorageUrl(link.media.bucket_id, link.media.storage_path)} alt={link.media.file_name || "Foto do checklist"} className="h-full w-full object-cover" />
                <span className="absolute inset-0 hidden items-center justify-center bg-black/35 text-white group-hover:flex"><ImageIcon size={16} /></span>
              </a>
            ))}
          </div>
        </div>
      )}

      {showObservation && (
        <div className="mt-3 max-w-4xl">
          <FTextarea
            label={`Observação${requiredObservation ? " *" : ""}`}
            disabled={disabled}
            value={observation}
            onChange={(event: any) => setObservation(event.target.value)}
            placeholder={failure ? "Descreva a não conformidade encontrada" : "Observação do item"}
          />
        </div>
      )}

      {!disabled && (
        <div className="mt-3 flex justify-end">
          <AdminButton className="h-9" onClick={() => void save()} disabled={saving}>
            <Save size={14} /> {saving ? "Salvando..." : "Salvar"}
          </AdminButton>
        </div>
      )}
    </div>
  );
}

function answerOptions(item: OrderChecklistItem) {
  if (item.response_type_snapshot === "conformity") return [{ value: "ok", label: "Conforme" }, { value: "not_ok", label: "Não conforme" }];
  if (item.response_type_snapshot === "yes_no") return [{ value: "yes", label: "Sim" }, { value: "no", label: "Não" }];
  return [{ value: "confirmed", label: "Confirmar" }];
}
