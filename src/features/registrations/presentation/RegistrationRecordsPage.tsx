import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, File as FileIcon, Image as ImageIcon, Paperclip, Plus, X } from "lucide-react";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { cn } from "@/shared/domain/formatters";
import { AdminCard, AdminDialog, AdminIconButton, AdminPage, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import type { Registration } from "../infrastructure/registrations.repository";
import {
  addRegistrationRecordAttachments,
  createRegistrationRecord,
  getRegistrationRecordAttachmentUrl,
  listRegistrationRecords,
  type RegistrationRecord,
  type RegistrationRecordAttachment,
} from "../infrastructure/registration-records.repository";

const MAX_ATTACHMENTS = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFileSize(value: number | null) {
  if (!value || value <= 0) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageAttachment(attachment: RegistrationRecordAttachment) {
  return String(attachment.mime_type || "").toLowerCase().startsWith("image/");
}

export function RegistrationRecordsPage({
  registration,
  organizationId,
  canCreate,
  onClose,
}: {
  registration: Registration;
  organizationId: string;
  canCreate: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.registrations.records(organizationId, registration.id);
  const recordsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await listRegistrationRecords(organizationId, registration.id);
      if (result.error) throw result.error;
      return result.data;
    },
  });
  const records = recordsQuery.data ?? [];
  const loading = recordsQuery.isPending && !recordsQuery.data;
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [authorFilter, setAuthorFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!recordsQuery.error) return;
    notifyAdmin(`Erro ao carregar registros: ${recordsQuery.error instanceof Error ? recordsQuery.error.message : String(recordsQuery.error)}`, "error");
  }, [recordsQuery.error]);

  const authorOptions = useMemo(() => {
    const byId = new Map<string, string>();
    records.forEach(record => {
      const key = record.created_by || "system";
      if (!byId.has(key)) byId.set(key, record.author_name || (key === "system" ? "Sistema" : "Usuário"));
    });
    return Array.from(byId.entries()).map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [records]);

  const filtered = useMemo(() => {
    const result = records.filter(record => {
      const authorKey = record.created_by || "system";
      if (authorFilter && authorKey !== authorFilter) return false;
      if (dateFilter && record.created_at.slice(0, 10) !== dateFilter) return false;
      return true;
    });
    return [...result].sort((a, b) => {
      const difference = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return sort === "asc" ? difference : -difference;
    });
  }, [records, authorFilter, dateFilter, sort]);

  const resetComposer = () => {
    setText("");
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const next = Array.from(incoming);
    const oversized = next.find(file => file.size > MAX_FILE_SIZE);
    if (oversized) {
      notifyAdmin(`O arquivo ${oversized.name} ultrapassa o limite de 20 MB.`, "error");
      return;
    }

    setFiles(current => {
      const merged = [...current];
      for (const file of next) {
        const duplicate = merged.some(item => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified);
        if (!duplicate) merged.push(file);
      }
      if (merged.length > MAX_ATTACHMENTS) {
        notifyAdmin(`É possível anexar no máximo ${MAX_ATTACHMENTS} arquivos por registro.`, "error");
        return merged.slice(0, MAX_ATTACHMENTS);
      }
      return merged;
    });
  };

  const removeFile = (index: number) => setFiles(current => current.filter((_, currentIndex) => currentIndex !== index));

  const openAttachment = async (attachment: RegistrationRecordAttachment, download = false) => {
    const popup = download ? null : window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    const result = await getRegistrationRecordAttachmentUrl(attachment, download);
    if (result.error || !result.url) {
      popup?.close();
      notifyAdmin(`Erro ao abrir anexo: ${result.error?.message || "URL não retornada."}`, "error");
      return;
    }

    if (download) {
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.download = attachment.file_name;
      anchor.rel = "noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      return;
    }

    if (popup) popup.location.href = result.url;
    else window.open(result.url, "_blank", "noopener,noreferrer");
  };

  const submit = async () => {
    const content = text.trim();
    if (!content) return;
    if (content.length > 2000) {
      notifyAdmin("O registro deve ter no máximo 2000 caracteres.", "error");
      return;
    }
    setSaving(true);
    const result = await createRegistrationRecord(organizationId, registration.id, content);
    if (result.error || !result.data) {
      setSaving(false);
      notifyAdmin(`Erro ao adicionar registro: ${result.error?.message || "Registro não retornado após salvar."}`, "error");
      return;
    }

    let attachmentError: Error | null = null;
    if (files.length) {
      const attachmentResult = await addRegistrationRecordAttachments(
        organizationId,
        registration.id,
        result.data.id,
        files,
      );
      attachmentError = attachmentResult.error;
    }

    queryClient.setQueryData<RegistrationRecord[]>(queryKey, current => [
      result.data!,
      ...(current || []).filter(record => record.id !== result.data!.id),
    ]);
    await queryClient.invalidateQueries({ queryKey });
    setSaving(false);
    resetComposer();
    setModalOpen(false);
    if (attachmentError) {
      notifyAdmin(`Registro adicionado, mas nem todos os anexos foram enviados: ${attachmentError.message}`, "error");
    } else {
      notifyAdmin(files.length ? "Registro e anexos adicionados." : "Registro adicionado.");
    }
  };

  return <>
    <AdminPage open onClose={onClose} breadcrumb={`Cadastros > ${registration.name} > Registros`} title="Registros" subtitle="Linha do tempo de observações permanentes deste cadastro" maxW="max-w-4xl">
      <div className="space-y-4 p-4 sm:p-5">
        <AdminCard className="bg-[#f8fafc] p-3 shadow-none">
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-bold uppercase text-[#5a6a82]">Usuário</label>
              <AdminSelect
                value={authorFilter}
                onValueChange={setAuthorFilter}
                ariaLabel="Usuário"
                className="min-w-0 text-xs font-medium normal-case"
                options={[{ value: "", label: "Todos os usuários" }, ...authorOptions]}
              />
            </div>
            <label className="min-w-0 text-[10px] font-bold uppercase text-[#5a6a82]">Data
              <input type="date" value={dateFilter} onChange={event => setDateFilter(event.target.value)} className={cn(INPUT, "mt-1 min-w-0 text-xs font-medium normal-case")} />
            </label>
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-bold uppercase text-[#5a6a82]">Ordenação</label>
              <AdminSelect
                value={sort}
                onValueChange={value => setSort(value as "desc" | "asc")}
                ariaLabel="Ordenação"
                className="min-w-0 text-xs font-medium normal-case"
                options={[
                  { value: "desc", label: "Mais recentes primeiro" },
                  { value: "asc", label: "Mais antigos primeiro" },
                ]}
              />
            </div>
            {(authorFilter || dateFilter) && <button type="button" onClick={() => { setAuthorFilter(""); setDateFilter(""); }} className="h-10 self-end rounded-lg border border-red-200 px-3 text-xs font-bold text-red-600 hover:bg-red-50">Limpar</button>}
          </div>
        </AdminCard>

        {loading ? <LoadingState text="Carregando registros..." /> : filtered.length === 0 ? <div className="rounded-xl border border-dashed border-[#0d1b2e]/15 bg-white p-8 text-center text-sm text-[#5a6a82]">Nenhum registro encontrado.</div> : <div className="space-y-3">{filtered.map(record => <AdminCard key={record.id} className="min-w-0 border-[#0057e7]/15 p-4 shadow-none">
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-black text-[#0d1b2e]">{record.author_name}</p>
              <p className="mt-0.5 break-words text-[10px] font-bold uppercase text-[#5a6a82]">{record.title || "Registro"}</p>
            </div>
            <span className="shrink-0 text-[10px] text-[#5a6a82]">{formatDateTime(record.created_at)}</span>
          </div>
          <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-[#0d1b2e]">{record.content}</p>
          {record.attachments.length > 0 && <div className="mt-4 border-t border-[#0d1b2e]/8 pt-3">
            <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-[#0057e7]">
              <Paperclip size={13} /> {record.attachments.length} {record.attachments.length === 1 ? "anexo" : "anexos"}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">{record.attachments.map(attachment => {
              const AttachmentIcon = isImageAttachment(attachment) ? ImageIcon : FileIcon;
              return <div key={attachment.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-[#0057e7]/15 bg-[#f8fbff] p-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#eaf2ff] text-[#0057e7]"><AttachmentIcon size={15} /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-[#0d1b2e]" title={attachment.file_name}>{attachment.file_name}</div>
                  {attachment.file_size != null && <div className="mt-0.5 text-[10px] text-[#7a8aa0]">{formatFileSize(attachment.file_size)}</div>}
                </div>
                <AdminIconButton ariaLabel={`Abrir ${attachment.file_name}`} title="Abrir anexo" onClick={() => void openAttachment(attachment)} className="shrink-0"><ExternalLink size={14} /></AdminIconButton>
                <AdminIconButton ariaLabel={`Baixar ${attachment.file_name}`} title="Baixar anexo" onClick={() => void openAttachment(attachment, true)} className="shrink-0"><Download size={14} /></AdminIconButton>
              </div>;
            })}</div>
          </div>}
        </AdminCard>)}</div>}
      </div>

      <div className="sticky bottom-0 flex items-center gap-2 border-t border-[#0d1b2e]/8 bg-white/95 px-4 py-4 backdrop-blur sm:justify-between sm:px-5">
        <BtnSecondary onClick={onClose} className="min-w-0 flex-1 sm:flex-none">Voltar</BtnSecondary>
        {canCreate && <BtnPrimary onClick={() => { resetComposer(); setModalOpen(true); }} className="min-w-0 flex-1 sm:flex-none"><Plus size={17} /> Novo registro</BtnPrimary>}
      </div>
    </AdminPage>

    <AdminDialog
      open={modalOpen}
      onClose={() => { if (!saving) { resetComposer(); setModalOpen(false); } }}
      title="Novo registro"
      description="Adicione uma observação permanente e, se necessário, anexe arquivos ou imagens."
      className="max-w-xl"
      footer={<div className="flex w-full gap-2 sm:justify-end sm:gap-3"><BtnSecondary onClick={() => { resetComposer(); setModalOpen(false); }} disabled={saving} className="min-w-0 flex-1 sm:flex-none">Cancelar</BtnSecondary><BtnPrimary onClick={() => void submit()} disabled={!text.trim() || saving} loading={saving} loadingText="Registrando..." className="min-w-0 flex-1 sm:flex-none">Registrar</BtnPrimary></div>}
    >
      <textarea autoFocus value={text} onChange={event => setText(event.target.value)} maxLength={2000} rows={6} placeholder="Escreva o que precisa ficar registrado neste cadastro..." className={cn(INPUT, "h-auto min-w-0 resize-y text-sm")} />
      <div className="mt-2 flex justify-between gap-3 text-[10px] text-[#5a6a82]"><span>O registro não poderá ser editado ou excluído.</span><span className="shrink-0">{text.length}/2000</span></div>

      <div className="mt-4 rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-black text-[#0d1b2e]">Anexos</div>
            <div className="mt-0.5 text-[10px] text-[#6b7c93]">Arquivos ou imagens • até 10 arquivos • 20 MB por arquivo</div>
          </div>
          <BtnSecondary type="button" onClick={() => fileInputRef.current?.click()} disabled={saving || files.length >= MAX_ATTACHMENTS} className="border-[#0057e7]/30 text-[#0057e7] hover:bg-[#eef5ff]">
            <Paperclip size={15} /> Anexar arquivos
          </BtnSecondary>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={event => {
              addFiles(event.currentTarget.files);
              event.currentTarget.value = "";
            }}
          />
        </div>

        {files.length > 0 && <div className="mt-3 space-y-2">{files.map((file, index) => <div key={`${file.name}-${file.size}-${file.lastModified}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-[#0d1b2e]/8 bg-white px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-[#0d1b2e]" title={file.name}>{file.name}</div>
            <div className="mt-0.5 text-[10px] text-[#7a8aa0]">{formatFileSize(file.size)}</div>
          </div>
          <AdminIconButton ariaLabel={`Remover ${file.name}`} title="Remover anexo da seleção" onClick={() => removeFile(index)} variant="danger" disabled={saving}><X size={14} /></AdminIconButton>
        </div>)}</div>}
      </div>
    </AdminDialog>
  </>;
}
