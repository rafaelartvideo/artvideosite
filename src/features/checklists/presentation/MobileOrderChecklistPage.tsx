import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Hash,
  Loader2,
  LockKeyhole,
  LogOut,
  RefreshCw,
  RotateCcw,
  Save,
  Smartphone,
} from "lucide-react";
import {
  completeMobileOrderChecklistStage,
  getMobileOrderChecklist,
  getMobileOrderChecklistStatus,
  pairMobileOrderChecklistCode,
  reopenMobileOrderChecklistStage,
  saveMobileOrderChecklistItem,
  uploadMobileOrderChecklistPhoto,
  type MobileChecklistItem,
  type MobileChecklistStage,
  type MobileOrderChecklistData,
} from "../infrastructure/order-mobile-checklist.gateway";

const STORAGE_KEY = "unionworld:mobile-order-checklist";

type Pairing = { id: string; token: string };
type Notice = { type: "success" | "error"; text: string };

function pairingCodeDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}

function formatPairingCode(value: string) {
  const digits = pairingCodeDigits(value);
  return digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;
}

function loadStoredPairing(): Pairing | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !parsed?.token) return null;
    return { id: String(parsed.id), token: String(parsed.token) };
  } catch {
    return null;
  }
}

function storePairing(pairing: Pairing | null) {
  if (!pairing) window.localStorage.removeItem(STORAGE_KEY);
  else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pairing));
}

function itemHasAnswer(item: MobileChecklistItem) {
  if (item.response_code === "na") return item.allow_na_snapshot;
  if (item.response_type_snapshot === "conformity") return item.response_code === "ok" || item.response_code === "not_ok";
  if (item.response_type_snapshot === "yes_no") return item.response_code === "yes" || item.response_code === "no";
  if (item.response_type_snapshot === "confirmation") return item.response_code === "confirmed";
  if (item.response_type_snapshot === "text") return Boolean(item.response_text?.trim());
  if (item.response_type_snapshot === "number") return item.response_number !== null;
  return false;
}

function stageProgress(stage: MobileChecklistStage) {
  const total = stage.items.length;
  const answered = stage.items.filter(itemHasAnswer).length;
  return { answered, total, percentage: total ? Math.round((answered / total) * 100) : 100 };
}

function checklistProgress(data: MobileOrderChecklistData["checklist"]) {
  const items = data?.stages.flatMap(stage => stage.items) || [];
  const answered = items.filter(itemHasAnswer).length;
  return { answered, total: items.length, percentage: items.length ? Math.round((answered / items.length) * 100) : 100 };
}

