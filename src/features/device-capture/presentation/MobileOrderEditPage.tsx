import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Clock3, Hash, ImagePlus, Loader2, LogOut, Save, Smartphone } from "lucide-react";
import { useLocation } from "react-router";
import { EmployeeMultiSelect } from "@/features/orders/presentation/OrderFormControls";
import {
  getMobileOrderEditor,
  getMobileOrderEditStatus,
  pairMobileOrderEditCode,
  saveMobileOrderEditor,
  uploadMobileOrderEditPhoto,
  type MobileOrderEditorData,
} from "@/features/orders/infrastructure/order-mobile-edit.gateway";

const STORAGE_KEY = "artvideo:mobile-order-edit";
type Pairing = { id: string; token: string };
type Notice = { type: "success" | "error"; text: string } | null;

function pairingCodeDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}

function formatPairingCode(value: string) {
  const digits = pairingCodeDigits(value);
  return digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;
}

function readStoredPairing(): Pairing | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
    return parsed?.id && parsed?.token ? { id: String(parsed.id), token: String(parsed.token) } : null;
  } catch {
    return null;
  }
}

function toInputDate(value: unknown) {
  const raw = String(value || "");
  return raw ? raw.slice(0, 16) : "";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block min-w-0"><span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-[#64748b]">{label}</span>{children}</label>;
}

const inputClass = "h-11 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm font-semibold text-[#0d1b2e] outline-none transition focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/10 disabled:bg-[#eef2f6] disabled:text-[#64748b]";
const textareaClass = "min-h-24 w-full resize-y rounded-xl border border-[#cbd5e1] bg-white px-3 py-2.5 text-sm font-semibold text-[#0d1b2e] outline-none transition focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/10";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-2xl border border-[#d9e1ec] bg-white shadow-sm"><div className="border-b border-[#e6ebf2] bg-[#f8fafc] px-4 py-3"><h2 className="text-sm font-black uppercase tracking-wide text-[#0d1b2e]">{title}</h2></div><div className="space-y-4 p-4">{children}</div></section>;
}

