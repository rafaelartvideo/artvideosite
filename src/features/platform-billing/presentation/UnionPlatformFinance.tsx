import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Banknote, CalendarDays, CheckCircle2, CreditCard, Plus, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { formatCurrency, formatDateOnly } from "@/shared/domain/formatters";
import {
  AdminButton,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminDialog,
  PageHeader,
} from "@/shared/ui/admin/AdminLayout";
import { FCurrencyInput, FInput, FSelect, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, StatusBadge, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { SubscriptionConfiguration } from "./SubscriptionConfiguration";
import {
  generatePlatformCharge,
  loadUnionPlatformFinance,
  savePlatformBillingPlan,
  savePlatformSubscription,
  settlePlatformCharge,
  type PlatformBillingPlan,
  type PlatformCharge,
  type PlatformSubscription,
} from "../infrastructure/platform-billing.repository";

type SectionId = "subscriptions" | "charges" | "plans" | "configuration";

const subscriptionStatusOptions = [
  { value: "trial", label: "Teste" },
  { value: "active", label: "Ativa" },
  { value: "past_due", label: "Em atraso" },
  { value: "suspended", label: "Suspensa" },
  { value: "cancelled", label: "Cancelada" },
];

function subscriptionStatusLabel(value: PlatformSubscription["status"]) {
  return subscriptionStatusOptions.find(option => option.value === value)?.label || value;
}

function chargeStatusLabel(value: PlatformCharge["status"]) {
  if (value === "paid") return "Pago";
  if (value === "overdue") return "Em atraso";
  if (value === "cancelled") return "Cancelado";
  return "Pendente";
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function UnionPlatformFinance() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const canManage = hasPermission("platform.billing.manage");
  const [section, setSection] = useState<SectionId>("subscriptions");
  const [planOpen, setPlanOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlatformBillingPlan | null>(null);
  const [editingSubscription, setEditingSubscription] = useState<PlatformSubscription | null>(null);
  const [chargeSubscription, setChargeSubscription] = useState<PlatformSubscription | null>(null);
  const [paymentCharge, setPaymentCharge] = useState<PlatformCharge | null>(null);
  const [saving, setSaving] = useState(false);

  const [planName, setPlanName] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [planAmount, setPlanAmount] = useState("0");
  const [planInterval, setPlanInterval] = useState("1");
  const [planActive, setPlanActive] = useState(true);

  const [subscriptionCompanyId, setSubscriptionCompanyId] = useState("");
  const [subscriptionPlanId, setSubscriptionPlanId] = useState("");
  const [subscriptionStatus, setSubscriptionStatus] = useState<PlatformSubscription["status"]>("active");
  const [subscriptionStartDate, setSubscriptionStartDate] = useState(todayDate());
  const [subscriptionDueDate, setSubscriptionDueDate] = useState("");
  const [subscriptionAmount, setSubscriptionAmount] = useState("0");
  const [subscriptionDiscount, setSubscriptionDiscount] = useState("0");
  const [subscriptionBillingDay, setSubscriptionBillingDay] = useState("");
  const [subscriptionNotes, setSubscriptionNotes] = useState("");

  const [chargeDueDate, setChargeDueDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const query = useQuery({
    queryKey: ["union-platform-finance"],
    queryFn: loadUnionPlatformFinance,
  });

  const data = query.data;
  const activePlans = useMemo(() => (data?.plans || []).filter(plan => plan.is_active), [data?.plans]);

  const refresh = async () => {
    await Promise.all([
      query.refetch(),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.dashboards() }),
    ]);
  };

  const openNewPlan = () => {
    setEditingPlan(null);
    setPlanName("");
    setPlanDescription("");
    setPlanAmount("0");
    setPlanInterval("1");
    setPlanActive(true);
    setPlanOpen(true);
  };

  const openEditPlan = (plan: PlatformBillingPlan) => {
    setEditingPlan(plan);
    setPlanName(plan.name);
    setPlanDescription(plan.description || "");
    setPlanAmount(String(plan.amount));
    setPlanInterval(String(plan.interval_months));
    setPlanActive(plan.is_active);
    setPlanOpen(true);
  };

  const submitPlan = async () => {
    setSaving(true);
    try {
      await savePlatformBillingPlan({
        id: editingPlan?.id,
        name: planName,
        description: planDescription,
        amount: Number(planAmount || 0),
        intervalMonths: Number(planInterval || 1),
        isActive: planActive,
      });
      setPlanOpen(false);
      await refresh();
      notifyAdmin(editingPlan ? "Plano atualizado." : "Plano criado.");
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível salvar o plano."), "error");
    } finally {
      setSaving(false);
    }
  };

  const openNewSubscription = () => {
    const firstPlan = activePlans[0];
    setEditingSubscription(null);
    setSubscriptionCompanyId("");
    setSubscriptionPlanId(firstPlan?.id || "");
    setSubscriptionStatus("active");
    setSubscriptionStartDate(todayDate());
    setSubscriptionDueDate("");
    setSubscriptionAmount(firstPlan ? String(firstPlan.amount) : "0");
    setSubscriptionDiscount("0");
    setSubscriptionBillingDay("");
    setSubscriptionNotes("");
    setSubscriptionOpen(true);
  };

  const openEditSubscription = (subscription: PlatformSubscription) => {
    setEditingSubscription(subscription);
    setSubscriptionCompanyId(subscription.organization_id);
    setSubscriptionPlanId(subscription.plan_id);
    setSubscriptionStatus(subscription.status);
    setSubscriptionStartDate(subscription.start_date || todayDate());
    setSubscriptionDueDate(subscription.next_due_date || "");
    setSubscriptionAmount(String(subscription.amount));
    setSubscriptionDiscount(String(subscription.discount_amount));
    setSubscriptionBillingDay(subscription.billing_day ? String(subscription.billing_day) : "");
    setSubscriptionNotes(subscription.notes || "");
    setSubscriptionOpen(true);
  };

  const changeSubscriptionPlan = (planId: string) => {
    setSubscriptionPlanId(planId);
    if (!editingSubscription) {
      const plan = data?.plans.find(item => item.id === planId);
      if (plan) setSubscriptionAmount(String(plan.amount));
    }
  };

  const submitSubscription = async () => {
    setSaving(true);
    try {
      await savePlatformSubscription({
        id: editingSubscription?.id,
        organizationId: subscriptionCompanyId,
        planId: subscriptionPlanId,
        status: subscriptionStatus,
        startDate: subscriptionStartDate,
        nextDueDate: subscriptionDueDate || null,
        amount: Number(subscriptionAmount || 0),
        discountAmount: Number(subscriptionDiscount || 0),
        billingDay: subscriptionBillingDay ? Number(subscriptionBillingDay) : null,
        notes: subscriptionNotes,
      });
      setSubscriptionOpen(false);
      await refresh();
      notifyAdmin(editingSubscription ? "Assinatura atualizada." : "Assinatura criada.");
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível salvar a assinatura."), "error");
    } finally {
      setSaving(false);
    }
  };

  const openCharge = (subscription: PlatformSubscription) => {
    setChargeSubscription(subscription);
    setChargeDueDate(subscription.next_due_date || "");
    setChargeOpen(true);
  };

  const submitCharge = async () => {
    if (!chargeSubscription) return;
    setSaving(true);
    try {
      await generatePlatformCharge(chargeSubscription.id, chargeDueDate);
      setChargeOpen(false);
      await refresh();
      notifyAdmin("Cobrança gerada.");
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível gerar a cobrança."), "error");
    } finally {
      setSaving(false);
    }
  };

  const openPayment = (charge: PlatformCharge) => {
    setPaymentCharge(charge);
    setPaymentMethod("");
    setPaymentNotes("");
    setPaymentOpen(true);
  };

  const submitPayment = async () => {
    if (!paymentCharge) return;
    setSaving(true);
    try {
      await settlePlatformCharge(paymentCharge.id, paymentMethod, paymentNotes);
      setPaymentOpen(false);
      await refresh();
      notifyAdmin("Recebimento registrado.");
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível registrar o recebimento."), "error");
    } finally {
      setSaving(false);
    }
  };

  return <div className="min-w-0 space-y-4">
    <PageHeader
      title="Financeiro"
      subtitle="Assinaturas e recebimentos da Union World. Os dados financeiros operacionais das empresas parceiras não entram neste módulo."
      actions={canManage && section !== "configuration" ? <AdminButton onClick={section === "plans" ? openNewPlan : openNewSubscription}><Plus size={15} /> {section === "plans" ? "Novo plano" : "Nova assinatura"}</AdminButton> : undefined}
    />

    {query.isPending ? <LoadingState text="Carregando financeiro da Union..." /> : query.isError || !data ? (
      <AdminCard className="flex min-h-[260px] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={28} className="text-red-500" />
        <div>
          <p className="font-black text-foreground">Não foi possível carregar o financeiro.</p>
          <p className="mt-1 text-xs text-muted-foreground">{systemErrorMessage(query.error)}</p>
        </div>
        <AdminButton size="sm" onClick={() => query.refetch()}>Tentar novamente</AdminButton>
      </AdminCard>
    ) : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Assinaturas ativas", data.metrics.active_subscriptions, CreditCard],
          ["Em atraso", data.metrics.past_due_subscriptions, AlertTriangle],
          ["MRR", formatCurrency(data.metrics.mrr), TrendingUp],
          ["A receber", formatCurrency(data.metrics.open_receivables), Banknote],
          ["Vencido", formatCurrency(data.metrics.overdue_receivables), CalendarDays],
          ["Recebido no mês", formatCurrency(data.metrics.received_month), CheckCircle2],
        ].map(([label, value, Icon]: any) => <div key={label} className="border border-border bg-card p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon size={17} /></span>
          <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <strong className="mt-1 block truncate text-lg font-black text-foreground">{value}</strong>
        </div>)}
      </div>

      <div className="border-b border-border">
        <div className="flex min-w-0 gap-5 overflow-x-auto">
          {[
            { id: "subscriptions" as const, label: "Assinaturas" },
            { id: "charges" as const, label: "Cobranças" },
            { id: "plans" as const, label: "Planos" },
            { id: "configuration" as const, label: "Configuração" },
          ].map(item => <button
            key={item.id}
            type="button"
            onClick={() => setSection(item.id)}
            className={`shrink-0 border-b-2 px-1 pb-3 pt-1 text-xs font-bold transition-colors ${section === item.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >{item.label}</button>)}
        </div>
      </div>

      {section === "subscriptions" && <AdminCard square>
        <AdminCardHeader>
          <div><h3 className="text-xs font-black uppercase tracking-[0.12em] text-foreground">Assinaturas</h3><p className="mt-1 text-xs text-muted-foreground">Plano e cobrança atual de cada empresa parceira.</p></div>
          {canManage && <AdminButton size="sm" onClick={openNewSubscription}><Plus size={14} /> Nova assinatura</AdminButton>}
        </AdminCardHeader>
        {data.subscriptions.length ? <div className="overflow-x-auto">
          <table className="min-w-[960px]">
            <thead><tr><th className="text-left">Empresa</th><th className="text-left">Plano</th><th className="text-left">Situação</th><th className="text-left">Valor</th><th className="text-left">Próximo vencimento</th><th className="text-right">Ações</th></tr></thead>
            <tbody>{data.subscriptions.map(subscription => <tr key={subscription.id}>
              <td className="font-bold text-foreground">{subscription.organization_name}</td>
              <td className="text-sm text-muted-foreground">{subscription.plan_name}</td>
              <td><StatusBadge status={subscriptionStatusLabel(subscription.status)} /></td>
              <td className="font-bold text-foreground">{formatCurrency(subscription.net_amount)}</td>
              <td className="text-sm text-muted-foreground">{formatDateOnly(subscription.next_due_date, "—")}</td>
              <td><div className="flex justify-end gap-2">
                {canManage && <AdminButton size="sm" variant="secondary" onClick={() => openEditSubscription(subscription)}>Editar</AdminButton>}
                {canManage && subscription.status !== "cancelled" && <AdminButton size="sm" variant="secondary" onClick={() => openCharge(subscription)}>Gerar cobrança</AdminButton>}
              </div></td>
            </tr>)}</tbody>
          </table>
        </div> : <AdminCardContent><p className="text-sm text-muted-foreground">Nenhuma assinatura cadastrada.</p></AdminCardContent>}
      </AdminCard>}

      {section === "charges" && <AdminCard square>
        <AdminCardHeader>
          <div><h3 className="text-xs font-black uppercase tracking-[0.12em] text-foreground">Cobranças</h3><p className="mt-1 text-xs text-muted-foreground">Contas a receber das assinaturas da Union World.</p></div>
        </AdminCardHeader>
        {data.charges.length ? <div className="overflow-x-auto">
          <table className="min-w-[980px]">
            <thead><tr><th className="text-left">Empresa</th><th className="text-left">Plano</th><th className="text-left">Vencimento</th><th className="text-left">Valor</th><th className="text-left">Situação</th><th className="text-left">Pagamento</th><th className="text-right">Ações</th></tr></thead>
            <tbody>{data.charges.map(charge => <tr key={charge.id}>
              <td className="font-bold text-foreground">{charge.organization_name}</td>
              <td className="text-sm text-muted-foreground">{charge.plan_name}</td>
              <td className="text-sm text-muted-foreground">{formatDateOnly(charge.due_date, "—")}</td>
              <td className="font-bold text-foreground">{formatCurrency(charge.amount)}</td>
              <td><StatusBadge status={chargeStatusLabel(charge.status)} /></td>
              <td className="text-sm text-muted-foreground">{charge.paid_at ? formatDateOnly(charge.paid_at, "—") : "—"}</td>
              <td><div className="flex justify-end">
                {canManage && charge.status !== "paid" && charge.status !== "cancelled" && <AdminButton size="sm" onClick={() => openPayment(charge)}>Registrar pagamento</AdminButton>}
              </div></td>
            </tr>)}</tbody>
          </table>
        </div> : <AdminCardContent><p className="text-sm text-muted-foreground">Nenhuma cobrança gerada.</p></AdminCardContent>}
      </AdminCard>}

      {section === "configuration" && <SubscriptionConfiguration financeData={data} canManage={canManage} onChanged={refresh} />}

      {section === "plans" && <AdminCard square>
        <AdminCardHeader>
          <div><h3 className="text-xs font-black uppercase tracking-[0.12em] text-foreground">Planos</h3><p className="mt-1 text-xs text-muted-foreground">Planos comerciais disponíveis para as empresas parceiras.</p></div>
          {canManage && <AdminButton size="sm" onClick={openNewPlan}><Plus size={14} /> Novo plano</AdminButton>}
        </AdminCardHeader>
        {data.plans.length ? <div className="overflow-x-auto">
          <table className="min-w-[760px]">
            <thead><tr><th className="text-left">Plano</th><th className="text-left">Valor</th><th className="text-left">Ciclo</th><th className="text-left">Situação</th><th className="text-right">Ações</th></tr></thead>
            <tbody>{data.plans.map(plan => <tr key={plan.id}>
              <td><strong className="block text-foreground">{plan.name}</strong>{plan.description && <span className="mt-0.5 block max-w-[360px] truncate text-xs text-muted-foreground">{plan.description}</span>}</td>
              <td className="font-bold text-foreground">{formatCurrency(plan.amount)}</td>
              <td className="text-sm text-muted-foreground">{plan.interval_months === 1 ? "Mensal" : `A cada ${plan.interval_months} meses`}</td>
              <td><StatusBadge status={plan.is_active ? "Ativo" : "Inativo"} /></td>
              <td><div className="flex justify-end">{canManage && <AdminButton size="sm" variant="secondary" onClick={() => openEditPlan(plan)}>Editar</AdminButton>}</div></td>
            </tr>)}</tbody>
          </table>
        </div> : <AdminCardContent><p className="text-sm text-muted-foreground">Nenhum plano cadastrado.</p></AdminCardContent>}
      </AdminCard>}
    </>}

    <AdminDialog
      open={planOpen}
      onClose={() => !saving && setPlanOpen(false)}
      title={editingPlan ? "Editar plano" : "Novo plano"}
      description="Plano comercial da Union World para empresas parceiras."
      footer={<div className="flex justify-end gap-2"><AdminButton variant="secondary" disabled={saving} onClick={() => setPlanOpen(false)}>Cancelar</AdminButton><AdminButton loading={saving} disabled={!planName.trim()} onClick={() => void submitPlan()}>Salvar</AdminButton></div>}
    >
      <div className="space-y-4">
        <FInput label="Nome do plano" value={planName} onChange={(event: any) => setPlanName(event.target.value)} required />
        <FTextarea label="Descrição" value={planDescription} onChange={(event: any) => setPlanDescription(event.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FCurrencyInput label="Valor" value={planAmount} onChange={(event: any) => setPlanAmount(event.target.value)} />
          <FSelect label="Ciclo" value={planInterval} onChange={(event: any) => setPlanInterval(event.target.value)} options={[{ value: "1", label: "Mensal" }, { value: "3", label: "Trimestral" }, { value: "6", label: "Semestral" }, { value: "12", label: "Anual" }]} />
        </div>
        <FToggle label="Plano ativo" description="Planos inativos continuam preservados nas assinaturas existentes." checked={planActive} onChange={setPlanActive} />
      </div>
    </AdminDialog>

    <AdminDialog
      open={subscriptionOpen}
      onClose={() => !saving && setSubscriptionOpen(false)}
      title={editingSubscription ? "Editar assinatura" : "Nova assinatura"}
      description="Vincule uma empresa parceira a um plano da Union World."
      className="max-w-2xl"
      footer={<div className="flex justify-end gap-2"><AdminButton variant="secondary" disabled={saving} onClick={() => setSubscriptionOpen(false)}>Cancelar</AdminButton><AdminButton loading={saving} disabled={!subscriptionCompanyId || !subscriptionPlanId} onClick={() => void submitSubscription()}>Salvar</AdminButton></div>}
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FSelect label="Empresa parceira" value={subscriptionCompanyId} disabled={Boolean(editingSubscription)} onChange={(event: any) => setSubscriptionCompanyId(event.target.value)} options={[{ value: "", label: "Selecionar empresa" }, ...data?.companies.map(company => ({ value: company.id, label: company.name })) || []]} />
          <FSelect label="Plano" value={subscriptionPlanId} onChange={(event: any) => changeSubscriptionPlan(event.target.value)} options={[{ value: "", label: "Selecionar plano" }, ...data?.plans.map(plan => ({ value: plan.id, label: plan.name })) || []]} />
          <FSelect label="Situação" value={subscriptionStatus} onChange={(event: any) => setSubscriptionStatus(event.target.value)} options={subscriptionStatusOptions} />
          <FInput label="Início" type="date" value={subscriptionStartDate} onChange={(event: any) => setSubscriptionStartDate(event.target.value)} />
          <FInput label="Próximo vencimento" type="date" value={subscriptionDueDate} onChange={(event: any) => setSubscriptionDueDate(event.target.value)} />
          <FInput label="Dia padrão da cobrança" type="number" min={1} max={28} value={subscriptionBillingDay} onChange={(event: any) => setSubscriptionBillingDay(event.target.value)} placeholder="1 a 28" />
          <FCurrencyInput label="Valor contratado" value={subscriptionAmount} onChange={(event: any) => setSubscriptionAmount(event.target.value)} />
          <FCurrencyInput label="Desconto fixo" value={subscriptionDiscount} onChange={(event: any) => setSubscriptionDiscount(event.target.value)} />
        </div>
        <FTextarea label="Observações" value={subscriptionNotes} onChange={(event: any) => setSubscriptionNotes(event.target.value)} />
      </div>
    </AdminDialog>

    <AdminDialog
      open={chargeOpen}
      onClose={() => !saving && setChargeOpen(false)}
      title="Gerar cobrança"
      description={chargeSubscription ? `${chargeSubscription.organization_name} · ${chargeSubscription.plan_name}` : undefined}
      footer={<div className="flex justify-end gap-2"><AdminButton variant="secondary" disabled={saving} onClick={() => setChargeOpen(false)}>Cancelar</AdminButton><AdminButton loading={saving} disabled={!chargeDueDate} onClick={() => void submitCharge()}>Gerar cobrança</AdminButton></div>}
    >
      <FInput label="Vencimento" type="date" value={chargeDueDate} onChange={(event: any) => setChargeDueDate(event.target.value)} required />
    </AdminDialog>

    <AdminDialog
      open={paymentOpen}
      onClose={() => !saving && setPaymentOpen(false)}
      title="Registrar pagamento"
      description={paymentCharge ? `${paymentCharge.organization_name} · ${formatCurrency(paymentCharge.amount)}` : undefined}
      footer={<div className="flex justify-end gap-2"><AdminButton variant="secondary" disabled={saving} onClick={() => setPaymentOpen(false)}>Cancelar</AdminButton><AdminButton loading={saving} onClick={() => void submitPayment()}>Confirmar recebimento</AdminButton></div>}
    >
      <div className="space-y-4">
        <FSelect label="Forma de pagamento" value={paymentMethod} onChange={(event: any) => setPaymentMethod(event.target.value)} options={[{ value: "", label: "Não informado" }, { value: "pix", label: "Pix" }, { value: "boleto", label: "Boleto" }, { value: "card", label: "Cartão" }, { value: "transfer", label: "Transferência" }, { value: "cash", label: "Dinheiro" }, { value: "other", label: "Outro" }]} />
        <FTextarea label="Observações" value={paymentNotes} onChange={(event: any) => setPaymentNotes(event.target.value)} />
      </div>
    </AdminDialog>
  </div>;
}