function MobileChecklistItemCard({
  pairing,
  item,
  number,
  disabled,
  onRefresh,
  onNotice,
}: {
  pairing: Pairing;
  item: MobileChecklistItem;
  number: number;
  disabled: boolean;
  onRefresh: () => Promise<void>;
  onNotice: (notice: Notice) => void;
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
      onNotice({ type: "error", text: "Informe um valor numérico válido." });
      return;
    }

    setSaving(true);
    try {
      await saveMobileOrderChecklistItem({
        sessionId: pairing.id,
        token: pairing.token,
        itemId: item.id,
        responseCode: responseCode || null,
        responseText: responseCode === "na" ? null : responseText || null,
        responseNumber: responseCode === "na" ? null : normalizedNumber,
        observation: observation || null,
      });
      await onRefresh();
      onNotice({ type: "success", text: "Resposta salva." });
    } catch (error) {
      onNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível salvar a resposta." });
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      await uploadMobileOrderChecklistPhoto(pairing.id, pairing.token, item.id, file);
      await onRefresh();
      onNotice({ type: "success", text: "Foto adicionada ao checklist." });
    } catch (error) {
      onNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível adicionar a foto." });
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[#dce3ec] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black leading-5 text-[#0d1b2e]">
            {number}. {item.title_snapshot}
            {item.is_required_snapshot && <span className="ml-1 text-red-500">*</span>}
          </p>
          {item.description_snapshot && (
            <p className="mt-1 text-xs leading-5 text-[#64748b]">{item.description_snapshot}</p>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {(item.response_type_snapshot === "conformity" || item.response_type_snapshot === "yes_no") && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setResponseCode(item.response_type_snapshot === "conformity" ? "ok" : "yes")}
              className={`h-11 rounded-xl border text-sm font-black disabled:opacity-50 ${responseCode === "ok" || responseCode === "yes" ? "border-[#0057e7] bg-[#0057e7] text-white" : "border-[#cbd5e1] bg-white text-[#334155]"}`}
            >
              {item.response_type_snapshot === "conformity" ? "Conforme" : "Sim"}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setResponseCode(item.response_type_snapshot === "conformity" ? "not_ok" : "no")}
              className={`h-11 rounded-xl border text-sm font-black disabled:opacity-50 ${responseCode === "not_ok" || responseCode === "no" ? "border-red-600 bg-red-600 text-white" : "border-[#cbd5e1] bg-white text-[#334155]"}`}
            >
              {item.response_type_snapshot === "conformity" ? "Não conforme" : "Não"}
            </button>
          </div>
        )}

        {item.response_type_snapshot === "confirmation" && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setResponseCode("confirmed")}
            className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-sm font-black disabled:opacity-50 ${responseCode === "confirmed" ? "border-[#0057e7] bg-[#0057e7] text-white" : "border-[#cbd5e1] bg-white text-[#334155]"}`}
          >
            <CheckCircle2 size={17} /> Confirmado
          </button>
        )}

        {item.response_type_snapshot === "text" && (
          <input
            value={responseText}
            disabled={disabled}
            onChange={event => setResponseText(event.target.value)}
            placeholder="Digite a resposta"
            className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm font-semibold text-[#0d1b2e] outline-none focus:border-[#0057e7] disabled:bg-[#f8fafc]"
          />
        )}

        {item.response_type_snapshot === "number" && (
          <input
            type="number"
            inputMode="decimal"
            value={responseNumber}
            disabled={disabled}
            onChange={event => setResponseNumber(event.target.value)}
            placeholder="Digite o valor"
            className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm font-semibold text-[#0d1b2e] outline-none focus:border-[#0057e7] disabled:bg-[#f8fafc]"
          />
        )}

        {item.allow_na_snapshot && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setResponseCode("na")}
            className={`h-10 rounded-xl border px-4 text-xs font-black disabled:opacity-50 ${responseCode === "na" ? "border-[#0057e7] bg-[#eef5ff] text-[#0057e7]" : "border-[#cbd5e1] bg-white text-[#52647c]"}`}
          >
            Não se aplica
          </button>
        )}

        <textarea
          value={observation}
          disabled={disabled}
          onChange={event => setObservation(event.target.value)}
          placeholder="Observação"
          rows={3}
          className="w-full resize-none rounded-xl border border-[#cbd5e1] bg-white px-3 py-3 text-sm font-semibold text-[#0d1b2e] outline-none focus:border-[#0057e7] disabled:bg-[#f8fafc]"
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-[#0d1b2e]/8 pt-3">
        <div className="flex items-center gap-2">
          {item.media_count > 0 && (
            <span className="rounded-lg bg-[#eef3f9] px-2.5 py-2 text-[11px] font-bold text-[#52647c]">
              {item.media_count} foto{item.media_count === 1 ? "" : "s"}
            </span>
          )}
          {!disabled && item.photo_requirement_snapshot !== "none" && (
            <label className={`inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-xl border border-[#cbd5e1] bg-white px-3 text-xs font-black text-[#334155] ${uploading ? "pointer-events-none opacity-60" : ""}`}>
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
              {uploading ? "Enviando" : "Foto"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void uploadPhoto(file);
                }}
              />
            </label>
          )}
        </div>

        {!disabled && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            aria-label={saving ? "Salvando..." : "Salvar"}
            title={saving ? "Salvando..." : "Salvar"}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0057e7] text-white disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          </button>
        )}
      </div>
    </section>
  );
}

