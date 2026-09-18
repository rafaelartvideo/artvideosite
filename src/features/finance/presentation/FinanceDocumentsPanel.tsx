import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Eye, FileText, Upload } from "lucide-react";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import { FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
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
  const canView = hasPermission("finance.documents.view") || hasPermission("finance.documents.manage");
  const canManage = hasPermission("finance.documents.manage");
  const [type, setType] = useState<FinancialAttachmentType>("other");
  const [file, setFile] = useState<File | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<FinancialAttachment | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [message, setMessage] = useState("");

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
  const errorText = message || (error instanceof Error ? error.message : "");

  const view = async (attachment: FinancialAttachment) => {
    try {
      setMessage("");
      const url = await createFinancialAttachmentSignedUrl(attachment.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : "Não foi possível abrir o documento.");
    }
  };

  const archive = async () => {
    if (!archiveTarget) return;
    if (!archiveReason.trim()) { setMessage("Informe o motivo do arquivamento."); return; }
    try {
      setMessage("");
      await archiveMutation.mutateAsync({ id: archiveTarget.id, reason: archiveReason.trim() });
    } catch {
      // Error is rendered from the mutation.
    }
  };

  return <AdminCard>
    <AdminCardHeader>
      <div><h3 className="text-sm font-black text-[#0d1b2e]">Documentos</h3><p className="mt-1 text-xs text-[#5a6a82]">Notas fiscais, boletos, recibos e comprovantes vinculados ao lançamento.</p></div>
    </AdminCardHeader>
    <AdminCardContent className="space-y-4">
      {canManage && <div className="grid gap-3 rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-3 sm:grid-cols-[180px_1fr_auto] sm:items-end">
        <FSelect label="Tipo" value={type} options={TYPE_OPTIONS} onChange={(event: any) => setType(event.target.value as FinancialAttachmentType)} />
        <div><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Arquivo</label><input id={`finance-file-${entryId}`} type="file" onChange={event => setFile(event.target.files?.[0] || null)} className="block w-full text-xs text-[#5a6a82] file:mr-3 file:rounded-lg file:border-0 file:bg-[#0057e7]/10 file:px-3 file:py-2 file:text-xs file:font-bold file:text-[#0057e7]" /></div>
        <AdminButton onClick={() => uploadMutation.mutate()} loading={uploadMutation.isPending} loadingText="Enviando..." disabled={!file}><Upload size={15} /> Enviar</AdminButton>
      </div>}

      {errorText && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorText}</div>}
      {query.isLoading ? <p className="text-sm text-[#5a6a82]">Carregando documentos...</p> : attachments.length === 0 ? <div className="flex items-center gap-2 rounded-xl border border-dashed border-[#0d1b2e]/15 p-4 text-sm text-[#5a6a82]"><FileText size={17} /> Nenhum documento anexado.</div> : <div className="space-y-2">
        {attachments.map(item => <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-[#0d1b2e]/8 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="truncate text-sm font-bold text-[#0d1b2e]">{item.file_name}</p><p className="mt-1 text-xs text-[#5a6a82]">{typeLabel(item.attachment_type)} · {formatSize(item.size_bytes)} · {new Date(item.created_at).toLocaleString("pt-BR")}</p></div>
          <div className="flex gap-2"><AdminButton size="sm" variant="secondary" onClick={() => void view(item)}><Eye size={14} /> Abrir</AdminButton>{canManage && <AdminButton size="sm" variant="danger" onClick={() => { setArchiveTarget(item); setArchiveReason(""); setMessage(""); }}><Archive size={14} /> Arquivar</AdminButton>}</div>
        </div>)}
      </div>}
    </AdminCardContent>

    {archiveTarget && <div className="fixed inset-0 z-[135] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"><div className="border-b px-5 py-4"><h2 className="text-lg font-black text-[#0d1b2e]">Arquivar documento</h2><p className="mt-1 text-xs text-[#5a6a82]">{archiveTarget.file_name}</p></div><div className="p-5"><FTextarea label="Motivo" required value={archiveReason} onChange={(event: any) => setArchiveReason(event.target.value)} rows={3} /></div><div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={() => setArchiveTarget(null)} disabled={archiveMutation.isPending}>Cancelar</AdminButton><AdminButton variant="danger" onClick={() => void archive()} loading={archiveMutation.isPending} loadingText="Arquivando...">Arquivar</AdminButton></div></div></div>}
  </AdminCard>;
}
