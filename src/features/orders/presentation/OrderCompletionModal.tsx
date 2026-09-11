import { useEffect, useState } from "react";
import { MapPin, MessageCircle, Phone, X } from "lucide-react";
import { getAddressMapUrl, type Address } from "@/lib/address";
import { AdminIconButton, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { FDecimalInput } from "@/shared/ui/admin/AdminFormControls";
import { formatCnpj, formatCpf, formatNumber, formatPhone } from "@/shared/domain/formatters";
import { notifyPhoneCallIntegration, phoneContactLinks } from "../domain/order-contact-actions";
import type { useOrderCompletion } from "../application/useOrderCompletion";

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
        className={`${actionClass} border-[#0057e7]/25 bg-white text-[#0057e7] hover:bg-[#eef5ff]`}
      >
        <Phone size={14} />
        <span className="hidden md:inline md:text-xs">Ligar</span>
      </a>
    ) : (
      <button type="button" disabled aria-label="Telefone não disponível" title="Telefone não disponível" className={`${actionClass} cursor-not-allowed border-[#0d1b2e]/10 bg-white text-[#94a0b0] opacity-50`}>
        <Phone size={14} />
        <span className="hidden md:inline md:text-xs">Ligar</span>
      </button>
    )}

    {whatsappContact.whatsapp ? (
      <a
        href={whatsappContact.whatsapp}
        target="_blank"
        rel="noreferrer"
        aria-label="Abrir WhatsApp do cliente"
        title="Abrir WhatsApp do cliente"
        className={`${actionClass} border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50`}
      >
        <MessageCircle size={14} />
        <span className="hidden md:inline md:text-xs">WhatsApp</span>
      </a>
    ) : (
      <button type="button" disabled aria-label="WhatsApp não disponível" title="WhatsApp não disponível" className={`${actionClass} cursor-not-allowed border-[#0d1b2e]/10 bg-white text-[#94a0b0] opacity-50`}>
        <MessageCircle size={14} />
        <span className="hidden md:inline md:text-xs">WhatsApp</span>
      </button>
    )}

    {mapUrl ? (
      <a
        href={mapUrl}
        target="_blank"
        rel="noreferrer"
        aria-label="Abrir endereço do cliente no mapa"
        title={address?.shared_map_url ? "Abrir localização enviada pelo cliente" : "Abrir endereço no mapa"}
        className={`${actionClass} border-[#0057e7]/25 bg-white text-[#0057e7] hover:bg-[#eef5ff]`}
      >
        <MapPin size={14} />
        <span className="hidden md:inline md:text-xs">Mapa</span>
      </a>
    ) : (
      <button type="button" disabled aria-label="Endereço não disponível" title="Endereço não disponível" className={`${actionClass} cursor-not-allowed border-[#0d1b2e]/10 bg-white text-[#94a0b0] opacity-50`}>
        <MapPin size={14} />
        <span className="hidden md:inline md:text-xs">Mapa</span>
      </button>
    )}
  </>;
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0">
    <p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</p>
    <p className="mt-1 break-words text-sm font-semibold text-[#0d1b2e]">{value || "—"}</p>
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

  useEffect(() => {
    if (completion.open) setAddressExpanded(false);
  }, [completion.open, detail?.id]);

  if (!completion.open || !detail) return null;

  const customer = detail.customer as any;
  const address = customerAddress(customer);
  const isCompany = customer?.customer_type === "PJ";

  return <div
    className="fixed inset-0 z-[80] flex min-w-0 items-center justify-center bg-black/55 p-2 sm:p-4"
    role="dialog"
    aria-modal="true"
    onMouseDown={event => {
      if (event.target === event.currentTarget && !saving) completion.setOpen(false);
    }}
  >
    <div className="flex max-h-[94vh] w-full min-w-0 max-w-4xl flex-col overflow-hidden rounded-2xl bg-[#f8fafc] shadow-2xl">
      <div className="flex min-w-0 items-start justify-between gap-4 border-b border-[#0d1b2e]/10 bg-white px-4 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0057e7]">Ordens de Serviço</p>
          <h2 className="mt-1 break-words text-xl font-black leading-tight text-[#0d1b2e]">Concluir OS {detail.os_number || ""}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#5a6a82]">Revise o cliente, os itens utilizados e os valores antes de confirmar a conclusão financeira.</p>
        </div>
        <AdminIconButton ariaLabel="Fechar" onClick={() => completion.setOpen(false)} disabled={saving} variant="ghost" className="shrink-0"><X size={18} /></AdminIconButton>
      </div>

      <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-5">
        <div className="mx-auto min-w-0 max-w-3xl space-y-4">
          <Section
            title="Cliente"
            actions={<CustomerQuickActions customer={customer} orderId={detail.id} />}
          >
            <div className="min-w-0 space-y-4">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <InfoItem label="Nome" value={customerName(customer)} />
                <InfoItem label={isCompany ? "CNPJ" : "CPF"} value={customerDocument(customer)} />
                <InfoItem label="Telefone" value={formatPhone(customer?.phone) || "—"} />
                <InfoItem label="WhatsApp" value={formatPhone(customer?.whatsapp) || "—"} />
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={() => setAddressExpanded(value => !value)}
                className="text-xs font-bold text-[#0057e7] hover:underline disabled:opacity-50"
              >
                {addressExpanded ? "Ocultar endereço ▲" : "Mostrar endereço ▼"}
              </button>

              {addressExpanded && (
                <div className="border-t border-[#0d1b2e]/8 pt-4">
                  {address ? (
                    <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <InfoItem label="CEP" value={address.zip_code || "—"} />
                      <InfoItem label="Rua" value={address.street || "—"} />
                      <InfoItem label="Número" value={address.number || "—"} />
                      <InfoItem label="Complemento" value={address.complement || "—"} />
                      <InfoItem label="Bairro" value={address.neighborhood || "—"} />
                      <InfoItem label="Cidade" value={address.city || "—"} />
                      <InfoItem label="Estado" value={address.state || "—"} />
                    </div>
                  ) : <p className="text-sm text-[#5a6a82]">Nenhum endereço cadastrado para este cliente.</p>}
                </div>
              )}
            </div>
          </Section>

          <Section title="Serviço e peças">
            <div className="min-w-0 space-y-4">
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <InfoItem label="Serviço" value={detail.general_service?.name || "—"} />
                <div className="min-w-0 sm:text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Valor do serviço</p>
                  <p className="mt-1 text-base font-black text-[#0d1b2e]">{formatCurrency(completion.servicePrice)}</p>
                </div>
              </div>

              <div className="border-t border-[#0d1b2e]/8 pt-4">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.12em] text-[#0d1b2e]">Peças utilizadas</p>
                    <p className="mt-0.5 text-xs text-[#5a6a82]">Itens aprovados e registrados na solução.</p>
                  </div>
                  <strong className="shrink-0 text-sm text-[#0057e7]">{formatCurrency(completion.partsTotal)}</strong>
                </div>

                {usedItems.length === 0 ? (
                  <p className="mt-4 text-sm text-[#5a6a82]">Nenhuma peça utilizada.</p>
                ) : (
                  <div className="mt-4 divide-y divide-[#0d1b2e]/8 border-y border-[#0d1b2e]/8">
                    {usedItems.map(item => {
                      const quantity = Number(item.quantity || 0);
                      const unitPrice = Number(item.unit_sale_price || item.inventory_item?.sale_price || 0);
                      const total = Number(item.total_sale_price ?? quantity * unitPrice);
                      return <div key={item.id} className="grid min-w-0 gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-5">
                        <div className="min-w-0">
                          <p className="break-words text-sm font-semibold text-[#0d1b2e]">{item.inventory_item?.name || "Peça sem nome"}</p>
                          {item.inventory_item?.sku && <p className="mt-0.5 text-[10px] text-[#5a6a82]">SKU: {item.inventory_item.sku}</p>}
                        </div>
                        <span className="text-xs font-semibold text-[#5a6a82]">{formatNumber(quantity)} {item.inventory_item?.unit || "un"}</span>
                        <strong className="text-sm text-[#0d1b2e]">{formatCurrency(total)}</strong>
                      </div>;
                    })}
                  </div>
                )}
              </div>

              <div className="flex min-w-0 items-center justify-between gap-4 border-t border-[#0d1b2e]/8 pt-4">
                <strong className="text-sm text-[#0d1b2e]">Subtotal</strong>
                <strong className="text-lg font-black text-[#0057e7]">{formatCurrency(completion.subtotal)}</strong>
              </div>
            </div>
          </Section>

          <Section title="Desconto">
            <div className="min-w-0">
              <FDecimalInput
                label="Desconto (%)"
                value={completion.discount}
                decimalPlaces={2}
                onChange={(event: any) => completion.setDiscount(event.target.value)}
                hint={`Máximo permitido: ${formatNumber(completion.maxDiscount, { maximumFractionDigits: 2 })}%`}
                error={completion.discountPercentage > completion.maxDiscount ? "O desconto ultrapassa o máximo permitido." : undefined}
              />
            </div>
          </Section>

          <Section title="Resumo da conclusão">
            <div className="min-w-0 space-y-3">
              <div className="flex min-w-0 items-center justify-between gap-4 text-sm">
                <span className="text-[#5a6a82]">Subtotal</span>
                <strong className="text-[#0d1b2e]">{formatCurrency(completion.subtotal)}</strong>
              </div>
              <div className="flex min-w-0 items-center justify-between gap-4 text-sm">
                <span className="text-[#5a6a82]">Desconto ({formatNumber(completion.discountPercentage, { maximumFractionDigits: 2 })}%)</span>
                <strong className="text-[#0d1b2e]">- {formatCurrency(completion.discountAmount)}</strong>
              </div>
              <div className="flex min-w-0 flex-col gap-1 border-t border-[#0d1b2e]/8 pt-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
                <strong className="text-sm text-[#0d1b2e]">Valor final da OS</strong>
                <strong className="break-words text-2xl font-black text-[#0057e7] sm:text-right">{formatCurrency(completion.finalTotal)}</strong>
              </div>
            </div>
          </Section>
        </div>
      </div>

      <div className="flex min-w-0 flex-wrap justify-end gap-3 border-t border-[#0d1b2e]/10 bg-white px-4 py-4 sm:px-6">
        <BtnSecondary onClick={() => completion.setOpen(false)} disabled={saving}>Cancelar</BtnSecondary>
        <BtnPrimary
          onClick={() => void completion.submit()}
          disabled={completion.discountPercentage > completion.maxDiscount}
          loading={saving}
          loadingText="Concluindo..."
        >
          Confirmar conclusão
        </BtnPrimary>
      </div>
    </div>
  </div>;
}
