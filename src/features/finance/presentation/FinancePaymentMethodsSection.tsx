import { useState } from "react";
import { CreditCard, Pencil, Plus, X } from "lucide-react";
import { FCurrencyInput, FDecimalInput, FIntegerInput, FInput, FSelect, FToggle } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, AdminCardToolbar, AdminIconButton, BtnPrimary } from "@/shared/ui/admin/AdminLayout";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import { paymentMethodNetAmount } from "../domain/finance-foundation.mjs";
import type { FinancialPaymentMethod, FinancialPaymentMethodType } from "../domain/finance.types";

const METHOD_TYPES: { value: FinancialPaymentMethodType; label: string }[] = [
  { value: "cash", label: "Dinheiro" }, { value: "pix", label: "PIX" }, { value: "debit_card", label: "Cartão de débito" },
  { value: "credit_card", label: "Cartão de crédito" }, { value: "boleto", label: "Boleto" }, { value: "transfer", label: "Transferência" }, { value: "other", label: "Outra" },
];
const emptyForm = () => ({ id: undefined as string | undefined, name: "", method_type: "pix" as FinancialPaymentMethodType, percentage_fee: "0", fixed_fee: "0", settlement_days: "0", requires_financial_account: true, creates_future_settlement: false, default_financial_account_id: "", is_active: true });
const typeLabel = (type: FinancialPaymentMethodType) => METHOD_TYPES.find(item => item.value === type)?.label || type;

