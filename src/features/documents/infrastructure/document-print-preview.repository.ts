import { supabase } from "@/lib/supabase";
import type { DocumentSignatureSnapshot } from "../domain/document-signature";

export type CanonicalPrintPreview = {
  preview_url: string;
  pdf_hash: string;
  snapshot_hash: string;
};

export async function createCanonicalPrintPreview(input: {
  organizationId: string;
  serviceOrderId: string;
  printTemplateId: string;
  snapshot: DocumentSignatureSnapshot;
}): Promise<CanonicalPrintPreview> {
  const { data, error } = await supabase.functions.invoke("document-print-preview", {
    body: {
      organization_id: input.organizationId,
      service_order_id: input.serviceOrderId,
      print_template_id: input.printTemplateId,
      snapshot: input.snapshot,
    },
  });
  if (error) throw error;
  if (!data?.success || !data?.preview_url) throw new Error(String(data?.error || "Não foi possível gerar o PDF de impressão."));
  return {
    preview_url: String(data.preview_url),
    pdf_hash: String(data.pdf_hash || ""),
    snapshot_hash: String(data.snapshot_hash || ""),
  };
}
