import { MessageCircle, Phone } from "lucide-react";
import type { Address } from "@/lib/address";
import { formatCnpj, formatCpf, formatPhone } from "@/shared/domain/formatters";
import { Section } from "@/shared/ui/admin/AdminLayout";
import { notifyPhoneCallIntegration, phoneContactLinks } from "../domain/order-contact-actions";
import {
  getPriorityLabel,
  getResponsibleName,
  type ServiceOrderWithRelations,
} from "./OrderFormControls";

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
  formatDate,
  formatState,
  getSla,
  hasPermission,
}: {
  detail: any;
  formatDate: (value?: string | null, time?: boolean) => string;
  formatState: (state: unknown) => string;
  getSla: (
    serviceTypeId?: string,
    situationId?: string,
    relatedSituation?: any,
  ) => { hours: number; isDefault: boolean } | null;
  hasPermission: (permission: string) => boolean;
}) {
  const fmtDate = formatDate;
  const stateLabel = formatState;
  const getSlaForOrder = getSla;
  const customer = detail.customer as any;
  const callContact = phoneContactLinks(customer?.phone || customer?.whatsapp);
  const whatsappContact = phoneContactLinks(customer?.whatsapp || customer?.phone);
  const contactActionClass = "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold normal-case tracking-normal transition-colors";
  return (
    <>
              {hasPermission("orders.section.customer") && (<Section
                title="Cliente"
                actions={<>
                  {callContact.tel ? (
                    <a
                      href={callContact.tel}
                      data-phone-number={`+${callContact.phone}`}
                      data-service-order-id={detail.id}
                      onClick={() => notifyPhoneCallIntegration(callContact.phone, detail.id)}
                      className={`${contactActionClass} border-[#0057e7]/20 bg-white text-[#0057e7] hover:bg-[#eef5ff]`}
                      title="Abrir no telefone ou aplicativo de telefonia"
                    >
                      <Phone size={13} /> Ligar
                    </a>
                  ) : (
                    <button type="button" disabled className={`${contactActionClass} cursor-not-allowed border-[#0d1b2e]/10 text-[#94a0b0] opacity-60`}>
                      <Phone size={13} /> Ligar
                    </button>
                  )}
                  {whatsappContact.whatsapp ? (
                    <a
                      href={whatsappContact.whatsapp}
                      target="_blank"
                      rel="noreferrer"
                      data-phone-number={`+${whatsappContact.phone}`}
                      className={`${contactActionClass} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                      title="Abrir conversa no WhatsApp"
                    >
                      <MessageCircle size={13} /> WhatsApp
                    </a>
                  ) : (
                    <button type="button" disabled className={`${contactActionClass} cursor-not-allowed border-[#0d1b2e]/10 text-[#94a0b0] opacity-60`}>
                      <MessageCircle size={13} /> WhatsApp
                    </button>
                  )}
                </>}
              >
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
              </Section>)}
              {hasPermission("orders.section.address") && (<Section title="Dados de endereço">
                <div className="grid sm:grid-cols-2 gap-3">
                  {(["zip_code", "street", "number", "complement", "neighborhood", "city", "state"] as const).map((key) => {
                    const labels: Record<string, string> = { zip_code: "CEP", street: "Rua", number: "Número", complement: "Complemento", neighborhood: "Bairro", city: "Cidade", state: "Estado" };
                    const address = ((detail.customer as any)?.addresses || []).find((item: Address) => item.is_default) || (detail.customer as any)?.addresses?.[0];
                    return address?.[key] ? <InfoRow key={key} label={labels[key]} value={address[key]} /> : null;
                  })}
                </div>
              </Section>)}
              {hasPermission("orders.section.equipment") && (<Section title="Equipamento">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Equipamento" value={(detail.equipment_type as any)?.name || undefined} />
                  <InfoRow label="Marca" value={(detail.equipment_brand as any)?.name || undefined} />
                  <InfoRow label="Modelo" value={(detail.equipment_model as any)?.name || detail.model || undefined} />
                  <InfoRow label="Versão" value={detail.model || undefined} />
                  <InfoRow label="Número de série" value={detail.serial_number || undefined} />
                  <InfoRow label="Lacre" value={detail.accessories || undefined} />
                  <InfoRow label="Garantia" value={detail.equipment_condition || undefined} />
                </div>
              </Section>)}
              {hasPermission("orders.section.service_location") && (<Section title="Local do atendimento">
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
              </Section>)}
              {hasPermission("orders.section.information") && (<Section title="Informações da OS">
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
                  <InfoRow label="Concluída em" value={detail.completed_at ? fmtDate(detail.completed_at, true) : null} />
                  {detail.completed_at && <InfoRow label="Concluída por" value={detail.completed_by_profile?.full_name || "Nome não informado"} />}
                  <InfoRow label="Horas da situação" value={(detail.situation as any)?.hours == null ? null : `${(detail.situation as any).hours} hora(s)`} />
                  {(() => { const sla = getSlaForOrder(detail.service_type_id, detail.situation_id, detail.situation); return sla ? <InfoRow label="SLA da situação" value={`${sla.hours} hora(s) (${sla.isDefault ? "Padrão" : "Personalizado"})`} /> : null; })()}
                </div>
              </Section>)}
              {detail.internal_notes && hasPermission("orders.section.internal_notes") && (<Section title="Observações internas"><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.internal_notes}</p></Section>)}
              {detail.customer_notes && hasPermission("orders.section.problem") && (<Section title="Descrição do problema"><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.customer_notes}</p></Section>)}
    </>
  );
}
