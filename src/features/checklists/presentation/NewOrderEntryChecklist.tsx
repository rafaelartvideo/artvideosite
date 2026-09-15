import { useEffect, useState } from "react";
import { Camera, ClipboardCheck, Plus, X } from "lucide-react";
import { FInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import {
  getNewOrderEntryChecklistDraft,
  loadNewOrderEntryChecklist,
  setNewOrderEntryChecklistDraft,
  subscribeNewOrderEntryChecklistContent,
  type EntryChecklistDraft,
} from "../application/new-order-entry-checklist";

export function NewOrderEntryChecklist({ equipmentTypeId }: { equipmentTypeId?: string | null }) {
  const [draft, setDraft] = useState<EntryChecklistDraft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => subscribeNewOrderEntryChecklistContent(() => {
    setDraft(getNewOrderEntryChecklistDraft());
  }), []);

  useEffect(() => {
    let cancelled = false;
    setDraft(null);
    setNewOrderEntryChecklistDraft(null);
    if (!equipmentTypeId) return;

    setLoading(true);
    setError("");
    void loadNewOrderEntryChecklist(equipmentTypeId)
      .then(value => {
        if (!cancelled) {
          setDraft(value);
          setNewOrderEntryChecklistDraft(value);
        }
      })
      .catch(reason => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [equipmentTypeId]);

  const update = (index: number, patch: Partial<EntryChecklistDraft["items"][number]>) => {
    setDraft(current => {
      if (!current) return current;
      const next = {
        ...current,
        items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
      };
      setNewOrderEntryChecklistDraft(next);
      return next;
    });
  };

  if (!equipmentTypeId || (!loading && !error && !draft)) return null;

  return (
    <div className="min-w-0 border-t border-[#0d1b2e]/8 pt-4 sm:col-span-2">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0057e7] text-white">
          <ClipboardCheck size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-[#0d1b2e]">Checklist de entrada</p>
          <p className="mt-0.5 text-xs leading-5 text-[#5a6a82]">Preencha a primeira etapa durante a abertura da OS.</p>
        </div>
      </div>

      {loading && <div className="rounded-xl border border-[#0057e7]/15 bg-[#eef5ff] p-4 text-sm font-semibold text-[#0057e7]">Carregando checklist de entrada...</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>}

      {draft && (
        <div className="overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-2.5">
            <strong className="text-xs font-black text-[#0057e7]">{draft.stageName}</strong>
            <span className="rounded-full bg-[#eaf2ff] px-2 py-0.5 text-[10px] font-black text-[#0057e7]">1ª ETAPA</span>
          </div>

          <div className="divide-y divide-[#0d1b2e]/8">
            {draft.items.map((item, index) => {
              const failure = (item.responseType === "conformity" && item.responseCode === "not_ok")
                || (item.responseType === "yes_no" && item.responseCode === "no");
              const showObservation = item.observationRequirement !== "none" || failure || Boolean(item.observation);
              const photoEnabled = item.photoRequirement !== "none";

              return (
                <div key={item.key} className="px-3 py-3 sm:px-4">
                  <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#0d1b2e]">
                        {index + 1}. {item.title}
                        {item.required && <span className="ml-1 text-red-500">*</span>}
                      </p>

                      {["conformity", "yes_no", "confirmation"].includes(item.responseType) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {options(item.responseType).map(option => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => update(index, { responseCode: option.value })}
                              className={`h-9 rounded-lg border px-3 text-xs font-bold transition ${item.responseCode === option.value
                                ? "border-[#0057e7] bg-[#eef5ff] text-[#0057e7]"
                                : "border-[#0d1b2e]/12 bg-white text-[#52647c] hover:border-[#0057e7]/35 hover:text-[#0057e7]"}`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {item.responseType === "text" && (
                        <div className="mt-2">
                          <FTextarea
                            label="Resposta"
                            value={item.responseText}
                            onChange={(event: any) => update(index, { responseText: event.target.value })}
                          />
                        </div>
                      )}

                      {item.responseType === "number" && (
                        <div className="mt-2 max-w-xs">
                          <FInput
                            label="Valor"
                            inputMode="decimal"
                            value={item.responseNumber}
                            onChange={(event: any) => update(index, { responseNumber: event.target.value })}
                          />
                        </div>
                      )}

                      {item.description && (
                        <p className="mt-1.5 text-xs leading-5 text-[#6b7c93]">
                          <span className="font-bold text-[#52647c]">Orientação:</span> {item.description}
                        </p>
                      )}
                    </div>

                    {photoEnabled && (
                      <div className="flex items-center justify-end gap-2 sm:self-center">
                        <label className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[#0057e7]/25 bg-[#eef5ff]/70 text-[#0057e7] transition hover:bg-[#e2eeff]" title="Tirar foto" aria-label="Tirar foto">
                          <Camera size={16} />
                          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) update(index, { photos: [...item.photos, file] }); event.currentTarget.value = ""; }} />
                        </label>

                        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-[#0057e7]/25 bg-white px-3 text-xs font-bold text-[#0057e7] transition hover:bg-[#eef5ff]">
                          <Plus size={15} /> Foto
                          <input type="file" accept="image/*" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) update(index, { photos: [...item.photos, file] }); event.currentTarget.value = ""; }} />
                        </label>
                      </div>
                    )}
                  </div>

                  {item.photos.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {item.photos.map((file, photoIndex) => (
                        <LocalPhotoThumb
                          key={`${file.name}-${file.lastModified}-${photoIndex}`}
                          file={file}
                          onRemove={() => update(index, { photos: item.photos.filter((_, currentIndex) => currentIndex !== photoIndex) })}
                        />
                      ))}
                    </div>
                  )}

                  {showObservation && (
                    <div className="mt-3">
                      <FTextarea
                        label="Observação"
                        value={item.observation}
                        onChange={(event: any) => update(index, { observation: event.target.value })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function LocalPhotoThumb({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="group relative h-16 w-16 overflow-hidden rounded-lg border border-[#0d1b2e]/10 bg-[#f5f7fa]">
      {src && <img src={src} alt={file.name || "Foto do checklist"} className="h-full w-full object-cover" />}
      <button type="button" onClick={onRemove} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 text-white shadow-sm transition hover:bg-black" title="Remover foto" aria-label="Remover foto">
        <X size={12} />
      </button>
    </div>
  );
}

function options(type: string) {
  if (type === "conformity") return [{ value: "ok", label: "Conforme" }, { value: "not_ok", label: "Não conforme" }];
  if (type === "yes_no") return [{ value: "yes", label: "Sim" }, { value: "no", label: "Não" }];
  return [{ value: "confirmed", label: "Confirmar" }];
}
