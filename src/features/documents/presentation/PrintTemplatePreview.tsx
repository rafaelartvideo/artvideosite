import React from "react";
import type { PrintLayoutSettings } from "../domain/print-template";

export type PrintTemplatePreviewMargins = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type PrintTemplatePreviewSection = {
  key: string;
  label: string;
  columns?: 1 | 2 | 3;
  fields: Array<{ key: string; label: string }>;
};

export type PrintTemplatePreviewProps = {
  documentName: string;
  documentType: string;
  orientation: "portrait" | "landscape";
  margins: PrintTemplatePreviewMargins;
  show_logo: boolean;
  show_company_info: boolean;
  show_page_number: boolean;
  show_printed_at: boolean;
  header_text?: string | null;
  footer_text?: string | null;
  sections: PrintTemplatePreviewSection[];
  selectedFields: Set<string>;
  compact?: boolean;
  layout: PrintLayoutSettings;
};

const COMPANY_MOCK = {
  name: "ArtVideo",
  subtitle: "Assistência Técnica",
  phone: "Telefone: (00) 0000-0000",
  email: "E-mail: contato@empresa.com.br",
};

const PREVIEW_FIELD_VALUES: Record<string, string> = {
  "customer.full_name": "João da Silva",
  "customer.customer_type": "Pessoa física",
  "customer.document": "000.000.000-00",
  "customer.cnpj": "00.000.000/0000-00",
  "customer.legal_name": "João da Silva ME",
  "customer.trade_name": "ArtVideo Soluções",
  "customer.state_registration": "ISENTO",
  "customer.phone": "(00) 99999-9999",
  "customer.whatsapp": "(00) 99999-9999",
  "customer.email": "joao@email.com.br",
  "customer.birth_date": "10/05/1988",
  "address.full": "Rua das Flores, 123 - Centro - São Paulo/SP",
  "address.zip_code": "01000-000",
  "address.street": "Rua das Flores",
  "address.number": "123",
  "address.complement": "Bloco A",
  "address.neighborhood": "Centro",
  "address.city": "São Paulo",
  "address.state": "SP",
  "address.reference": "Próximo ao mercado",
  "order.os_number": "OS-2026-001",
  "order.external_os_number": "EXT-0152",
  "order.order_type": "Assistência técnica",
  "order.origin": "Atendimento online",
  "order.priority": "Alta",
  "order.status": "Em andamento",
  "order.situation": "Aguardando aprovação",
  "order.created_at": "01/09/2026 09:30",
  "order.updated_at": "02/09/2026 12:00",
  "service.name": "Reparo de notebook",
  "service.type": "Manutenção",
  "service.general_services": "Formatação, diagnóstico, exame de hardware",
  "service.scheduled_at": "03/09/2026 14:00",
  "service.started_at": "02/09/2026 15:45",
  "equipment.type": "Notebook",
  "equipment.brand": "Dell",
  "equipment.model": "Inspiron 15",
  "equipment.serial_number": "ABCD123456",
  "equipment.accessories": "Carregador, mouse e mochila",
  "equipment.condition": "Bom estado",
  "responsibility.assigned_to": "Maria Souza",
  "responsibility.technician": "Carlos Nogueira",
  "responsibility.completed_by": "Maria Souza",
  "sla.situation_started_at": "02/09/2026 09:00",
  "sla.situation_hours": "24 horas",
  "sla.service_type_forecast_days": "3 dias",
  "sla.solved_at": "03/09/2026 11:20",
  "sla.completed_at": "03/09/2026 17:00",
  "resolution.diagnosis": "Problema de inicialização por falha de hardware e instabilidade de sistema.",
  "resolution.solution": "Substituição da placa-mãe, revisão de conectores e reinstalação do sistema operacional.",
  "resolution.solution_images": "Imagens anexadas",
  "financial.service_price": "R$ 420,00",
  "financial.parts_total": "R$ 180,00",
  "financial.subtotal": "R$ 600,00",
  "financial.discount_percentage": "10%",
  "financial.discount_amount": "R$ 60,00",
  "financial.final_total": "R$ 540,00",
  "signatures.customer_name": "João da Silva",
  "signatures.customer_document": "000.000.000-00",
  "signatures.date": "03/09/2026",
};

