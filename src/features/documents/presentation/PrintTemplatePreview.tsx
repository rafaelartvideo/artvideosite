import { useEffect, useMemo, useRef, useState } from "react";
import { buildOrderPrintDocumentHtml, type PrintOrderContext } from "../domain/order-print-document";
import type { ChecklistStageType, OrderChecklistStage } from "@/features/checklists/domain/checklist";
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
  checklist: {
    id: "preview-checklist", organization_id: "preview", service_order_id: "preview",
    equipment_type_id: null, source_profile_id: null, profile_name_snapshot: "Inspeção do equipamento",
    profile_version_snapshot: 1, status: "in_progress", created_at: "2026-09-15T09:00:00",
    completed_by: null, completed_at: null,
    stages: (["entry", "diagnosis", "qc", "custom"] as ChecklistStageType[]).map((type, index): OrderChecklistStage => ({
      id: type, organization_id: "preview", checklist_id: "preview-checklist",
      stage_code_snapshot: type, stage_type_snapshot: type,
      name_snapshot: ["Entrada", "Diagnóstico", "Qualidade / saída", "Conferência adicional"][index],
      situation_id_snapshot: null, situation_name_snapshot: null,
      block_situation_exit_snapshot: false, block_resolution_snapshot: false, block_completion_snapshot: false,
      sort_order: index, status: "completed", completed_by: null, completed_at: null,
      reopened_by: null, reopened_at: null,
      items: [{
        id: type + "-item", organization_id: "preview", stage_id: type, source_kind: "profile",
        title_snapshot: ["Estado do gabinete", "Teste da fonte", "Teste de funcionamento", "Conferência dos acessórios"][index],
        description_snapshot: null, response_type_snapshot: "conformity", allow_na_snapshot: true,
        is_required_snapshot: true, photo_requirement_snapshot: "none", observation_requirement_snapshot: "optional",
        sort_order: 0, response_code: "ok", response_text: null, response_number: null,
        observation: index === 0 ? "Sem avarias aparentes." : null,
        answered_by: null, answered_at: null, media: [],
      }],
    })),
  },
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const pageWidth = (template.orientation === "landscape" ? 297 : 210) * 96 / 25.4;
  const pageHeight = (template.orientation === "landscape" ? 210 : 297) * 96 / 25.4;
  const scale = Math.min(1, (availableWidth || pageWidth) / pageWidth);

  useEffect(() => setContentHeight(0), [html]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => setAvailableWidth(entry.contentRect.width));
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex w-full justify-center py-2">
      <div ref={containerRef} className="relative w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
        style={{ maxWidth: compact ? (template.orientation === "landscape" ? 620 : 440) : pageWidth, height: Math.max(pageHeight, contentHeight) * scale }}>
        <iframe
          title="Pré-visualização do documento"
          srcDoc={html}
          onLoad={event => setContentHeight(event.currentTarget.contentDocument?.body.scrollHeight || pageHeight)}
          className="absolute left-0 top-0 border-0 bg-white"
          style={{ width: pageWidth, height: Math.max(pageHeight, contentHeight), transform: `scale(${scale})`, transformOrigin: "top left" }}
        />
      </div>
    </div>
  );
}
