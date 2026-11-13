import { useQuery } from "@tanstack/react-query";
import { FileText, Image as ImageIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  createFinancialAttachmentSignedUrl,
  listFinancialAttachments,
} from "../infrastructure/finance-documents.repository";
import type { FinancialAttachment } from "../domain/finance.types";

type EvidenceKind = "payment_proof" | "delivery_evidence";
type EvidenceWithUrl = { document: FinancialAttachment; url: string | null };

function matchesKind(attachment: FinancialAttachment, kind: EvidenceKind) {
  if (attachment.source_document_kind === kind) return true;
  // Compatibilidade com comprovantes vinculados antes da coluna de classificação.
  return kind === "payment_proof" && attachment.source_document_kind == null
    && Boolean(attachment.source_media_id) && attachment.attachment_type === "proof";
}

export function FinanceOrderEvidenceGallery({
  entryId,
  kind,
}: {
  entryId: string;
  kind: EvidenceKind;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canView = hasPermission("finance.documents.view") || hasPermission("finance.documents.manage");
  const organizationId = activeOrganizationId || "";
  const label = kind === "payment_proof" ? "Comprovante de pagamento" : "Evidência de entrega";

  // Carrega apenas ao abrir o detalhe, nunca para cada linha da tabela financeira.
  const query = useQuery({
    queryKey: ["finance", organizationId, entryId, "order-evidence", kind],
    enabled: Boolean(canView && organizationId && entryId),
    staleTime: 60_000,
    queryFn: async (): Promise<EvidenceWithUrl[]> => {
      const attachments = await listFinancialAttachments(organizationId, entryId);
      const evidence = attachments.filter(attachment => matchesKind(attachment, kind));
      return Promise.all(evidence.map(async document => {
        try {
          const url = await createFinancialAttachmentSignedUrl(
            document.storage_path, document.storage_bucket || "financial-documents",
          );
          return { document, url };
        } catch {
          return { document, url: null };
        }
      }));
    },
  });

  if (!canView || !query.data?.length) {
    if (query.isError) return <p role="alert" className="text-xs text-destructive">
      Não foi possível carregar {label.toLowerCase()}.
    </p>;
    return null;
  }

  return <section aria-label={label} className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
    <div className="flex items-center gap-2">
      <ImageIcon size={17} className="text-primary" />
      <h3 className="text-sm font-bold text-foreground">{label}</h3>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {query.data.map(({ document, url }) => {
        const isImage = document.mime_type?.startsWith("image/")
          || /\.(?:jpe?g|png|webp)$/i.test(document.file_name);
        const body = <>
          {isImage && url
            ? <img src={url} alt={label} loading="lazy" className="h-32 w-full rounded-md object-contain bg-muted/30" />
            : <div className="flex h-32 items-center justify-center rounded-md bg-muted/40">
              <FileText size={32} className="text-muted-foreground" />
            </div>}
          <span className="block truncate text-xs font-semibold text-foreground" title={document.file_name}>
            {document.file_name}
          </span>
          <span className="block text-[11px] text-muted-foreground">
            {url ? "Abrir arquivo" : "Arquivo indisponível no momento"}
          </span>
        </>;
        return url
          ? <a key={document.id} href={url} target="_blank" rel="noopener noreferrer"
              className="min-w-0 space-y-1.5 rounded-lg border border-border p-2 transition-colors hover:border-primary/40">
              {body}
            </a>
          : <div key={document.id} className="min-w-0 space-y-1.5 rounded-lg border border-border p-2 opacity-60">
              {body}
            </div>;
      })}
    </div>
  </section>;
}
