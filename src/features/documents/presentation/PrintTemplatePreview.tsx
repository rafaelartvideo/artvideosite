import { useMemo } from "react";
import { buildOrderPrintDocumentHtml, type PrintOrderContext } from "../domain/order-print-document";
import type { PrintTemplateEditorValue } from "../domain/print-template";

const PREVIEW_CONTEXT: PrintOrderContext = {
  printedBy: "Maria Souza",
  order: {
    id: "preview",
    os_number: "OS-2026-001",
    external_os_number: "EXT-0152",
    order_type: "external",
    origin: "Atendimento online",
    priority: "Alta",
    created_at: "2026-09-01T09:30:00",
    updated_at: "2026-09-02T12:00:00",
    scheduled_at: "2026-09-03T14:00:00",
    situation_started_at: "2026-09-02T09:00:00",
    situation_sla_hours: 24,
    diagnosis: "Problema de inicialização por falha de hardware.",
    solution: "Substituição do componente e revisão geral do equipamento.",
    service_price: 420,
    parts_total: 180,
    subtotal: 600,
    discount_percentage: 10,
    discount_amount: 60,
    final_total: 540,
    customer_notes: "Equipamento não liga.",
    customer: {
      customer_type: "PF",
      full_name: "João da Silva",
      document: "00000000000",
      phone: "(00) 3333-4444",
      whatsapp: "(00) 99999-9999",
      email: "joao@email.com.br",
      addresses: [{
        is_default: true,
        zip_code: "01000-000",
        street: "Rua das Flores",
        number: "123",
        complement: "Bloco A",
        neighborhood: "Centro",
        city: "São Paulo",
        state: "SP",
      }],
    },
    service_type: { title: "Manutenção", forecast_days: 3 },
    general_service: { name: "Reparo de notebook" },
    equipment_type: { name: "Notebook" },
    equipment_brand: { name: "Dell" },
    equipment_model: { name: "Inspiron 15" },
    serial_number: "ABCD123456",
    accessories: "Carregador e mochila",
    equipment_condition: "Bom estado",
    order_status: { name: "Em andamento" },
    situation: { name: "Aguardando aprovação" },
    technician_links: [{ employee: { full_name: "Carlos Nogueira" } }],
  },
  usedItems: [{
    quantity: 1,
    unit_sale_price: 180,
    total_sale_price: 180,
    inventory_item: { name: "Peça de reposição" },
  }],
  partRequests: [{ status: "Aprovada", purpose: "Resolução", notes: "Peça necessária para o reparo." }],
  history: [],
};

export function PrintTemplatePreview({
  template,
  compact = false,
}: {
  template: PrintTemplateEditorValue;
  compact?: boolean;
}) {
  const html = useMemo(
    () => buildOrderPrintDocumentHtml(template, PREVIEW_CONTEXT),
    [template],
  );
  const aspectRatio = template.orientation === "landscape" ? "297 / 210" : "210 / 297";

  return (
    <div className="flex w-full justify-center py-2">
      <iframe
        title="Pré-visualização do documento"
        srcDoc={html}
        className="w-full rounded-lg border border-slate-200 bg-white shadow-lg"
        style={{
          aspectRatio,
          maxWidth: compact ? (template.orientation === "landscape" ? 620 : 440) : 900,
        }}
      />
    </div>
  );
}
