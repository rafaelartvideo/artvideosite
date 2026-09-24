import { useEffect, useMemo, useState } from "react";
import { Camera, CheckCircle2, ClipboardCheck, Loader2, Plus, Save } from "lucide-react";
import {
  getDeviceEntryChecklist,
  sendDeviceChecklistAnswer,
  uploadDeviceChecklistPhoto,
  type DeviceChecklistPayload,
  type DeviceEntryChecklist,
  type DeviceEntryChecklistItem,
} from "@/features/orders/infrastructure/device-capture.gateway";

type Notice = { text: string; type: "success" | "error" } | null;

function isFailure(item: DeviceEntryChecklistItem) {
  return (item.responseType === "conformity" && item.responseCode === "not_ok")
    || (item.responseType === "yes_no" && item.responseCode === "no");
}

function hasAnswer(item: DeviceEntryChecklistItem) {
  if (item.responseCode === "na") return item.allowNA;
  if (item.responseType === "conformity") return item.responseCode === "ok" || item.responseCode === "not_ok";
  if (item.responseType === "yes_no") return item.responseCode === "yes" || item.responseCode === "no";
  if (item.responseType === "confirmation") return item.responseCode === "confirmed";
  if (item.responseType === "text") return Boolean(item.responseText.trim());
  if (item.responseType === "number") return item.responseNumber.trim() !== "" && Number.isFinite(Number(item.responseNumber.replace(",", ".")));
  return false;
}

function itemValidation(item: DeviceEntryChecklistItem) {
  const answered = hasAnswer(item);
  const failure = isFailure(item);
  if (item.required && !answered) return "Resposta obrigatória";
  if (answered && (item.photoRequirement === "required" || (item.photoRequirement === "required_on_failure" && failure)) && item.photos.length === 0) return "Foto obrigatória";
  if (answered && (item.observationRequirement === "required" || (item.observationRequirement === "required_on_failure" && failure)) && !item.observation.trim()) return "Observação obrigatória";
  return "";
}

function answerOptions(item: DeviceEntryChecklistItem) {
  if (item.responseType === "conformity") return [
    { value: "ok", label: "Conforme" },
    { value: "not_ok", label: "Não conforme" },
  ];
  if (item.responseType === "yes_no") return [
    { value: "yes", label: "Sim" },
    { value: "no", label: "Não" },
  ];
  if (item.responseType === "confirmation") return [{ value: "confirmed", label: "Confirmar" }];
  return [];
}

function checklistSignature(checklist: DeviceEntryChecklist | null) {
  if (!checklist) return "none";
  return `${checklist.equipmentTypeId}|${checklist.stageCode}|${checklist.items.map(item => item.key).join("|")}`;
}

