import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Link2, Copy, ShieldCheck, CreditCard, CheckCircle2, LockKeyhole } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";

type Gateway = {
  provider_key: string;
  display_name: string;
  description: string;
  integration_ready: boolean;
};
type PaymentSettings = {
  provider_key: string;
  environment: "sandbox" | "production";
  enabled: boolean;
  mercado_pago_public_key?: string | null;
};
const emptySettings: PaymentSettings = { provider_key: "none", environment: "sandbox", enabled: false };

type HomologationInvitation = {
  id: string;
  url: string;
  expiresAt: string;
};

/**
 * Configuração básica do provedor + gerador de homologação.
 * Ferramentas e históricos de testes continuam no servidor, mas não ocupam a tela.
 */
export function SitePaymentsPage({ onBack }: { onBack: () => void }) {
  const { activeOrganization, hasPermission } = useAuth();
  const canUpdate = hasPermission("site_settings.update");
  const orgId = activeOrganization?.id;
  const [providers, setProviders] = useState<Gateway[]>([]);
  const [settings, setSettings] = useState<PaymentSettings>(emptySettings);
  const [savedSettings, setSavedSettings] = useState<PaymentSettings>(emptySettings);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invitation, setInvitation] = useState<HomologationInvitation | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    if (!orgId) { setSettingsLoading(false); return; }
    setSettingsLoading(true);
    void Promise.all([
      supabase.from("artvideo_store_payment_providers")
        .select("provider_key,display_name,description,integration_ready").order("display_name"),
      supabase.from("artvideo_store_payment_settings")
        .select("provider_key,environment,enabled,mercado_pago_public_key")
        .eq("organization_id", orgId).maybeSingle(),
    ]).then(([providersResult, settingsResult]) => {
      if (!live) return;
      if (providersResult.error || settingsResult.error)
        throw providersResult.error || settingsResult.error;
      const loaded = (settingsResult.data as PaymentSettings | null) || emptySettings;
      setProviders((providersResult.data || []) as Gateway[]);
      setSettings(loaded);
      setSavedSettings(loaded);
    }).catch(error => {
      if (live) notifyAdmin(systemErrorMessage(error, "Não foi possível carregar os provedores."), "error");
    }).finally(() => { if (live) setSettingsLoading(false); });
    return () => { live = false; };
  }, [orgId]);

  const selectedProvider = useMemo(
    () => providers.find(provider => provider.provider_key === settings.provider_key),
    [providers, settings.provider_key],
  );
  const canEnable = Boolean(selectedProvider?.integration_ready
    && settings.provider_key !== "none" && settings.environment === "production");
  const modified = JSON.stringify(settings) !== JSON.stringify(savedSettings);

  const updateSettings = (patch: Partial<PaymentSettings>) => {
    if (!canUpdate || saving) return;
    setSettings(previous => ({ ...previous, ...patch }));
  };

  const saveSettings = async () => {
    if (!orgId || !canUpdate || saving || settingsLoading) return;
    const pending = { ...settings, enabled: canEnable && settings.enabled };
    if (pending.enabled && (!savedSettings.enabled ||
        pending.provider_key !== savedSettings.provider_key ||
        pending.environment !== savedSettings.environment) &&
        !window.confirm("Confirmar a ativação de cobranças reais com este provedor?")) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("artvideo_store_payment_settings")
        .upsert({ organization_id: orgId, ...pending }, { onConflict: "organization_id" });
      if (error) throw error;
      setSettings(pending);
      setSavedSettings(pending);
      notifyAdmin("Configurações de pagamento salvas.", "success");
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível salvar as configurações."), "error");
    } finally {
      setSaving(false);
    }
  };

  const invitationAction = async (action: "homologation_create" | "homologation_revoke") => {
    if (!canUpdate || loading) return;
    if (action === "homologation_create" && !window.confirm(
      "Gerar um link privado para UMA compra real de homologação? " +
      "O convite vale por 2 horas e o pagamento pode cobrar valores reais, " +
      "gerar tarifas e movimentar o estoque. O checkout público permanecerá desativado."
    )) return;

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("artvideo-store-payment-lab", {
        body: {
          action,
          ...(action === "homologation_revoke" && invitation
            ? { invitation_id: invitation.id }
            : {}),
        },
      });
      if (error) {
        const response = error.context;
        if (response instanceof Response) {
          const payload = await response.clone().json().catch(() => null);
          if (payload?.error) throw new Error(String(payload.error));
        }
        throw new Error("Não foi possível administrar o convite de homologação.");
      }
      if (data?.error) throw new Error(String(data.error));
      if (action === "homologation_create") {
        if (!data?.invitation?.id || !data.invitation.url || !data.invitation.expiresAt) {
          throw new Error("O servidor não retornou um link de homologação válido.");
        }
        setInvitation(data.invitation as HomologationInvitation);
      } else {
        setInvitation(null);
      }
      notifyAdmin(String(data?.message || "Convite atualizado."), "success");
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível administrar o convite."), "error");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!invitation) return;
    try {
      await navigator.clipboard.writeText(invitation.url);
      notifyAdmin("Link de homologação copiado.", "success");
    } catch {
      notifyAdmin("Não foi possível copiar o link. Selecione o endereço para copiá-lo.", "error");
    }
  };

  if (!activeOrganization?.is_artvideo_tenant ||
      !hasPermission("site.view") || !hasPermission("site_settings.view")) return null;
  if (settingsLoading) return <LoadingState text="Carregando pagamentos da loja..." />;

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Pagamentos" subtitle="Escolha o provedor e gerencie a homologação da loja." />

    <Section title="Provedor de pagamento" description="Selecione o serviço usado para receber as compras. Outros provedores poderão ser habilitados quando a integração estiver pronta.">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {providers.map(provider => {
          const selected = settings.provider_key === provider.provider_key;
          return <button key={provider.provider_key} type="button"
            aria-pressed={selected}
            disabled={!canUpdate || saving}
            onClick={() => updateSettings({ provider_key: provider.provider_key, enabled: false })}
            className={"flex min-w-0 flex-col gap-2 rounded-lg border p-4 text-left transition-colors disabled:opacity-60 " +
              (selected ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/50 hover:bg-muted/30")}>
            <span className="flex items-center gap-2 text-sm font-bold">
              <CreditCard size={17} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1">{provider.display_name}</span>
              {selected && <CheckCircle2 size={16} className="shrink-0 text-primary" />}
            </span>
            <span className="text-xs leading-5 text-muted-foreground">{provider.description}</span>
            {provider.provider_key !== "none" && <span className={"text-[11px] font-semibold " +
              (provider.integration_ready ? "text-emerald-600 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
              {provider.integration_ready ? "Integração disponível" : "Integração ainda não disponível"}
            </span>}
          </button>;
        })}
      </div>
    </Section>

    <Section title="Configuração do checkout" description="As credenciais secretas permanecem no Supabase e não são exibidas nesta página.">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block min-w-0 text-xs font-bold">
          Ambiente
          <AdminSelect value={settings.environment} ariaLabel="Ambiente de pagamento"
            options={[{ value: "sandbox", label: "Homologação / testes" }, { value: "production", label: "Produção" }]}
            onValueChange={value => updateSettings({ environment: value as PaymentSettings["environment"], enabled: false })}
            disabled={!canUpdate || saving} className="mt-2" />
        </label>
        <label className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border p-3">
          <span className="min-w-0">
            <span className="block text-xs font-bold">Aceitar pagamentos online</span>
            <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">
              {canEnable ? "Ativa ou desativa o checkout público." : "Indisponível para a seleção atual."}
            </span>
          </span>
          <input type="checkbox" checked={canEnable && settings.enabled}
            aria-label="Aceitar pagamentos online"
            disabled={!canUpdate || saving || !canEnable}
            onChange={event => updateSettings({ enabled: event.target.checked })}
            className="h-5 w-5 shrink-0 accent-blue-600" />
        </label>
      </div>
      {settings.provider_key === "mercado_pago" && <div className="mt-4 max-w-2xl">
        <label htmlFor="mp-public-key" className="mb-1.5 block text-xs font-bold">Public Key do Mercado Pago</label>
        <input id="mp-public-key" type="text" autoComplete="off"
          placeholder="APP_USR-..."
          value={settings.mercado_pago_public_key || ""}
          disabled={!canUpdate || saving}
          onChange={event => updateSettings({ mercado_pago_public_key: event.target.value.trim() })}
          className="h-11 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground" />
        <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <LockKeyhole size={15} className="mt-0.5 shrink-0 text-primary" />
          Para trocar a conta, atualize também no Supabase o Access Token, o ID do vendedor e o segredo do webhook da mesma aplicação.
        </p>
      </div>}
      <div className="mt-4 flex justify-end">
        <BtnPrimary onClick={() => void saveSettings()} loading={saving} loadingText="Salvando..."
          disabled={!modified || !canUpdate || saving}>Salvar configurações</BtnPrimary>
      </div>
    </Section>

    <Section title="Link de homologação" description="Acesso privado para testar o checkout completo sem liberar as vendas ao público.">
      <div className="space-y-4">
        <p className="text-xs leading-6 text-muted-foreground">
          Cada link permite iniciar um pedido real e expira em 2 horas.
          O pagamento pode gerar cobrança, tarifas e movimentação de estoque.
          O limite é de 3 convites por hora e 12 por dia. Use uma conta compradora
          diferente da conta vendedora.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <BtnPrimary onClick={() => void invitationAction("homologation_create")}
            disabled={!canUpdate || loading} loading={loading}
            loadingText="Gerando link...">
            <Link2 size={16} /> Gerar link de homologação
          </BtnPrimary>
          {invitation && <BtnSecondary onClick={() => void invitationAction("homologation_revoke")}
            disabled={!canUpdate || loading}>
            Revogar link
          </BtnSecondary>}
        </div>

        {invitation && <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <ShieldCheck size={17} className="text-primary" />
            Convite gerado · válido até {new Date(invitation.expiresAt).toLocaleString("pt-BR")}
          </div>
          <input type="text" readOnly value={invitation.url}
            aria-label="Link privado de homologação"
            onFocus={event => event.currentTarget.select()}
            className="h-11 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground" />
          <div className="flex flex-wrap items-center gap-2">
            <BtnSecondary onClick={() => void copyLink()}><Copy size={15} /> Copiar link</BtnSecondary>
            <a href={invitation.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold text-primary hover:bg-primary/5">
              <ExternalLink size={15} /> Abrir site de homologação
            </a>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Guarde o link: por segurança, seu endereço completo não será recuperado após recarregar a página.
          </p>
        </div>}
      </div>
    </Section>

    <AdminStickyToolbar>
      <BtnSecondary onClick={() => {
        if (modified && !window.confirm("Existem alterações não salvas. Deseja voltar?")) return;
        onBack();
      }}>Voltar</BtnSecondary>
    </AdminStickyToolbar>
  </div>;
}