const documentTypeLabels: Record<string, string> = {
  OS: "Ordem de Serviço",
  ENTRADA: "Entrada",
  SAIDA_DEVOLUCAO: "Saída / Devolução",
  LAUDO: "Laudo técnico",
  COMPROVANTE: "Comprovante",
  CUSTOM: "Personalizado",
};

const mmToPx = (mm: number) => Math.round(mm * 3.78);

const getPreviewValue = (fieldKey: string) => PREVIEW_FIELD_VALUES[fieldKey] || "Exemplo";

const formatDocumentType = (type: string) => documentTypeLabels[type] || type || "Documento";

const formatPrintedAt = () => new Date().toLocaleString("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function PrintTemplatePreview({
  documentName,
  documentType,
  orientation,
  margins,
  show_logo,
  show_company_info,
  show_page_number,
  show_printed_at,
  header_text,
  footer_text,
  sections,
  selectedFields,
  compact = false,
  layout,
}: PrintTemplatePreviewProps) {
  const widthMm = orientation === "portrait" ? 210 : 297;
  const heightMm = orientation === "portrait" ? 297 : 210;
  const pagePadding = {
    top: mmToPx(margins.top),
    right: mmToPx(margins.right),
    bottom: mmToPx(margins.bottom),
    left: mmToPx(margins.left),
  };

  const visibleSections = sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field) => selectedFields.has(field.key)),
    }))
    .filter((section) => section.fields.length > 0);

  const headerTitle = documentName?.trim() || "Documento";
  const docTypeLabel = formatDocumentType(documentType);

  return (
    <div className="print-preview-shell">
      <style>{`
        .print-preview-shell {
          display: flex;
          justify-content: center;
          width: 100%;
          padding: 8px 0;
        }
        .print-a4-sheet {
          width: min(100%, ${compact ? "420px" : "760px"});
          max-width: 100%;
          aspect-ratio: ${widthMm} / ${heightMm};
          background: #ffffff;
          border: 1px solid rgba(15, 23, 42, 0.08);
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08);
          border-radius: 10px;
          overflow: hidden;
        }
        .print-a4-content {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #fff;
          color: #0f172a;
          box-sizing: border-box;
          font-family: ${layout.font_family}, sans-serif;
          font-size: ${layout.body_font_size}px;
          line-height: ${layout.line_height};
        }
        .print-header {
          border-bottom: 1px solid rgba(148, 163, 184, 0.55);
          padding-bottom: 10px;
          margin-bottom: 14px;
        }
        .print-header-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .print-logo {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 52px;
          height: 52px;
          border-radius: 8px;
          background: rgba(148, 163, 184, 0.12);
          color: #475569;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: 1px solid rgba(148, 163, 184, 0.2);
        }
        .print-company-meta {
          flex: 1;
          min-width: 0;
        }
        .print-company-name {
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: 0.02em;
        }
        .print-company-subtitle {
          font-size: 11px;
          color: #475569;
        }
        .print-company-contact {
          font-size: 10px;
          line-height: 1.5;
          color: #64748b;
        }
        .print-document-tag {
          text-align: right;
          font-size: 11px;
          font-weight: 700;
          color: #475569;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .print-document-name {
          margin-top: 6px;
          font-size: 16px;
          font-weight: 800;
          color: #0f172a;
        }
        .print-header-text {
          margin-top: 8px;
          font-size: 10px;
          color: #475569;
        }
        .print-body {
          flex: 1;
          min-height: 0;
        }
        .print-section-list {
          display: flex;
          flex-direction: column;
          gap: ${layout.section_spacing}px;
        }
        .print-section {
          border: ${layout.show_section_borders ? "1px solid rgba(148, 163, 184, 0.35)" : "0"};
          border-radius: ${layout.section_style === "boxed" ? "8px" : "0"};
          background: ${layout.section_style === "boxed" ? "rgba(248, 250, 252, 0.7)" : "#fff"};
          padding: ${layout.section_style === "boxed" ? "8px 10px 10px" : "8px 0"};
          break-inside: avoid;
          page-break-inside: avoid;
        }
        .print-section-title {
          margin: 0 0 8px;
          font-size: ${layout.section_title_font_size}px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #334155;
        }
        .print-field-grid {
          display: grid;
          gap: ${layout.field_spacing}px;
        }
        .print-field {
          padding: ${layout.section_style === "table" ? "6px 4px" : "6px 8px"};
          border-radius: ${layout.section_style === "boxed" ? "6px" : "0"};
          background: ${layout.section_style === "boxed" ? "rgba(255, 255, 255, 0.7)" : "#fff"};
          border: ${layout.show_field_borders ? "1px solid rgba(148, 163, 184, 0.3)" : layout.section_style === "table" ? "0 0 1px 0 solid rgba(148, 163, 184, 0.3)" : "0"};
          border-bottom: ${layout.section_style === "table" && !layout.show_field_borders ? "1px solid rgba(148, 163, 184, 0.3)" : undefined};
          min-width: 0;
        }
        .print-field-label {
          display: block;
          font-size: ${layout.label_font_size}px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #64748b;
          margin-bottom: 3px;
        }
        .print-field-value {
          display: block;
          font-size: ${layout.body_font_size}px;
          color: #0f172a;
          line-height: 1.4;
          word-break: break-word;
        }
        .print-footer {
          margin-top: 12px;
          border-top: 1px solid rgba(148, 163, 184, 0.55);
          padding-top: 8px;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          font-size: 9px;
          color: #64748b;
        }
        .print-footer-text {
          flex: 1;
          min-width: 0;
          word-break: break-word;
        }
        .print-footer-meta {
          white-space: nowrap;
          text-align: right;
        }
        @media print {
          .print-preview-shell {
            padding: 0;
          }
          .print-a4-sheet {
            width: 100%;
            max-width: none;
            box-shadow: none;
            border: none;
            border-radius: 0;
          }
          .print-section {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
      <div
        className="print-a4-sheet"
        style={{
          transform: compact ? "scale(1)" : undefined,
        }}
      >
        <div
          className="print-a4-content"
          style={{
            paddingTop: pagePadding.top,
            paddingRight: pagePadding.right,
            paddingBottom: pagePadding.bottom,
            paddingLeft: pagePadding.left,
          }}
        >
          <header className="print-header">
            <div className="print-header-row">
              <div className="print-logo" style={{ opacity: show_logo ? 1 : 0.35 }}>
                {show_logo ? "Logo" : ""}
              </div>

              {show_company_info && (
                <div className="print-company-meta">
                  <div className="print-company-name">{COMPANY_MOCK.name}</div>
                  <div className="print-company-subtitle">{COMPANY_MOCK.subtitle}</div>
                  <div className="print-company-contact">
                    {COMPANY_MOCK.phone}
                    <br />
                    {COMPANY_MOCK.email}
                  </div>
                </div>
              )}

              <div className="print-document-tag">{docTypeLabel}</div>
            </div>

            <div className="print-document-name">{headerTitle}</div>
            {header_text && <div className="print-header-text">{header_text}</div>}
          </header>

          <main className="print-body">
            <div className="print-section-list">
              {visibleSections.map((section) => (
                <section key={section.key} className="print-section">
                  <h3 className="print-section-title">{section.label}</h3>
                  <div
                    className="print-field-grid"
                    style={{ gridTemplateColumns: `repeat(${section.columns || 2}, minmax(0, 1fr))` }}
                  >
                    {section.fields.map((field) => (
                      <div key={field.key} className="print-field">
                        <span className="print-field-label">{field.label}</span>
                        <span className="print-field-value">{getPreviewValue(field.key)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </main>

          <footer className="print-footer">
            <div className="print-footer-text">{footer_text || ""}</div>
            <div className="print-footer-meta">
              {show_printed_at && <div>Impresso em {formatPrintedAt()}</div>}
              {show_page_number && <div>Página 1</div>}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
