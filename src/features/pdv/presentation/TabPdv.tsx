import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  LockKeyhole,
  Minus,
  Package,
  Plus,
  ReceiptText,
  Settings2,
  ShoppingCart,
  Store,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { REFERENCE_DATA_CACHE_TIME } from "@/infrastructure/query/query-client";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { formatCurrency } from "@/shared/domain/formatters";
import { AdminSelect, FCurrencyInput, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
import {
  AdminButton,
  AdminCard,
  PageHeader,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import { LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import {
  closeFinancialCashSession,
  openFinancialCashSession,
  recordFinancialCashAdjustment,
} from "@/features/finance/infrastructure/finance-cash.repository";
import {
  configurePdvQuickSetup,
  loadPdvBootstrap,
  loadPdvCashSessionReport,
  savePdvSettings,
} from "../infrastructure/pdv.repository";
import { PdvSaleWorkspace } from "./PdvSaleWorkspace";
import { PdvSalesHistory } from "./PdvSalesHistory";
import { CashReportDetail, PdvCashReports } from "./PdvCashReports";

type CashAction = "open" | "supply" | "withdraw" | "close";

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function cashActionTitle(action: CashAction) {
  if (action === "open") return "Abrir caixa";
  if (action === "supply") return "Suprimento";
  if (action === "withdraw") return "Sangria";
  return "Fechar caixa";
}

function CashDrawerControl({
  open,
  disabled,
  onClick,
}: {
  open: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={open ? "Fechar caixa" : "Abrir caixa"}
    className="group relative block h-[132px] w-full overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-default disabled:opacity-60"
  >
    <div className="absolute inset-x-0 top-0 z-20 h-[54px] border-b border-border bg-muted px-4">
      <div className="flex h-full items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card shadow-sm">
            <span className={`h-2.5 w-2.5 rounded-full transition-colors duration-300 ${open ? "bg-emerald-500" : "bg-slate-400"}`} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-black uppercase tracking-[0.12em] text-foreground">Caixa PDV</p>
            <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">{open ? "Gaveta aberta" : "Gaveta fechada"}</p>
          </div>
        </div>
        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-black text-foreground">
          {open ? "Fechar" : "Abrir"}
        </span>
      </div>
    </div>

    <div
      aria-hidden="true"
      className={`absolute left-4 right-4 top-[45px] z-10 h-[58px] rounded-b-xl border border-border bg-card shadow-[0_12px_24px_rgba(15,23,42,0.12)] transition-transform duration-500 ease-out ${open ? "translate-y-[21px]" : "translate-y-0"}`}
    >
      <div className="absolute left-1/2 top-3 h-2 w-16 -translate-x-1/2 rounded-full bg-muted-foreground/35 transition-all duration-300 group-hover:w-20" />
      <div className="absolute inset-x-3 bottom-3 grid grid-cols-5 gap-1.5">
        {Array.from({ length: 5 }).map((_, index) => <span key={index} className="h-2 rounded-sm bg-muted" />)}
      </div>
    </div>

    <div className="absolute inset-x-0 bottom-0 z-30 flex h-[31px] items-center justify-center border-t border-border bg-card/95 text-[11px] font-black text-primary backdrop-blur">
      {open ? "Clique para fechar a gaveta" : "Clique para puxar a gaveta"}
    </div>
  </button>;
}

export function TabPdv({
  routeResourceId,
  onRouteChange,
}: {
  routeResourceId?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
}) {
  const { user, activeOrganizationId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const canConfigure = hasPermission("pdv.settings.manage");
  const canSell = hasPermission("pdv.sales.create");
  const canOpenCash = hasPermission("pdv.cash.open");
  const canCloseCash = hasPermission("pdv.cash.close");
  const canSupplyCash = hasPermission("pdv.cash.supply");
  const canWithdrawCash = hasPermission("pdv.cash.withdraw");
  const canViewCashReports = hasPermission("pdv.cash.reports");

  const bootstrapQuery = useQuery({
    queryKey: queryKeys.pdv.bootstrap(organizationId || "none"),
    queryFn: () => loadPdvBootstrap(organizationId),
    enabled: Boolean(organizationId),
    staleTime: REFERENCE_DATA_CACHE_TIME,
    gcTime: REFERENCE_DATA_CACHE_TIME,
  });

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [defaultCashAccountId, setDefaultCashAccountId] = useState("");
  const [requireOpenCash, setRequireOpenCash] = useState(true);
  const [allowSaleWithoutCustomer, setAllowSaleWithoutCustomer] = useState(true);
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [cashDialog, setCashDialog] = useState<CashAction | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [cashNote, setCashNote] = useState("");
  const [cashErrors, setCashErrors] = useState<{ amount?: string; note?: string }>({});

  const bootstrap = bootstrapQuery.data;
  const settings = bootstrap?.settings ?? null;
  const cashAccount = bootstrap?.cash_account ?? null;
  const openSession = bootstrap?.open_session ?? null;

  const closeReportQuery = useQuery({
    queryKey: queryKeys.pdv.cashSessionReport(organizationId || "none", openSession?.id || "none"),
    queryFn: () => loadPdvCashSessionReport(organizationId, openSession!.id),
    enabled: Boolean(
      organizationId
      && openSession?.id
      && canViewCashReports
      && cashDialog === "close"
    ),
  });

  useEffect(() => {
    if (!settings) return;
    setDefaultCashAccountId(settings.default_cash_account_id || "");
    setRequireOpenCash(settings.require_open_cash);
    setAllowSaleWithoutCustomer(settings.allow_sale_without_customer);
    setAllowNegativeStock(settings.allow_negative_stock);
  }, [
    settings?.organization_id,
    settings?.default_cash_account_id,
    settings?.require_open_cash,
    settings?.allow_sale_without_customer,
    settings?.allow_negative_stock,
  ]);

  useEffect(() => {
    if (!bootstrapQuery.error) return;
    setToast({ msg: systemErrorMessage(bootstrapQuery.error, "Não foi possível carregar o PDV."), type: "error" });
  }, [bootstrapQuery.error]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.pdv.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.all }),
    ]);
  };

  const quickSetupMutation = useMutation({
    mutationFn: () => configurePdvQuickSetup(organizationId),
    onSuccess: async () => {
      setToast({ msg: "PDV configurado. O Caixa PDV já está ligado ao Financeiro.", type: "success" });
      await refresh();
    },
    onError: error => setToast({ msg: systemErrorMessage(error, "Não foi possível configurar o PDV."), type: "error" }),
  });

  const settingsMutation = useMutation({
    mutationFn: () => {
      if (!settings) throw new Error("Configure o PDV antes de alterar a venda rápida.");
      return savePdvSettings(organizationId, {
        default_cash_account_id: defaultCashAccountId || null,
        require_open_cash: requireOpenCash,
        allow_sale_without_customer: allowSaleWithoutCustomer,
        allow_negative_stock: allowNegativeStock,
      }, user?.id || null);
    },
    onSuccess: async () => {
      setToast({ msg: "Configurações de venda rápida salvas.", type: "success" });
      await refresh();
    },
    onError: error => setToast({ msg: systemErrorMessage(error, "Não foi possível salvar as configurações do PDV."), type: "error" }),
  });

  const canStartSale = Boolean(
    canSell
    && bootstrap?.configured
    && Number(bootstrap.readiness.active_products || 0) > 0
    && Number(bootstrap.readiness.ready_payment_methods || 0) > 0
    && (!settings?.require_open_cash || openSession),
  );

  const openCashDialog = (action: CashAction) => {
    setCashDialog(action);
    setCashAmount("");
    setCashNote("");
    setCashErrors({});
  };

  const closeCashDialog = () => {
    setCashDialog(null);
    setCashAmount("");
    setCashNote("");
    setCashErrors({});
  };

  const submitCashAction = async () => {
    if (!cashDialog || !cashAccount) return;
    const amount = Number(cashAmount || 0);
    const needsPositiveAmount = cashDialog === "supply" || cashDialog === "withdraw";
    const nextErrors: typeof cashErrors = {};

    if (!Number.isFinite(amount) || amount < 0 || (needsPositiveAmount && amount <= 0)) {
      nextErrors.amount = needsPositiveAmount ? "Informe um valor maior que zero." : "Informe o valor contado no caixa.";
    }
    if (needsPositiveAmount && !cashNote.trim()) nextErrors.note = "Informe o motivo da movimentação.";
    if (cashDialog === "close" && closeReportQuery.data) {
      const expected = Number(closeReportQuery.data.session.expected_amount || 0);
      const difference = Math.round((amount - expected) * 100) / 100;
      if (difference !== 0 && !cashNote.trim()) {
        nextErrors.note = "Informe a justificativa para a diferença do fechamento.";
      }
    }

    setCashErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    try {
      if (cashDialog === "open") {
        await openFinancialCashSession(organizationId, cashAccount.id, amount, cashNote.trim() || null);
      } else if (cashDialog === "close") {
        if (!openSession) return;
        await closeFinancialCashSession(organizationId, openSession.id, amount, cashNote.trim() || null);
      } else {
        if (!openSession) return;
        await recordFinancialCashAdjustment(
          organizationId,
          openSession.id,
          cashDialog,
          amount,
          cashNote.trim(),
        );
      }
      setToast({ msg: cashActionTitle(cashDialog) + " concluído.", type: "success" });
      closeCashDialog();
      await refresh();
    } catch (error) {
      setToast({ msg: systemErrorMessage(error, "Não foi possível concluir a operação do caixa."), type: "error" });
    }
  };

  if (bootstrapQuery.isPending) {
    return <div className="space-y-5"><PageHeader title="PDV" subtitle="Venda rápida, caixa e operação de balcão." /><AdminCard className="p-8"><LoadingState text="Carregando PDV..." /></AdminCard></div>;
  }

  const cashOptions = (bootstrap?.cash_accounts || []).map(account => ({ value: account.id, label: account.name }));
  const readiness = bootstrap?.readiness || { active_products: 0, active_payment_methods: 0, ready_payment_methods: 0 };

  if (routeResourceId === "sale" && bootstrap && canStartSale) {
    return <PdvSaleWorkspace bootstrap={bootstrap} onBack={() => onRouteChange?.(null, null)} />;
  }

  if (routeResourceId === "sales") {
    return <PdvSalesHistory
      onBack={() => onRouteChange?.(null, null)}
      onNewSale={() => onRouteChange?.("sale", null)}
      canStartSale={canStartSale}
    />;
  }

  if (routeResourceId === "cash" && canViewCashReports) {
    return <PdvCashReports onBack={() => onRouteChange?.(null, null)} />;
  }

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <PageHeader
      title="PDV"
      subtitle="Venda rápida com produtos, caixa físico e integração automática com o Financeiro."
      actions={<div className="flex flex-wrap justify-end gap-2">
        {canViewCashReports && <AdminButton variant="secondary" onClick={() => onRouteChange?.("cash", null)}><Banknote size={15} /> Caixas</AdminButton>}
        <AdminButton variant="secondary" onClick={() => onRouteChange?.("sales", null)}><ReceiptText size={15} /> Vendas</AdminButton>
        {canSell && <AdminButton disabled={!canStartSale} onClick={() => onRouteChange?.("sale", null)} title={!canStartSale ? "Abra e configure o caixa antes de iniciar a venda." : "Nova venda"}><ShoppingCart size={15} /> Nova venda</AdminButton>}
      </div>}
    />

    {!bootstrap?.configured ? <Section
      title="Configuração inicial do PDV"
      description="O PDV usa o mesmo caixa do Financeiro para não existir saldo duplicado em dois módulos."
      contentClassName="space-y-5"
    >
        <div className="grid gap-3 md:grid-cols-3">
          <ReadinessCard
            icon={Package}
            title="Produtos"
            value={String(readiness.active_products) + " ativo" + (readiness.active_products === 1 ? "" : "s")}
            ready={readiness.active_products > 0}
            detail="Produtos disponíveis para a venda."
          />
          <ReadinessCard
            icon={CreditCard}
            title="Formas de pagamento"
            value={String(readiness.active_payment_methods) + " ativa" + (readiness.active_payment_methods === 1 ? "" : "s")}
            ready={readiness.active_payment_methods > 0}
            detail="Dinheiro, PIX, cartões e outras formas vêm do Financeiro."
          />
          <ReadinessCard
            icon={Banknote}
            title="Caixa"
            value="Não configurado"
            ready={false}
            detail="Será criado ou vinculado um caixa físico padrão para o PDV."
          />
        </div>

        <div className="rounded-xl border border-primary/15 bg-primary-soft p-4">
          <p className="text-sm font-black text-[#0d1b2e]">Configuração rápida</p>
          <p className="mt-1 text-xs leading-5 text-[#5a6a82]">Ativa o controle de caixa físico, cria ou reutiliza um <strong>Caixa PDV</strong> e deixa a venda rápida preparada. O Financeiro continua sendo a fonte do saldo real.</p>
          {canConfigure
            ? <AdminButton className="mt-4" onClick={() => quickSetupMutation.mutate()} loading={quickSetupMutation.isPending} loadingText="Configurando..."><Settings2 size={15} /> Configurar PDV</AdminButton>
            : <p className="mt-3 text-xs font-semibold text-amber-700">Um gestor com permissão de configuração precisa preparar o PDV antes da primeira venda.</p>}
        </div>
    </Section> : <>
      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Section
          title="Caixa do PDV"
          description={cashAccount?.name || "Caixa não selecionado"}
          actions={<StatusBadge status={openSession ? "Aberto" : "Fechado"} />}
          contentClassName="space-y-4"
        >
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Saldo da conta" value={formatCurrency(Number(cashAccount?.balance || 0))} />
              <Metric label="Situação" value={openSession ? "Caixa aberto" : "Caixa fechado"} />
              <Metric label="Abertura" value={openSession ? formatDateTime(openSession.opened_at) : "—"} />
            </div>

            {openSession && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-bold text-emerald-800">Contado na abertura: {formatCurrency(openSession.opening_counted_amount)}</p>
              {Number(openSession.opening_difference || 0) !== 0 && <p className="mt-1 text-xs text-emerald-700">Diferença registrada: {formatCurrency(openSession.opening_difference)}</p>}
            </div>}

            {(canOpenCash || canCloseCash) && <CashDrawerControl
              open={Boolean(openSession)}
              disabled={openSession ? !canCloseCash : !canOpenCash}
              onClick={() => openCashDialog(openSession ? "close" : "open")}
            />}

            {openSession && (canSupplyCash || canWithdrawCash) && <div className="flex flex-wrap gap-2">
              {canSupplyCash && <AdminButton variant="secondary" onClick={() => openCashDialog("supply")}><Plus size={14} /> Suprimento</AdminButton>}
              {canWithdrawCash && <AdminButton variant="secondary" onClick={() => openCashDialog("withdraw")}><Minus size={14} /> Sangria</AdminButton>}
            </div>}

            {!canOpenCash && !canCloseCash && <p className="text-xs text-[#5a6a82]">Seu perfil pode acessar o PDV, mas não possui permissão para operar abertura e fechamento de caixa.</p>}
        </Section>

        <Section
          title="Prontidão para venda"
          description="Itens mínimos para operar o balcão."
          contentClassName="space-y-3"
        >
            <CompactReadyRow ready={readiness.active_products > 0} label="Produtos ativos" value={String(readiness.active_products)} />
            <CompactReadyRow ready={readiness.ready_payment_methods > 0} label="Formas de pagamento prontas" value={String(readiness.ready_payment_methods)} />
            <CompactReadyRow ready={!settings?.require_open_cash || Boolean(openSession)} label="Caixa exigido" value={settings?.require_open_cash ? (openSession ? "Aberto" : "Fechado") : "Não obrigatório"} />
            <div className="border-t border-[#0d1b2e]/8 pt-3">
              <p className="text-xs leading-5 text-[#5a6a82]">{canStartSale ? "A estrutura está pronta para iniciar uma venda." : "Conclua os itens pendentes antes de iniciar uma venda."}</p>
            </div>
        </Section>
      </div>

      <Section
        title="Configurações de venda rápida"
        description="Padrões usados no balcão. O caixa continua integrado ao Financeiro."
        contentClassName="space-y-5"
      >
          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Caixa padrão</label>
              <AdminSelect
                value={defaultCashAccountId}
                onValueChange={setDefaultCashAccountId}
                options={cashOptions}
                disabled={!canConfigure || settingsMutation.isPending}
                ariaLabel="Caixa padrão do PDV"
              />
              <p className="mt-1 text-[10px] leading-4 text-[#5a6a82]">A venda em dinheiro e a sessão de caixa usarão esta conta física.</p>
            </div>

            <div className="space-y-4">
              <FToggle
                label="Exigir caixa aberto para vender"
                description="Padrão recomendado para operação de balcão e conferência no fechamento."
                checked={requireOpenCash}
                disabled={!canConfigure || settingsMutation.isPending}
                onChange={setRequireOpenCash}
              />
              <FToggle
                label="Permitir venda sem cliente identificado"
                description="Útil para vendas rápidas de balcão. O cliente poderá ser informado quando necessário."
                checked={allowSaleWithoutCustomer}
                disabled={!canConfigure || settingsMutation.isPending}
                onChange={setAllowSaleWithoutCustomer}
              />
              <FToggle
                label="Permitir estoque negativo"
                description="Desligado por padrão para impedir venda acima do saldo disponível."
                checked={allowNegativeStock}
                disabled={!canConfigure || settingsMutation.isPending}
                onChange={setAllowNegativeStock}
              />
            </div>
          </div>

          {canConfigure && <div className="flex justify-end border-t border-[#0d1b2e]/8 pt-4">
            <AdminButton onClick={() => settingsMutation.mutate()} loading={settingsMutation.isPending} loadingText="Salvando..."><Settings2 size={14} /> Salvar configurações</AdminButton>
          </div>}
      </Section>
    </>}

    {cashDialog && cashAccount && <div className="fixed inset-0 z-[160] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true">
      <div className="admin-crm flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="shrink-0 border-b border-[#0d1b2e]/8 px-5 py-4">
          <h2 className="text-lg font-black text-[#0d1b2e]">{cashActionTitle(cashDialog)}</h2>
          <p className="mt-1 text-xs text-[#5a6a82]">{cashAccount.name}</p>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {cashDialog === "close" && canViewCashReports && closeReportQuery.isPending && <LoadingState text="Calculando fechamento..." />}

          {cashDialog === "close" && closeReportQuery.data && <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-3">
            <CashReportDetail report={closeReportQuery.data} compact />
          </div>}

          <FCurrencyInput
            label={cashDialog === "open" || cashDialog === "close" ? "Valor contado no caixa" : "Valor"}
            value={cashAmount}
            error={cashErrors.amount}
            onChange={(event: any) => {
              setCashErrors(current => ({ ...current, amount: undefined }));
              setCashAmount(event.target.value);
            }}
          />
          {cashDialog === "close" && closeReportQuery.data && cashAmount !== "" && <div className={(() => {
            const expected = Number(closeReportQuery.data.session.expected_amount || 0);
            const counted = Number(cashAmount || 0);
            const difference = Math.round((counted - expected) * 100) / 100;
            return "rounded-xl border px-3 py-2 text-xs font-bold " + (difference === 0
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-800");
          })()}>
            {(() => {
              const expected = Number(closeReportQuery.data.session.expected_amount || 0);
              const counted = Number(cashAmount || 0);
              const difference = Math.round((counted - expected) * 100) / 100;
              return difference === 0
                ? "Valor contado confere com o esperado."
                : "Diferença no fechamento: " + formatCurrency(difference);
            })()}
          </div>}

          <FTextarea
            label={cashDialog === "supply" || cashDialog === "withdraw"
              ? "Motivo *"
              : cashDialog === "close" && closeReportQuery.data && cashAmount !== "" && Math.round((Number(cashAmount || 0) - Number(closeReportQuery.data.session.expected_amount || 0)) * 100) / 100 !== 0
                ? "Justificativa *"
                : "Observação / justificativa"}
            value={cashNote}
            error={cashErrors.note}
            rows={3}
            onChange={(event: any) => {
              setCashErrors(current => ({ ...current, note: undefined }));
              setCashNote(event.target.value);
            }}
            placeholder={cashDialog === "close" ? "Obrigatória apenas se houver diferença no fechamento" : undefined}
          />
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#0d1b2e]/8 bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <AdminButton variant="secondary" onClick={closeCashDialog}>Cancelar</AdminButton>
          <AdminButton onClick={() => void submitCashAction()}>Confirmar</AdminButton>
        </div>
      </div>
    </div>}
  </div>;
}

function ReadinessCard({
  icon: Icon,
  title,
  value,
  ready,
  detail,
}: {
  icon: typeof Store;
  title: string;
  value: string;
  ready: boolean;
  detail: string;
}) {
  return <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-4">
    <div className="flex items-start justify-between gap-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-primary shadow-sm"><Icon size={17} /></span>
      <span className={"rounded-full px-2 py-1 text-[10px] font-black uppercase " + (ready ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>{ready ? "Pronto" : "Pendente"}</span>
    </div>
    <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[#7a8aa0]">{title}</p>
    <p className="mt-1 text-lg font-black text-[#0d1b2e]">{value}</p>
    <p className="mt-1 text-xs leading-5 text-[#5a6a82]">{detail}</p>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-3">
    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8a98aa]">{label}</p>
    <p className="mt-1 break-words text-sm font-black text-[#0d1b2e]">{value}</p>
  </div>;
}

function CompactReadyRow({ ready, label, value }: { ready: boolean; label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl border border-[#0d1b2e]/8 px-3 py-3">
    <div className="flex min-w-0 items-center gap-2">
      <CheckCircle2 size={16} className={ready ? "text-emerald-600" : "text-amber-500"} />
      <span className="truncate text-xs font-bold text-[#34445b]">{label}</span>
    </div>
    <span className="shrink-0 text-xs font-black text-[#0d1b2e]">{value}</span>
  </div>;
}
