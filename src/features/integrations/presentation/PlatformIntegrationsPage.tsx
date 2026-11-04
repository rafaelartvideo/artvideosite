import { useEffect, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, CircleAlert, Headphones, LockKeyhole, MessageCircle, Phone, Search, Store, Ticket, WandSparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AdminButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { setOrganizationModuleEnabled } from "@/features/partner-companies/infrastructure/partner-companies.repository";
import { OlxIntegrationPage } from "./OlxIntegrationPage";

const INTEGRATIONS = [
  { key: "olx", title: "OLX", category: "Marketplace externo", description: "Publicação e sincronização de anúncios elegíveis, após homologação e autorização OAuth.", icon: Store, ready: false },
  { key: "whatsapp", title: "WhatsApp · WuzAPI", category: "Comunicação", description: "Motor de mensagens da Union; cada empresa utiliza uma sessão isolada.", icon: MessageCircle, ready: true },
  { key: "sac_digital", title: "SAC Digital", category: "Atendimento", description: "Integração do SAC Digital com canais, webhooks e atendimento.", icon: Headphones, ready: true },
  { key: "pbx", title: "PABX · SIP/Asterisk", category: "Telefonia", description: "Telefonia integrada e ramais no motor central da Union.", icon: Phone, ready: true },
  { key: "queue", title: "Union Senhas", category: "Atendimento", description: "Integração da fila eletrônica aos atendimentos e ordens de serviço.", icon: Ticket, ready: true },
  { key: "ai", title: "Union IA", category: "Inteligência artificial", description: "Recursos de IA disponibilizados pela plataforma conforme o plano.", icon: WandSparkles, ready: true },
] as const;

type IntegrationKey = typeof INTEGRATIONS[number]["key"];
type PartnerRow = { id: string; name: string; status: string };
type ModuleRow = { organization_id: string; module_key: string; is_enabled: boolean };
const PAGE_SIZE = 15;

export function PlatformIntegrationsPage({ onBack }: { onBack: () => void }) {
  const { hasPermission, user } = useAuth();
  const canManage = hasPermission("organizations.modules.manage");
  const [selected, setSelected] = useState<IntegrationKey>("olx");
  const [showOlxGuide, setShowOlxGuide] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<PartnerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [assigned, setAssigned] = useState<Record<string, boolean>>({});
  const [availableKeys, setAvailableKeys] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<PartnerRow | null>(null);
  const [error, setError] = useState("");

  const provider = INTEGRATIONS.find(item => item.key === selected)!;
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      const system = await supabase.from("system_modules").select("key").in("key", INTEGRATIONS.map(item => item.key));
      if (cancelled) return;
      if (system.error) { setError("Não foi possível consultar as integrações da plataforma."); setLoading(false); return; }
      setAvailableKeys((system.data || []).map(item => item.key));
      let query = supabase.from("organizations")
        .select("id,name,status", { count: "exact" })
        .or("organization_type.eq.partner,settings->>is_artvideo_tenant.eq.true")
        .order("name")
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      if (search) query = query.ilike("name", "%" + search.replace(/[%_]/g, "") + "%");
      const result = await query;
      if (cancelled) return;
      if (result.error) { setError("Não foi possível carregar as empresas parceiras."); setLoading(false); return; }
      const rows = (result.data || []) as PartnerRow[];
      if (!rows.length) {
        setCompanies([]); setAssigned({}); setTotal(result.count || 0); setLoading(false); return;
      }
      const moduleResult = await supabase.from("organization_modules")
        .select("organization_id,module_key,is_enabled")
        .in("organization_id", rows.map(item => item.id))
        .eq("module_key", selected);
      if (cancelled) return;
      if (moduleResult.error) { setError("Não foi possível consultar as permissões de distribuição."); setLoading(false); return; }
      const next: Record<string, boolean> = {};
      for (const row of (moduleResult.data || []) as ModuleRow[]) next[row.organization_id] = row.is_enabled;
      setCompanies(rows);
      setAssigned(next);
      setTotal(result.count || 0);
      setLoading(false);
    }
    void load();
    return () => { cancelled = true; };
  }, [selected, page, search, reload]);

  async function updateCompany(company: PartnerRow, enabled: boolean) {
    if (!canManage || savingId || !availableKeys.includes(selected)) return;
    setSavingId(company.id);
    setConfirmDisable(null);
    setError("");
    try {
      const result = await setOrganizationModuleEnabled(company.id, selected, enabled, user?.id);
      if (result.error) throw result.error;
      setAssigned(previous => ({ ...previous, [company.id]: enabled }));
    } catch {
      setError("Não foi possível salvar o acesso de " + company.name + ". Nenhuma alteração foi confirmada.");
      setReload(value => value + 1);
    } finally {
      setSavingId(null);
    }
  }

  if (showOlxGuide) return <OlxIntegrationPage onBack={() => setShowOlxGuide(false)} />;
  return <div className="space-y-5">
    <PageHeader title="Integrações"
      subtitle="Gestão central da Union World: escolha quais integrações ficam disponíveis para cada empresa parceira."
      actions={<AdminButton variant="secondary" onClick={onBack}><ArrowLeft size={16}/> Voltar</AdminButton>} />

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {INTEGRATIONS.map(item => {
        const Icon = item.icon;
        const active = item.key === selected;
        return <button key={item.key} type="button"
          aria-pressed={active}
          onClick={() => { setSelected(item.key); setPage(1); setConfirmDisable(null); }}
          className={"min-h-[142px] rounded-xl border bg-card p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary " +
            (active ? "border-primary ring-1 ring-primary/30" : "border-border hover:border-primary/50 hover:bg-muted/20")}>
          <div className="flex items-start justify-between gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon size={21}/></span>
            <span className="rounded-md bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {item.ready ? "Disponível" : "Em homologação"}
            </span>
          </div>
          <div className="mt-3 font-semibold text-foreground">{item.title}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</div>
        </button>;
      })}
    </div>

    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{provider.category}</div>
          <h2 className="mt-1 text-lg font-bold">{provider.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Disponibilização por empresa · {total} empresa(s) encontrada(s)</p>
        </div>
        {selected === "olx" && <AdminButton variant="secondary" onClick={() => setShowOlxGuide(true)}>Requisitos da OLX</AdminButton>}
      </div>
      {selected === "olx" && <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
        <CircleAlert size={17} className="mt-0.5 shrink-0"/>
        Disponibilizar a OLX não conecta nenhuma conta e não publica anúncios. A API permanece desativada até a homologação e autorização oficial.
      </p>}
      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <LockKeyhole size={16} className="shrink-0"/> Este painel controla o módulo liberado para a empresa. Credenciais, sessões e dados operacionais permanecem isolados por organização. Não há compartilhamento de tokens.
      </p>
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setPage(1); setSearch(searchText.trim()); }}>
        <label className="flex min-w-[185px] flex-1 items-center gap-2 rounded-lg border border-border bg-background px-3">
          <Search size={16} className="shrink-0 text-muted-foreground"/>
          <input className="min-h-10 w-full bg-transparent text-sm outline-none" value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Nome da empresa" aria-label="Buscar empresa"/>
        </label>
        <AdminButton type="submit" variant="secondary">Buscar</AdminButton>
      </form>
      {error && <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {!availableKeys.includes(selected) && !loading && <p className="mt-3 text-xs text-muted-foreground">Este módulo ainda não está cadastrado no catálogo do banco. A distribuição ficará disponível após a migração.</p>}
      <div className="mt-4 divide-y divide-border rounded-xl border border-border">
        {loading ? <p className="p-5 text-center text-sm text-muted-foreground">Carregando empresas...</p>
          : companies.length === 0 ? <p className="p-5 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada.</p>
          : companies.map(company => {
            const enabled = assigned[company.id] === true;
            const disabled = !canManage || !availableKeys.includes(selected) || savingId !== null || company.status !== "active";
            return <div key={company.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 p-3 sm:px-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{company.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{company.status === "active" ? (enabled ? "Integração disponibilizada" : "Integração indisponível") : "Empresa inativa"}</p>
              </div>
              <button type="button" role="switch" aria-checked={enabled} aria-label={(enabled ? "Desativar " : "Disponibilizar ") + provider.title + " para " + company.name}
                disabled={disabled}
                onClick={() => enabled ? setConfirmDisable(company) : void updateCompany(company, true)}
                className={"flex h-8 min-w-[102px] items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 " +
                  (enabled ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground hover:bg-muted")}>
                {savingId === company.id ? "Salvando..." : enabled ? <><Check size={13}/> Ativada</> : "Desativada"}
              </button>
            </div>;
          })}
      </div>
      {total > PAGE_SIZE && <div className="mt-4 flex items-center justify-end gap-3 text-xs text-muted-foreground">
        <span>Página {page} de {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span>
        <button aria-label="Página anterior" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)} className="rounded-lg border border-border p-2 disabled:opacity-40"><ChevronLeft size={17}/></button>
        <button aria-label="Próxima página" disabled={page * PAGE_SIZE >= total || loading} onClick={() => setPage(value => value + 1)} className="rounded-lg border border-border p-2 disabled:opacity-40"><ChevronRight size={17}/></button>
      </div>}
      {!canManage && <p className="mt-3 text-xs text-muted-foreground">Seu perfil permite consultar integrações, mas não alterar a disponibilidade por empresa.</p>}
    </section>
    {confirmDisable && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="disable-integration-title" className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <h2 id="disable-integration-title" className="text-base font-bold">Desativar integração?</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">A integração {provider.title} deixará de estar disponível para {confirmDisable.name}. A desativação poderá interromper operações vinculadas, sem excluir os registros existentes.</p>
        <div className="mt-5 flex justify-end gap-2">
          <AdminButton variant="secondary" onClick={() => setConfirmDisable(null)}>Cancelar</AdminButton>
          <AdminButton onClick={() => void updateCompany(confirmDisable, false)}>Confirmar</AdminButton>
        </div>
      </div>
    </div>}
  </div>;
}
