import { systemErrorMessage } from "@/shared/domain/error-message";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Eye, FileText, Upload } from "lucide-react";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import { FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { FinanceTableSurface } from "./FinanceTableSurface";
import type { FinancialAttachment, FinancialAttachmentType } from "../domain/finance.types";
import {
  archiveFinancialAttachment,
  createFinancialAttachmentSignedUrl,
  listFinancialAttachments,
  uploadFinancialAttachment,
} from "../infrastructure/finance-documents.repository";

const TYPE_OPTIONS = [
  { value: "invoice", label: "Nota fiscal" },
  { value: "boleto", label: "Boleto" },
  { value: "receipt", label: "Recibo" },
  { value: "proof", label: "Comprovante" },
  { value: "other", label: "Outro" },
];

function typeLabel(value: string) {
  return TYPE_OPTIONS.find(item => item.value === value)?.label || "Documento";
}

function formatSize(bytes: number | null) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FinanceDocumentsPanel({ entryId }: { entryId: string }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const organizationKey = activeOrganizationId || "none";
  const canView = hasPermission("finance.documents.view");
  const canManage = hasPermission("finance.documents.manage");
  const [type, setType] = useState<FinancialAttachmentType>("other");
  const [file, setFile] = useState<File | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<FinancialAttachment | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [archiveReasonError, setArchiveReasonError] = useState("");

  const query = useQuery({
    queryKey: queryKeys.finance.attachments(organizationKey, entryId),
    enabled: Boolean(canView && activeOrganizationId && entryId),
    queryFn: () => listFinancialAttachments(organizationId, entryId),
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.attachments(organizationKey, entryId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.finance.entry(organizationKey, entryId) }),
    ]);
  };

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Selecione um arquivo.");
      return uploadFinancialAttachment(organizationId, entryId, file, type);
    },
    onSuccess: async () => {
      setFile(null);
      setType("other");
      const input = document.getElementById(`finance-file-${entryId}`) as HTMLInputElement | null;
      if (input) input.value = "";
      await invalidate();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => archiveFinancialAttachment(organizationId, id, reason),
    onSuccess: async () => {
      setArchiveTarget(null);
      setArchiveReason("");
      await invalidate();
    },
  });

  if (!canView) return null;
  const attachments = query.data || [];
  const error = query.error || uploadMutation.error || archiveMutation.error;
  const errorText = error ? systemErrorMessage(error) : "";

  const view = async (attachment: FinancialAttachment) => {
    try {
      setArchiveReasonError("");
      const url = await createFinancialAttachmentSignedUrl(attachment.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      notifyAdmin(systemErrorMessage(caught, "Não foi possível abrir o documento."), "error");
    }
  };

  const archive = async () => {
    if (!archiveTarget) return;
    if (!archiveReason.trim()) { setArchiveReasonError("Informe o motivo do arquivamento."); return; }
    try {
      setArchiveReasonError("");
      await archiveMutation.mutateAsync({ id: archiveTarget.id, reason: archiveReason.trim() });
    } catch {
      // Error is rendered from the mutation.
    }
  };

  return <div className="space-y-3">
    {canManage && <div className="grid w-full grid-cols-1 items-end gap-2 border-b border-border pb-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,0.8fr)]">
      <div className="w-full min-w-0"><FSelect label="Tipo" value={type} options={TYPE_OPTIONS} onChange={(event: any) => setType(event.target.value as FinancialAttachmentType)} /></div>
      <div className="w-full min-w-0">
        <label htmlFor={"finance-file-" + entryId} className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Arquivo</label>
        <input id={"finance-file-" + entryId} type="file" onChange={event => setFile(event.target.files?.[0] || null)} className="block h-[42px] w-full min-w-0 cursor-pointer rounded-lg border border-border bg-muted/55 text-sm text-muted-foreground file:mr-3 file:h-full file:border-0 file:border-r file:border-border file:bg-muted file:px-3 file:text-xs file:font-bold file:text-foreground hover:border-primary/40" />
      </div>
      <AdminButton className="h-[42px] w-full" onClick={() => uploadMutation.mutate()} loading={uploadMutation.isPending} loadingText="Enviando..." disabled={!file}><Upload size={15} /> Enviar</AdminButton>
    </div>}

    {errorText && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{errorText}</p>}
    {query.isLoading ? <LoadingState text="Carregando documentos..." /> : <FinanceTableSurface>
        <table className="w-full min-w-[650px] text-sm">
          <thead className="border-b border-border bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 text-left">Documento</th>
              <th scope="col" className="px-4 py-3 text-left">Tipo</th>
              <th scope="col" className="px-4 py-3 text-left">Data</th>
              <th scope="col" className="px-4 py-3 text-right">Tamanho</th>
              <th scope="col" className="px-4 py-3 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {attachments.length === 0
              ? <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground"><FileText size={19} className="mx-auto mb-2" />Nenhum documento anexado.</td></tr>
              : attachments.map(item => <tr key={item.id} className="transition-colors hover:bg-muted/30">
                <td className="max-w-[280px] truncate px-4 py-3 font-semibold text-foreground" title={item.file_name}>{item.file_name}</td>
                <td className="px-4 py-3 text-muted-foreground">{typeLabel(item.attachment_type)}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{new Date(item.created_at).toLocaleString("pt-BR")}</td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{formatSize(item.size_bytes)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <AdminButton size="sm" variant="secondary" onClick={() => void view(item)}><Eye size={14} /> Abrir</AdminButton>
                    {canManage && <AdminButton size="sm" variant="danger" onClick={() => { setArchiveTarget(item); setArchiveReason(""); setArchiveReasonError(""); }}><Archive size={14} /> Arquivar</AdminButton>}
                  </div>
                </td>
              </tr>)}
          </tbody>
        </table>
    </FinanceTableSurface>}

    {archiveTarget && <AdminDialog open onClose={() => { if (!archiveMutation.isPending) setArchiveTarget(null); }} title="Arquivar documento" description={archiveTarget.file_name} className="max-w-lg" footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={() => setArchiveTarget(null)} disabled={archiveMutation.isPending}>Cancelar</AdminButton><AdminButton variant="danger" onClick={() => void archive()} loading={archiveMutation.isPending} loadingText="Arquivando...">Arquivar</AdminButton></div>}><FTextarea label="Motivo" required error={archiveReasonError} value={archiveReason} onChange={(event: any) => { setArchiveReasonError(""); setArchiveReason(event.target.value); }} rows={3} /></AdminDialog>}
  </div>;
}
