import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, MapPin, MessageCircle, Phone, X } from "lucide-react";
import { getAddressMapUrl, type Address } from "@/lib/address";
import { AdminIconButton, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { FDecimalInput } from "@/shared/ui/admin/AdminFormControls";
import { formatCnpj, formatCpf, formatNumber, formatPhone } from "@/shared/domain/formatters";
import { notifyPhoneCallIntegration, phoneContactLinks } from "../domain/order-contact-actions";
import type { useOrderCompletion } from "../application/useOrderCompletion";

function addressText(address?: Address | null) {
  if (!address) return "Endereço não informado";
  return [
    address.street,
    address.number,
    address.complement,
    address.neighborhood,
    address.city,
    address.state,
    address.zip_code,
  ].filter(Boolean).join(", ") || "Endereço não informado";
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
  const [addressesOpen, setAddressesOpen] = useState(false);

  useEffect(() => {
    if (completion.open) setAddressesOpen(false);
  }, [completion.open, detail?.id]);

  if (!completion.open || !detail) return null;

  const customer = detail.customer as any;
  const addresses = (Array.isArray(customer?.addresses) ? customer.addresses : []) as Address[];
  const defaultAddress = addresses.find(address => address.is_default) || addresses[0];
  const mapUrl = getAddressMapUrl(defaultAddress);
  const callContact = phoneContactLinks(customer?.phone || customer?.whatsapp);
  const whatsappContact = phoneContactLinks(customer?.whatsapp || customer?.phone);
  const isCompany = customer?.customer_type === "PJ";
  const customerName = customer?.full_name || customer?.trade_name || customer?.legal_name || "—";
  const customerDocument = isCompany
    ? formatCnpj(customer?.cnpj || customer?.document || "")
    : formatCpf(customer?.document || "");
  const actionClass = "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition-colors";
  const compactActionClass = `${actionClass} w-8 px-0 sm:w-auto sm:px-2.5`;
  const actionLabelClass = "hidden sm:inline";

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-3 sm:p-4" role="dialog" aria-modal="true" onMouseDown={event => { if (event.target === event.currentTarget && !saving) completion.setOpen(false); }}>
    <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-[#0d1b2e]/10 px-4 py-4 sm:px-5">
        <div className="min-w-0"><h2 className="text-lg font-black text-[#0d1b2e]">Concluir OS</h2><p className="mt-0.5 text-sm text-[#5a6a82]">Revise o cliente e confirme os valores finais do atendimento.</p></div>
        <AdminIconButton ariaLabel="Fechar" onClick={() => completion.setOpen(false)} disabled={saving} variant="ghost"><X size={18} /></AdminIconButton>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-5">
        <div className="divide-y divide-[#0d1b2e]/10">
          <section className="py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.12em] text-[#0057e7]">Cliente</h3>
                <p className="mt-0.5 text-xs text-[#5a6a82]">Dados de contato vinculados à OS.</p>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {callContact.tel ? <a href={callContact.tel} data-phone-number={`+${callContact.phone}`} data-service-order-id={detail.id} onClick={() => notifyPhoneCallIntegration(callContact.phone, detail.id)} aria-label="Ligar para o cliente" title="Ligar para o cliente" className={`${compactActionClass} border-[#0057e7]/20 bg-white text-[#0057e7] hover:bg-[#eef5ff]`}><Phone size={14} /><span className={actionLabelClass}>Ligar</span></a> : <button type="button" disabled aria-label="Telefone não disponível" title="Telefone não disponível" className={`${compactActionClass} cursor-not-allowed border-[#0d1b2e]/10 text-[#94a0b0] opacity-60`}><Phone size={14} /><span className={actionLabelClass}>Ligar</span></button>}
                {whatsappContact.whatsapp ? <a href={whatsappContact.whatsapp} target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp do cliente" title="Abrir WhatsApp do cliente" className={`${compactActionClass} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}><MessageCircle size={14} /><span className={actionLabelClass}>WhatsApp</span></a> : <button type="button" disabled aria-label="WhatsApp não disponível" title="WhatsApp não disponível" className={`${compactActionClass} cursor-not-allowed border-[#0d1b2e]/10 text-[#94a0b0] opacity-60`}><MessageCircle size={14} /><span className={actionLabelClass}>WhatsApp</span></button>}
                {mapUrl ? <a href={mapUrl} target="_blank" rel="noreferrer" aria-label="Abrir endereço do cliente no mapa" title={defaultAddress?.shared_map_url ? "Abrir localização enviada pelo cliente" : "Abrir endereço no mapa"} className={`${compactActionClass} border-[#0057e7]/20 bg-white text-[#0057e7] hover:bg-[#eef5ff]`}><MapPin size={14} /><span className={actionLabelClass}>Mapa</span></a> : <button type="button" disabled aria-label="Endereço não disponível" title="Endereço não disponível" className={`${compactActionClass} cursor-not-allowed border-[#0d1b2e]/10 text-[#94a0b0] opacity-60`}><MapPin size={14} /><span className={actionLabelClass}>Mapa</span></button>}
                <button type="button" onClick={() => setAddressesOpen(value => !value)} aria-expanded={addressesOpen} className={`${actionClass} border-[#0d1b2e]/15 bg-white text-[#0d1b2e] hover:bg-[#f5f7fa]`}><span>Endereços</span>{addressesOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
              </div>
            </div>

            <div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2">
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Nome</p><p className="mt-1 break-words text-sm font-semibold text-[#0d1b2e]">{customerName}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">{isCompany ? "CNPJ" : "CPF"}</p><p className="mt-1 text-sm font-semibold text-[#0d1b2e]">{customerDocument || "—"}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Telefone</p><p className="mt-1 text-sm text-[#0d1b2e]">{formatPhone(customer?.phone) || "—"}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">WhatsApp</p><p className="mt-1 text-sm text-[#0d1b2e]">{formatPhone(customer?.whatsapp) || "—"}</p></div>
            </div>

            {addressesOpen && <div className="mt-4 border-t border-[#0d1b2e]/8 pt-3">
              {addresses.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhum endereço cadastrado para este cliente.</p> : <div className="divide-y divide-[#0d1b2e]/8">{addresses.map((address, index) => {
                const currentMapUrl = getAddressMapUrl(address);
                return <div key={(address as any).id || index} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><p className="text-xs font-bold text-[#0d1b2e]">Endereço {index + 1}</p>{address.is_default && <span className="rounded-full bg-[#eef5ff] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#0057e7]">Principal</span>}</div><p className="mt-1 break-words text-xs leading-relaxed text-[#5a6a82]">{addressText(address)}</p></div>
                  {currentMapUrl && <a href={currentMapUrl} target="_blank" rel="noreferrer" aria-label={`Abrir endereço ${index + 1} no mapa`} title="Abrir no mapa" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#0057e7]/20 bg-white text-[#0057e7] hover:bg-[#eef5ff]"><MapPin size={14} /></a>}
                </div>;
              })}</div>}
            </div>}
          </section>

          <section className="py-4">
            <div className="mb-3"><h3 className="text-xs font-black uppercase tracking-[0.12em] text-[#0057e7]">Resumo financeiro</h3><p className="mt-0.5 text-xs text-[#5a6a82]">Serviço e peças utilizadas nesta OS.</p></div>
            <div className="space-y-3">
              <div className="flex justify-between gap-3 text-sm"><span className="text-[#5a6a82]">Serviço: {detail.general_service?.name || "—"}</span><strong className="text-[#0d1b2e]">{formatCurrency(completion.servicePrice)}</strong></div>
              <div>
                <div className="flex justify-between gap-3 text-sm"><span className="text-[#5a6a82]">Peças utilizadas</span><strong className="text-[#0d1b2e]">{formatCurrency(completion.partsTotal)}</strong></div>
                {usedItems.length === 0 ? <p className="mt-2 text-xs text-[#5a6a82]">Nenhuma peça utilizada.</p> : <div className="mt-2 divide-y divide-[#0d1b2e]/8 border-y border-[#0d1b2e]/8">{usedItems.map(item => <div key={item.id} className="flex items-center justify-between gap-3 py-2 text-xs"><div className="min-w-0"><p className="truncate font-semibold text-[#0d1b2e]">{item.inventory_item?.name || "Peça sem nome"}</p>{item.inventory_item?.sku && <p className="text-[10px] text-[#5a6a82]">SKU: {item.inventory_item.sku}</p>}</div><strong className="shrink-0 text-[#0d1b2e]">{formatNumber(Number(item.quantity || 0))} {item.inventory_item?.unit || "un"}</strong></div>)}</div>}
              </div>
              <div className="flex justify-between border-t border-[#0d1b2e]/10 pt-3"><strong className="text-sm text-[#0d1b2e]">Subtotal</strong><strong className="text-[#0057e7]">{formatCurrency(completion.subtotal)}</strong></div>
            </div>
          </section>

          <section className="py-4">
            <div className="mb-3"><h3 className="text-xs font-black uppercase tracking-[0.12em] text-[#0057e7]">Desconto</h3><p className="mt-0.5 text-xs text-[#5a6a82]">Aplique o desconto permitido para o serviço.</p></div>
            <FDecimalInput label="Desconto (%)" value={completion.discount} decimalPlaces={2} onChange={(event: any) => completion.setDiscount(event.target.value)} hint={`Máximo permitido: ${formatNumber(completion.maxDiscount, { maximumFractionDigits: 2 })}%`} error={completion.discountPercentage > completion.maxDiscount ? "O desconto ultrapassa o máximo permitido." : undefined} />
          </section>

          <section className="py-4">
            <div className="flex justify-between gap-3 text-sm text-[#5a6a82]"><span>Desconto</span><span>- {formatCurrency(completion.discountAmount)}</span></div>
            <div className="mt-3 flex items-end justify-between gap-4 border-t border-[#0d1b2e]/10 pt-3"><strong className="text-sm text-[#0d1b2e]">Valor final</strong><strong className="text-2xl font-black text-[#0057e7]">{formatCurrency(completion.finalTotal)}</strong></div>
          </section>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-3 border-t border-[#0d1b2e]/10 px-4 py-4 sm:px-5"><BtnSecondary onClick={() => completion.setOpen(false)} disabled={saving}>Cancelar</BtnSecondary><BtnPrimary onClick={() => void completion.submit()} disabled={completion.discountPercentage > completion.maxDiscount} loading={saving} loadingText="Concluindo...">Confirmar conclusão</BtnPrimary></div>
    </div>
  </div>;
}