export function MobileOrderChecklistPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const queryPairing = params.get("session") && params.get("token")
    ? { id: String(params.get("session")), token: String(params.get("token")) }
    : null;

  const [pairing, setPairing] = useState<Pairing | null>(() => queryPairing || loadStoredPairing());
  const [pairingCode, setPairingCode] = useState("");
  const [state, setState] = useState<"checking" | "connect" | "ready" | "expired">("checking");
  const [data, setData] = useState<MobileOrderChecklistData | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pairBusy, setPairBusy] = useState(false);
  const [stageBusy, setStageBusy] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const activePairingRef = useRef<Pairing | null>(pairing);

  activePairingRef.current = pairing;

  const load = async (target = activePairingRef.current) => {
    if (!target) {
      setState("connect");
      setData(null);
      return;
    }

    try {
      const next = await getMobileOrderChecklist(target.id, target.token);
      setData(next);
      setState("ready");
      storePairing(target);
      if (window.location.search) {
        window.history.replaceState(window.history.state, "", "/checklist-mobile");
      }
    } catch (error) {
      storePairing(null);
      setPairing(null);
      setData(null);
      setState("expired");
      setNotice({ type: "error", text: error instanceof Error ? error.message : "A conexão expirou ou foi encerrada." });
    }
  };

  useEffect(() => {
    void load(pairing);
  }, []);

  useEffect(() => {
    if (!pairing || state !== "ready") return;
    let cancelled = false;

    const ping = async () => {
      try {
        await getMobileOrderChecklistStatus(pairing.id, pairing.token);
      } catch {
        if (cancelled) return;
        storePairing(null);
        setPairing(null);
        setData(null);
        setState("expired");
      }
    };

    const timer = window.setInterval(() => void ping(), 20000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pairing?.id, pairing?.token, state]);

  const checklist = data?.checklist || null;
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

  const connectByCode = async () => {
    if (pairingCodeDigits(pairingCode).length !== 8 || pairBusy) return;
    setPairBusy(true);
    setNotice(null);
    try {
      const result = await pairMobileOrderChecklistCode(pairingCode);
      const next = { id: result.id, token: result.token };
      setPairing(next);
      activePairingRef.current = next;
      await load(next);
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Código inválido ou expirado." });
    } finally {
      setPairBusy(false);
    }
  };

  const disconnect = () => {
    storePairing(null);
    setPairing(null);
    activePairingRef.current = null;
    setData(null);
    setNotice(null);
    setPairingCode("");
    setSelectedStageId(null);
    setState("connect");
    window.history.replaceState(window.history.state, "", "/checklist-mobile");
  };

  const refresh = async () => {
    if (!pairing) return;
    const next = await getMobileOrderChecklist(pairing.id, pairing.token);
    setData(next);
  };

  const completeStage = async (stage: MobileChecklistStage) => {
    if (!pairing || stageBusy) return;
    setStageBusy(true);
    setNotice(null);
    try {
      await completeMobileOrderChecklistStage(pairing.id, pairing.token, stage.id);
      await refresh();
      setSelectedStageId(null);
      setNotice({ type: "success", text: "Etapa concluída. O checklist foi atualizado na OS." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível concluir a etapa." });
    } finally {
      setStageBusy(false);
    }
  };

  const reopenStage = async (stage: MobileChecklistStage) => {
    if (!pairing || stageBusy) return;
    setStageBusy(true);
    setNotice(null);
    try {
      await reopenMobileOrderChecklistStage(pairing.id, pairing.token, stage.id);
      await refresh();
      setSelectedStageId(stage.id);
      setNotice({ type: "success", text: "Etapa reaberta." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível reabrir a etapa." });
    } finally {
      setStageBusy(false);
    }
  };

  if (state === "checking") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f4f7fb] px-4">
        <div className="text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-[#0057e7]" />
          <p className="mt-3 text-sm font-bold text-[#5a6a82]">Abrindo checklist...</p>
        </div>
      </div>
    );
  }

  if (state === "connect" || state === "expired") {
    return (
      <div className="min-h-dvh bg-[#f4f7fb]">
        <header className="bg-[#0d1b2e] px-4 pb-5 pt-[calc(1rem+env(safe-area-inset-top))] text-white shadow-lg">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0057e7]"><ClipboardCheck size={22} /></span>
            <div>
              <h1 className="text-base font-black">Checklist da OS</h1>
              <p className="mt-0.5 text-xs text-white/65">Conexão temporária Union World</p>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-lg space-y-4 p-4">
          {notice && (
            <div role={notice.type === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm font-bold ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
              {notice.text}
            </div>
          )}

          <section className="rounded-3xl border border-[#d9e1ec] bg-white p-5 shadow-sm">
            <div className="text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef5ff] text-[#0057e7]"><Hash size={24} /></span>
              <h2 className="mt-4 text-xl font-black text-[#0d1b2e]">Conectar ao checklist</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#64748b]">
                Escaneie o QR exibido no computador ou digite o código temporário.
              </p>
            </div>

            <div className="mt-6 space-y-3">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={pairingCode}
                onChange={event => setPairingCode(formatPairingCode(event.target.value))}
                placeholder="0000 0000"
                className="h-14 w-full rounded-2xl border border-[#cbd5e1] bg-white px-4 text-center font-mono text-2xl font-black tracking-[0.18em] text-[#0d1b2e] outline-none focus:border-[#0057e7]"
              />
              <button
                type="button"
                onClick={() => void connectByCode()}
                disabled={pairingCodeDigits(pairingCode).length !== 8 || pairBusy}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0057e7] px-4 text-sm font-black text-white disabled:opacity-50"
              >
                {pairBusy ? <Loader2 size={17} className="animate-spin" /> : <Smartphone size={17} />}
                Conectar
              </button>
            </div>

            <p className="mt-4 text-center text-[11px] leading-5 text-[#64748b]">
              O código não dá acesso ao painel administrativo. Ele abre apenas o checklist da OS vinculada e expira automaticamente.
            </p>
          </section>

          {state === "expired" && (
            <button
              type="button"
              onClick={disconnect}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] bg-white text-sm font-bold text-[#334155]"
            >
              <LogOut size={16} /> Usar outro código
            </button>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#f4f7fb] pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-30 bg-[#0d1b2e] px-4 pb-4 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white shadow-lg">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/55">Checklist</p>
            <h1 className="truncate text-lg font-black">OS {data?.order.os_number || ""}</h1>
          </div>
          <button
            type="button"
            onClick={disconnect}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white"
            aria-label="Sair do checklist"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 p-4">
        {notice && (
          <div role={notice.type === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm font-bold ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {notice.text}
          </div>
        )}

        {!checklist ? (
          <section className="rounded-3xl border border-[#d9e1ec] bg-white p-6 text-center shadow-sm">
            <ClipboardCheck className="mx-auto text-[#7b8da6]" size={32} />
            <h2 className="mt-3 text-lg font-black text-[#0d1b2e]">Sem checklist configurado</h2>
            <p className="mt-2 text-sm leading-6 text-[#64748b]">Esta OS não possui um checklist disponível para preenchimento.</p>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-[#d9e1ec] bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#5b6d86]">Progresso geral</p>
                  <p className="mt-1 truncate text-sm font-black text-[#0d1b2e]">{checklist.profile_name_snapshot}</p>
                  <p className="mt-1 text-xs font-semibold text-[#64748b]">{progress.answered} de {progress.total} itens respondidos</p>
                </div>
                <span className="text-lg font-black text-[#0057e7]">{progress.percentage}%</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e8edf4]">
                <div className="h-full rounded-full bg-[#0057e7] transition-all" style={{ width: `${progress.percentage}%` }} />
              </div>
            </section>

            <nav className="-mx-4 overflow-x-auto px-4" aria-label="Etapas do checklist">
              <div className="flex w-max gap-2">
                {checklist.stages.map((stage, index) => {
                  const completed = stage.status === "completed";
                  const current = index === activeIndex && !completed;
                  const locked = index > maxAccessibleIndex;
                  const selected = stage.id === selectedStage?.id;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      disabled={locked}
                      onClick={() => setSelectedStageId(stage.id)}
                      className={`flex min-w-[132px] items-center gap-2 rounded-2xl border px-3 py-2.5 text-left disabled:opacity-45 ${selected ? "border-[#0057e7] bg-[#eef5ff]" : "border-[#d9e1ec] bg-white"}`}
                    >
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${completed ? "bg-emerald-500 text-white" : current ? "bg-[#0057e7] text-white" : "bg-[#eef3f9] text-[#64748b]"}`}>
                        {completed ? <Check size={16} /> : locked ? <LockKeyhole size={13} /> : index + 1}
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate text-xs text-[#0d1b2e]">{stage.name_snapshot}</strong>
                        <span className="mt-0.5 block text-[10px] font-semibold text-[#7a8aa0]">{completed ? "Concluída" : current ? "Atual" : "Bloqueada"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </nav>

            {selectedStage && (() => {
              const stage = selectedStage;
              const stageStats = stageProgress(stage);
              const completed = stage.status === "completed";
              const isCurrent = selectedIndex === activeIndex && !completed;
              const editable = isCurrent;
              const canGoNext = selectedIndex < maxAccessibleIndex;
              const canReopenSelected = completed && data?.can_reopen && selectedIndex === reopenableIndex && reopenableIndex >= 0;

              return (
                <div className="space-y-3">
                  <section className="rounded-2xl border border-[#d9e1ec] bg-white p-4 shadow-sm">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[#718096]">Etapa</p>
                        <h2 className="mt-1 text-base font-black text-[#0d1b2e]">{stage.name_snapshot}</h2>
                        {stage.situation_name_snapshot && <p className="mt-1 text-xs font-semibold text-[#64748b]">Situação: {stage.situation_name_snapshot}</p>}
                      </div>
                      <span className="text-sm font-black text-[#0d1b2e]">{stageStats.percentage}%</span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e8edf4]">
                      <div className="h-full rounded-full bg-[#0057e7]" style={{ width: `${stageStats.percentage}%` }} />
                    </div>
                  </section>

                  {stage.items.map((item, index) => (
                    <MobileChecklistItemCard
                      key={item.id}
                      pairing={pairing!}
                      item={item}
                      number={index + 1}
                      disabled={!editable}
                      onRefresh={refresh}
                      onNotice={setNotice}
                    />
                  ))}

                  <section className="flex items-center justify-between gap-2 rounded-2xl border border-[#d9e1ec] bg-white p-3 shadow-sm">
                    <div>
                      {selectedIndex > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedStageId(checklist.stages[selectedIndex - 1].id)}
                          className="flex h-10 items-center gap-1 rounded-xl border border-[#cbd5e1] px-3 text-xs font-black text-[#334155]"
                        >
                          <ChevronLeft size={15} /> Anterior
                        </button>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      {completed && canGoNext && (
                        <button
                          type="button"
                          onClick={() => setSelectedStageId(checklist.stages[selectedIndex + 1].id)}
                          className="flex h-10 items-center gap-1 rounded-xl border border-[#cbd5e1] px-3 text-xs font-black text-[#334155]"
                        >
                          Próxima <ChevronRight size={15} />
                        </button>
                      )}

                      {canReopenSelected && (
                        <button
                          type="button"
                          disabled={stageBusy}
                          onClick={() => void reopenStage(stage)}
                          className="flex h-10 items-center gap-1.5 rounded-xl border border-[#cbd5e1] px-3 text-xs font-black text-[#334155] disabled:opacity-50"
                        >
                          {stageBusy ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                          Reabrir
                        </button>
                      )}

                      {!completed && isCurrent && (
                        <button
                          type="button"
                          disabled={stageBusy}
                          onClick={() => void completeStage(stage)}
                          className="flex h-10 items-center gap-1.5 rounded-xl bg-[#0057e7] px-3 text-xs font-black text-white disabled:opacity-50"
                        >
                          {stageBusy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                          Concluir
                        </button>
                      )}
                    </div>
                  </section>
                </div>
              );
            })()}
          </>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#0d1b2e]/10 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <p className="min-w-0 truncate text-xs font-bold text-[#64748b]">OS {data?.order.os_number || ""}</p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="flex h-10 items-center gap-1.5 rounded-xl border border-[#cbd5e1] px-3 text-xs font-black text-[#334155]"
          >
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>
    </div>
  );
}
