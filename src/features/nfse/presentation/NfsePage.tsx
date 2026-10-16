import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { FileCheck2, FileClock, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { adminPath } from "@/features/admin-shell/admin-routes";
import {
  getFiscalCompanySettings, listFiscalServiceMappings, listNfseDrafts,
  prepareNfseDraftFromOrder, previewOrderNfseServices,
  saveFiscalCompanySettings, saveFiscalServiceMapping,
  type FiscalCompanySettings, type FiscalServiceMapping, type NfseDraft,
} from "../infrastructure/nfse.repository";
import { NFSE_LIVE_EMISSION_ENABLED } from "../domain/nfse-provider";

type View = "notes" | "settings" | "services";
type ServiceRow = { id: string; name: string; mapping: FiscalServiceMapping | null };
const inputClass = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary";
const labelClass = "block space-y-1 text-xs font-semibold text-muted-foreground";
const emptySettings = (organization_id: string): FiscalCompanySettings => ({
  organization_id, tax_regime: "not_configured", municipal_registration: null,
  municipality_ibge_code: null, default_service_code: null,
  fiscal_contact_email: null, accounting_notes: null,
  emission_enabled: false, automatic_emission_enabled: false,
});
const formatMoney = (value: unknown) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
const REGIMES = [
  ["not_configured", "Não definido"], ["simples_nacional", "Simples Nacional"],
  ["mei", "MEI"], ["lucro_presumido", "Lucro Presumido"],
  ["lucro_real", "Lucro Real"], ["other", "Outro"],
];

export function NfsePage() {
  const { activeOrganizationId, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const orderId = new URLSearchParams(location.search).get("order");
  const canManageDrafts = hasPermission("nfse.drafts.manage");
  const canManageSettings = hasPermission("nfse.settings.manage");
  const canManageServices = hasPermission("nfse.services.manage");
  const [view, setView] = useState<View>("notes");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<NfseDraft[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const [settings, setSettings] = useState<FiscalCompanySettings | null>(null);
  const [servicePage, setServicePage] = useState(0);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [serviceCount, setServiceCount] = useState(0);
  const [serviceEdits, setServiceEdits] = useState<Record<string, { national_service_code: string; municipal_service_code: string; national_taxation_code: string; suggested_iss_rate: string }>>({});
  const [orderPreview, setOrderPreview] = useState<Awaited<ReturnType<typeof previewOrderNfseServices>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => { setPage(0); setServicePage(0); setSearch(""); setSettings(null); setOrderPreview(null); setError(""); }, [activeOrganizationId]);
  useEffect(() => {
    if (!activeOrganizationId || view !== "notes") return;
    let alive = true;
    setLoading(true);
    void listNfseDrafts(activeOrganizationId, page, search)
      .then(result => { if (alive) { setDrafts(result.items); setDraftCount(result.total); setError(""); } })
      .catch(err => { if (alive) { setError(systemErrorMessage(err)); setDrafts([]); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeOrganizationId, page, search, reload, view]);

  useEffect(() => {
    if (!activeOrganizationId || view !== "settings") return;
    let alive = true;
    setLoading(true);
    void getFiscalCompanySettings(activeOrganizationId)
      .then(data => { if (alive) { setSettings(data || emptySettings(activeOrganizationId)); setError(""); } })
      .catch(err => { if (alive) setError(systemErrorMessage(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeOrganizationId, view, reload]);

  useEffect(() => {
    if (!activeOrganizationId || view !== "services") return;
    let alive = true;
    setLoading(true);
    void listFiscalServiceMappings(activeOrganizationId, servicePage)
      .then(result => {
        if (!alive) return;
        setServices(result.items);
        setServiceCount(result.total);
        setServiceEdits(Object.fromEntries(result.items.map(item => [item.id, {
          national_service_code: item.mapping?.national_service_code || "",
          municipal_service_code: item.mapping?.municipal_service_code || "",
          national_taxation_code: item.mapping?.national_taxation_code || "",
          suggested_iss_rate: item.mapping?.suggested_iss_rate == null ? "" : String(item.mapping.suggested_iss_rate),
        }])));
        setError("");
      })
      .catch(err => { if (alive) setError(systemErrorMessage(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeOrganizationId, view, servicePage, reload]);

  useEffect(() => {
    if (!activeOrganizationId || !orderId) { setOrderPreview(null); return; }
    let alive = true;
    void previewOrderNfseServices(activeOrganizationId, orderId)
      .then(value => { if (alive) { setOrderPreview(value); setError(""); } })
      .catch(err => { if (alive) setError("Não foi possível preparar a prévia: " + systemErrorMessage(err)); });
    return () => { alive = false; };
  }, [activeOrganizationId, orderId]);

  async function saveSettings() {
    if (!settings || !canManageSettings) return;
    if (settings.municipality_ibge_code && !/^\d{7}$/.test(settings.municipality_ibge_code)) { setError("Informe um código IBGE municipal com 7 dígitos."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      await saveFiscalCompanySettings({
        organization_id: settings.organization_id, tax_regime: settings.tax_regime,
        municipal_registration: settings.municipal_registration?.trim() || null,
        municipality_ibge_code: settings.municipality_ibge_code?.trim() || null,
        default_service_code: settings.default_service_code?.trim() || null,
        fiscal_contact_email: settings.fiscal_contact_email?.trim() || null,
        accounting_notes: settings.accounting_notes?.trim() || null,
      });
      setMessage("Configuração fiscal salva. A emissão permanece desativada.");
    } catch (err) { setError(systemErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function saveMapping(row: ServiceRow) {
    const values = serviceEdits[row.id];
    if (!activeOrganizationId || !values || !canManageServices) return;
    const rate = values.suggested_iss_rate.trim() ? Number(values.suggested_iss_rate.replace(",", ".")) : null;
    if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) { setError("Alíquota inválida: informe um percentual entre 0 e 100."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      await saveFiscalServiceMapping({
        organization_id: activeOrganizationId, general_service_id: row.id,
        national_service_code: values.national_service_code.trim() || null,
        municipal_service_code: values.municipal_service_code.trim() || null,
        national_taxation_code: values.national_taxation_code.trim() || null,
        suggested_iss_rate: rate,
      });
      setMessage(`Código fiscal de "${row.name}" salvo. Revise com a contabilidade antes da emissão.`);
      setReload(value => value + 1);
    } catch (err) { setError(systemErrorMessage(err)); }
    finally { setBusy(false); }
  }

  async function prepareDraft() {
    if (!orderId || !canManageDrafts || !activeOrganizationId) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await prepareNfseDraftFromOrder(orderId);
      setMessage("Rascunho preparado. Nenhuma nota fiscal foi enviada ou autorizada.");
      navigate(adminPath("nfse"), { replace: true });
      setPage(0); setReload(value => value + 1);
    } catch (err) { setError(systemErrorMessage(err)); }
    finally { setBusy(false); }
  }

  function chooseView(next: View) { setView(next); setError(""); setMessage(""); }
  function editService(serviceId: string, key: keyof (typeof serviceEdits)[string], value: string) {
    setServiceEdits(current => ({ ...current, [serviceId]: { ...current[serviceId], [key]: value } }));
  }
  const disabled = busy || !activeOrganizationId;
  return <div className="min-w-0 space-y-5">
    <PageHeader title="Notas Fiscais de Serviço" subtitle="Prepare e confira rascunhos de NFS-e por empresa, integrados às Ordens de Serviço." />
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-foreground">
      <ShieldAlert size={19} className="mt-0.5 shrink-0 text-amber-600" />
      <div><strong>Etapa 1 — sem emissão real.</strong> Nenhuma nota será transmitida, autorizada, cancelada ou enviada ao cliente. Os rascunhos não têm validade fiscal. Integração com provedor ainda não configurada.</div>
    </div>
    {NFSE_LIVE_EMISSION_ENABLED ? null : <span className="sr-only">Transmissão bloqueada no sistema</span>}
    <div className="flex flex-wrap gap-2 border-b border-border pb-3">
      {([["notes","Rascunhos"],["settings","Configuração fiscal"],["services","Códigos dos serviços"]] as const).map(([key,label]) =>
        <button key={key} type="button" onClick={() => chooseView(key)} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${view===key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>{label}</button>
      )}
    </div>
    {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
    {message && <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-foreground">{message}</div>}

    {view === "notes" && <div className="space-y-4">
      {orderId && <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-bold">Prévia fiscal da OS {orderPreview?.order.os_number || ""}</h2><AdminButton variant="secondary" onClick={() => navigate(adminPath("nfse"))}>Fechar prévia</AdminButton></div>
        {orderPreview && <>
          <p className="text-xs text-muted-foreground">Somente itens de serviço. Peças e produtos são excluídos. Confira descontos, cliente, código tributário e retenções com a contabilidade.</p>
          <div className="divide-y divide-border rounded-lg border border-border">{orderPreview.items.map(item => <div key={item.id} className="flex flex-wrap justify-between gap-2 p-3 text-sm"><span>{item.title_snapshot} · {item.quantity} un.</span><strong>{formatMoney(item.subtotal)}</strong></div>)}</div>
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>Total bruto de serviços: {formatMoney(orderPreview.total)}</strong><AdminButton onClick={prepareDraft} disabled={!canManageDrafts || disabled || orderPreview.total<=0}>{busy ? "Salvando..." : "Preparar rascunho"}</AdminButton></div>
        </>}
      </section>}
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Rascunhos de NFS-e</h2><p className="text-xs text-muted-foreground">Total: {draftCount.toLocaleString("pt-BR")} · Nenhuma emissão autorizada nesta etapa</p></div><div className="flex items-center gap-2"><FileClock size={17} className="text-muted-foreground"/><span className="text-xs text-muted-foreground">Somente rascunhos</span></div></div>
        <input className={inputClass} aria-label="Buscar OS ou cliente" placeholder="Buscar pelo número da OS ou nome do cliente" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
        {loading && <LoadingState text="Carregando rascunhos..." />}
        {!loading && drafts.length===0 && <div className="rounded-lg border border-dashed border-border py-10 text-center"><FileCheck2 size={26} className="mx-auto mb-2 text-muted-foreground"/><p className="font-semibold">Nenhum rascunho encontrado</p><p className="mt-1 text-xs text-muted-foreground">Abra uma OS com serviços para preparar sua primeira prévia fiscal.</p></div>}
        {!loading && drafts.length>0 && <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="border-b border-border text-xs text-muted-foreground"><th className="py-3">Origem</th><th>Cliente</th><th>Serviços</th><th>Situação</th><th>Data</th></tr></thead><tbody>{drafts.map(draft => <tr key={draft.id} className="border-b border-border/60"><td className="py-3 font-semibold">{draft.source_order_id ? <button type="button" className="text-primary hover:underline" onClick={() => navigate(adminPath("orders",draft.source_order_id))}>OS {draft.source_order_number_snapshot || "—"}</button> : "Manual"}</td><td>{draft.customer_name_snapshot || "—"}</td><td className="font-semibold">{formatMoney(draft.services_net_total)}</td><td><span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs">Rascunho</span></td><td>{new Date(draft.created_at).toLocaleDateString("pt-BR")}</td></tr>)}</tbody></table></div>}
        <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Página {page+1} de {Math.max(1,Math.ceil(draftCount/10))}</span><div className="flex gap-2"><AdminButton variant="secondary" disabled={page===0 || loading} onClick={() => setPage(v=>v-1)}>Anterior</AdminButton><AdminButton variant="secondary" disabled={(page+1)*10>=draftCount || loading} onClick={() => setPage(v=>v+1)}>Próxima</AdminButton></div></div>
      </section>
    </div>}

    {view === "settings" && <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div><h2 className="font-bold">Configuração fiscal da empresa</h2><p className="mt-1 text-xs text-muted-foreground">CNPJ, razão social e endereço continuam sendo gerenciados em Dados da Empresa. Confira essas informações antes de emitir.</p></div>
      {settings && <>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>Regime tributário<select className={inputClass} value={settings.tax_regime} disabled={!canManageSettings || disabled} onChange={event=>setSettings(s=>s && ({...s,tax_regime:event.target.value}))}>{REGIMES.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
          <label className={labelClass}>Inscrição municipal<input className={inputClass} value={settings.municipal_registration||""} disabled={!canManageSettings || disabled} onChange={event=>setSettings(s=>s && ({...s,municipal_registration:event.target.value}))}/></label>
          <label className={labelClass}>Código IBGE do município (7 dígitos)<input className={inputClass} inputMode="numeric" maxLength={7} value={settings.municipality_ibge_code||""} disabled={!canManageSettings || disabled} onChange={event=>setSettings(s=>s && ({...s,municipality_ibge_code:event.target.value.replace(/\D/g,"")}))}/></label>
          <label className={labelClass}>Código padrão do serviço (conferência)<input className={inputClass} value={settings.default_service_code||""} disabled={!canManageSettings || disabled} onChange={event=>setSettings(s=>s && ({...s,default_service_code:event.target.value}))}/></label>
          <label className={labelClass}>E-mail fiscal<input className={inputClass} type="email" value={settings.fiscal_contact_email||""} disabled={!canManageSettings || disabled} onChange={event=>setSettings(s=>s && ({...s,fiscal_contact_email:event.target.value}))}/></label>
          <label className={labelClass}>Provedor de emissão<input className={inputClass} value="Não definido — transmissão bloqueada" disabled readOnly/></label>
        </div>
        <label className={labelClass}>Observações da contabilidade<textarea className={inputClass+" h-24 py-2"} maxLength={3000} value={settings.accounting_notes||""} disabled={!canManageSettings || disabled} onChange={event=>setSettings(s=>s && ({...s,accounting_notes:event.target.value}))}/></label>
        <div className="rounded-lg bg-muted p-3 text-sm"><strong>Emissão automática:</strong> desativada. <strong>Emissão manual:</strong> desativada. A configuração não permite habilitar essas opções nesta etapa.</div>
        {canManageSettings && <div className="flex justify-end"><AdminButton disabled={disabled} onClick={saveSettings}>{busy?"Salvando...":"Salvar configuração fiscal"}</AdminButton></div>}
      </>}
      {!settings && (loading ? <LoadingState text="Carregando configurações..." /> : <p className="text-sm text-muted-foreground">Configuração indisponível.</p>)}
    </section>}

    {view === "services" && <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div><h2 className="font-bold">Códigos fiscais dos serviços</h2><p className="mt-1 text-xs text-muted-foreground">Vinculação separada por empresa. O código e a alíquota sugerida não substituem a validação tributária do contador.</p></div>
      {loading && <LoadingState text="Carregando serviços..." />}
      {!loading && services.length===0 && <p className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">Nenhum serviço cadastrado nesta empresa.</p>}
      {services.map(service => {
        const edit = serviceEdits[service.id];
        if (!edit) return null;
        return <div key={service.id} className="space-y-3 rounded-lg border border-border p-3">
          <h3 className="text-sm font-bold">{service.name}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {([["national_service_code","Item LC 116 / lista nacional"],["municipal_service_code","Código municipal"],["national_taxation_code","Código de tributação nacional"],["suggested_iss_rate","ISS sugerido (%)"]] as const).map(([key,label]) =>
              <label key={key} className={labelClass}>{label}<input className={inputClass} disabled={!canManageServices||disabled} value={edit[key]} onChange={event=>editService(service.id,key,event.target.value)}/></label>
            )}
          </div>
          {canManageServices && <div className="flex justify-end"><AdminButton variant="secondary" disabled={disabled} onClick={() => void saveMapping(service)}>Salvar códigos</AdminButton></div>}
        </div>;
      })}
      <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Página {servicePage+1} de {Math.max(1,Math.ceil(serviceCount/10))}</span><div className="flex gap-2"><AdminButton variant="secondary" disabled={servicePage===0 || loading} onClick={()=>setServicePage(v=>v-1)}>Anterior</AdminButton><AdminButton variant="secondary" disabled={(servicePage+1)*10>=serviceCount || loading} onClick={()=>setServicePage(v=>v+1)}>Próxima</AdminButton></div></div>
    </section>}
  </div>;
}
