import { DollarSign } from "lucide-react";
import type { Address } from "@/lib/address";
import {
  formatCnpj,
  formatCpf,
  formatPhone,
  Section,
  StatusBadge,
} from "@/shared/admin/AdminPrimitives";
import {
  getPriorityLabel,
  getResponsibleName,
  type ServiceOrderWithRelations,
} from "./OrderFormControls";
import {
  OrderImageThumb,
  type OrderImage,
} from "./OrderImages";

export function InfoRow({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return value ? (
    <div>
      <p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-0.5">{label}</p>
      <p className="text-sm font-medium text-[#0d1b2e]">{value}</p>
    </div>
  ) : null;
}

export function OrderDetailsContent({
  detail,
  images,
  history,
  formatDate,
  formatState,
  getSla,
  onViewImage,
}: {
  detail: any;
  images: OrderImage[];
  history: any[];
  formatDate: (value?: string | null, time?: boolean) => string;
  formatState: (state: unknown) => string;
  getSla: (
    serviceTypeId?: string,
    situationId?: string,
    relatedSituation?: any,
  ) => { hours: number; isDefault: boolean } | null;
  onViewImage: (image: OrderImage) => void;
}) {
  const orderImages = images;
  const detailHistory = history;
  const fmtDate = formatDate;
  const stateLabel = formatState;
  const getSlaForOrder = getSla;
  const setViewImage = onViewImage;
  return (
    <>
<div className="flex flex-wrap gap-2 items-center">
                <StatusBadge status={(detail.order_status as any)?.name || "—"} color={(detail.order_status as any)?.color} />
                {(detail.situation as any)?.name && <StatusBadge status={(detail.situation as any).name} color={(detail.situation as any)?.color} />}
              </div>
              <Section title="Cliente">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Nome" value={(detail.customer as any)?.full_name} />
                  {(detail.customer as any)?.customer_type === "PJ" ? <>
                    <InfoRow label="Tipo" value="Pessoa Jurídica" />
                    <InfoRow label="CNPJ" value={formatCnpj((detail.customer as any)?.cnpj || "")} />
                    <InfoRow label="Razão social" value={(detail.customer as any)?.legal_name} />
                  </> : <InfoRow label="CPF" value={(detail.customer as any)?.document ? formatCpf((detail.customer as any).document) : null} />}
                  <InfoRow label="WhatsApp" value={formatPhone((detail.customer as any)?.whatsapp)} />
                  <InfoRow label="Telefone" value={formatPhone((detail.customer as any)?.phone)} />
                  <InfoRow label="E-mail" value={(detail.customer as any)?.email} />
                </div>
              </Section>
              <Section title="Dados de endereço">
                <div className="grid sm:grid-cols-2 gap-3">
                  {(["zip_code", "street", "number", "complement", "neighborhood", "city", "state"] as const).map((key) => {
                    const labels: Record<string, string> = { zip_code: "CEP", street: "Rua", number: "Número", complement: "Complemento", neighborhood: "Bairro", city: "Cidade", state: "Estado" };
                    const address = ((detail.customer as any)?.addresses || []).find((item: Address) => item.is_default) || (detail.customer as any)?.addresses?.[0];
                    return address?.[key] ? <InfoRow key={key} label={labels[key]} value={address[key]} /> : null;
                  })}
                </div>
              </Section>
              <Section title="Equipamento">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Equipamento" value={(detail.equipment_type as any)?.name || undefined} />
                  <InfoRow label="Marca" value={(detail.equipment_brand as any)?.name || undefined} />
                  <InfoRow label="Modelo" value={(detail.equipment_model as any)?.name || detail.model || undefined} />
                  <InfoRow label="Versão" value={detail.model || undefined} />
                  <InfoRow label="Número de série" value={detail.serial_number || undefined} />
                  <InfoRow label="Lacre" value={detail.accessories || undefined} />
                  <InfoRow label="Garantia" value={detail.equipment_condition || undefined} />
                </div>
              </Section>
              <Section title="Local do atendimento">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Tipo da OS" value={detail.order_type === "external" ? "Externa" : "Interna"} />
                  {detail.order_type === "external" && <InfoRow label="Origem do endereço" value={detail.service_address_source === "customer" ? "Endereço cadastrado do cliente" : "Endereço informado para esta OS"} />}
                  {detail.order_type === "external" && <InfoRow label="CEP" value={detail.service_zip_code} />}
                  {detail.order_type === "external" && <InfoRow label="Estado" value={stateLabel(detail.service_state)} />}
                  {detail.order_type === "external" && <InfoRow label="Cidade" value={detail.service_city} />}
                  {detail.order_type === "external" && <InfoRow label="Bairro" value={detail.service_neighborhood} />}
                  {detail.order_type === "external" && <InfoRow label="Rua" value={detail.service_street} />}
                  {detail.order_type === "external" && <InfoRow label="Número" value={detail.service_number} />}
                  {detail.order_type === "external" && <InfoRow label="Complemento" value={detail.service_complement} />}
                </div>
              </Section>
              <Section title="Informações da OS">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Nº da OS" value={detail.os_number} />
                  <InfoRow label="OS Externa" value={detail.external_os_number?.trim() || "Não informada"} />
                  <InfoRow label="Tipo de atendimento" value={(detail.service_type as any)?.title} />
                  <InfoRow label="Serviço" value={(detail.general_service as any)?.name || (detail.service as any)?.title} />
                  <InfoRow label="Responsável" value={getResponsibleName(detail as ServiceOrderWithRelations)} />
                  <InfoRow label="Vendedores" value={(detail.seller_links || []).length ? (detail.seller_links || []).map((link: any) => link.employee?.full_name).filter(Boolean).join(", ") : (detail.seller as any)?.full_name || "Nenhum vendedor atribuído"} />
                  <InfoRow label="Técnicos" value={(detail.technician_links || []).length ? (detail.technician_links || []).map((link: any) => link.employee?.full_name).filter(Boolean).join(", ") : (detail.technician as any)?.full_name || "Nenhum técnico atribuído"} />
                  <InfoRow label="Status" value={(detail.order_status as any)?.name} />
                  <InfoRow label="Situação" value={(detail.situation as any)?.name} />
                  <InfoRow label="Prioridade" value={getPriorityLabel(detail.priority) || undefined} />
                  <InfoRow label="Data de início" value={fmtDate(detail.created_at)} />
                  <InfoRow label="Data agendada" value={fmtDate(detail.scheduled_at)} />
                  <InfoRow label="Data de conclusão" value={fmtDate(detail.completed_at)} />
                  <InfoRow label="Horas da situação" value={(detail.situation as any)?.hours == null ? null : `${(detail.situation as any).hours} hora(s)`} />
                  {(() => { const sla = getSlaForOrder(detail.service_type_id, detail.situation_id, detail.situation); return sla ? <InfoRow label="SLA da situação" value={`${sla.hours} hora(s) (${sla.isDefault ? "Padrão" : "Personalizado"})`} /> : null; })()}
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[#0057e7]/20 bg-[#f0f6ff] px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0057e7]/10 text-[#0057e7]"><DollarSign size={16} /></div>
                    <span className="font-bold text-[#0d1b2e]">Valor da OS</span>
                  </div>
                  <span className="font-black text-[#0057e7]">{detail.estimated_price == null ? "Valor não informado" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(detail.estimated_price))}</span>
                </div>
              </Section>
              {orderImages.length > 0 && <Section title="Imagens da OS"><div className="flex flex-wrap gap-3">{orderImages.map(image => <OrderImageThumb key={image.key} image={image} onView={() => setViewImage(image)} />)}</div></Section>}
              <Section title="Histórico">
                {detailHistory.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhum registro de alteração.</p> : (
                  <div className="space-y-2">
                    {detailHistory.map((h: any) => (
                      <div key={h.id} className="flex gap-3 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#0057e7] mt-1.5 flex-shrink-0" />
                        <div>
                          <span className="font-bold text-[#0d1b2e]">{(h.order_status as any)?.name || "Status alterado"}</span>
                          {h.notes && <span className="text-[#5a6a82] ml-1">— {h.notes}</span>}
                          <p className="text-[#5a6a82] text-[10px]">{fmtDate(h.created_at, true)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
              {detail.internal_notes && <Section title="Observações internas"><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.internal_notes}</p></Section>}
              {detail.customer_notes && <Section title="Descrição do problema"><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.customer_notes}</p></Section>}
    </>
  );
}
