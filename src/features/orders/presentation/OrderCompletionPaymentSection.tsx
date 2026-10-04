import { useState } from "react";
import { Check, ChevronDown, Plus, Trash2 } from "lucide-react";
import { AdminButton, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { FCurrencyInput, FDecimalInput, FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { cn, formatNumber } from "@/shared/domain/formatters";
import type { useOrderCompletion } from "../application/useOrderCompletion";

type CompletionController = ReturnType<typeof useOrderCompletion>;

const quickCounts = [2, 3, 4, 5, 6];
const moreCounts = [7, 8, 9, 10, 12];

export function OrderCompletionPaymentSection({
  completion,
  saving,
  formatCurrency,
}: {
  completion: CompletionController;
  saving: boolean;
  formatCurrency: (value: number) => string;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const methods = completion.financeOptions.payment_methods;
  const currentCount = completion.installments.length;
  const differenceOk = Math.abs(completion.installmentDifference) <= 0.009;

  return <div className="min-w-0 space-y-5">
    {!completion.financeOptionsLoading && !completion.financeOptionsError && !completion.financeEnabled ? (
      <div className="border-y border-border py-4 text-sm text-muted-foreground">
        O módulo Financeiro está desativado para esta empresa. A OS será concluída sem gerar contas a receber.
      </div>
    ) : (
      <div className="min-w-0 space-y-3">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-black text-foreground">Parcelas e formas</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Divida o total, informe os vencimentos e marque somente o que já foi recebido.
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold text-muted-foreground">
              Total: <strong className="text-foreground">{formatCurrency(completion.finalTotal)}</strong>
            </span>

            {quickCounts.map(count => (
              <button
                key={count}
                type="button"
                disabled={saving || completion.finalTotal <= 0}
                onClick={() => {
                  completion.applyInstallmentCount(count);
                  setMoreOpen(false);
                }}
                className={cn(
                  "h-9 min-w-9 rounded-lg border px-2.5 text-xs font-bold transition-colors disabled:opacity-50",
                  currentCount === count
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:text-primary",
                )}
              >
                {count}x
              </button>
            ))}

            <div className="relative">
              <button
                type="button"
                disabled={saving || completion.finalTotal <= 0}
                onClick={() => setMoreOpen(value => !value)}
                className={cn(
                  "inline-flex h-9 items-center gap-1 rounded-lg border px-3 text-xs font-bold transition-colors disabled:opacity-50",
                  moreCounts.includes(currentCount)
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border bg-card text-foreground hover:border-primary/40 hover:text-primary",
                )}
              >
                Mais <ChevronDown size={13} />
              </button>
              {moreOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-30 grid min-w-28 gap-1 rounded-lg border border-border bg-card p-1.5 shadow-xl">
                  {moreCounts.map(count => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => {
                        completion.applyInstallmentCount(count);
                        setMoreOpen(false);
                      }}
                      className="rounded-md px-3 py-2 text-left text-xs font-bold text-foreground hover:bg-muted"
                    >
                      {count}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            <AdminButton
              type="button"
              size="sm"
              onClick={completion.addInstallment}
              disabled={saving || completion.finalTotal <= 0}
              className="h-9"
            >
              <Plus size={14} /> Parcela
            </AdminButton>
          </div>
        </div>

        {completion.financeOptionsLoading && (
          <div className="border-y border-border py-4 text-sm text-muted-foreground">
            Carregando formas de recebimento...
          </div>
        )}

        {completion.financeOptionsError && (
          <div className="border-y border-red-200 py-4 text-sm font-semibold text-red-700">
            Não foi possível carregar as opções financeiras: {completion.financeOptionsError}
          </div>
        )}

        {!completion.financeOptionsLoading && completion.financeEnabled && completion.installments.length === 0 && completion.finalTotal > 0 && (
          <div className="border-y border-dashed border-border py-5 text-center text-sm text-muted-foreground">
            Adicione uma parcela ou escolha uma quantidade acima.
          </div>
        )}

        {completion.installments.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="divide-y divide-border">
              {completion.installments.map((installment, index) => (
                <div key={installment.id} className="min-w-0 bg-card px-3 py-3 sm:px-4">
                  <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(120px,0.75fr)_minmax(145px,0.8fr)_minmax(200px,1.15fr)_88px_minmax(145px,0.8fr)_36px] xl:items-end">
                    <FCurrencyInput
                      label={`Valor${completion.installments.length > 1 ? ` · ${index + 1}ª` : ""}`}
                      value={installment.amount}
                      disabled={saving}
                      onChange={(event: any) => completion.updateInstallment(installment.id, { amount: event.target.value })}
                    />

                    <FInput
                      label="Vencimento"
                      type="date"
                      value={installment.due_date}
                      disabled={saving}
                      onChange={(event: any) => completion.updateInstallment(installment.id, { due_date: event.target.value })}
                    />

                    <FSelect
                      label="Forma de recebimento"
                      value={installment.payment_method_id}
                      disabled={saving || completion.financeOptionsLoading}
                      options={[{ value: "", label: "Selecione" }, ...methods.map(item => ({ value: item.id, label: item.name }))]}
                      onChange={(event: any) => completion.updateInstallment(installment.id, { payment_method_id: event.target.value })}
                    />

                    <div className="min-w-0">
                      <p className="mb-1.5 text-[11px] font-bold text-foreground">Recebido</p>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={installment.received}
                        disabled={saving}
                        onClick={() => completion.updateInstallment(installment.id, { received: !installment.received })}
                        className={cn(
                          "flex h-[42px] w-full items-center justify-center rounded-lg border transition-colors disabled:opacity-50",
                          installment.received
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                            : "border-border bg-muted/30 text-muted-foreground hover:border-primary/30",
                        )}
                      >
                        <span className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-md border",
                          installment.received ? "border-emerald-500 bg-emerald-500 text-white" : "border-border bg-card",
                        )}>
                          {installment.received && <Check size={16} strokeWidth={3} />}
                        </span>
                      </button>
                    </div>

                    {installment.received ? (
                      <FInput
                        label="Data de recebimento"
                        type="date"
                        value={installment.received_at}
                        disabled={saving}
                        onChange={(event: any) => completion.updateInstallment(installment.id, { received_at: event.target.value })}
                      />
                    ) : (
                      <div className="hidden xl:block" />
                    )}

                    <div className="flex items-end justify-end">
                      <AdminIconButton
                        ariaLabel="Remover parcela"
                        title="Remover parcela"
                        variant="danger"
                        disabled={saving || completion.installments.length <= 1}
                        onClick={() => completion.removeInstallment(installment.id)}
                      >
                        <Trash2 size={14} />
                      </AdminIconButton>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t border-border bg-muted/30 px-4 py-2.5 text-[11px] font-semibold">
              <span className="text-muted-foreground">
                Soma: <strong className="text-foreground">{formatCurrency(completion.installmentTotal)}</strong>
              </span>
              <span className={differenceOk ? "text-muted-foreground" : "text-red-600"}>
                Diferença: <strong>{formatCurrency(Math.abs(completion.installmentDifference))}</strong>
              </span>
              <span className="text-emerald-700">
                Recebido: <strong>{formatCurrency(completion.totalPaidNow)}</strong>
              </span>
              <span className="text-amber-700">
                Em aberto: <strong>{formatCurrency(completion.openAmount)}</strong>
              </span>
            </div>
          </div>
        )}

        {completion.financeEnabled && methods.length === 0 && !completion.financeOptionsLoading && !completion.financeOptionsError && (
          <p className="text-xs font-semibold text-amber-700">
            Nenhuma forma de pagamento ativa está disponível no Financeiro.
          </p>
        )}

        {completion.financeValidationMessage && (
          <p className="text-sm font-semibold text-red-700">{completion.financeValidationMessage}</p>
        )}
      </div>
    )}

    <div className="grid min-w-0 gap-4 border-t border-border pt-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="min-w-0">
        <p className="mb-2 text-xs font-black uppercase tracking-[0.1em] text-foreground">Desconto</p>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex shrink-0 rounded-lg border border-border bg-muted/35 p-1">
            <button
              type="button"
              disabled={saving}
              onClick={() => completion.setDiscountMode("percentage")}
              className={cn(
                "h-9 min-w-11 rounded-md px-3 text-xs font-black transition-colors disabled:opacity-50",
                completion.discountMode === "percentage"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              %
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => completion.setDiscountMode("amount")}
              className={cn(
                "h-9 min-w-11 rounded-md px-3 text-xs font-black transition-colors disabled:opacity-50",
                completion.discountMode === "amount"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-card hover:text-foreground",
              )}
            >
              R$
            </button>
          </div>

          <div className="min-w-0 flex-1 sm:max-w-xs">
            {completion.discountMode === "percentage" ? (
              <FDecimalInput
                label="Valor do desconto"
                value={completion.discount}
                decimalPlaces={2}
                disabled={saving}
                onChange={(event: any) => completion.setDiscount(event.target.value)}
                error={completion.discountExceedsMax ? "Desconto acima do permitido." : completion.discountExceedsServicePrice ? "Desconto maior que a base da OS." : undefined}
              />
            ) : (
              <FCurrencyInput
                label="Valor do desconto"
                value={completion.discount}
                disabled={saving}
                onChange={(event: any) => completion.setDiscount(event.target.value)}
                error={completion.discountExceedsMax ? "Desconto acima do permitido." : completion.discountExceedsServicePrice ? "Desconto maior que a base da OS." : undefined}
              />
            )}
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {completion.commercialPricing
            ? completion.discountMode === "percentage"
              ? "Aplicado sobre o subtotal da OS."
              : `Máximo: ${formatCurrency(completion.subtotal)}`
            : completion.discountMode === "percentage"
              ? `Máximo permitido: ${formatNumber(completion.maxDiscountPercentage, { maximumFractionDigits: 2 })}%`
              : `Máximo permitido: ${formatCurrency(completion.maxDiscountAmount)}`}
        </p>
      </div>

      <div className="flex min-w-[220px] items-end justify-between gap-6 lg:justify-end">
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Subtotal</p>
          <p className="mt-1 text-sm font-bold text-foreground">{formatCurrency(completion.subtotal)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total final</p>
          <p className="mt-1 text-xl font-black text-primary">{formatCurrency(completion.finalTotal)}</p>
        </div>
      </div>
    </div>
  </div>;
}
