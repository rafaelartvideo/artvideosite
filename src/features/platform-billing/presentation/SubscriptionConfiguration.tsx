import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, PackagePlus, Settings2, SlidersHorizontal } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { formatCurrency } from "@/shared/domain/formatters";
import {
  AdminButton,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminDialog,
} from "@/shared/ui/admin/AdminLayout";
import { FCurrencyInput, FInput, FSelect, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, StatusBadge, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { loadOrganizationPlanUsage } from "@/features/subscriptions/infrastructure/subscription-usage.repository";
import type { PlatformBillingPlan, PlatformSubscription, UnionPlatformFinanceData } from "../infrastructure/platform-billing.repository";
import {
  loadUnionSubscriptionConfiguration,
  saveUnionBillingAddon,
  saveUnionPlanConfiguration,
  saveUnionSubscriptionConfiguration,
  type BillingAddon,
  type BillingLimitDefinition,
} from "../infrastructure/subscription-configuration.repository";

type ConfigSection = "plans" | "addons" | "companies";

type SubscriptionConfigurationProps = {
  financeData: UnionPlatformFinanceData;
  canManage: boolean;
  onChanged: () => Promise<void>;
};

const billingTypeOptions = [
  { value: "fixed", label: "Valor fixo" },
  { value: "per_unit", label: "Por unidade" },
  { value: "usage", label: "Por consumo" },
];

function displayLimitValue(definition: BillingLimitDefinition, value: number) {
  if (definition.unit === "bytes") return value / (1024 ** 3);
  return value;
}

function persistLimitValue(definition: BillingLimitDefinition, value: number) {
  if (definition.unit === "bytes") return Math.round(value * (1024 ** 3));
  return Math.max(0, value);
}

function limitSuffix(definition: BillingLimitDefinition) {
  if (definition.unit === "bytes") return "GB";
  if (definition.unit === "days") return "dias";
  if (definition.unit === "credits") return "créditos";
  return "";
}

function PlanConfigurationDialog({
  plan,
  open,
  canManage,
  config,
  onClose,
  onSaved,
}: {
  plan: PlatformBillingPlan | null;
  open: boolean;
  canManage: boolean;
  config: Awaited<ReturnType<typeof loadUnionSubscriptionConfiguration>>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const initialLimits = useMemo(() => {
    if (!plan) return {};
    const result: Record<string, string> = {};
    for (const definition of config.limit_definitions) {
      const row = config.plan_limits.find(item => item.plan_id === plan.id && item.key === definition.key);
      result[definition.key] = String(displayLimitValue(definition, row?.value || 0));
    }
    return result;
  }, [config.limit_definitions, config.plan_limits, plan]);

  const initialFeatures = useMemo(() => {
    if (!plan) return {};
    const result: Record<string, boolean> = {};
    for (const definition of config.feature_definitions) {
      result[definition.key] = config.plan_features.some(item => item.plan_id === plan.id && item.key === definition.key && item.enabled);
    }
    return result;
  }, [config.feature_definitions, config.plan_features, plan]);

  const initialModules = useMemo(() => new Set(
    plan ? config.plan_modules.filter(item => item.plan_id === plan.id && item.included).map(item => item.module_key) : [],
  ), [config.plan_modules, plan]);

  const [limits, setLimits] = useState<Record<string, string>>(initialLimits);
  const [features, setFeatures] = useState<Record<string, boolean>>(initialFeatures);
  const [modules, setModules] = useState<Set<string>>(initialModules);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setLimits(initialLimits);
    setFeatures(initialFeatures);
    setModules(new Set(initialModules));
  };

  const save = async () => {
    if (!plan || !canManage) return;
    setSaving(true);
    try {
      const normalizedLimits: Record<string, number> = {};
      for (const definition of config.limit_definitions) {
        normalizedLimits[definition.key] = persistLimitValue(definition, Number(limits[definition.key] || 0));
      }
      await saveUnionPlanConfiguration({
        planId: plan.id,
        limits: normalizedLimits,
        features,
        modules: Array.from(modules),
      });
      await onSaved();
      notifyAdmin("Configuração do plano atualizada.");
      onClose();
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível salvar a configuração do plano."), "error");
    } finally {
      setSaving(false);
    }
  };

  return <AdminDialog
    open={open}
    onClose={() => { if (!saving) { reset(); onClose(); } }}
    title={plan ? "Configurar " + plan.name : "Configurar plano"}
    description="Defina limites, recursos comerciais e módulos incluídos. Nesta etapa, estes valores ainda não bloqueiam o uso."
    className="max-w-5xl"
    footer={<div className="flex justify-end gap-2">
      <AdminButton variant="secondary" disabled={saving} onClick={() => { reset(); onClose(); }}>Cancelar</AdminButton>
      <AdminButton loading={saving} disabled={!canManage || !plan} onClick={() => void save()}>Salvar configuração</AdminButton>
    </div>}
  >
    <div className="space-y-6">
      <section>
        <h4 className="text-xs font-black uppercase tracking-[0.11em] text-foreground">Limites do plano</h4>
        <p className="mt-1 text-xs text-muted-foreground">São referências contratuais por enquanto; nenhum limite abaixo bloqueia operações.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {config.limit_definitions.map(definition => <label key={definition.key} className="block border border-border bg-muted/20 p-3">
            <span className="block text-xs font-bold text-foreground">{definition.label}</span>
            {definition.description && <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{definition.description}</span>}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={0}
                step={definition.unit === "bytes" ? "0.1" : "1"}
                value={limits[definition.key] ?? "0"}
                disabled={!canManage}
                onChange={event => setLimits(current => ({ ...current, [definition.key]: event.target.value }))}
                className="h-10 min-w-0 flex-1 border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none focus:border-primary"
              />
              {limitSuffix(definition) && <span className="shrink-0 text-xs font-bold text-muted-foreground">{limitSuffix(definition)}</span>}
            </div>
          </label>)}
        </div>
      </section>

      <section>
        <h4 className="text-xs font-black uppercase tracking-[0.11em] text-foreground">Recursos do plano</h4>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {config.feature_definitions.map(feature => <label key={feature.key} className="flex cursor-pointer items-start gap-3 border border-border p-3">
            <input
              type="checkbox"
              checked={Boolean(features[feature.key])}
              disabled={!canManage}
              onChange={event => setFeatures(current => ({ ...current, [feature.key]: event.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              <strong className="block text-xs text-foreground">{feature.label}</strong>
              {feature.description && <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{feature.description}</span>}
            </span>
          </label>)}
        </div>
      </section>

      <section>
        <h4 className="text-xs font-black uppercase tracking-[0.11em] text-foreground">Módulos incluídos</h4>
        <p className="mt-1 text-xs text-muted-foreground">Configuração comercial apenas. A liberação técnica atual dos módulos continua independente.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {config.system_modules.map(module => <label key={module.key} className="flex cursor-pointer items-start gap-3 border border-border p-3">
            <input
              type="checkbox"
              checked={modules.has(module.key)}
              disabled={!canManage}
              onChange={event => setModules(current => {
                const next = new Set(current);
                if (event.target.checked) next.add(module.key);
                else next.delete(module.key);
                return next;
              })}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              <strong className="block text-xs text-foreground">{module.name}</strong>
              <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{module.category}</span>
            </span>
          </label>)}
        </div>
      </section>
    </div>
  </AdminDialog>;
}

export function SubscriptionConfiguration({ financeData, canManage, onChanged }: SubscriptionConfigurationProps) {
  const [section, setSection] = useState<ConfigSection>("plans");
  const [selectedPlan, setSelectedPlan] = useState<PlatformBillingPlan | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [addonOpen, setAddonOpen] = useState(false);
  const [editingAddon, setEditingAddon] = useState<BillingAddon | null>(null);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [selectedSubscription, setSelectedSubscription] = useState<PlatformSubscription | null>(null);
  const [saving, setSaving] = useState(false);

  const [addonCode, setAddonCode] = useState("");
  const [addonName, setAddonName] = useState("");
  const [addonDescription, setAddonDescription] = useState("");
  const [addonAmount, setAddonAmount] = useState("0");
  const [addonBillingType, setAddonBillingType] = useState<BillingAddon["billing_type"]>("fixed");
  const [addonModuleKey, setAddonModuleKey] = useState("");
  const [addonActive, setAddonActive] = useState(true);
  const [addonLimits, setAddonLimits] = useState<Record<string, string>>({});
  const [addonFeatures, setAddonFeatures] = useState<Record<string, boolean>>({});

  const [companyAddons, setCompanyAddons] = useState<Record<string, { selected: boolean; quantity: string; amount: string }>>({});
  const [companyLimitOverrides, setCompanyLimitOverrides] = useState<Record<string, { mode: "default" | "replace" | "add"; value: string }>>({});
  const [companyFeatureOverrides, setCompanyFeatureOverrides] = useState<Record<string, "default" | "enabled" | "disabled">>({});

  const query = useQuery({
    queryKey: ["union-subscription-configuration"],
    queryFn: loadUnionSubscriptionConfiguration,
  });
  const config = query.data;

  const usageQuery = useQuery({
    queryKey: ["organization-plan-usage-admin", selectedSubscription?.organization_id],
    queryFn: () => loadOrganizationPlanUsage(selectedSubscription?.organization_id || ""),
    enabled: companyOpen && Boolean(selectedSubscription?.organization_id),
  });

  const refresh = async () => {
    await query.refetch();
    if (selectedSubscription?.organization_id) await usageQuery.refetch();
    await onChanged();
  };

  const openPlan = (plan: PlatformBillingPlan) => {
    setSelectedPlan(plan);
    setPlanOpen(true);
  };

  const openNewAddon = () => {
    setEditingAddon(null);
    setAddonCode("");
    setAddonName("");
    setAddonDescription("");
    setAddonAmount("0");
    setAddonBillingType("fixed");
    setAddonModuleKey("");
    setAddonActive(true);
    setAddonLimits({});
    setAddonFeatures({});
    setAddonOpen(true);
  };

  const openEditAddon = (addon: BillingAddon) => {
    setEditingAddon(addon);
    setAddonCode(addon.code);
    setAddonName(addon.name);
    setAddonDescription(addon.description || "");
    setAddonAmount(String(addon.amount));
    setAddonBillingType(addon.billing_type);
    setAddonModuleKey(addon.module_key || "");
    setAddonActive(addon.is_active);
    const nextLimits: Record<string, string> = {};
    for (const definition of config?.limit_definitions || []) {
      const rawValue = addon.limit_deltas[definition.key] || 0;
      nextLimits[definition.key] = String(displayLimitValue(definition, rawValue));
    }
    setAddonLimits(nextLimits);
    setAddonFeatures(addon.feature_grants || {});
    setAddonOpen(true);
  };

  const saveAddon = async () => {
    if (!config || !canManage) return;
    setSaving(true);
    try {
      const limitDeltas: Record<string, number> = {};
      for (const definition of config.limit_definitions) {
        const raw = Number(addonLimits[definition.key] || 0);
        if (raw > 0) limitDeltas[definition.key] = persistLimitValue(definition, raw);
      }
      const featureGrants = Object.fromEntries(
        config.feature_definitions
          .filter(feature => addonFeatures[feature.key])
          .map(feature => [feature.key, true]),
      );
      await saveUnionBillingAddon({
        id: editingAddon?.id,
        code: addonCode.trim(),
        name: addonName.trim(),
        description: addonDescription.trim() || null,
        amount: Number(addonAmount || 0),
        billingType: addonBillingType,
        moduleKey: addonModuleKey || null,
        limitDeltas,
        featureGrants,
        isActive: addonActive,
      });
      setAddonOpen(false);
      await refresh();
      notifyAdmin(editingAddon ? "Add-on atualizado." : "Add-on criado.");
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível salvar o add-on."), "error");
    } finally {
      setSaving(false);
    }
  };

  const openCompany = (subscription: PlatformSubscription) => {
    if (!config) return;
    setSelectedSubscription(subscription);
    const addons: Record<string, { selected: boolean; quantity: string; amount: string }> = {};
    for (const addon of config.addons) {
      const current = config.subscription_addons.find(item =>
        item.subscription_id === subscription.id && item.addon_id === addon.id && item.status === "active"
      );
      addons[addon.id] = {
        selected: Boolean(current),
        quantity: String(current?.quantity || 1),
        amount: String(current?.amount ?? addon.amount),
      };
    }
    setCompanyAddons(addons);

    const limits: Record<string, { mode: "default" | "replace" | "add"; value: string }> = {};
    for (const definition of config.limit_definitions) {
      const current = config.limit_overrides.find(item => item.subscription_id === subscription.id && item.key === definition.key);
      limits[definition.key] = current
        ? { mode: current.mode, value: String(displayLimitValue(definition, current.value)) }
        : { mode: "default", value: "0" };
    }
    setCompanyLimitOverrides(limits);

    const features: Record<string, "default" | "enabled" | "disabled"> = {};
    for (const definition of config.feature_definitions) {
      const current = config.feature_overrides.find(item => item.subscription_id === subscription.id && item.key === definition.key);
      features[definition.key] = current ? (current.enabled ? "enabled" : "disabled") : "default";
    }
    setCompanyFeatureOverrides(features);
    setCompanyOpen(true);
  };

  const saveCompany = async () => {
    if (!selectedSubscription || !config || !canManage) return;
    setSaving(true);
    try {
      const addons = config.addons
        .filter(addon => companyAddons[addon.id]?.selected)
        .map(addon => ({
          addon_id: addon.id,
          quantity: Math.max(1, Number(companyAddons[addon.id]?.quantity || 1)),
          amount: Math.max(0, Number(companyAddons[addon.id]?.amount ?? addon.amount)),
        }));

      const limitOverrides: Record<string, { mode: "replace" | "add"; value: number }> = {};
      for (const definition of config.limit_definitions) {
        const current = companyLimitOverrides[definition.key];
        if (!current || current.mode === "default") continue;
        limitOverrides[definition.key] = {
          mode: current.mode,
          value: persistLimitValue(definition, Number(current.value || 0)),
        };
      }

      const featureOverrides: Record<string, { enabled: boolean }> = {};
      for (const definition of config.feature_definitions) {
        const current = companyFeatureOverrides[definition.key];
        if (!current || current === "default") continue;
        featureOverrides[definition.key] = { enabled: current === "enabled" };
      }

      await saveUnionSubscriptionConfiguration({
        subscriptionId: selectedSubscription.id,
        addons,
        limitOverrides,
        featureOverrides,
      });
      setCompanyOpen(false);
      await refresh();
      notifyAdmin("Configuração da empresa atualizada.");
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível salvar a configuração da empresa."), "error");
    } finally {
      setSaving(false);
    }
  };

  if (query.isPending) return <LoadingState text="Carregando configuração das assinaturas..." />;
  if (query.isError || !config) {
    return <AdminCard><AdminCardContent className="p-6">
      <p className="font-bold text-foreground">Não foi possível carregar a configuração.</p>
      <p className="mt-1 text-sm text-muted-foreground">{systemErrorMessage(query.error)}</p>
    </AdminCardContent></AdminCard>;
  }

  const extraModuleKeys = config.addons.map(addon => addon.module_key).filter((key): key is string => Boolean(key));
  const moduleOptions = Array.from(new Set(extraModuleKeys)).filter(key => !config.system_modules.some(module => module.key === key));
  const activeAddons = config.addons.filter(addon => addon.is_active);

  return <div className="space-y-4">
    <AdminCard square>
      <AdminCardContent className="flex items-start gap-3 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><Settings2 size={17} /></span>
        <div>
          <p className="text-sm font-black text-foreground">Configuração comercial sem bloqueios</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Tudo abaixo define o contrato e prepara a cobrança. Nenhum limite, recurso ou módulo configurado aqui impede operações no CRM nesta fase.
          </p>
        </div>
      </AdminCardContent>
    </AdminCard>

    <div className="border-b border-border">
      <div className="flex gap-5 overflow-x-auto">
        {[
          { id: "plans" as const, label: "Planos e limites" },
          { id: "addons" as const, label: "Add-ons" },
          { id: "companies" as const, label: "Empresas" },
        ].map(item => <button
          key={item.id}
          type="button"
          onClick={() => setSection(item.id)}
          className={"shrink-0 border-b-2 px-1 pb-3 pt-1 text-xs font-bold transition-colors " + (section === item.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}
        >{item.label}</button>)}
      </div>
    </div>

    {section === "plans" && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {financeData.plans.map(plan => {
        const limitsCount = config.plan_limits.filter(item => item.plan_id === plan.id).length;
        const featuresCount = config.plan_features.filter(item => item.plan_id === plan.id && item.enabled).length;
        const modulesCount = config.plan_modules.filter(item => item.plan_id === plan.id && item.included).length;
        return <AdminCard key={plan.id} square>
          <AdminCardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-black text-foreground">{plan.name}</h3>
                <p className="mt-1 text-sm font-bold text-primary">{formatCurrency(plan.amount)}</p>
              </div>
              <StatusBadge status={plan.is_active ? "Ativo" : "Inativo"} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="border border-border p-2"><strong className="block text-base text-foreground">{limitsCount}</strong><span className="text-[10px] text-muted-foreground">limites</span></div>
              <div className="border border-border p-2"><strong className="block text-base text-foreground">{featuresCount}</strong><span className="text-[10px] text-muted-foreground">recursos</span></div>
              <div className="border border-border p-2"><strong className="block text-base text-foreground">{modulesCount}</strong><span className="text-[10px] text-muted-foreground">módulos</span></div>
            </div>
            <div className="mt-4 flex justify-end">
              <AdminButton size="sm" variant="secondary" onClick={() => openPlan(plan)}><SlidersHorizontal size={14} /> Configurar</AdminButton>
            </div>
          </AdminCardContent>
        </AdminCard>;
      })}
    </div>}

    {section === "addons" && <AdminCard square>
      <AdminCardHeader>
        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.11em] text-foreground">Catálogo de add-ons</h3>
          <p className="mt-1 text-xs text-muted-foreground">Módulos, armazenamento e capacidades adicionais que podem ser contratados por empresa.</p>
        </div>
        {canManage && <AdminButton size="sm" onClick={openNewAddon}><PackagePlus size={14} /> Novo add-on</AdminButton>}
      </AdminCardHeader>
      {config.addons.length ? <div className="overflow-x-auto">
        <table className="min-w-[900px]">
          <thead><tr><th className="text-left">Add-on</th><th className="text-left">Código</th><th className="text-left">Cobrança</th><th className="text-left">Valor</th><th className="text-left">Situação</th><th className="text-right">Ações</th></tr></thead>
          <tbody>{config.addons.map(addon => <tr key={addon.id}>
            <td><strong className="block text-foreground">{addon.name}</strong>{addon.description && <span className="mt-0.5 block max-w-[360px] truncate text-xs text-muted-foreground">{addon.description}</span>}</td>
            <td className="font-mono text-xs text-muted-foreground">{addon.code}</td>
            <td className="text-sm text-muted-foreground">{billingTypeOptions.find(item => item.value === addon.billing_type)?.label || addon.billing_type}</td>
            <td className="font-bold text-foreground">{formatCurrency(addon.amount)}</td>
            <td><StatusBadge status={addon.is_active ? "Ativo" : "Inativo"} /></td>
            <td><div className="flex justify-end">{canManage && <AdminButton size="sm" variant="secondary" onClick={() => openEditAddon(addon)}>Editar</AdminButton>}</div></td>
          </tr>)}</tbody>
        </table>
      </div> : <AdminCardContent><p className="text-sm text-muted-foreground">Nenhum add-on cadastrado.</p></AdminCardContent>}
    </AdminCard>}

    {section === "companies" && <AdminCard square>
      <AdminCardHeader>
        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.11em] text-foreground">Configuração por empresa</h3>
          <p className="mt-1 text-xs text-muted-foreground">Adicione extras e exceções sem alterar o plano-base.</p>
        </div>
      </AdminCardHeader>
      {financeData.subscriptions.length ? <div className="overflow-x-auto">
        <table className="min-w-[920px]">
          <thead><tr><th className="text-left">Empresa</th><th className="text-left">Plano</th><th className="text-left">Add-ons ativos</th><th className="text-left">Exceções</th><th className="text-right">Ações</th></tr></thead>
          <tbody>{financeData.subscriptions.map(subscription => {
            const addonsCount = config.subscription_addons.filter(item => item.subscription_id === subscription.id && item.status === "active").length;
            const overridesCount = config.limit_overrides.filter(item => item.subscription_id === subscription.id).length
              + config.feature_overrides.filter(item => item.subscription_id === subscription.id).length;
            return <tr key={subscription.id}>
              <td className="font-bold text-foreground">{subscription.organization_name}</td>
              <td className="text-sm text-muted-foreground">{subscription.plan_name}</td>
              <td className="text-sm text-muted-foreground">{addonsCount}</td>
              <td className="text-sm text-muted-foreground">{overridesCount}</td>
              <td><div className="flex justify-end"><AdminButton size="sm" variant="secondary" onClick={() => openCompany(subscription)}><Building2 size={14} /> Configurar</AdminButton></div></td>
            </tr>;
          })}</tbody>
        </table>
      </div> : <AdminCardContent><p className="text-sm text-muted-foreground">Nenhuma assinatura cadastrada.</p></AdminCardContent>}
    </AdminCard>}

    {selectedPlan && <PlanConfigurationDialog
      key={selectedPlan.id + String(planOpen)}
      plan={selectedPlan}
      open={planOpen}
      canManage={canManage}
      config={config}
      onClose={() => setPlanOpen(false)}
      onSaved={refresh}
    />}

    <AdminDialog
      open={addonOpen}
      onClose={() => !saving && setAddonOpen(false)}
      title={editingAddon ? "Editar add-on" : "Novo add-on"}
      description="Configure o preço e o que este adicional acrescenta ao contrato."
      className="max-w-4xl"
      footer={<div className="flex justify-end gap-2">
        <AdminButton variant="secondary" disabled={saving} onClick={() => setAddonOpen(false)}>Cancelar</AdminButton>
        <AdminButton loading={saving} disabled={!canManage || !addonCode.trim() || !addonName.trim()} onClick={() => void saveAddon()}>Salvar add-on</AdminButton>
      </div>}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FInput label="Código" value={addonCode} onChange={(event: any) => setAddonCode(String(event.target.value).toLowerCase().replace(/[^a-z0-9_]/g, "_"))} placeholder="ex.: storage_10gb" />
          <FInput label="Nome" value={addonName} onChange={(event: any) => setAddonName(event.target.value)} />
          <FCurrencyInput label="Valor" value={addonAmount} onChange={(event: any) => setAddonAmount(event.target.value)} />
          <FSelect label="Tipo de cobrança" value={addonBillingType} onChange={(event: any) => setAddonBillingType(event.target.value)} options={billingTypeOptions} />
          <FSelect
            label="Módulo liberado"
            value={addonModuleKey}
            onChange={(event: any) => setAddonModuleKey(event.target.value)}
            options={[
              { value: "", label: "Nenhum módulo específico" },
              ...config.system_modules.map(module => ({ value: module.key, label: module.name })),
              ...moduleOptions.map(key => ({ value: key, label: key })),
              ...["queue", "pbx", "marketplace", "ai"].filter(key => !config.system_modules.some(module => module.key === key) && !moduleOptions.includes(key)).map(key => ({ value: key, label: key })),
            ]}
          />
          <div className="sm:pt-6"><FToggle label="Add-on ativo" description="Inativos permanecem preservados nas assinaturas antigas." checked={addonActive} onChange={setAddonActive} /></div>
        </div>
        <FTextarea label="Descrição" value={addonDescription} onChange={(event: any) => setAddonDescription(event.target.value)} />

        <section>
          <h4 className="text-xs font-black uppercase tracking-[0.11em] text-foreground">Limites adicionais</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {config.limit_definitions.map(definition => <label key={definition.key} className="block border border-border p-3">
              <span className="block text-xs font-bold text-foreground">{definition.label}</span>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={definition.unit === "bytes" ? "0.1" : "1"}
                  value={addonLimits[definition.key] ?? "0"}
                  onChange={event => setAddonLimits(current => ({ ...current, [definition.key]: event.target.value }))}
                  className="h-10 min-w-0 flex-1 border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                />
                {limitSuffix(definition) && <span className="text-xs font-bold text-muted-foreground">{limitSuffix(definition)}</span>}
              </div>
            </label>)}
          </div>
        </section>

        <section>
          <h4 className="text-xs font-black uppercase tracking-[0.11em] text-foreground">Recursos concedidos</h4>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {config.feature_definitions.map(feature => <label key={feature.key} className="flex items-start gap-3 border border-border p-3">
              <input type="checkbox" checked={Boolean(addonFeatures[feature.key])} onChange={event => setAddonFeatures(current => ({ ...current, [feature.key]: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-primary" />
              <span><strong className="block text-xs text-foreground">{feature.label}</strong>{feature.description && <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{feature.description}</span>}</span>
            </label>)}
          </div>
        </section>
      </div>
    </AdminDialog>

    <AdminDialog
      open={companyOpen}
      onClose={() => !saving && setCompanyOpen(false)}
      title={selectedSubscription ? "Configurar " + selectedSubscription.organization_name : "Configurar empresa"}
      description={selectedSubscription ? selectedSubscription.plan_name + " · add-ons e exceções comerciais" : undefined}
      className="max-w-5xl"
      footer={<div className="flex justify-end gap-2">
        <AdminButton variant="secondary" disabled={saving} onClick={() => setCompanyOpen(false)}>Cancelar</AdminButton>
        <AdminButton loading={saving} disabled={!canManage || !selectedSubscription} onClick={() => void saveCompany()}>Salvar configuração</AdminButton>
      </div>}
    >
      <div className="space-y-6">
        {usageQuery.data && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Usuários atuais", usageQuery.data.usage.users || 0, usageQuery.data.limits.users || 0],
            ["PDVs", usageQuery.data.usage.pdv_terminals || 0, usageQuery.data.limits.pdv_terminals || 0],
            ["Dispositivos", usageQuery.data.usage.field_devices || 0, usageQuery.data.limits.field_devices || 0],
            ["Ramais", usageQuery.data.usage.pbx_extensions || 0, usageQuery.data.limits.pbx_extensions || 0],
          ].map(([label, used, limit]) => <div key={String(label)} className="border border-border p-3">
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-base font-black text-foreground">{Number(used).toLocaleString("pt-BR")} <span className="text-xs font-semibold text-muted-foreground">/ {Number(limit).toLocaleString("pt-BR")}</span></p>
          </div>)}
        </div>}

        <section>
          <h4 className="text-xs font-black uppercase tracking-[0.11em] text-foreground">Add-ons contratados</h4>
          <div className="mt-3 space-y-2">
            {activeAddons.map(addon => {
              const state = companyAddons[addon.id] || { selected: false, quantity: "1", amount: String(addon.amount) };
              return <div key={addon.id} className="grid gap-3 border border-border p-3 sm:grid-cols-[minmax(0,1fr)_100px_140px] sm:items-end">
                <label className="flex items-start gap-3">
                  <input type="checkbox" checked={state.selected} onChange={event => setCompanyAddons(current => ({ ...current, [addon.id]: { ...state, selected: event.target.checked } }))} className="mt-0.5 h-4 w-4 accent-primary" />
                  <span><strong className="block text-sm text-foreground">{addon.name}</strong><span className="mt-0.5 block text-xs text-muted-foreground">{addon.description || addon.code}</span></span>
                </label>
                <label><span className="mb-1 block text-[10px] font-black uppercase text-muted-foreground">Quantidade</span><input type="number" min={1} disabled={!state.selected} value={state.quantity} onChange={event => setCompanyAddons(current => ({ ...current, [addon.id]: { ...state, quantity: event.target.value } }))} className="h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
                <label><span className="mb-1 block text-[10px] font-black uppercase text-muted-foreground">Valor unitário</span><input type="number" min={0} step="0.01" disabled={!state.selected} value={state.amount} onChange={event => setCompanyAddons(current => ({ ...current, [addon.id]: { ...state, amount: event.target.value } }))} className="h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary" /></label>
              </div>;
            })}
          </div>
        </section>

        <section>
          <h4 className="text-xs font-black uppercase tracking-[0.11em] text-foreground">Exceções de limite</h4>
          <p className="mt-1 text-xs text-muted-foreground">Use apenas quando uma empresa tiver uma condição diferente do plano ou dos add-ons.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {config.limit_definitions.map(definition => {
              const current = companyLimitOverrides[definition.key] || { mode: "default" as const, value: "0" };
              return <div key={definition.key} className="border border-border p-3">
                <p className="text-xs font-bold text-foreground">{definition.label}</p>
                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_120px] gap-2">
                  <select value={current.mode} onChange={event => setCompanyLimitOverrides(state => ({ ...state, [definition.key]: { ...current, mode: event.target.value as any } }))} className="h-10 border border-border bg-background px-2 text-xs outline-none focus:border-primary">
                    <option value="default">Usar plano/add-ons</option>
                    <option value="add">Adicionar</option>
                    <option value="replace">Substituir total</option>
                  </select>
                  <input type="number" min={0} step={definition.unit === "bytes" ? "0.1" : "1"} disabled={current.mode === "default"} value={current.value} onChange={event => setCompanyLimitOverrides(state => ({ ...state, [definition.key]: { ...current, value: event.target.value } }))} className="h-10 border border-border bg-background px-2 text-sm outline-none focus:border-primary" />
                </div>
                {limitSuffix(definition) && <p className="mt-1 text-[10px] text-muted-foreground">Valor em {limitSuffix(definition)}.</p>}
              </div>;
            })}
          </div>
        </section>

        <section>
          <h4 className="text-xs font-black uppercase tracking-[0.11em] text-foreground">Exceções de recurso</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {config.feature_definitions.map(feature => <div key={feature.key} className="border border-border p-3">
              <p className="text-xs font-bold text-foreground">{feature.label}</p>
              <select value={companyFeatureOverrides[feature.key] || "default"} onChange={event => setCompanyFeatureOverrides(current => ({ ...current, [feature.key]: event.target.value as any }))} className="mt-2 h-10 w-full border border-border bg-background px-2 text-xs outline-none focus:border-primary">
                <option value="default">Usar configuração do plano/add-ons</option>
                <option value="enabled">Forçar liberado</option>
                <option value="disabled">Forçar bloqueado</option>
              </select>
            </div>)}
          </div>
        </section>
      </div>
    </AdminDialog>
  </div>;
}
