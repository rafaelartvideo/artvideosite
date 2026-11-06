import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Banknote, Landmark, LockKeyhole, Minus, MoreVertical, Pencil, Pin, Plus, Vault, Wallet } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { FInput, FSelect, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState, StatusBadge, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, AdminDialog, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import { useFinanceMovements } from "../application/useFinanceMovements";
import type { FinancialAccount, FinancialAccountType, FinancialMovementType } from "../domain/finance.types";
import { FinanceCashActionDialog, type FinanceCashAction } from "./FinanceCashSection";
import { useFinanceCash } from "../application/useFinanceCash";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import { FinanceOpeningBalanceDialog } from "./FinanceOpeningBalanceDialog";
import { parsePinnedFinanceAccounts, prioritizePinnedFinanceAccounts } from "../domain/finance-account-cards.mjs";

const ACCOUNT_TYPES: { value: FinancialAccountType; label: string }[] = [
  { value: "cash", label: "Caixa físico" },
  { value: "bank", label: "Conta bancária" },
  { value: "pix", label: "Conta PIX" },
  { value: "other", label: "Outra" },
];

const emptyForm = () => ({
  id: undefined as string | undefined,
  name: "",
  account_type: "bank" as FinancialAccountType,
  description: "",
  bank_name: "",
  agency: "",
  account_number: "",
  pix_key: "",
  allows_cash_session: false,
  is_active: true,
});

function typeLabel(type: FinancialAccountType) {
  return ACCOUNT_TYPES.find(item => item.value === type)?.label || type;
}

/** Marca original do PIX, exibida sem depender de fontes ou de redes externas. */
function PixBrandIcon({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M5.283 18.36a3.505 3.505 0 0 0 2.493-1.032l3.6-3.6a.684.684 0 0 1 .946 0l3.613 3.613a3.504 3.504 0 0 0 2.493 1.032h.71l-4.56 4.56a3.647 3.647 0 0 1-5.156 0L4.85 18.36ZM18.428 5.627a3.505 3.505 0 0 0-2.493 1.032l-3.613 3.614a.67.67 0 0 1-.946 0l-3.6-3.6A3.505 3.505 0 0 0 5.283 5.64h-.434l4.573-4.572a3.646 3.646 0 0 1 5.156 0l4.559 4.559ZM1.068 9.422 3.79 6.699h1.492a2.483 2.483 0 0 1 1.744.722l3.6 3.6a1.73 1.73 0 0 0 2.443 0l3.614-3.613a2.482 2.482 0 0 1 1.744-.723h1.767l2.737 2.737a3.646 3.646 0 0 1 0 5.156l-2.736 2.736h-1.768a2.482 2.482 0 0 1-1.744-.722l-3.613-3.613a1.77 1.77 0 0 0-2.444 0l-3.6 3.6a2.483 2.483 0 0 1-1.744.722H3.791l-2.723-2.723a3.646 3.646 0 0 1 0-5.156"/>
  </svg>;
}

function AccountTypeIcon({ type }: { type: FinancialAccountType }) {
  if (type === "pix") return <PixBrandIcon size={26} />;
  if (type === "bank") return <Landmark size={27} strokeWidth={1.7} />;
  if (type === "cash") return <Banknote size={27} strokeWidth={1.7} />;
  return <Wallet size={27} strokeWidth={1.7} />;
}

const ACCOUNT_CARD_THEME: Record<FinancialAccountType, { icon: string; top: string; tag: string }> = {
  cash: { icon: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300", top: "from-amber-500/[0.06] to-transparent", tag: "bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  bank: { icon: "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300", top: "from-blue-500/[0.06] to-transparent", tag: "bg-blue-500/10 text-blue-800 dark:text-blue-300" },
  pix: { icon: "border-teal-500/20 bg-teal-500/10 text-teal-700 dark:text-teal-300", top: "from-teal-500/[0.06] to-transparent", tag: "bg-teal-500/10 text-teal-800 dark:text-teal-300" },
  other: { icon: "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300", top: "from-slate-500/[0.06] to-transparent", tag: "bg-slate-500/10 text-slate-800 dark:text-slate-300" },
};

function accountDetails(account: FinancialAccount) {
  if (account.account_type === "bank") {
    return [account.bank_name, account.agency ? `Ag. ${account.agency}` : null, account.account_number ? `Conta ${account.account_number}` : null].filter(Boolean).join(" · ") || "Sem dados bancários";
  }
  if (account.account_type === "pix") return account.pix_key || "Chave PIX não informada";
  if (account.account_type === "cash") return account.allows_cash_session ? "Permite abertura e fechamento de caixa" : "Sem sessão de caixa";
  return account.description || "Sem detalhes adicionais";
}

const MOVEMENT_LABELS: Record<FinancialMovementType, string> = {
  opening_balance: "Saldo inicial",
  receipt: "Recebimento",
  payment: "Pagamento",
  fee: "Taxa financeira",
  transfer_in: "Transferência recebida",
  transfer_out: "Transferência enviada",
  reversal: "Estorno",
  supply: "Suprimento",
  withdraw: "Sangria",
  cash_adjustment: "Ajuste de caixa",
};

export function FinanceAccountsSection({ createSignal = 0 }: { createSignal?: number } = {}) {
  const { hasPermission, activeOrganizationId, user } = useAuth();
  const finance = useFinanceFoundation();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [cashAction, setCashAction] = useState<{ accountId: string; action: FinanceCashAction } | null>(null);
  const money = useFinanceMovements({
    loadMovements: Boolean(selectedAccountId),
    loadTransfers: false,
    movementAccountId: selectedAccountId || "",
    movementPageSize: 60,
  });
  const cashEnabled = Boolean(finance.settingsQuery.data?.cash_session_enabled);
  const cash = useFinanceCash(cashEnabled);
  const canView = hasPermission("finance.accounts.view");
  const canManage = hasPermission("finance.accounts.manage");
  const canOpenCash = hasPermission("finance.cash.open");
  const canSupplyCash = hasPermission("finance.cash.supply");
  const canWithdrawCash = hasPermission("finance.cash.withdraw");
  const canCloseCash = hasPermission("finance.cash.close");
  const canOperateCash = canOpenCash || canSupplyCash || canWithdrawCash || canCloseCash;
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [openingAccount, setOpeningAccount] = useState<FinancialAccount | null>(null);
  const [nameError, setNameError] = useState("");
  const pinStorageKey = `union:finance:pinned-accounts:v1:${activeOrganizationId || "none"}:${user?.id || "anonymous"}`;
  const [pinPreference, setPinPreference] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const pinnedAccountIds = pinPreference.key === pinStorageKey ? pinPreference.ids : [];
  useEffect(() => {
    try {
      const ids = activeOrganizationId && user?.id
        ? parsePinnedFinanceAccounts(window.localStorage.getItem(pinStorageKey)) : [];
      setPinPreference({ key: pinStorageKey, ids });
    } catch {
      setPinPreference({ key: pinStorageKey, ids: [] });
    }
  }, [pinStorageKey, activeOrganizationId, user?.id]);
  const togglePin = (accountId: string) => {
    const ids = pinnedAccountIds.includes(accountId)
      ? pinnedAccountIds.filter(id => id !== accountId)
      : [...pinnedAccountIds, accountId];
    setPinPreference({ key: pinStorageKey, ids });
    try {
      if (activeOrganizationId && user?.id) window.localStorage.setItem(pinStorageKey, JSON.stringify(ids));
    } catch {
      // A preferência é opcional e não deve bloquear as operações financeiras.
    }
  };
  useEffect(() => {
    if (createSignal > 0 && canManage) { setForm(emptyForm()); setNameError(""); setFormOpen(true); }
  }, [createSignal, canManage]);

  const balances = money.balancesQuery.data || {};
  const accounts = (finance.accountsQuery.data || []).map(account => ({ ...account, balance: Number(balances[account.id] || 0) }));
  const orderedAccounts = prioritizePinnedFinanceAccounts(accounts, pinnedAccountIds);
  const totalBalance = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const bankBalance = accounts.filter(account => account.account_type === "bank" || account.account_type === "pix").reduce((sum, account) => sum + account.balance, 0);
  const cashBalance = accounts.filter(account => account.account_type === "cash").reduce((sum, account) => sum + account.balance, 0);
  const otherBalance = accounts.filter(account => account.account_type === "other").reduce((sum, account) => sum + account.balance, 0);
  const selectedAccount = accounts.find(account => account.id === selectedAccountId) || null;
  const cashAccount = cashAction ? accounts.find(account => account.id === cashAction.accountId) || null : null;
  const openSessions = useMemo(() => new Map(
    (cash.sessionsQuery.data || []).filter(item => item.status === "open").map(item => [item.financial_account_id, item]),
  ), [cash.sessionsQuery.data]);
  const statement = money.movementsQuery.data;
  const statementLoading = money.movementsQuery.isLoading || money.movementsQuery.isPlaceholderData;
  const queryError = finance.accountsQuery.error || money.balancesQuery.error || (cashEnabled ? cash.sessionsQuery.error : null);
  const mutationError = finance.saveAccount.error || finance.toggleAccount.error || money.openingBalanceMutation.error;
  const errorMessage = mutationError ? systemErrorMessage(mutationError) : queryError ? systemErrorMessage(queryError) : "";

  if (!canView) return <AdminCard className="p-6"><p className="text-sm text-[#5a6a82]">Você não possui permissão para visualizar caixas e contas.</p></AdminCard>;

  const openEdit = (account: FinancialAccount) => {
    setForm({
      id: account.id,
      name: account.name,
      account_type: account.account_type,
      description: account.description || "",
      bank_name: account.bank_name || "",
      agency: account.agency || "",
      account_number: account.account_number || "",
      pix_key: account.pix_key || "",
      allows_cash_session: account.allows_cash_session,
      is_active: account.is_active,
    });
    setNameError("");
    setFormOpen(true);
  };

  const closeForm = () => {
    if (finance.saveAccount.isPending) return;
    setFormOpen(false);
    setForm(emptyForm());
    setNameError("");
  };

  const submit = async () => {
    if (!form.name.trim()) { setNameError("Informe o nome da conta financeira."); return; }
    setNameError("");
    try {
      await finance.saveAccount.mutateAsync({
        ...form,
        description: form.description || null,
        bank_name: form.bank_name || null,
        agency: form.agency || null,
        account_number: form.account_number || null,
        pix_key: form.pix_key || null,
      });
      closeForm();
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível salvar a conta financeira."), "error");
    }
  };

  const loading = finance.accountsQuery.isLoading || money.balancesQuery.isLoading;
  const cashOperations = (account: FinancialAccount) => {
    if (!cashEnabled || account.account_type !== "cash" || !account.allows_cash_session || !account.is_active) return null;
    if (cash.sessionsQuery.isLoading) return null;
    const session = openSessions.get(account.id) || null;
    if (!session) return canOpenCash ? <button type="button"
      onClick={() => setCashAction({ accountId: account.id, action: "open" })}
      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border admin-action-blue-outline px-2.5 py-1.5 text-xs font-bold hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
      <Banknote size={15} /> Abrir caixa
    </button> : null;
    const options = [
      canSupplyCash && { action: "supply" as const, title: "Suprimento", icon: Plus },
      canWithdrawCash && { action: "withdraw" as const, title: "Sangria", icon: Minus },
      canCloseCash && { action: "close" as const, title: "Fechar caixa", icon: LockKeyhole },
    ].filter(Boolean) as Array<{ action: FinanceCashAction; title: string; icon: typeof Plus }>;
    if (!options.length) return null;
    return <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button"
          aria-label="Operações do caixa"
          className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border admin-action-blue-outline px-2.5 py-1.5 text-xs font-bold hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
          <MoreVertical size={16} /> <span className="hidden lg:inline">Operações</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {options.map(option => {
          const Icon = option.icon;
          return <DropdownMenuItem key={option.action} onSelect={() => setCashAction({ accountId: account.id, action: option.action })}>
            <Icon size={15} /> {option.title}
          </DropdownMenuItem>;
        })}
      </DropdownMenuContent>
    </DropdownMenu>;
  };

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[
        { title: "Saldo total", amount: totalBalance, detail: "Todas as contas e caixas", emphasis: true },
        { title: "Bancos e PIX", amount: bankBalance, detail: "Saldos bancários e digitais", emphasis: false },
        { title: "Caixa físico", amount: cashBalance, detail: "Dinheiro em caixa", emphasis: false },
        ...(accounts.some(account => account.account_type === "other") ? [{ title: "Outras contas", amount: otherBalance, detail: "Outras fontes de saldo", emphasis: false }] : []),
      ].map(item => <AdminCard key={item.title} className={`relative overflow-hidden border p-4 sm:p-5 ${item.emphasis ? "border-primary/25 bg-primary/[0.04]" : "border-border"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{item.title}</p>
            {loading ? <div className="mt-3 h-8 w-36 animate-pulse rounded bg-muted" /> :
              <p className={`mt-3 break-words text-2xl font-black tabular-nums tracking-tight ${item.amount < 0 ? "text-red-600 dark:text-red-400" : item.emphasis ? "text-primary" : "text-foreground"}`}>{formatCurrency(item.amount)}</p>}
          </div>
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary" aria-hidden="true">
            <Vault size={27} strokeWidth={1.7} />
          </span>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{item.detail}</p>
      </AdminCard>)}
    </div>

    {errorMessage && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{errorMessage}</div>}
    {loading ? <div className="p-8"><LoadingState text="Carregando contas e caixas" /></div> : accounts.length === 0
      ? <div className="p-8"><EmptyState icon={Landmark} title="Nenhuma conta financeira" /></div>
      : <section aria-label="Contas e caixas" className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {orderedAccounts.map(account => {
          const theme = ACCOUNT_CARD_THEME[account.account_type];
          const isPinned = pinnedAccountIds.includes(account.id);
          const cashSession = openSessions.get(account.id) || null;
          const detail = accountDetails(account);
          return <article key={account.id}
            className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm transition-[box-shadow,border-color] hover:border-primary/30 hover:shadow-md ${isPinned ? "border-primary/35 ring-1 ring-primary/10" : "border-border"} ${!account.is_active ? "opacity-75" : ""}`}>
            <div className={`flex min-w-0 items-start gap-2.5 bg-gradient-to-br p-4 pb-3 ${theme.top}`}>
              <button type="button" onClick={() => setSelectedAccountId(account.id)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                aria-label={`Ver detalhes e extrato de ${account.name}`}>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${theme.icon}`}><AccountTypeIcon type={account.account_type} /></span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold ${theme.tag}`}>{typeLabel(account.account_type)}</span>
                  <span className="min-w-0 break-words text-sm font-bold leading-snug text-foreground">{account.name}</span>
                </span>
              </button>
              <button type="button" aria-label={isPinned ? `Desafixar ${account.name}` : `Fixar ${account.name}`}
                title={isPinned ? "Desafixar conta" : "Fixar conta no início"}
                aria-pressed={isPinned}
                onClick={() => togglePin(account.id)}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${isPinned ? "border-primary/30 bg-primary/10 text-primary" : "border-border/60 bg-card/70 text-muted-foreground hover:bg-muted hover:text-primary"}`}>
                <Pin size={17} className={isPinned ? "fill-current" : ""} />
              </button>
            </div>

            <button type="button" onClick={() => setSelectedAccountId(account.id)}
              className="flex w-full flex-1 flex-col items-start gap-3 px-4 pb-4 pt-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
              aria-label={`Abrir extrato de ${account.name}`}>
              <div className="w-full">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Saldo disponível</p>
                <p className={`mt-1 break-words text-2xl font-black tabular-nums tracking-tight ${account.balance > 0 ? "text-emerald-600 dark:text-emerald-400" : account.balance < 0 ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>
                  {formatCurrency(account.balance)}
                </p>
              </div>
              <p className="min-h-9 w-full break-words text-xs leading-relaxed text-muted-foreground">{detail}</p>
              <div className="mt-auto flex flex-wrap items-center gap-1.5">
                <StatusBadge status={account.is_active ? "Ativo" : "Inativo"} />
                {account.account_type === "cash" && cashEnabled && account.allows_cash_session &&
                  (cash.sessionsQuery.isLoading ? <span className="text-[11px] text-muted-foreground">Verificando caixa...</span> :
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${cashSession ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "border-border bg-muted text-muted-foreground"}`}>
                      {cashSession ? "Caixa aberto" : "Caixa fechado"}
                    </span>)}
                {!account.opening_balance_configured_at && <span className="rounded-full border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-400">Saldo inicial pendente</span>}
              </div>
            </button>

            <footer className="mt-auto flex min-h-[62px] flex-wrap items-center justify-end gap-1.5 border-t border-border bg-muted/30 px-3 py-2.5">
              {cashOperations(account)}
              {canManage && <>
                {!account.opening_balance_configured_at && <AdminIconButton ariaLabel={`Configurar saldo inicial de ${account.name}`} title="Configurar saldo inicial" onClick={() => setOpeningAccount(account)}><Banknote size={15} /></AdminIconButton>}
                <AdminIconButton ariaLabel={`Editar ${account.name}`} title="Editar conta" onClick={() => openEdit(account)}><Pencil size={15} /></AdminIconButton>
                <AdminActiveStateButton active={account.is_active} entityLabel={`conta ${account.name}`}
                  loading={finance.toggleAccount.isPending} onClick={() => void finance.toggleAccount.mutateAsync({ id: account.id, isActive: !account.is_active })} />
              </>}
              {!canManage && !cashOperations(account) && <span className="mr-auto text-xs font-medium text-muted-foreground">Somente visualização</span>}
            </footer>
          </article>;
        })}
      </section>}

    {selectedAccount && <AdminDialog
      open
      onClose={() => setSelectedAccountId(null)}
      title="Detalhes da conta"
      description={selectedAccount.name + " · " + typeLabel(selectedAccount.account_type)}
      className="max-w-4xl"
      footer={<div className="flex justify-end gap-2">
        {canManage && <AdminButton variant="tertiary" onClick={() => { setSelectedAccountId(null); openEdit(selectedAccount); }}><Pencil size={16} /> Editar conta</AdminButton>}
        <AdminButton variant="secondary" onClick={() => setSelectedAccountId(null)}>Fechar</AdminButton>
      </div>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/[0.05] p-4 sm:p-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Saldo total disponível</p>
            <p className={`mt-2 text-2xl font-black tabular-nums ${selectedAccount.balance < 0 ? "text-red-600 dark:text-red-400" : "text-primary"}`}>{formatCurrency(selectedAccount.balance)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{accountDetails(selectedAccount)}</p>
          </div>
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-primary"><Vault size={33} /></div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="text-sm font-bold text-foreground">Extrato da conta</h3>
            <p className="text-xs text-muted-foreground">Últimas 60 movimentações · Role para consultar</p>
          </div>
          {statementLoading ? <div className="p-8"><LoadingState text="Carregando extrato" /></div>
            : money.movementsQuery.error ? <p className="p-4 text-sm text-red-600">{systemErrorMessage(money.movementsQuery.error)}</p>
            : !statement?.items.length ? <div className="p-6"><EmptyState icon={Landmark} title="Nenhuma movimentação nesta conta" /></div>
            : <div className="overflow-x-auto">
                <div className="max-h-[264px] min-w-[620px] overflow-y-auto overscroll-contain">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10 bg-card"><tr>
                      <th className="text-left">Data</th>
                      <th className="text-left">Movimentação</th>
                      <th className="text-left">Descrição</th>
                      <th className="text-right">Valor</th>
                    </tr></thead>
                    <tbody>{statement.items.map(item => <tr key={item.id} className="h-[54px] border-t border-border/70">
                      <td className="whitespace-nowrap text-xs text-muted-foreground">{new Date(item.occurred_at).toLocaleString("pt-BR")}</td>
                      <td className="whitespace-nowrap text-xs font-semibold text-foreground">{MOVEMENT_LABELS[item.movement_type] || item.movement_type}</td>
                      <td className="max-w-[220px] truncate text-xs text-muted-foreground" title={item.description_snapshot}>{item.description_snapshot || "—"}</td>
                      <td className={`text-right text-xs font-bold tabular-nums ${item.direction === "credit" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        <span className="inline-flex items-center justify-end gap-1">{item.direction === "credit" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}{item.direction === "credit" ? "+" : "−"} {formatCurrency(item.amount)}</span>
                      </td>
                    </tr>)}</tbody>
                  </table>
                </div>
              </div>}
        </div>
      </div>
    </AdminDialog>}

    {cashAction && cashAccount && <FinanceCashActionDialog
      key={cashAction.accountId + ":" + cashAction.action}
      account={cashAccount}
      session={openSessions.get(cashAction.accountId) || null}
      action={cashAction.action}
      onClose={() => setCashAction(null)}
    />}

    {formOpen && <AdminDialog
      open
      onClose={closeForm}
      title={form.id ? "Editar conta" : "Nova conta"}
      description="O saldo não é editável aqui; ele é formado pelo livro financeiro."
      className="max-w-2xl"
      footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={closeForm} disabled={finance.saveAccount.isPending}>Cancelar</AdminButton><AdminButton onClick={submit} loading={finance.saveAccount.isPending} loadingText="Salvando...">Salvar conta</AdminButton></div>}
    ><div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FInput label="Nome" required error={nameError} value={form.name} onChange={(event: any) => { setNameError(""); setForm(current => ({ ...current, name: event.target.value })); }} placeholder="Ex.: Banco principal" />
            <FSelect label="Tipo" required value={form.account_type} onChange={(event: any) => {
              const accountType = event.target.value as FinancialAccountType;
              setForm(current => ({ ...current, account_type: accountType, bank_name: accountType === "bank" ? current.bank_name : "", agency: accountType === "bank" ? current.agency : "", account_number: accountType === "bank" ? current.account_number : "", pix_key: accountType === "pix" ? current.pix_key : "", allows_cash_session: accountType === "cash" ? current.allows_cash_session : false }));
            }} options={ACCOUNT_TYPES} />
          </div>
          {form.account_type === "bank" && <div className="grid gap-4 sm:grid-cols-3"><FInput label="Banco" value={form.bank_name} onChange={(event: any) => setForm(current => ({ ...current, bank_name: event.target.value }))} /><FInput label="Agência" value={form.agency} onChange={(event: any) => setForm(current => ({ ...current, agency: event.target.value }))} /><FInput label="Conta" value={form.account_number} onChange={(event: any) => setForm(current => ({ ...current, account_number: event.target.value }))} /></div>}
          {form.account_type === "pix" && <FInput label="Chave PIX" value={form.pix_key} onChange={(event: any) => setForm(current => ({ ...current, pix_key: event.target.value }))} placeholder="Chave associada à conta" />}
          {form.account_type === "cash" && <FToggle label="Permitir sessão de caixa" description="Habilita esta conta para o fluxo de abertura e fechamento de caixa." checked={form.allows_cash_session} onChange={value => setForm(current => ({ ...current, allows_cash_session: value }))} />}
          <FTextarea label="Descrição" value={form.description} onChange={(event: any) => setForm(current => ({ ...current, description: event.target.value }))} placeholder="Observações opcionais sobre a conta" />
          {errorMessage && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}
</div></AdminDialog>}

    <FinanceOpeningBalanceDialog
      open={Boolean(openingAccount)}
      account={openingAccount}
      saving={money.openingBalanceMutation.isPending}
      error={money.openingBalanceMutation.error}
      onClose={() => { if (!money.openingBalanceMutation.isPending) setOpeningAccount(null); }}
      onSave={async (amount, note) => {
        if (!openingAccount) return;
        await money.openingBalanceMutation.mutateAsync({ accountId: openingAccount.id, amount, note });
      }}
    />
  </div>;
}
