import { Plus, Trash2 } from "lucide-react";
import { FDecimalInput, FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminCard } from "@/shared/ui/admin/AdminLayout";
import type { useOrderCompletion } from "../application/useOrderCompletion";

type CompletionController = ReturnType<typeof useOrderCompletion>;

const modeOptions = [
  { value: "open", label: "Deixar em aberto" },
  { value: "now", label: "Receber agora" },
  { value: "partial", label: "Receber parcialmente" },
];

export function OrderCompletionPaymentSection({
  completion,
  saving,
  formatCurrency,
}: {
  completion: CompletionController;
  saving: boolean;
  formatCurrency: (value: number) => string;
}) {
  const methods = completion.financeOptions.payment_methods;
  const accounts = completion.financeOptions.accounts;
  const needsOpenInstallments = completion.openAmount > 0.009;
  const immediateMode = completion.paymentMode !== "open";

  if (!completion.financeOptionsLoading && !completion.financeOptionsError && !completion.financeEnabled) {
    return <div className="rounded-xl border border-[#0d1b2e]/10 bg-white px-4 py-3 text-sm text-[#5a6a82]">
      O módulo Financeiro está desativado para esta empresa. A OS será concluída normalmente, sem gerar lançamento financeiro.
    </div>;
  }

  return <div className="space-y-4">
    <FSelect
      label="Forma de conclusão financeira"
      value={completion.paymentMode}
      disabled={saving || completion.finalTotal <= 0}
      options={modeOptions}
      onChange={(event: any) => completion.setPaymentMode(event.target.value)}
    />

    {completion.finalTotal <= 0 && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
      O valor final da OS é zero. A conclusão será registrada sem gerar valor a receber.
    </div>}

    {completion.financeOptionsLoading && immediateMode && <div className="rounded-xl border border-[#0057e7]/20 bg-[#eef5ff] px-4 py-3 text-sm text-[#0057e7]">
      Carregando contas e formas de pagamento...
    </div>}

    {completion.financeOptionsError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      Não foi possível carregar as opções financeiras: {completion.financeOptionsError}
    </div>}

    {immediateMode && completion.finalTotal > 0 && <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0d1b2e]">Recebimentos imediatos</p>
          <p className="mt-0.5 text-xs text-[#5a6a82]">Adicione mais de uma linha para pagamento misto, como PIX + dinheiro.</p>
        </div>
        <AdminButton type="button" size="sm" variant="secondary" onClick={completion.addPayment} disabled={saving || completion.financeOptionsLoading}>
          <Plus size={14} /> Adicionar forma
        </AdminButton>
      </div>

      {accounts.length === 0 && !completion.financeOptionsLoading && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
        Nenhuma conta financeira ativa foi cadastrada. Cadastre uma em Financeiro &gt; Caixas e contas para receber agora.
      </div>}

      {methods.length === 0 && !completion.financeOptionsLoading && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
        Nenhuma forma de pagamento ativa está disponível.
      </div>}

      <div className="space-y-3">
        {completion.payments.map((payment, index) => <AdminCard key={payment.id} className="p-4">
          <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(130px,0.7fr)_minmax(180px,1fr)_minmax(180px,1fr)_auto] md:items-end">
            <FDecimalInput
              label={`Valor ${index + 1}`}
              value={payment.principal_amount}
              decimalPlaces={2}
              disabled={saving}
              onChange={(event: any) => completion.updatePayment(payment.id, { principal_amount: event.target.value })}
            />
            <FSelect
              label="Forma de pagamento"
              value={payment.payment_method_id}
              disabled={saving || completion.financeOptionsLoading}
              options={[{ value: "", label: "Selecione" }, ...methods.map(item => ({ value: item.id, label: item.name }))]}
              onChange={(event: any) => completion.updatePayment(payment.id, { payment_method_id: event.target.value })}
            />
            <FSelect
              label="Conta de destino"
              value={payment.financial_account_id}
              disabled={saving || completion.financeOptionsLoading}
              options={[{ value: "", label: "Selecione" }, ...accounts.map(item => ({ value: item.id, label: item.name }))]}
              onChange={(event: any) => completion.updatePayment(payment.id, { financial_account_id: event.target.value })}
            />
            <AdminButton
              type="button"
              size="sm"
              variant="danger"
              onClick={() => completion.removePayment(payment.id)}
              disabled={saving || completion.payments.length <= 1}
              className="md:mb-0.5"
            >
              <Trash2 size={14} /> Remover
            </AdminButton>
          </div>
        </AdminCard>)}
      </div>
    </div>}

    {needsOpenInstallments && completion.finalTotal > 0 && <div className="rounded-xl border border-[#0d1b2e]/10 bg-white p-4">
      <div className="mb-3">
        <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0d1b2e]">Saldo em aberto</p>
        <p className="mt-0.5 text-xs text-[#5a6a82]">Defina como o valor restante ficará no Contas a Receber.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FInput
          label="Quantidade de parcelas"
          type="number"
          min={1}
          max={60}
          value={completion.installmentCount}
          disabled={saving}
          onChange={(event: any) => completion.setInstallmentCount(event.target.value)}
        />
        <FInput
          label="Primeiro vencimento"
          type="date"
          value={completion.firstDueDate}
          disabled={saving}
          onChange={(event: any) => completion.setFirstDueDate(event.target.value)}
        />
      </div>
    </div>}

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[#0d1b2e]/8 bg-white p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Valor final</p>
        <p className="mt-1 text-base font-black text-[#0d1b2e]">{formatCurrency(completion.finalTotal)}</p>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Recebido agora</p>
        <p className="mt-1 text-base font-black text-emerald-800">{formatCurrency(completion.totalPaidNow)}</p>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Fica em aberto</p>
        <p className="mt-1 text-base font-black text-amber-800">{formatCurrency(completion.openAmount)}</p>
      </div>
    </div>

    {completion.financeValidationMessage && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
      {completion.financeValidationMessage}
    </div>}
  </div>;
}
