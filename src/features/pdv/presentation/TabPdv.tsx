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
  Settings2,
  ShoppingCart,
  Store,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { formatCurrency } from "@/shared/domain/formatters";
import { AdminSelect, FCurrencyInput, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
import {
  AdminButton,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  PageHeader,
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
  savePdvSettings,
} from "../infrastructure/pdv.repository";

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

  const bootstrapQuery = useQuery({
    queryKey: queryKeys.pdv.bootstrap(organizationId || "none"),
    queryFn: () => loadPdvBootstrap(organizationId),
    enabled: Boolean(organizationId),
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

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <PageHeader
      title="PDV"
      subtitle="Venda rápida com produtos, caixa físico e integração automática com o Financeiro."
      actions={canSell ? <AdminButton disabled={!canStartSale} onClick={() => onRouteChange?.("sale", null)} title={!canStartSale ? "Abra e configure o caixa antes de iniciar a venda." : "Nova venda"}><ShoppingCart size={15} /> Nova venda</AdminButton> : undefined}
    />

    {!bootstrap?.configured ? <AdminCard className="overflow-hidden">
      <AdminCardHeader>
        <div>
          <h2 className="text-base font-black text-[#0d1b2e]">Configuração inicial do PDV</h2>
          <p className="mt-1 text-xs leading-5 text-[#5a6a82]">O PDV usa o mesmo caixa do Financeiro para não existir saldo duplicado em dois módulos.</p>
        </div>
      </AdminCardHeader>
      <AdminCardContent className="space-y-5">
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
      </AdminCardContent>
    </AdminCard> : <>
      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <AdminCard>
          <AdminCardHeader>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black text-[#0d1b2e]">Caixa do PDV</h2>
                <StatusBadge status={openSession ? "Aberto" : "Fechado"} />
              </div>
              <p className="mt-1 text-xs text-[#5a6a82]">{cashAccount?.name || "Caixa não selecionado"}</p>
            </div>
          </AdminCardHeader>
          <AdminCardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Saldo da conta" value={formatCurrency(Number(cashAccount?.balance || 0))} />
              <Metric label="Situação" value={openSession ? "Caixa aberto" : "Caixa fechado"} />
              <Metric label="Abertura" value={openSession ? formatDateTime(openSession.opened_at) : "—"} />
            </div>

            {openSession && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-bold text-emerald-800">Contado na abertura: {formatCurrency(openSession.opening_counted_amount)}</p>
              {Number(openSession.opening_difference || 0) !== 0 && <p className="mt-1 text-xs text-emerald-700">Diferença registrada: {formatCurrency(openSession.opening_difference)}</p>}
            </div>}

            <div className="flex flex-wrap gap-2">
              {!openSession && canOpenCash && <AdminButton onClick={() => openCashDialog("open")}><Banknote size={14} /> Abrir caixa</AdminButton>}
              {openSession && canSupplyCash && <AdminButton variant="secondary" onClick={() => openCashDialog("supply")}><Plus size={14} /> Suprimento</AdminButton>}
              {openSession && canWithdrawCash && <AdminButton variant="secondary" onClick={() => openCashDialog("withdraw")}><Minus size={14} /> Sangria</AdminButton>}
              {openSession && canCloseCash && <AdminButton variant="secondary" onClick={() => openCashDialog("close")}><LockKeyhole size={14} /> Fechar caixa</AdminButton>}
            </div>

            {!canOpenCash && !canCloseCash && <p className="text-xs text-[#5a6a82]">Seu perfil pode acessar o PDV, mas não possui permissão para operar abertura e fechamento de caixa.</p>}
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader>
            <div>
              <h2 className="text-base font-black text-[#0d1b2e]">Prontidão para venda</h2>
              <p className="mt-1 text-xs text-[#5a6a82]">Itens mínimos para operar o balcão.</p>
            </div>
          </AdminCardHeader>
          <AdminCardContent className="space-y-3">
            <CompactReadyRow ready={readiness.active_products > 0} label="Produtos ativos" value={String(readiness.active_products)} />
            <CompactReadyRow ready={readiness.ready_payment_methods > 0} label="Formas de pagamento prontas" value={String(readiness.ready_payment_methods)} />
            <CompactReadyRow ready={!settings?.require_open_cash || Boolean(openSession)} label="Caixa exigido" value={settings?.require_open_cash ? (openSession ? "Aberto" : "Fechado") : "Não obrigatório"} />
            <div className="border-t border-[#0d1b2e]/8 pt-3">
              <p className="text-xs leading-5 text-[#5a6a82]">{canStartSale ? "A estrutura está pronta para iniciar uma venda." : "Conclua os itens pendentes antes de iniciar uma venda."}</p>
            </div>
          </AdminCardContent>
        </AdminCard>
      </div>

      <AdminCard>
        <AdminCardHeader>
          <div>
            <h2 className="text-base font-black text-[#0d1b2e]">Configurações de venda rápida</h2>
            <p className="mt-1 text-xs leading-5 text-[#5a6a82]">Padrões usados no balcão. O caixa continua integrado ao Financeiro.</p>
          </div>
        </AdminCardHeader>
        <AdminCardContent className="space-y-5">
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
        </AdminCardContent>
      </AdminCard>
    </>}

    {cashDialog && cashAccount && <div className="fixed inset-0 z-[160] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true">
      <div className="admin-crm w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="border-b border-[#0d1b2e]/8 px-5 py-4">
          <h2 className="text-lg font-black text-[#0d1b2e]">{cashActionTitle(cashDialog)}</h2>
          <p className="mt-1 text-xs text-[#5a6a82]">{cashAccount.name}</p>
        </div>
        <div className="space-y-4 p-5">
          <FCurrencyInput
            label={cashDialog === "open" || cashDialog === "close" ? "Valor contado no caixa" : "Valor"}
            value={cashAmount}
            error={cashErrors.amount}
            onChange={(event: any) => {
              setCashErrors(current => ({ ...current, amount: undefined }));
              setCashAmount(event.target.value);
            }}
          />
          <FTextarea
            label={cashDialog === "supply" || cashDialog === "withdraw" ? "Motivo *" : "Observação / justificativa"}
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
        <div className="flex flex-col-reverse gap-2 border-t border-[#0d1b2e]/8 px-5 py-4 sm:flex-row sm:justify-end">
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