export function FinancePaymentMethodsSection() {
  const finance = useFinanceFoundation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState("");
  const methods = finance.paymentMethodsQuery.data || [];
  const accounts = (finance.accountsQuery.data || []).filter(item => item.is_active);
  const queryError = finance.paymentMethodsQuery.error;

  const edit = (item: FinancialPaymentMethod) => { setForm({ id: item.id, name: item.name, method_type: item.method_type, percentage_fee: String(item.percentage_fee ?? 0), fixed_fee: String(item.fixed_fee ?? 0), settlement_days: String(item.settlement_days ?? 0), requires_financial_account: item.requires_financial_account, creates_future_settlement: item.creates_future_settlement, default_financial_account_id: item.default_financial_account_id || "", is_active: item.is_active }); setMessage(""); setOpen(true); };
  const close = () => { if (finance.savePaymentMethod.isPending) return; setOpen(false); setForm(emptyForm()); setMessage(""); };
  const save = async () => {
    if (!form.name.trim()) { setMessage("Informe o nome da forma de pagamento."); return; }
    const percentageFee = Number(form.percentage_fee || 0);
    const fixedFee = Number(form.fixed_fee || 0);
    const settlementDays = Number(form.settlement_days || 0);
    if (!Number.isFinite(percentageFee) || percentageFee < 0 || percentageFee > 100) { setMessage("A taxa percentual deve ficar entre 0% e 100%."); return; }
    if (!Number.isFinite(fixedFee) || fixedFee < 0 || !Number.isFinite(settlementDays) || settlementDays < 0) { setMessage("Informe taxas e prazo de liquidação válidos."); return; }
    try {
      setMessage("");
      await finance.savePaymentMethod.mutateAsync({ id: form.id, name: form.name, method_type: form.method_type, percentage_fee: percentageFee, fixed_fee: fixedFee, settlement_days: Math.trunc(settlementDays), requires_financial_account: form.requires_financial_account, creates_future_settlement: form.creates_future_settlement, default_financial_account_id: form.requires_financial_account ? form.default_financial_account_id || null : null, is_active: form.is_active });
      close();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível salvar a forma de pagamento."); }
  };
  const preview = paymentMethodNetAmount(100, Number(form.percentage_fee || 0), Number(form.fixed_fee || 0));

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-black text-[#0d1b2e]">Formas de pagamento</h2><p className="mt-1 text-xs text-[#5a6a82]">Configure taxas, prazo de liquidação e conta padrão.</p></div><BtnPrimary onClick={() => { setForm(emptyForm()); setMessage(""); setOpen(true); }}><Plus size={16} /> Nova forma</BtnPrimary></div>
    <AdminCard>
      <AdminCardToolbar><p className="text-xs font-semibold text-[#5a6a82]">{methods.length} {methods.length === 1 ? "forma cadastrada" : "formas cadastradas"}</p></AdminCardToolbar>
      {queryError && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{queryError instanceof Error ? queryError.message : "Não foi possível carregar as formas de pagamento."}</div>}
      {finance.paymentMethodsQuery.isLoading ? <div className="p-8"><LoadingState /></div> : methods.length === 0 ? <div className="p-8"><EmptyState icon={CreditCard} title="Nenhuma forma de pagamento" /></div> : <div className="overflow-x-auto"><table className="min-w-[820px]"><thead><tr><th className="text-left">Forma</th><th className="text-left">Tipo</th><th className="text-left">Taxas</th><th className="text-left">Liquidação</th><th className="text-left">Status</th><th className="text-right">Ações</th></tr></thead><tbody>{methods.map(item => <tr key={item.id}><td className="font-bold text-[#0d1b2e]">{item.name}</td><td className="text-xs text-[#5a6a82]">{typeLabel(item.method_type)}</td><td className="text-xs text-[#5a6a82]">{Number(item.percentage_fee).toLocaleString("pt-BR")} % + {Number(item.fixed_fee).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td><td className="text-xs text-[#5a6a82]">{item.creates_future_settlement ? `${item.settlement_days} dia(s)` : "Imediata"}</td><td><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></td><td><div className="flex justify-end gap-1"><AdminIconButton ariaLabel="Editar forma de pagamento" onClick={() => edit(item)}><Pencil size={15} /></AdminIconButton><AdminIconButton ariaLabel={item.is_active ? "Inativar forma de pagamento" : "Ativar forma de pagamento"} onClick={() => finance.togglePaymentMethod.mutateAsync({ id: item.id, isActive: !item.is_active })} /></div></td></tr>)}</tbody></table></div>}
    </AdminCard>

    {open && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-5 py-4"><h2 className="text-lg font-black">{form.id ? "Editar forma de pagamento" : "Nova forma de pagamento"}</h2><button type="button" onClick={close} className="rounded-lg p-2 text-[#5a6a82] hover:bg-slate-100"><X size={18} /></button></div><div className="space-y-4 p-5"><div className="grid gap-4 sm:grid-cols-2"><FInput label="Nome" required value={form.name} onChange={(event: any) => setForm(current => ({ ...current, name: event.target.value }))} /><FSelect label="Tipo" required value={form.method_type} options={METHOD_TYPES} onChange={(event: any) => setForm(current => ({ ...current, method_type: event.target.value as FinancialPaymentMethodType }))} /></div><div className="grid gap-4 sm:grid-cols-3"><FDecimalInput label="Taxa percentual (%)" decimalPlaces={4} value={form.percentage_fee} onChange={(event: any) => setForm(current => ({ ...current, percentage_fee: event.target.value }))} /><FCurrencyInput label="Taxa fixa" value={form.fixed_fee} onChange={(event: any) => setForm(current => ({ ...current, fixed_fee: event.target.value }))} /><FIntegerInput label="Prazo de liquidação (dias)" value={form.settlement_days} onChange={(event: any) => setForm(current => ({ ...current, settlement_days: event.target.value }))} /></div><div className="grid gap-3 sm:grid-cols-2"><FToggle label="Exige conta financeira" description="A baixa deverá informar uma conta de origem ou destino." checked={form.requires_financial_account} onChange={value => setForm(current => ({ ...current, requires_financial_account: value, default_financial_account_id: value ? current.default_financial_account_id : "" }))} /><FToggle label="Liquidação futura" description="O valor entra primeiro como previsto até a data de repasse." checked={form.creates_future_settlement} onChange={value => setForm(current => ({ ...current, creates_future_settlement: value }))} /></div>{form.requires_financial_account && <FSelect label="Conta padrão" value={form.default_financial_account_id} options={[{ value: "", label: "Sem conta padrão" }, ...accounts.map(item => ({ value: item.id, label: item.name }))]} onChange={(event: any) => setForm(current => ({ ...current, default_financial_account_id: event.target.value }))} />}<div className="rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-4"><p className="text-[11px] font-bold uppercase tracking-wide text-[#5a6a82]">Prévia sobre R$ 100,00</p><p className="mt-1 text-lg font-black text-[#0d1b2e]">Líquido: {Number(preview).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></div>{message && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>}</div><div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={close}>Cancelar</AdminButton><AdminButton onClick={save} loading={finance.savePaymentMethod.isPending} loadingText="Salvando...">Salvar forma</AdminButton></div></div></div>}
  </div>;
}
