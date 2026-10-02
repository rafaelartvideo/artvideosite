import { useEffect, useMemo, useState } from "react";
import { MapPin, Maximize2, MessageCircle, Minimize2, Package, Phone, Wrench } from "lucide-react";
import { getAddressMapUrl, type Address } from "@/lib/address";
import {
  AdminButton,
  AdminDialog,
  AdminIconButton,
  BtnPrimary,
  BtnSecondary,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import { FCurrencyInput } from "@/shared/ui/admin/AdminFormControls";
import { formatCnpj, formatCpf, formatNumber, formatPhone } from "@/shared/domain/formatters";
import { notifyPhoneCallIntegration, phoneContactLinks } from "../domain/order-contact-actions";
import type { useOrderCompletion } from "../application/useOrderCompletion";
import type { OrderCommercialItem } from "../infrastructure/order-commercial-items.repository";
import { OrderCompletionPaymentSection } from "./OrderCompletionPaymentSection";

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

function CustomerQuickActions({ customer, orderId }: { customer: any; orderId: string }) {
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
      <a
        href={whatsappContact.whatsapp}
        target="_blank"
        rel="noreferrer"
        aria-label="Abrir WhatsApp do cliente"
        title="Abrir WhatsApp do cliente"
        className={`${actionClass} border-emerald-200 bg-card text-emerald-700 hover:bg-emerald-50`}
      >
        <MessageCircle size={14} />
        <span className="hidden md:inline">WhatsApp</span>
      </a>
    ) : (
      <button type="button" disabled aria-label="WhatsApp não disponível" title="WhatsApp não disponível" className={`${actionClass} cursor-not-allowed border-border bg-card text-muted-foreground opacity-50`}>
        <MessageCircle size={14} />
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
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${service ? "bg-primary-soft text-primary" : "bg-muted text-foreground"}`}>
      {service ? <Wrench size={15} /> : <Package size={15} />}
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="min-w-0 break-words text-sm font-bold text-foreground">{item.title_snapshot || (service ? "Serviço" : "Produto")}</p>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-muted-foreground">
          {service ? "Serviço" : "Produto"}
        </span>
      </div>
      {item.description_snapshot && <p className="mt-0.5 break-words text-[11px] text-muted-foreground">{item.description_snapshot}</p>}
      <p className="mt-1 text-[10px] text-muted-foreground">
        {formatNumber(quantity)} {item.unit_snapshot || (service ? "serviço" : "un")} × {formatCurrency(unitPrice)}
        {additionalCost > 0 ? ` + ${formatCurrency(additionalCost)} adicional` : ""}
      </p>
    </div>
    <strong className="shrink-0 text-sm text-foreground">{formatCurrency(total)}</strong>
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
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"><Package size={15} /></span>
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="min-w-0 break-words text-sm font-bold text-foreground">{item.inventory_item?.name || "Produto utilizado"}</p>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">Utilizado</span>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {formatNumber(quantity)} {item.inventory_item?.unit || "un"} × {formatCurrency(unitPrice)}
        {item.inventory_item?.sku ? ` · SKU ${item.inventory_item.sku}` : ""}
      </p>
    </div>
    <strong className="shrink-0 text-sm text-foreground">{formatCurrency(total)}</strong>
  </div>;
}

export function OrderCompletionModal({
  detail,
  usedItems,
  completion,
  saving,
  formatCurrency,
}: {
  detail: any;
  usedItems: any[];
  completion: ReturnType<typeof useOrderCompletion>;
  saving: boolean;
  formatCurrency: (value: number) => string;
}) {
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    if (completion.open) {
      setAddressExpanded(false);
      setMinimized(false);
    }
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

  if (!completion.open || !detail) return null;

  const customer = detail.customer as any;
  const address = customerAddress(customer);
  const isCompany = customer?.customer_type === "PJ";
  const close = () => {
    if (!saving) {
      setMinimized(false);
      completion.setOpen(false);
    }
  };

  const completionBlocked = completion.discountExceedsMax
    || completion.discountExceedsServicePrice
    || Boolean(completion.servicePriceValidationMessage)
    || Boolean(completion.financeValidationMessage)
    || completion.financeOptionsLoading
    || completion.commercialItemsLoading
    || (completion.commercialPricing && Boolean(completion.commercialItemsError));

  if (minimized) {
    return <div
      className="admin-crm fixed bottom-4 right-4 z-[150] flex w-[min(92vw,360px)] items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-card-foreground shadow-2xl"
      role="dialog"
      aria-label={`Concluir OS ${detail.os_number || ""} minimizada`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">Concluir OS {detail.os_number || ""}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {customerName(customer)} · {formatCurrency(completion.finalTotal)}
        </p>
      </div>
      <AdminIconButton
        ariaLabel="Restaurar modal"
        title="Restaurar"
        onClick={() => setMinimized(false)}
        variant="ghost"
        className="shrink-0"
      >
        <Maximize2 size={16} />
      </AdminIconButton>
    </div>;
  }

  return <AdminDialog
    open={completion.open}
    onClose={close}
    title={`Concluir OS ${detail.os_number || ""}`}
    description="Confira a composição da OS, os valores e o recebimento antes de finalizar."
    headerActions={<AdminIconButton
      ariaLabel="Minimizar modal"
      title="Minimizar"
      onClick={() => setMinimized(true)}
      disabled={saving}
      variant="ghost"
      className="shrink-0"
    >
      <Minimize2 size={16} />
    </AdminIconButton>}
    className="!max-w-6xl"
    footer={<div className="flex min-w-0 flex-wrap justify-end gap-3">
      <BtnSecondary onClick={close} disabled={saving}>Cancelar</BtnSecondary>
      <BtnPrimary
        onClick={() => void completion.submit()}
        disabled={completionBlocked}
        loading={saving}
        loadingText="Concluindo..."
      >
        Confirmar conclusão
      </BtnPrimary>
    </div>}
  >
    <div className="min-w-0 space-y-5">
      <Section
        title="Cliente e resumo"
        actions={<CustomerQuickActions customer={customer} orderId={detail.id} />}
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
                ) : <p className="text-sm text-muted-foreground">Nenhum endereço cadastrado para este cliente.</p>}
              </div>
            )}
          </div>

          <div className="space-y-3 border-t border-border pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Serviços</span>
              <strong className="text-foreground">{formatCurrency(completion.servicePrice)}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Produtos</span>
              <strong className="text-foreground">{formatCurrency(completion.partsTotal)}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-border pt-3 text-sm">
              <span className="font-bold text-foreground">Subtotal</span>
              <strong className="text-foreground">{formatCurrency(completion.subtotal)}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">
                {completion.discountMode === "percentage"
                  ? `Desconto (${formatNumber(completion.discountValue, { maximumFractionDigits: 2 })}%)`
                  : "Desconto"}
              </span>
              <strong className="text-foreground">- {formatCurrency(completion.discountAmount)}</strong>
            </div>
            <div className="flex items-end justify-between gap-4 border-t border-border pt-4">
              <span className="text-sm font-black text-foreground">Valor final</span>
              <strong className="text-2xl font-black text-primary">{formatCurrency(completion.finalTotal)}</strong>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Produtos e serviços">
        <div className="min-w-0 space-y-4">
          {completion.commercialItemsLoading && (
            <div className="rounded-xl border border-border bg-muted/45 px-4 py-3 text-sm text-muted-foreground">
              Carregando a composição da OS...
            </div>
          )}

          {completion.commercialItemsError && (
            <div className="flex min-w-0 flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="min-w-0 text-sm font-semibold text-red-700">
                Não foi possível carregar Produtos e Serviços: {completion.commercialItemsError}
              </p>
              <AdminButton variant="secondary" size="sm" onClick={() => void completion.reloadCommercialItems()} disabled={completion.commercialItemsLoading}>
                Tentar novamente
              </AdminButton>
            </div>
          )}

          {!completion.commercialItemsLoading && !completion.commercialItemsError && completion.commercialPricing ? (
            <>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.1em] text-foreground">Serviços</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Serviços registrados na composição da OS.</p>
                  </div>
                  <strong className="text-sm text-primary">{formatCurrency(completion.servicePrice)}</strong>
                </div>
                {commercialServices.length ? (
                  <div className="divide-y divide-border border-y border-border">
                    {commercialServices.map(item => <CommercialItemRow key={item.id} item={item} formatCurrency={formatCurrency} />)}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                    Nenhum serviço foi adicionado à composição desta OS.
                  </div>
                )}
              </div>

              <div className="border-t border-border pt-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.1em] text-foreground">Produtos</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Produtos da composição e peças utilizadas na solução sem duplicidade.</p>
                  </div>
                  <strong className="text-sm text-primary">{formatCurrency(completion.partsTotal)}</strong>
                </div>
                {commercialProducts.length || resolutionOnlyItems.length ? (
                  <div className="divide-y divide-border border-y border-border">
                    {commercialProducts.map(item => <CommercialItemRow key={item.id} item={item} formatCurrency={formatCurrency} />)}
                    {resolutionOnlyItems.map(item => <ResolutionProductRow key={`used-${item.id}`} item={item} formatCurrency={formatCurrency} />)}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                    Nenhum produto foi adicionado ou utilizado nesta OS.
                  </div>
                )}
              </div>
            </>
          ) : !completion.commercialItemsLoading && !completion.commercialItemsError ? (
            <>
              <div className="border-y border-border py-4">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <InfoItem label="Serviço" value={detail.general_service?.name || "—"} />
                  {completion.priceAtCompletion ? (
                    <FCurrencyInput
                      label="Valor do serviço"
                      value={completion.servicePriceInput}
                      onChange={(event: any) => completion.setServicePriceInput(event.target.value)}
                      error={completion.servicePriceValidationMessage || undefined}
                      hint="Informe o valor definido para esta conclusão."
                      disabled={saving}
                    />
                  ) : (
                    <InfoItem label="Valor do serviço" value={formatCurrency(completion.servicePrice)} />
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.1em] text-foreground">Produtos utilizados</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Peças aprovadas e registradas na solução.</p>
                  </div>
                  <strong className="text-sm text-primary">{formatCurrency(completion.partsTotal)}</strong>
                </div>
                {usedItems.length ? (
                  <div className="divide-y divide-border border-y border-border">
                    {usedItems.map(item => <ResolutionProductRow key={item.id} item={item} formatCurrency={formatCurrency} />)}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                    Nenhum produto utilizado.
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </Section>

      <Section title="Pagamento">
        <OrderCompletionPaymentSection completion={completion} saving={saving} formatCurrency={formatCurrency} />
      </Section>
    </div>
  </AdminDialog>;
}
