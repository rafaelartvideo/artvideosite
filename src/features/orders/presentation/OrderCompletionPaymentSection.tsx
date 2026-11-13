import { useEffect, useRef, useState } from "react";
import { Camera, Check, CheckCircle2, ChevronDown, FileText, LoaderCircle, Plus, Trash2, Upload, X } from "lucide-react";
import { AdminButton, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { InlineLoading } from "@/shared/ui/admin/AdminFeedback";
import { FCurrencyInput, FDecimalInput, FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { cn, formatNumber } from "@/shared/domain/formatters";
import type { useOrderCompletion } from "../application/useOrderCompletion";
import { OrderChecklistMobileBridge } from "@/features/checklists/presentation/OrderChecklistMobileBridge";

type CompletionController = ReturnType<typeof useOrderCompletion>;

const quickCounts = [2, 3, 4, 5, 6];
const moreCounts = [7, 8, 9, 10, 12];


type EvidenceKind = "payment" | "delivery";

function OrderCompletionEvidencePicker({ completion, saving, kind }: {
  completion: CompletionController; saving: boolean; kind: EvidenceKind;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const payment = kind === "payment";
  const title = payment ? "Comprovante de pagamento" : "Evidência de entrega";
  const required = payment ? completion.paymentProofRequired : completion.deliveryEvidenceRequired;
  const file = payment ? completion.paymentProofFile : completion.deliveryEvidenceFile;
  const attached = payment
    ? completion.paymentProofAttached || completion.paymentProofAlreadyOnOrder
    : completion.deliveryEvidenceAttached || completion.deliveryEvidenceAlreadyOnOrder;
  const choose = payment ? completion.choosePaymentProof : completion.chooseDeliveryEvidence;

  useEffect(() => {
    setPreviewLoaded(false);
    if (!file?.type.startsWith("image/")) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const select = (files: FileList | null) => {
    const selected = files?.item(0);
    if (selected) choose(selected);
  };

  return <div className="min-w-0 space-y-3 rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold text-foreground">{title}</p>
        <span className={`text-[10px] font-semibold ${required ? "text-destructive" : "text-muted-foreground"}`}>
          {required ? "(obrigatório)" : "(opcional)"}
        </span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {payment
          ? required ? "Anexe o comprovante antes de concluir a OS, mesmo com valores pendentes."
            : "Anexe um comprovante caso o pagamento já tenha sido recebido."
          : required ? "Registre uma foto ou PDF que comprove a entrega antes de concluir a OS."
            : "Você pode registrar uma foto ou PDF da entrega do equipamento."}
        {" "}O arquivo ficará em Documentos → Anexos da OS.
      </p>
    </div>
    {attached ? <p role="status" className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 size={16} /> {title} anexado à OS.
    </p> : !completion.canAttachPaymentProof ? <p className="text-xs text-muted-foreground">
      Seu perfil não possui permissão para anexar documentos.
    </p> : <>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
        className="hidden" aria-label={`Selecionar arquivo de ${title.toLowerCase()}`}
        onChange={event => { select(event.currentTarget.files); event.currentTarget.value = ""; }} />
      <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp"
        capture="environment" className="hidden" aria-label={`Fotografar ${title.toLowerCase()}`}
        onChange={event => { select(event.currentTarget.files); event.currentTarget.value = ""; }} />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button type="button" disabled={saving} onClick={() => cameraInputRef.current?.click()}
          className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2 text-xs font-bold text-foreground transition-colors hover:border-primary/40 disabled:opacity-50 md:hidden">
          <Camera size={16} /> Tirar foto
        </button>
        <button type="button" disabled={saving} onClick={() => fileInputRef.current?.click()}
          className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-2 text-xs font-bold text-foreground transition-colors hover:border-primary/40 disabled:opacity-50 md:flex-none md:px-4">
          <Upload size={16} /> Selecionar arquivo
        </button>
      </div>
      {file && <div className="flex min-w-0 items-center gap-3 rounded-lg border border-primary/20 bg-card p-2.5">
        {previewUrl ? <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-muted/60">
          {!previewLoaded && <span role="status" aria-label={`Carregando prévia de ${title.toLowerCase()}`}
            className="absolute inset-0 flex items-center justify-center">
            <LoaderCircle size={18} className="animate-spin text-muted-foreground" aria-hidden="true" />
          </span>}
          <img src={previewUrl} alt={`Prévia: ${title}`} onLoad={() => setPreviewLoaded(true)}
            className={`h-full w-full object-cover transition-opacity ${previewLoaded ? "opacity-100" : "opacity-0"}`} />
        </div> : <FileText size={22} className="shrink-0 text-primary" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-foreground" title={file.name}>{file.name}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {(file.size / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} MB
            {file.type.startsWith("image/") ? " · Foto otimizada automaticamente" : " · PDF preservado"}
          </p>
        </div>
        <button type="button" onClick={() => choose(null)} disabled={saving}
          aria-label={`Remover arquivo de ${title.toLowerCase()}`} title="Remover arquivo"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50">
          <X size={16} />
        </button>
      </div>}
      {payment && completion.paymentProofTypeLoading && <p role="status" className="text-xs text-muted-foreground">Preparando anexo...</p>}
      {payment && file && completion.paymentProofTypeError && <p role="alert" className="text-xs font-semibold text-destructive">{completion.paymentProofTypeError}</p>}
    </>}
  </div>;
}

export function OrderCompletionEvidenceSection({ completion, saving }: {
  completion: CompletionController; saving: boolean;
}) {
  if (!completion.paymentProofEnabled && !completion.deliveryEvidenceEnabled) return null;
  return <div className="space-y-3">
    <div className="flex min-w-0 justify-end">
      {completion.canAttachPaymentProof && completion.paymentProofOrderId && (
        <OrderChecklistMobileBridge
          orderId={completion.paymentProofOrderId}
          osNumber={completion.paymentProofOsNumber}
          scope="payment-proof"
          disabled={saving}
          onDocumentsUpdated={completion.refreshPaymentProofFromMobile}
        />
      )}
    </div>
    {completion.paymentProofRequirementLoading && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Carregando comprovante e evidência de entrega...
    </p>}
    {completion.paymentProofRequirementError && <p role="alert" className="text-xs font-semibold text-destructive">Não foi possível verificar as evidências: {completion.paymentProofRequirementError}</p>}
    {saving && (completion.paymentProofFile || completion.deliveryEvidenceFile) && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> Salvando as evidências da OS...
    </p>}
    <div className="grid min-w-0 gap-3 md:grid-cols-2">
      {completion.paymentProofEnabled && !completion.coverageFree && <OrderCompletionEvidencePicker completion={completion} saving={saving} kind="payment" />}
      {completion.deliveryEvidenceEnabled && <OrderCompletionEvidencePicker completion={completion} saving={saving} kind="delivery" />}
    </div>
  </div>;
}

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
              Informe as parcelas e marque os valores relatados como recebidos. A baixa será confirmada no Financeiro.
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold text-muted-foreground">
              Total: <strong className="text-emerald-700 dark:text-emerald-300">{formatCurrency(completion.finalTotal)}</strong>
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
            <InlineLoading text="Carregando formas de recebimento..." />
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
                  <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(120px,0.75fr)_minmax(145px,0.8fr)_minmax(200px,1.15fr)_88px_minmax(145px,0.8fr)_42px] xl:items-end">
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
                      <p className="mb-1.5 text-[11px] font-bold text-foreground">Recebido*</p>
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
                        className="!h-[42px] !w-[42px] shrink-0"
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
                Informado recebido*: <strong>{formatCurrency(completion.totalPaidNow)}</strong>
              </span>
              <span className="text-amber-700">
                Não informado: <strong>{formatCurrency(completion.openAmount)}</strong>
              </span>
            </div>
            <p className="px-4 py-2 text-[11px] text-muted-foreground">* Marcação informativa: todas as parcelas aguardam confirmação da baixa no Financeiro, inclusive as marcadas como recebidas.</p>
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
          <p className="mt-1 text-sm font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(completion.subtotal)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total final</p>
          <p className="mt-1 text-xl font-black text-emerald-700 dark:text-emerald-300">{formatCurrency(completion.finalTotal)}</p>
        </div>
      </div>
    </div>

  </div>;
}