function EmployeePicker({ title, employees, selected, onChange }: { title: string; employees: any[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return <EmployeeMultiSelect
    label={title}
    employees={employees}
    selectedIds={selected}
    onChange={onChange}
    placeholder={`Selecionar ${title.toLocaleLowerCase("pt-BR")}`}
    clearLabel={`Limpar ${title}`}
  />;
}

export function MobileOrderEditPage() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const queryPairing = params.get("session") && params.get("token") ? { id: String(params.get("session")), token: String(params.get("token")) } : null;
  const [pairing, setPairing] = useState<Pairing | null>(() => queryPairing || readStoredPairing());
  const [state, setState] = useState<"idle" | "checking" | "connected" | "expired">(pairing ? "checking" : "idle");
  const [data, setData] = useState<MobileOrderEditorData | null>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [technicianIds, setTechnicianIds] = useState<string[]>([]);
  const [sellerIds, setSellerIds] = useState<string[]>([]);
  const [technicalValues, setTechnicalValues] = useState<Record<string, string>>({});
  const [pairingCode, setPairingCode] = useState("");
  const [pairBusy, setPairBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(pairing));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"label" | "equipment" | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const equipmentInputRef = useRef<HTMLInputElement>(null);

  const rememberPairing = (next: Pairing) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setPairing(next);
    setState("checking");
    window.history.replaceState(window.history.state, "", "/editar-os-mobile");
  };

  const disconnect = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setPairing(null);
    setData(null);
    setForm({});
    setState("idle");
    setPairingCode("");
    setNotice(null);
    window.history.replaceState(window.history.state, "", "/editar-os-mobile");
  };

  const hydrate = useCallback((next: MobileOrderEditorData) => {
    setData(next);
    const order = next.order || {};
    setForm({
      general_service_id: order.general_service_id || "",
      service_type_id: order.service_type_id || "",
      status_id: order.status_id || "",
      situation_id: order.situation_id || "",
      equipment_type_id: order.equipment_type_id || "",
      equipment_brand_id: order.equipment_brand_id || "",
      equipment_model_id: order.equipment_model_id || "",
      model: order.model || "",
      serial_number: order.serial_number || "",
      accessories: order.accessories || "",
      equipment_condition: order.equipment_condition || "",
      priority: order.priority || "normal",
      scheduled_at: toInputDate(order.scheduled_at),
      started_at: toInputDate(order.started_at),
      internal_notes: order.internal_notes || "",
      customer_notes: order.customer_notes || "",
      estimated_price: order.estimated_price == null ? "" : String(order.estimated_price),
      order_type: order.order_type === "external" ? "external" : "internal",
      service_state: order.service_state || "",
      service_city: order.service_city || "",
      service_street: order.service_street || "",
      service_zip_code: order.service_zip_code || "",
      service_neighborhood: order.service_neighborhood || "",
      service_number: order.service_number || "",
      service_complement: order.service_complement || "",
      external_os_number: order.external_os_number || "",
    });
    setTechnicianIds(next.technician_ids || []);
    setSellerIds(next.seller_ids || []);
    setTechnicalValues(next.technical_values || {});
  }, []);

  const loadEditor = useCallback(async (current: Pairing) => {
    setLoading(true);
    try {
      await getMobileOrderEditStatus(current.id, current.token);
      const editor = await getMobileOrderEditor(current.id, current.token);
      hydrate(editor);
      setState("connected");
      setNotice(null);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      if (window.location.search) window.history.replaceState(window.history.state, "", "/editar-os-mobile");
    } catch (error) {
      setState("expired");
      setNotice({ type: "error", text: error instanceof Error ? error.message : "A conexão expirou." });
    } finally {
      setLoading(false);
    }
  }, [hydrate]);

  useEffect(() => {
    document.title = "Editar OS pelo celular - ArtVideo";
  }, []);

  useEffect(() => {
    if (!pairing) return;
    void loadEditor(pairing);
  }, [pairing?.id, pairing?.token, loadEditor]);

  useEffect(() => {
    if (!pairing || state !== "connected") return;
    let cancelled = false;
    const heartbeat = async () => {
      try {
        await getMobileOrderEditStatus(pairing.id, pairing.token);
      } catch (error) {
        if (cancelled) return;
        setState("expired");
        setNotice({ type: "error", text: error instanceof Error ? error.message : "A conexão expirou." });
      }
    };
    const timer = window.setInterval(() => void heartbeat(), 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [pairing?.id, pairing?.token, state]);

  const connectByCode = async () => {
    const code = pairingCodeDigits(pairingCode);
    if (code.length !== 8 || pairBusy) return;
    setPairBusy(true);
    setNotice(null);
    try {
      const session = await pairMobileOrderEditCode(code);
      rememberPairing({ id: session.id, token: session.token });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Código inválido ou expirado." });
    } finally {
      setPairBusy(false);
    }
  };

  const options = data?.options;
  const brands = useMemo(() => (options?.equipment_brands || []).filter(item => !form.equipment_type_id || item.equipment_type_id === form.equipment_type_id), [options?.equipment_brands, form.equipment_type_id]);
  const models = useMemo(() => (options?.equipment_models || []).filter(item => !form.equipment_brand_id || item.equipment_brand_id === form.equipment_brand_id), [options?.equipment_models, form.equipment_brand_id]);

  const update = (key: string, value: any) => setForm(current => ({ ...current, [key]: value }));

  const save = async () => {
    if (!pairing || !data || saving) return;
    setSaving(true);
    setNotice(null);
    try {
      await saveMobileOrderEditor({ sessionId: pairing.id, token: pairing.token, patch: form, technicianIds, sellerIds, technicalValues });
      const refreshed = await getMobileOrderEditor(pairing.id, pairing.token);
      hydrate(refreshed);
      setNotice({ type: "success", text: `OS ${refreshed.order?.os_number || ""} atualizada com sucesso.` });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível salvar a OS." });
    } finally {
      setSaving(false);
    }
  };

  const uploadPhoto = async (kind: "label" | "equipment", file?: File) => {
    if (!file || !pairing || uploading) return;
    setUploading(kind);
    setNotice(null);
    try {
      await uploadMobileOrderEditPhoto(pairing.id, pairing.token, kind, file);
      setNotice({ type: "success", text: kind === "label" ? "Foto da etiqueta adicionada à OS." : "Foto do equipamento adicionada à OS." });
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "Não foi possível enviar a foto." });
    } finally {
      setUploading(null);
    }
  };

  if (state === "idle" || state === "expired") {
    return <div className="min-h-dvh bg-[#f4f7fb] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="bg-[#0d1b2e] px-4 pb-5 pt-[calc(1rem+env(safe-area-inset-top))] text-white shadow-lg"><div className="mx-auto flex max-w-lg items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0057e7]"><Smartphone size={22}/></span><div><h1 className="text-base font-black">Editar OS pelo celular</h1><p className="mt-0.5 text-xs text-white/65">Conexão temporária ArtVideo</p></div></div></header>
      <main className="mx-auto max-w-lg space-y-4 p-4">
        {notice && <div role={notice.type === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm font-bold ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}
        <section className="rounded-3xl border border-[#d9e1ec] bg-white p-5 shadow-sm"><div className="text-center"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#eef5ff] text-[#0057e7]"><Hash size={24}/></span><h2 className="mt-4 text-xl font-black text-[#0d1b2e]">Conectar à OS</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#64748b]">Escaneie o QR exibido no computador com a câmera do celular ou digite o código temporário.</p></div><div className="mt-6 space-y-3"><input inputMode="numeric" autoComplete="one-time-code" value={pairingCode} onChange={event => setPairingCode(formatPairingCode(event.target.value))} placeholder="0000 0000" className="h-14 w-full rounded-2xl border border-[#cbd5e1] bg-white px-4 text-center font-mono text-2xl font-black tracking-[0.18em] text-[#0d1b2e] outline-none focus:border-[#0057e7]"/><button type="button" onClick={() => void connectByCode()} disabled={pairingCodeDigits(pairingCode).length !== 8 || pairBusy} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0057e7] px-4 text-sm font-black text-white disabled:opacity-50">{pairBusy ? <Loader2 size={17} className="animate-spin"/> : <Smartphone size={17}/>} Conectar</button></div><p className="mt-4 text-center text-[11px] leading-5 text-[#64748b]">O código não dá acesso ao painel administrativo. Ele abre apenas a OS vinculada e expira automaticamente.</p></section>
        {state === "expired" && <button type="button" onClick={disconnect} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#cbd5e1] bg-white text-sm font-bold text-[#334155]"><LogOut size={16}/> Usar outro código</button>}
      </main>
    </div>;
  }

  if (loading || state === "checking" || !data) {
    return <div className="flex min-h-dvh items-center justify-center bg-[#f4f7fb] p-6"><div className="text-center"><Loader2 className="mx-auto h-9 w-9 animate-spin text-[#0057e7]"/><p className="mt-3 text-sm font-bold text-[#64748b]">Abrindo a OS...</p></div></div>;
  }

  const order = data.order || {};
  const customer = order.customer || {};
  const expiresLabel = data.expires_at ? new Date(data.expires_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";

  return <div className="min-h-dvh bg-[#f4f7fb] pb-[calc(7rem+env(safe-area-inset-bottom))]">
    <header className="sticky top-0 z-30 border-b border-white/10 bg-[#0d1b2e] px-4 pb-3 pt-[calc(.75rem+env(safe-area-inset-top))] text-white shadow-lg"><div className="mx-auto flex max-w-2xl items-center justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-white/55">Edição temporária</p><h1 className="truncate text-lg font-black">OS #{order.os_number || "—"}</h1><p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-white/60"><Clock3 size={11}/> Expira às {expiresLabel}</p></div><button type="button" onClick={disconnect} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5" aria-label="Desconectar"><LogOut size={17}/></button></div></header>

    <main className="mx-auto max-w-2xl space-y-4 p-4">
      {notice && <div role={notice.type === "error" ? "alert" : "status"} className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.type === "success" && <CheckCircle2 size={17} className="mt-0.5 shrink-0"/>}<span>{notice.text}</span></div>}

      <Section title="Cliente"><div className="rounded-xl bg-[#f8fafc] p-3"><p className="font-black text-[#0d1b2e]">{customer.full_name || "—"}</p><div className="mt-2 grid grid-cols-1 gap-1 text-xs font-semibold text-[#64748b] sm:grid-cols-2"><p>{customer.document || "Documento não informado"}</p><p>{customer.whatsapp || customer.phone || "Telefone não informado"}</p><p className="sm:col-span-2">{customer.email || "E-mail não informado"}</p></div></div><p className="text-[11px] text-[#64748b]">Os dados do cliente são somente leitura nesta conexão.</p></Section>

      <Section title="Equipamento">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de equipamento"><select value={form.equipment_type_id} onChange={event => { update("equipment_type_id", event.target.value); update("equipment_brand_id", ""); update("equipment_model_id", ""); setTechnicalValues({}); }} className={inputClass}><option value="">Selecionar...</option>{(options?.equipment_types || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Marca"><select value={form.equipment_brand_id} onChange={event => { update("equipment_brand_id", event.target.value); update("equipment_model_id", ""); }} className={inputClass}><option value="">Selecionar...</option>{brands.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Modelo"><select value={form.equipment_model_id} onChange={event => update("equipment_model_id", event.target.value)} className={inputClass}><option value="">Selecionar...</option>{models.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
          <Field label="Número de série"><input value={form.serial_number || ""} disabled className={inputClass}/></Field>
          <Field label="Acessórios"><input value={form.accessories || ""} onChange={event => update("accessories", event.target.value)} className={inputClass}/></Field>
          <Field label="Condição"><input value={form.equipment_condition || ""} onChange={event => update("equipment_condition", event.target.value)} className={inputClass}/></Field>
        </div>
        {(data.technical_fields || []).length > 0 && <div className="grid gap-4 border-t border-[#e6ebf2] pt-4 sm:grid-cols-2">{(data.technical_fields || []).map((relation: any) => {
          const field = relation.technical_field || {};
          const id = String(relation.technical_field_id || field.id || "");
          if (!id) return null;
          return <Field key={id} label={`${field.label || "Campo técnico"}${relation.required ? " *" : ""}`}><input type={field.field_type === "number" ? "number" : "text"} value={technicalValues[id] || ""} onChange={event => setTechnicalValues(current => ({ ...current, [id]: event.target.value }))} className={inputClass}/></Field>;
        })}</div>}
        <div className="grid grid-cols-2 gap-2 border-t border-[#e6ebf2] pt-4"><button type="button" onClick={() => labelInputRef.current?.click()} disabled={Boolean(uploading)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#0057e7]/25 bg-[#eef5ff] px-3 text-xs font-black text-[#0057e7]">{uploading === "label" ? <Loader2 size={16} className="animate-spin"/> : <Camera size={16}/>} Etiqueta</button><button type="button" onClick={() => equipmentInputRef.current?.click()} disabled={Boolean(uploading)} className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#0057e7]/25 bg-[#eef5ff] px-3 text-xs font-black text-[#0057e7]">{uploading === "equipment" ? <Loader2 size={16} className="animate-spin"/> : <ImagePlus size={16}/>} Equipamento</button><input ref={labelInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { const file=event.target.files?.[0]; event.currentTarget.value=""; void uploadPhoto("label",file); }}/><input ref={equipmentInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { const file=event.target.files?.[0]; event.currentTarget.value=""; void uploadPhoto("equipment",file); }}/></div>
      </Section>

      <Section title="Atendimento e OS"><div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo de atendimento"><select value={form.service_type_id} onChange={event => update("service_type_id", event.target.value)} className={inputClass}><option value="">Selecionar...</option>{(options?.service_types || []).map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></Field>
        <Field label="Serviço"><select value={form.general_service_id} onChange={event => update("general_service_id", event.target.value)} className={inputClass}><option value="">Selecionar...</option>{(options?.general_services || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Status"><select value={form.status_id} onChange={event => update("status_id", event.target.value)} className={inputClass}><option value="">Selecionar...</option>{(options?.statuses || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Situação"><select value={form.situation_id} onChange={event => update("situation_id", event.target.value)} className={inputClass}><option value="">Selecionar...</option>{(options?.situations || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
        <Field label="Valor estimado"><input inputMode="decimal" value={form.estimated_price || ""} onChange={event => update("estimated_price", event.target.value)} className={inputClass}/></Field>
        <Field label="OS externa"><input value={form.external_os_number || ""} onChange={event => update("external_os_number", event.target.value)} className={inputClass}/></Field>
        <Field label="Data agendada"><input type="datetime-local" value={form.scheduled_at || ""} onChange={event => update("scheduled_at", event.target.value)} className={inputClass}/></Field>
        <Field label="Data de início"><input type="datetime-local" value={form.started_at || ""} onChange={event => update("started_at", event.target.value)} className={inputClass}/></Field>
      </div><EmployeePicker title="Técnicos" employees={options?.employees || []} selected={technicianIds} onChange={setTechnicianIds}/><EmployeePicker title="Vendedores / responsáveis" employees={options?.employees || []} selected={sellerIds} onChange={setSellerIds}/></Section>

      <Section title="Local do atendimento"><Field label="Tipo"><select value={form.order_type} onChange={event => update("order_type", event.target.value)} className={inputClass}><option value="internal">Interno</option><option value="external">Externo</option></select></Field>{form.order_type === "external" && <div className="grid gap-4 sm:grid-cols-2"><Field label="CEP"><input inputMode="numeric" value={form.service_zip_code || ""} onChange={event => update("service_zip_code", event.target.value)} className={inputClass}/></Field><Field label="UF"><input maxLength={2} value={form.service_state || ""} onChange={event => update("service_state", event.target.value.toUpperCase())} className={inputClass}/></Field><Field label="Cidade"><input value={form.service_city || ""} onChange={event => update("service_city", event.target.value)} className={inputClass}/></Field><Field label="Bairro"><input value={form.service_neighborhood || ""} onChange={event => update("service_neighborhood", event.target.value)} className={inputClass}/></Field><Field label="Rua"><input value={form.service_street || ""} onChange={event => update("service_street", event.target.value)} className={inputClass}/></Field><Field label="Número"><input value={form.service_number || ""} onChange={event => update("service_number", event.target.value)} className={inputClass}/></Field><div className="sm:col-span-2"><Field label="Complemento"><input value={form.service_complement || ""} onChange={event => update("service_complement", event.target.value)} className={inputClass}/></Field></div></div>}</Section>

      <Section title="Observações"><Field label="Descrição / observações do cliente"><textarea value={form.customer_notes || ""} onChange={event => update("customer_notes", event.target.value)} className={textareaClass}/></Field><Field label="Observações internas"><textarea value={form.internal_notes || ""} onChange={event => update("internal_notes", event.target.value)} className={textareaClass}/></Field></Section>
    </main>

    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#d9e1ec] bg-white/95 px-4 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_30px_rgba(13,27,46,.08)] backdrop-blur"><div className="mx-auto flex max-w-2xl gap-2"><button type="button" onClick={disconnect} disabled={saving} className="h-12 rounded-xl border border-[#cbd5e1] bg-white px-4 text-sm font-bold text-[#334155]">Sair</button><button type="button" onClick={() => void save()} disabled={saving} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0057e7] px-4 text-sm font-black text-white disabled:opacity-60">{saving ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>} {saving ? "Salvando..." : "Salvar alterações"}</button></div></div>
  </div>;
}