export function MobileEntryChecklist({ sessionId, token }: { sessionId: string; token: string }) {
  const [checklist, setChecklist] = useState<DeviceEntryChecklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null);
  const [uploadingItemKey, setUploadingItemKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (initial = false) => {
      try {
        const result = await getDeviceEntryChecklist(sessionId, token);
        if (cancelled) return;
        setChecklist(current => checklistSignature(current) === checklistSignature(result) ? current : result);
      } catch (error) {
        if (!cancelled) setNotice({ text: error instanceof Error ? error.message : "Não foi possível carregar o checklist.", type: "error" });
      } finally {
        if (initial && !cancelled) setLoading(false);
      }
    };

    void load(true);
    const timer = window.setInterval(() => void load(false), 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sessionId, token]);

  const progress = useMemo(() => {
    const items = checklist?.items || [];
    const answered = items.filter(hasAnswer).length;
    const valid = items.filter(item => !itemValidation(item)).length;
    return { answered, valid, total: items.length };
  }, [checklist]);

  const updateItem = (itemKey: string, patch: Partial<DeviceEntryChecklistItem>) => {
    setChecklist(current => current ? {
      ...current,
      items: current.items.map(item => item.key === itemKey ? { ...item, ...patch } : item),
    } : current);
  };

  const sendAnswer = async (item: DeviceEntryChecklistItem, patch: Partial<DeviceChecklistPayload> = {}) => {
    const payload: DeviceChecklistPayload = {
      responseCode: patch.responseCode ?? item.responseCode,
      responseText: patch.responseText ?? item.responseText,
      responseNumber: patch.responseNumber ?? item.responseNumber,
      observation: patch.observation ?? item.observation,
    };
    setBusyItemKey(item.key);
    setNotice(null);
    try {
      await sendDeviceChecklistAnswer(sessionId, token, item.key, payload);
      updateItem(item.key, payload);
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Não foi possível enviar a resposta.", type: "error" });
    } finally {
      setBusyItemKey(null);
    }
  };

  const uploadPhoto = async (item: DeviceEntryChecklistItem, file?: File) => {
    if (!file) return;
    setUploadingItemKey(item.key);
    setNotice(null);
    try {
      const photo = await uploadDeviceChecklistPhoto(sessionId, token, item.key, file);
      updateItem(item.key, { photos: [...item.photos, photo] });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Não foi possível enviar a foto do checklist.", type: "error" });
    } finally {
      setUploadingItemKey(null);
    }
  };

  if (loading) {
    return <section className="rounded-2xl border border-[#0d1b2e]/8 bg-white p-5 shadow-sm"><div className="flex items-center justify-center gap-2 py-6 text-sm font-bold text-[#5a6a82]"><Loader2 size={18} className="animate-spin text-[#0057e7]" /> Carregando checklist de entrada...</div></section>;
  }

  if (!checklist) {
    return <section className="rounded-2xl border border-[#0d1b2e]/8 bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef5ff] text-[#0057e7]"><ClipboardCheck size={18} /></span><div><h2 className="text-sm font-black text-[#0d1b2e]">Checklist de entrada</h2><p className="mt-1 text-xs leading-5 text-[#5a6a82]">Selecione no computador um equipamento com checklist de entrada. Esta área será carregada automaticamente.</p></div></div></section>;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#0d1b2e]/8 bg-white shadow-sm">
      <div className="border-b border-[#0d1b2e]/8 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#0057e7] text-white"><ClipboardCheck size={18} /></span>
            <div><h2 className="text-sm font-black text-[#0d1b2e]">Checklist de entrada</h2><p className="mt-0.5 text-xs text-[#5a6a82]">{checklist.stageName}</p></div>
          </div>
          <span className="rounded-full bg-[#eef5ff] px-2.5 py-1 text-[10px] font-black text-[#0057e7]">{progress.answered}/{progress.total}</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#edf1f5]"><div className="h-full rounded-full bg-[#0057e7] transition-all" style={{ width: `${progress.total ? Math.round((progress.answered / progress.total) * 100) : 100}%` }} /></div>
      </div>

      {notice && <div role={notice.type === "error" ? "alert" : "status"} className={`m-3 rounded-xl border px-3 py-2.5 text-xs font-bold ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}

      <div className="divide-y divide-[#0d1b2e]/8">
        {checklist.items.map((item, index) => {
          const failure = isFailure(item);
          const validation = itemValidation(item);
          const photoEnabled = item.photoRequirement !== "none";
          const showObservation = item.observationRequirement !== "none" || failure || Boolean(item.observation);
          const busy = busyItemKey === item.key;
          const uploading = uploadingItemKey === item.key;

          return <div key={item.key} className="p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black leading-5 text-[#0d1b2e]">{index + 1}. {item.title}{item.required && <span className="ml-1 text-red-500">*</span>}</p>

                {answerOptions(item).length > 0 && <div className="mt-2 flex flex-wrap gap-2">{answerOptions(item).map(option => <button key={option.value} type="button" disabled={busy} onClick={() => { updateItem(item.key, { responseCode: option.value }); void sendAnswer(item, { responseCode: option.value }); }} className={`min-h-9 rounded-lg border px-3 text-xs font-black transition ${item.responseCode === option.value ? "border-[#0057e7] bg-[#eef5ff] text-[#0057e7]" : "border-[#0d1b2e]/12 bg-white text-[#52647c]"} disabled:opacity-50`}>{option.label}</button>)}{item.allowNA && <button type="button" disabled={busy} onClick={() => { const value = item.responseCode === "na" ? "" : "na"; updateItem(item.key, { responseCode: value }); void sendAnswer(item, { responseCode: value }); }} className={`min-h-9 rounded-lg border px-3 text-xs font-black ${item.responseCode === "na" ? "border-slate-500 bg-slate-100 text-slate-700" : "border-[#0d1b2e]/12 bg-white text-[#52647c]"}`}>N/A</button>}</div>}

                {item.responseType === "text" && <textarea value={item.responseText} onChange={event => updateItem(item.key, { responseText: event.target.value })} rows={2} placeholder="Resposta" className="mt-2 w-full resize-y rounded-xl border border-[#0d1b2e]/15 bg-white px-3 py-2.5 text-sm text-[#0d1b2e] outline-none focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/10" />}
                {item.responseType === "number" && <input value={item.responseNumber} onChange={event => updateItem(item.key, { responseNumber: event.target.value })} inputMode="decimal" placeholder="Valor" className="mt-2 w-full rounded-xl border border-[#0d1b2e]/15 bg-white px-3 py-2.5 text-sm text-[#0d1b2e] outline-none focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/10" />}

                {item.description && <p className="mt-2 text-xs leading-5 text-[#6b7c93]"><span className="font-black text-[#52647c]">Orientação:</span> {item.description}</p>}
              </div>

              {photoEnabled && <div className="flex flex-col items-end justify-center gap-2">
                <label className={`flex h-10 w-10 items-center justify-center rounded-xl border border-[#0057e7]/25 bg-[#eef5ff] text-[#0057e7] ${uploading ? "pointer-events-none opacity-50" : "cursor-pointer"}`} title="Tirar foto">{uploading ? <Loader2 size={17} className="animate-spin" /> : <Camera size={17} />}<input type="file" accept="image/*" capture="environment" className="hidden" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ""; void uploadPhoto(item, file); }} /></label>
                <label className={`flex h-10 items-center gap-1 rounded-xl border border-[#0057e7]/25 bg-white px-2.5 text-[11px] font-black text-[#0057e7] ${uploading ? "pointer-events-none opacity-50" : "cursor-pointer"}`}><Plus size={14} /> Foto<input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ""; void uploadPhoto(item, file); }} /></label>
              </div>}
            </div>

            {item.photos.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{item.photos.map(photo => <a key={photo.id} href={photo.signedUrl} target="_blank" rel="noreferrer" className="h-16 w-16 overflow-hidden rounded-lg border border-[#0d1b2e]/10 bg-[#f5f7fa]"><img src={photo.signedUrl} alt={photo.fileName} className="h-full w-full object-cover" /></a>)}</div>}

            {showObservation && <textarea value={item.observation} onChange={event => updateItem(item.key, { observation: event.target.value })} rows={2} placeholder={failure ? "Descreva a não conformidade" : "Observação"} className="mt-3 w-full resize-y rounded-xl border border-[#0d1b2e]/15 bg-white px-3 py-2.5 text-sm text-[#0d1b2e] outline-none focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/10" />}

            {(item.responseType === "text" || item.responseType === "number" || showObservation) && <div className="mt-3 flex items-center justify-between gap-2">{validation ? <span className="text-[11px] font-bold text-amber-700">{validation}</span> : <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700"><CheckCircle2 size={13} /> Preenchido</span>}<button type="button" disabled={busy} onClick={() => void sendAnswer(item)} className="flex min-h-9 items-center gap-1.5 rounded-lg bg-[#0d1b2e] px-3 text-xs font-black text-white disabled:opacity-50">{busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar</button></div>}
          </div>;
        })}
      </div>

      <div className="border-t border-[#0d1b2e]/8 bg-[#f8fafc] p-4">
        {progress.total > 0 && progress.valid === progress.total ? <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-black text-emerald-700"><CheckCircle2 size={16} /> Checklist de entrada preenchido. Você já pode finalizar a OS no computador.</div> : <p className="text-xs leading-5 text-[#5a6a82]">Preencha os itens obrigatórios. As respostas e fotos são sincronizadas automaticamente com o computador.</p>}
      </div>
    </section>
  );
}
