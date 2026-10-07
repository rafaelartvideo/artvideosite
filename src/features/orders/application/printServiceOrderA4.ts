import { getOrderChecklist } from "@/features/checklists/infrastructure/checklists.repository";
import type { PrintTemplate } from "@/features/documents/domain/print-template";
import { openPrintWindow, renderOrderPrintDocument } from "@/features/documents/domain/order-print-document";
import { listPrintTemplates, loadPrintTemplateEditorValue } from "@/features/documents/infrastructure/documents.repository";
import { getCompanyPrintContext } from "@/features/settings/infrastructure/company-settings.repository";
import { resolveMediaStorageUrl } from "@/shared/infrastructure/media.repository";
import {
  getFullServiceOrder,
  listServiceOrderStatusHistory,
  listServiceOrderTechnicalValues,
  listServiceOrderUsedItems,
} from "../infrastructure/orders.repository";
import { listServiceOrderPartRequests } from "../infrastructure/orders-part-requests.repository";

function selectA4OrderTemplate(templates: PrintTemplate[]) {
  const active = templates.filter(template => template.is_active && template.paper_size === "A4");
  return active.find(template => template.document_type === "OS") || active[0] || null;
}

export async function printServiceOrderA4({
  order,
  printedBy,
  canPrintChecklists,
}: {
  order: any;
  printedBy?: string | null;
  canPrintChecklists: boolean;
}) {
  const popup = openPrintWindow();
  if (!popup) throw new Error("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");

  try {
    if (!order?.id || !order?.organization_id) throw new Error("A OS não possui empresa definida.");

    const templateResult = await listPrintTemplates();
    if (templateResult.error) throw templateResult.error;
    const template = selectA4OrderTemplate((templateResult.data || []) as PrintTemplate[]);
    if (!template) throw new Error("Nenhum modelo A4 ativo foi configurado em Operação > Documentos.");

    const [
      configuredTemplate,
      fullOrderResult,
      historyResult,
      usedItemsResult,
      technicalValuesResult,
      partRequestsResult,
      company,
    ] = await Promise.all([
      loadPrintTemplateEditorValue(template),
      getFullServiceOrder(order.id),
      listServiceOrderStatusHistory(order.id),
      listServiceOrderUsedItems(order.id),
      listServiceOrderTechnicalValues(order.id),
      listServiceOrderPartRequests(order.id),
      getCompanyPrintContext(order.organization_id),
    ]);

    if (fullOrderResult.error) throw fullOrderResult.error;
    if (historyResult.error) throw historyResult.error;
    if (usedItemsResult.error) throw usedItemsResult.error;
    if (technicalValuesResult.error) throw technicalValuesResult.error;
    if (partRequestsResult.error) throw partRequestsResult.error;

    const needsChecklist = [...configuredTemplate.selectedFields].some(key => key.startsWith("checklists."));
    if (needsChecklist && !canPrintChecklists) {
      throw new Error("Você não possui permissão para imprimir os checklists desta OS.");
    }

    const checklist = needsChecklist ? await getOrderChecklist(order.id) : null;
    const checklistMedia = (checklist?.stages || [])
      .filter(stage => configuredTemplate.selectedFields.has("checklists." + stage.stage_type_snapshot))
      .flatMap(stage => stage.items.flatMap(item => item.media.flatMap(link => link.media ? [link] : [])));
    const checklistPhotoUrls = Object.fromEntries(await Promise.all(
      checklistMedia.map(async link => [
        link.media_id,
        await resolveMediaStorageUrl(link.media!.bucket_id, link.media!.storage_path),
      ] as const),
    ));

    renderOrderPrintDocument(popup, configuredTemplate, {
      order: {
        ...order,
        ...(fullOrderResult.data || {}),
        technical_values: technicalValuesResult.data || [],
      },
      checklist,
      checklistPhotoUrls,
      usedItems: usedItemsResult.data || [],
      partRequests: partRequestsResult.data || [],
      history: historyResult.data || [],
      printedBy,
      company,
    });
  } catch (error) {
    popup.close();
    throw error;
  }
}
