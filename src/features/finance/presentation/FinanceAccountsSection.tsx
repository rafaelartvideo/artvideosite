import { useState } from "react";
import { Banknote, Landmark, Pencil, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { FInput, FSelect, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, AdminCardToolbar, AdminIconButton, BtnPrimary } from "@/shared/ui/admin/AdminLayout";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import { useFinanceMovements } from "../application/useFinanceMovements";
import type { FinancialAccount, FinancialAccountType } from "../domain/finance.types";
import { FinanceCashSection } from "./FinanceCashSection";
import { FinanceOpeningBalanceDialog } from "./FinanceOpeningBalanceDialog";

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

function accountDetails(account: FinancialAccount) {
  if (account.account_type === "bank") {
    return [account.bank_name, account.agency ? `Ag. ${account.agency}` : null, account.account_number ? `Conta ${account.account_number}` : null].filter(Boolean).join(" · ") || "Sem dados bancários";
  }
  if (account.account_type === "pix") return account.pix_key || "Chave PIX não informada";
  if (account.account_type === "cash") return account.allows_cash_session ? "Permite abertura e fechamento de caixa" : "Sem sessão de caixa";
  return account.description || "Sem detalhes adicionais";
}

export function FinanceAccountsSection() {
  const { hasPermission } = useAuth();
  const finance = useFinanceFoundation();
  const money = useFinanceMovements();
  const canView = hasPermission("finance.accounts.view") || hasPermission("finance.accounts.manage");
  const canManage = hasPermission("finance.accounts.manage");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [openingAccount, setOpeningAccount] = useState<FinancialAccount | null>(null);
  const [message, setMessage] = useState("");

  const balances = money.balancesQuery.data || {};
  const accounts = (finance.accountsQuery.data || []).map(account => ({ ...account, balance: Number(balances[account.id] || 0) }));
  const totalBalance = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const queryError = finance.accountsQuery.error || money.balancesQuery.error;
  const mutationError = finance.saveAccount.error || finance.toggleAccount.error || money.openingBalanceMutation.error;
  const errorMessage = message || (mutationError instanceof Error ? mutationError.message : queryError instanceof Error ? queryError.message : "");

  if (!canView) return <AdminCard className="p-6"><p className="text-sm text-[#5a6a82]">Você não possui permissão para visualizar caixas e contas.</p></AdminCard>;

  const openNew = () => {
    setForm(emptyForm());
    setMessage("");
    setFormOpen(true);
  };

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
    setMessage("");
    setFormOpen(true);
  };

  const closeForm = () => {
    if (finance.saveAccount.isPending) return;
    setFormOpen(false);
    setForm(emptyForm());
    setMessage("");
  };

  const submit = async () => {
    if (!form.name.trim()) { setMessage("Informe o nome da conta financeira."); return; }
    setMessage("");
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
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar a conta financeira.");
    }
  };

  const loading = finance.accountsQuery.isLoading || money.balancesQuery.isLoading;
  return <div className="space-y-4">
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-lg font-black text-[#0d1b2e]">Caixas e contas</h2>
        <p className="mt-1 text-xs leading-relaxed text-[#5a6a82]">Cadastre onde o dinheiro da empresa é movimentado. O saldo é calculado exclusivamente pelas movimentações financeiras.</p>
      </div>
      {canManage && <BtnPrimary onClick={openNew}><Plus size={16} /> Nova conta</BtnPrimary>}
    </div>

    <AdminCard className="p-4 sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Saldo total</p><p className="mt-1 text-2xl font-black text-[#0057e7]">{formatCurrency(totalBalance)}</p></div><p className="max-w-xl text-xs leading-relaxed text-[#5a6a82]">Soma dos saldos derivados do livro financeiro. Transferências entre contas não alteram este total.</p></div>
    </AdminCard>

    <AdminCard>
      <AdminCardToolbar className="sm:justify-between">
        <p className="text-xs font-semibold text-[#5a6a82]">{accounts.length} {accounts.length === 1 ? "conta cadastrada" : "contas cadastradas"}</p>
        <p className="text-xs text-[#8b98aa]">Sem exclusão: contas podem ser ativadas ou inativadas.</p>
      </AdminCardToolbar>
      {errorMessage && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}
      {loading ? <div className="p-8"><LoadingState /></div> : accounts.length === 0 ? <div className="p-8"><EmptyState icon={Landmark} title="Nenhuma conta financeira" /></div> : <div className="overflow-x-auto">
        <table className="min-w-[980px]">
          <thead><tr><th className="text-left">Nome</th><th className="text-left">Tipo</th><th className="text-left">Dados</th><th className="text-right">Saldo</th><th className="text-left">Saldo inicial</th><th className="text-left">Status</th>{canManage && <th className="text-right">Ações</th>}</tr></thead>
          <tbody>{accounts.map(account => <tr key={account.id}>
            <td><p className="font-bold text-[#0d1b2e]">{account.name}</p>{account.description && <p className="mt-0.5 text-xs text-[#5a6a82]">{account.description}</p>}</td>
            <td className="text-xs font-semibold text-[#5a6a82]">{typeLabel(account.account_type)}</td>
            <td className="text-xs text-[#5a6a82]">{accountDetails(account)}</td>
            <td className={`text-right text-sm font-black ${Number(account.balance || 0) < 0 ? "text-red-700" : "text-[#0057e7]"}`}>{formatCurrency(account.balance || 0)}</td>
            <td>{account.opening_balance_configured_at ? <span className="text-xs font-semibold text-emerald-700">Configurado</span> : <span className="text-xs font-semibold text-amber-700">Não configurado</span>}</td>
            <td><StatusBadge status={account.is_active ? "Ativo" : "Inativo"} /></td>
            {canManage && <td><div className="flex justify-end gap-1">{!account.opening_balance_configured_at && <AdminIconButton ariaLabel="Configurar saldo inicial" title="Configurar saldo inicial" onClick={() => { setOpeningAccount(account); setMessage(""); }}><Banknote size={15} /></AdminIconButton>}<AdminIconButton ariaLabel="Editar conta" title="Editar conta" onClick={() => openEdit(account)}><Pencil size={15} /></AdminIconButton><AdminIconButton ariaLabel={account.is_active ? "Inativar conta" : "Ativar conta"} title={account.is_active ? "Inativar conta" : "Ativar conta"} onClick={() => finance.toggleAccount.mutateAsync({ id: account.id, isActive: !account.is_active })}><span className="text-xs font-black">{account.is_active ? "II" : "▶"}</span></AdminIconButton></div></td>}
          </tr>)}</tbody>
        </table>
      </div>}
    </AdminCard>

    {Boolean(finance.settingsQuery.data?.cash_session_enabled) && <FinanceCashSection accounts={accounts} />}

    {formOpen && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="text-lg font-black text-[#0d1b2e]">{form.id ? "Editar conta" : "Nova conta"}</h2><p className="mt-1 text-xs text-[#5a6a82]">O saldo não é editável aqui; ele é formado pelo livro financeiro.</p></div><button type="button" onClick={closeForm} disabled={finance.saveAccount.isPending} className="rounded-lg p-2 text-[#5a6a82] hover:bg-slate-100"><X size={18} /></button></div>
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FInput label="Nome" required value={form.name} onChange={(event: any) => setForm(current => ({ ...current, name: event.target.value }))} placeholder="Ex.: Banco principal" />
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
        </div>
        <div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={closeForm} disabled={finance.saveAccount.isPending}>Cancelar</AdminButton><AdminButton onClick={submit} loading={finance.saveAccount.isPending} loadingText="Salvando...">Salvar conta</AdminButton></div>
      </div>
    </div>}

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
