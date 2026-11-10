import { AdminSectionEmpty } from "@/shared/ui/admin/AdminLayout";
import { WhatsAppBrandIcon } from "@/shared/ui/icons/WhatsAppBrandIcon";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileCheck2, MapPin, Package, Phone, Printer, Wrench } from "lucide-react";
import { getAddressMapUrl, type Address } from "@/lib/address";
import {
  AdminButton,
  AdminDialog,
  AdminIconButton,
  BtnPrimary,
  BtnSecondary,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import { FCurrencyInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { formatCnpj, formatCpf, formatNumber, formatPhone } from "@/shared/domain/formatters";
import { notifyPhoneCallIntegration, phoneContactLinks } from "../domain/order-contact-actions";
import type { useOrderCompletion } from "../application/useOrderCompletion";
import type { OrderCommercialItem } from "../infrastructure/order-commercial-items.repository";
import { OrderCompletionPaymentSection } from "./OrderCompletionPaymentSection";
import { OrderConclusionButton } from "./OrderConclusionButton";
import { CompanyWhatsAppAction } from "@/features/sac-digital/presentation/CompanyWhatsAppAction";

function customerAddress(customer: any): Address | null {
  const addresses = (Array.isArray(customer?.addresses) ? customer.addresses : []) as Address[];
  return addresses.find(address => address.is_default) || addresses[0] || null;
}

function customerName(customer: any) {
  return customer?.full_name || customer?.trade_name || customer?.legal_name || "—";
}

function customerDocument(customer: any) {
  const isCompany = customer?.customer_type === "PJ";
  if (isCompany) return formatCnpj(customer?.cnpj || customer?.document || "") || "—";
  return formatCpf(customer?.document || "") || "—";
}

function CustomerQuickActions({ customer, orderId, organizationId }: { customer: any; orderId: string; organizationId: string }) {
  const address = customerAddress(customer);
  const mapUrl = getAddressMapUrl(address);
  const callContact = phoneContactLinks(customer?.phone || customer?.whatsapp);
  const whatsappContact = phoneContactLinks(customer?.whatsapp || customer?.phone);
  const actionClass = "inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-colors";

  return <>
    {callContact.tel ? (
      <a
        href={callContact.tel}
        data-phone-number={`+${callContact.phone}`}
        data-service-order-id={orderId}
        onClick={event => { if (notifyPhoneCallIntegration(callContact.phone, orderId)) event.preventDefault(); }}
        aria-label="Ligar para o cliente"
        title="Ligar para o cliente"
        className={`${actionClass} border-primary/25 bg-card text-primary hover:bg-primary-soft`}
      >
        <Phone size={14} />
        <span className="hidden md:inline">Ligar</span>
      </a>
    ) : (
      <button type="button" disabled aria-label="Telefone não disponível" title="Telefone não disponível" className={`${actionClass} cursor-not-allowed border-border bg-card text-muted-foreground opacity-50`}>
        <Phone size={14} />
        <span className="hidden md:inline">Ligar</span>
      </button>
    )}

    {whatsappContact.whatsapp ? (
      <CompanyWhatsAppAction
        phone={customer?.whatsapp || customer?.phone}
        name={customerName(customer)}
        organizationId={organizationId}
        title="Abrir conversa no WhatsApp"
        className={`${actionClass} border-emerald-200 bg-card text-emerald-700 hover:bg-emerald-50`}
      >
        <WhatsAppBrandIcon size={14} />
        <span className="hidden md:inline">WhatsApp</span>
      </CompanyWhatsAppAction>
    ) : (
      <button type="button" disabled aria-label="WhatsApp não disponível" title="WhatsApp não disponível" className={`${actionClass} cursor-not-allowed border-border bg-card text-muted-foreground opacity-50`}>
        <WhatsAppBrandIcon size={14} />
        <span className="hidden md:inline">WhatsApp</span>
      </button>
    )}

    {mapUrl ? (
      <a
        href={mapUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Abrir endereço do cliente no mapa"
        title={address?.shared_map_url ? "Abrir localização enviada pelo cliente" : "Abrir endereço no mapa"}
        className={`${actionClass} border-primary/25 bg-card text-primary hover:bg-primary-soft`}
      >
        <MapPin size={14} />
        <span className="hidden md:inline">Mapa</span>
      </a>
    ) : (
      <button type="button" disabled aria-label="Endereço não disponível" title="Endereço não disponível" className={`${actionClass} cursor-not-allowed border-border bg-card text-muted-foreground opacity-50`}>
        <MapPin size={14} />
        <span className="hidden md:inline">Mapa</span>
      </button>
    )}
  </>;
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0">
    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="mt-1 break-words text-sm font-semibold text-foreground">{value || "—"}</p>
  </div>;
}

function CommercialItemRow({
  item,
  formatCurrency,
}: {
  item: OrderCommercialItem;
  formatCurrency: (value: number) => string;
}) {
  const quantity = Number(item.quantity || 0);
  const unitPrice = Number(item.unit_price || 0);
  const additionalCost = Number(item.additional_cost || 0);
  const total = Number(item.subtotal ?? quantity * unitPrice + additionalCost);
  const service = item.item_type !== "product";

  return <div className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center">
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${service ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "bg-violet-500/10 text-violet-600 dark:text-violet-400"}`}>
      {service ? <Wrench size={15} /> : <Package size={15} />}
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="min-w-0 break-words text-base font-bold text-foreground">{item.title_snapshot || (service ? "Serviço" : "Produto")}</p>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${service
          ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
          : "bg-violet-500/10 text-violet-700 dark:text-violet-300"}`}>
          {service ? "Serviço" : "Produto"}
        </span>
      </div>
      {item.description_snapshot && <p className="mt-0.5 break-words text-sm text-muted-foreground">{item.description_snapshot}</p>}
      <p className="mt-1 text-sm text-muted-foreground">
        {formatNumber(quantity)} {item.unit_snapshot || (service ? "serviço" : "un")} × {formatCurrency(unitPrice)}
        {additionalCost > 0 ? ` + ${formatCurrency(additionalCost)} adicional` : ""}
      </p>
    </div>
    <strong className="shrink-0 text-base font-bold tabular-nums text-foreground">{formatCurrency(total)}</strong>
  </div>;
}

function ResolutionProductRow({
  item,
  formatCurrency,
}: {
  item: any;
  formatCurrency: (value: number) => string;
}) {
  const quantity = Number(item.quantity || 0);
  const unitPrice = Number(item.unit_sale_price || item.inventory_item?.sale_price || 0);
  const total = Number(item.total_sale_price ?? quantity * unitPrice);

  return <div className="flex min-w-0 flex-col gap-2 py-3 sm:flex-row sm:items-center">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400"><Package size={17} /></span>
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="min-w-0 break-words text-base font-bold text-foreground">{item.inventory_item?.name || "Produto utilizado"}</p>
        <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-bold text-violet-700 dark:text-violet-300">Produto</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatNumber(quantity)} {item.inventory_item?.unit || "un"} × {formatCurrency(unitPrice)}
        {item.inventory_item?.sku ? ` · SKU ${item.inventory_item.sku}` : ""}
      </p>
    </div>
    <strong className="shrink-0 text-base font-bold tabular-nums text-foreground">{formatCurrency(total)}</strong>
  </div>;
}

export function OrderCompletionModal({
  detail,
  usedItems,
  completion,
  saving,
  preparing = false,
  preparingError = "",
  onRetryPreparing,
  onCancelPreparing,
  formatCurrency,
}: {
  detail: any;
  usedItems: any[];
  completion: ReturnType<typeof useOrderCompletion>;
  saving: boolean;
  preparing?: boolean;
  preparingError?: string;
  onRetryPreparing?: () => void;
  onCancelPreparing?: () => void;
  formatCurrency: (value: number) => string;
}) {
  const [addressExpanded, setAddressExpanded] = useState(false);

  useEffect(() => {
    if (completion.open) setAddressExpanded(false);
  }, [completion.open, detail?.id]);

  const commercialServices = useMemo(
    () => completion.commercialItems.filter(item => item.item_type === "service" || item.item_type === "custom_service"),
    [completion.commercialItems],
  );
  const commercialProducts = useMemo(
    () => completion.commercialItems.filter(item => item.item_type === "product"),
    [completion.commercialItems],
  );
  const commercialProductIds = useMemo(
    () => new Set(commercialProducts.map(item => item.inventory_item_id).filter(Boolean)),
    [commercialProducts],
  );
  const resolutionOnlyItems = useMemo(
    () => usedItems.filter(item => !item.inventory_item_id || !commercialProductIds.has(item.inventory_item_id)),
    [usedItems, commercialProductIds],
  );
  const hasProducts = commercialProducts.length > 0 || resolutionOnlyItems.length > 0;
  const hasServices = detail && (completion.commercialPricing
    ? commercialServices.length > 0
    : Boolean(detail.general_service?.name));

  if ((!completion.open && !preparing) || (!detail && !preparing)) return null;

  const close = () => {
    if (saving) return;
    if (preparing && onCancelPreparing) onCancelPreparing();
    else completion.setOpen(false);
  };

  const preparingConclusion = preparing || (
    completion.open && !completion.completedSuccessfully && (
      completion.commercialItemsLoading
      || completion.financeOptionsLoading
      || completion.warrantyLoading
      || completion.paymentProofRequirementLoading
    )
  );

  // Modal único desde o primeiro clique; mantém a mesma instância durante
  // a hidratação da OS e as consultas da conclusão, sem flash intermediário.
  if (preparingConclusion) {
    return <AdminDialog open onClose={close} title={`Concluir OS ${detail?.os_number || ""}`}
      description="Carregando os dados necessários para concluir esta OS."
      className="max-w-xl">
      {preparingError ? <div className="flex min-h-[220px] flex-col items-center justify-center gap-4 text-center">
        <p role="alert" className="text-sm font-semibold text-red-600">
          Não foi possível preparar a conclusão: {preparingError}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <AdminButton variant="secondary" onClick={close}>Fechar</AdminButton>
          {onRetryPreparing && <AdminButton onClick={onRetryPreparing}>Tentar novamente</AdminButton>}
        </div>
      </div> : <div className="flex min-h-[300px] items-center justify-center">
        <LoadingState text="Preparando conclusão..." />
      </div>}
    </AdminDialog>;
  }

  if (!detail) return null;
  const customer = detail.customer as any;
  const address = customerAddress(customer);
  const isCompany = customer?.customer_type === "PJ";

  if (completion.completedSuccessfully) {
    return <AdminDialog
      open={completion.open} onClose={close}
      title={"OS " + (detail.os_number || "") + " concluída"}
      description="A ordem de serviço foi concluída com sucesso."
      className="max-w-xl"
      footer={<div className="flex min-w-0 flex-wrap justify-end gap-3">
        <BtnSecondary onClick={close} disabled={saving || completion.certificateBusy}>Fechar</BtnSecondary>
        {completion.issuedCertificate ? <BtnPrimary onClick={() => void completion.printCertificate()}
          disabled={completion.certificateBusy} loading={completion.certificateBusy} loadingText="Preparando...">
          <Printer size={15} /> Imprimir certificado
        </BtnPrimary> : <BtnPrimary onClick={() => void completion.retryCertificate()}
          disabled={completion.certificateBusy} loading={completion.certificateBusy} loadingText="Gerando...">
          <FileCheck2 size={15} /> Tentar gerar certificado
        </BtnPrimary>}
      </div>}
    >
      <div className="space-y-4 py-3">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" />
          <div><p className="text-sm font-bold text-foreground">Ordem de serviço concluída</p>
            <p className="text-xs text-muted-foreground">{customerName(customer)} · OS {detail.os_number}</p></div>
        </div>
        {completion.issuedCertificate ? <div className="rounded-xl border border-border p-4">
          <p className="text-sm font-bold text-foreground">Certificado de garantia gerado automaticamente</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {completion.issuedCertificate.warranty_option_label} · {completion.issuedCertificate.warranty_days} dias ·
            válido até {new Date(completion.issuedCertificate.expires_at + "T12:00:00").toLocaleDateString("pt-BR")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Também ficará disponível na opção Imprimir dos detalhes da OS.</p>
        </div> : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-sm font-bold text-foreground">{completion.certificateBusy ? "Gerando certificado..." : "A OS foi concluída, mas o certificado não pôde ser emitido."}</p>
          {completion.certificateError && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{completion.certificateError}</p>}
        </div>}
        {completion.paymentProofAttached && <p className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={16} /> Comprovante de pagamento salvo nos documentos da OS.</p>}
        {completion.issuedCertificate && completion.certificateError && <p role="alert" className="text-xs font-semibold text-red-600">{completion.certificateError}</p>}
      </div>
    </AdminDialog>;
  }

  const completionBlocked = completion.returnAwaitingClassification || completion.discountExceedsMax
    || completion.discountExceedsServicePrice
    || (!completion.coverageFree && Boolean(completion.servicePriceValidationMessage))
    || Boolean(completion.financeValidationMessage)
    || completion.financeOptionsLoading
    || completion.commercialItemsLoading
    || completion.warrantyLoading
    || Boolean(completion.warrantyError)
    || (completion.commercialPricing && Boolean(completion.commercialItemsError))
    || completion.paymentProofRequirementLoading
    || Boolean(completion.paymentProofRequirementError)
    || (completion.paymentProofRequired && !completion.paymentProofFile
      && !completion.paymentProofAttached && !completion.paymentProofAlreadyOnOrder)
    || (Boolean(completion.paymentProofFile) && (completion.paymentProofTypeLoading || Boolean(completion.paymentProofTypeError)));

  return <AdminDialog
    open={completion.open}
    onClose={close}
    title={`Concluir OS ${detail.os_number || ""}`}
    description="Confira a composição da OS, os valores e o recebimento antes de finalizar."
    minimizedDescription={`${customerName(customer)} · ${formatCurrency(completion.finalTotal)}`}
    minimizable={!saving}
    className="!max-w-6xl"
    footer={<div className="flex min-w-0 flex-wrap justify-end gap-3">
      <BtnSecondary onClick={close} disabled={saving}>Cancelar</BtnSecondary>
      <OrderConclusionButton
        label="Concluir OS"
        onClick={() => void completion.submit()}
        disabled={completionBlocked}
        loading={saving}
      />
    </div>}
  >
    <div className="min-w-0 space-y-5">
      <Section
        title="Cliente e resumo"
        actions={<CustomerQuickActions customer={customer} orderId={detail.id} organizationId={detail.organization_id} />}
      >
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="min-w-0 space-y-4">
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <InfoItem label="Nome" value={customerName(customer)} />
              <InfoItem label={isCompany ? "CNPJ" : "CPF"} value={customerDocument(customer)} />
              <InfoItem label="Telefone" value={formatPhone(customer?.phone) || "—"} />
              <InfoItem label="WhatsApp" value={formatPhone(customer?.whatsapp) || "—"} />
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={() => setAddressExpanded(value => !value)}
              className="text-xs font-bold text-primary hover:underline disabled:opacity-50"
            >
              {addressExpanded ? "Ocultar endereço ▲" : "Mostrar endereço ▼"}
            </button>

            {addressExpanded && (
              <div className="border-t border-border pt-4">
                {address ? (
                  <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <InfoItem label="CEP" value={address.zip_code || "—"} />
                    <InfoItem label="Rua" value={address.street || "—"} />
                    <InfoItem label="Número" value={address.number || "—"} />
                    <InfoItem label="Complemento" value={address.complement || "—"} />
                    <InfoItem label="Bairro" value={address.neighborhood || "—"} />
                    <InfoItem label="Cidade" value={address.city || "—"} />
                    <InfoItem label="Estado" value={address.state || "—"} />
                  </div>
                ) : <AdminSectionEmpty compact>Nenhum endereço cadastrado para este cliente.</AdminSectionEmpty>}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Serviços</span>
              <strong className="text-emerald-700 dark:text-emerald-300">{formatCurrency(completion.servicePrice)}</strong>
            </div>
            {hasProducts && <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Produtos</span>
              <strong className="text-emerald-700 dark:text-emerald-300">{formatCurrency(completion.partsTotal)}</strong>
            </div>}
            <div className="flex items-center justify-between gap-4 border-t border-border pt-3 text-sm">
              <span className="font-bold text-foreground">Subtotal</span>
              <strong className="text-emerald-700 dark:text-emerald-300">{formatCurrency(completion.subtotal)}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">
                {completion.coverageFree ? "Cobertura integral da garantia / cortesia" : completion.discountMode === "percentage"
                  ? `Desconto (${formatNumber(completion.discountValue, { maximumFractionDigits: 2 })}%)`
                  : "Desconto"}
              </span>
              <strong className="text-red-600 dark:text-red-400">- {formatCurrency(completion.discountAmount)}</strong>
            </div>
            <div className="flex items-end justify-between gap-4 border-t border-border pt-4">
              <span className="text-sm font-black text-foreground">Valor final</span>
              <strong className="text-2xl font-black text-emerald-700 dark:text-emerald-300">{formatCurrency(completion.finalTotal)}</strong>
            </div>
          </div>
        </div>
      </Section>

      {completion.returnAwaitingClassification && <p role="alert" className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-800">
        Classifique a garantia do retorno antes de concluir.
      </p>}
      <div className="grid min-w-0 items-stretch gap-4 lg:grid-cols-2">
        <Section title="Produtos e serviços"
          className="flex h-[360px] min-h-0 flex-col"
          contentClassName="min-h-0 flex-1 overflow-y-auto">
          <div className="min-w-0">
            {completion.commercialItemsError && <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 text-sm font-semibold text-red-700">
                Não foi possível carregar Produtos e Serviços: {completion.commercialItemsError}
              </p>
              <AdminButton variant="secondary" size="sm" onClick={() => void completion.reloadCommercialItems()} disabled={completion.commercialItemsLoading}>
                Tentar novamente
              </AdminButton>
            </div>}

            {!completion.commercialItemsError && !completion.commercialItemsLoading && !hasServices && !hasProducts &&
              <AdminSectionEmpty className="min-h-[240px] text-sm">Nenhum produto ou serviço utilizado.</AdminSectionEmpty>}

            {!completion.commercialItemsError && !completion.commercialItemsLoading && (hasServices || hasProducts) && <>
              {hasServices && <div>
                {completion.commercialPricing
                  ? commercialServices.map(item => <CommercialItemRow key={item.id} item={item} formatCurrency={formatCurrency} />)
                  : <div className="flex min-w-0 flex-col gap-3 py-3 sm:flex-row sm:items-center">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400"><Wrench size={17} /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-words text-base font-bold text-foreground">{detail.general_service.name}</p>
                          <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-blue-300">Serviço</span>
                        </div>
                      </div>
                      {completion.priceAtCompletion
                        ? <div className="w-full shrink-0 sm:w-[190px]">
                            <FCurrencyInput label="Valor do serviço" value={completion.servicePriceInput}
                              onChange={(event: any) => completion.setServicePriceInput(event.target.value)}
                              error={completion.servicePriceValidationMessage || undefined}
                              disabled={saving} />
                          </div>
                        : <strong className="shrink-0 text-base font-bold tabular-nums text-foreground">{formatCurrency(completion.servicePrice)}</strong>}
                    </div>}
              </div>}

              {hasProducts && <div className={hasServices ? "border-t border-border pt-2" : ""}>
                {completion.commercialPricing && commercialProducts.map(item =>
                  <CommercialItemRow key={item.id} item={item} formatCurrency={formatCurrency} />)}
                {(completion.commercialPricing ? resolutionOnlyItems : usedItems).map(item =>
                  <ResolutionProductRow key={`used-${item.id}`} item={item} formatCurrency={formatCurrency} />)}
              </div>}
            </>}
          </div>
        </Section>

        <Section title="Certificado de garantia"
          className="flex h-[360px] min-h-0 flex-col"
          contentClassName="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-3">
            <p className="text-sm leading-relaxed text-muted-foreground">
              Escolha a garantia que será aplicada nesta OS. O certificado ficará disponível para imprimir novamente após a conclusão.
            </p>
            <FSelect label="Prazo da garantia" value={completion.warrantyOptionId}
              disabled={saving || completion.warrantyLoading}
              options={completion.warrantyOptions.length ? completion.warrantyOptions.map(option => ({
                value: option.id, label: option.label + " · " + option.warranty_days + " dias" + (option.is_default ? " (padrão)" : ""),
              })) : [{ value: "", label: completion.warrantyLoading ? "Carregando..." : "Garantia padrão · 90 dias" }]}
              onChange={(event: any) => completion.setWarrantyOptionId(event.target.value)} />
            {completion.warrantyError && <p role="alert" className="text-sm font-semibold text-red-600">{completion.warrantyError}</p>}
          </div>
        </Section>
      </div>
      {completion.coverageFree
        ? <p className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold text-orange-800">
            Atendimento coberto: valor a pagar R$ 0,00. Não serão gerados recebimentos nem exigido comprovante de pagamento.
          </p>
        : <Section title="Pagamento">
            <OrderCompletionPaymentSection completion={completion} saving={saving} formatCurrency={formatCurrency} />
          </Section>}
    </div>
  </AdminDialog>;
}
