import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, Image as ImageIcon, LoaderCircle } from "lucide-react";
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

function EvidencePhoto({ url, label }: { url: string; label: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return <div className="relative h-32 w-full overflow-hidden rounded-md bg-muted/30">
    {!loaded && !failed && <div role="status" aria-label={`Carregando foto de ${label.toLowerCase()}`}
      className="absolute inset-0 flex items-center justify-center gap-2 bg-muted/50 text-muted-foreground">
      <LoaderCircle size={19} className="animate-spin" aria-hidden="true" />
      <span className="text-[11px] font-medium">Carregando foto...</span>
    </div>}
    {failed ? <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
      <FileText size={20} /> Prévia indisponível
    </div> : <img src={url} alt={label}
      loading="eager" onLoad={() => setLoaded(true)} onError={() => setFailed(true)}
      className={`h-full w-full object-contain transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`} />}
  </div>;
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

  if (!canView) return null;
  if (query.isPending) return <section aria-label={label} aria-busy="true"
    className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
    <h3 className="text-sm font-bold text-foreground">{label}</h3>
    <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
      Carregando {label.toLowerCase()}...
    </div>
    <div className="h-32 animate-pulse rounded-lg bg-muted/60" aria-hidden="true" />
  </section>;
  if (query.isError) return <p role="alert" className="text-xs text-destructive">
    Não foi possível carregar {label.toLowerCase()}.
  </p>;
  if (!query.data?.length) return null;

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
            ? <EvidencePhoto url={url} label={label} />
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
          ? <a key={`${document.id}-${url}`} href={url} target="_blank" rel="noopener noreferrer"
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
