import { useRef, useState } from "react";
import {
  Camera,
  CheckCircle,
  Download,
  File,
  FileText,
  Paperclip,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminPage, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import type { OrderImage } from "./OrderImages";
import type { useOrderSituationDocuments } from "../application/useOrderSituationDocuments";
import {
  situationDocumentMedia,
  situationDocumentType,
  type OrderSituation,
  type OrderSituationDocument,
} from "../domain/order-situation-document";

type Controller = ReturnType<typeof useOrderSituationDocuments>;

function AttachmentCard({
  document,
  canRemove,
  removing,
  onView,
  onRemove,
}: {
  document: OrderSituationDocument;
  canRemove: boolean;
  removing: boolean;
  onView: (image: OrderImage) => void;
  onRemove: (document: OrderSituationDocument) => void;
}) {
  const { url, loading, error } = useMediaUrl(document.media_id);
  const media = situationDocumentMedia(document);
  const type = situationDocumentType(document);
  const name = media?.file_name || "Arquivo anexado";
  const isImage = Boolean(media?.mime_type?.startsWith("image/"));

  const openAttachment = () => {
    if (!url) return;
    if (isImage) onView({ key: document.id, mediaId: document.media_id, name });
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <article className="group relative flex min-h-28 flex-col justify-between rounded-xl border border-[#0d1b2e]/10 bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <button type="button" onClick={openAttachment} disabled={loading || !url} className="flex min-w-0 items-start gap-3 text-left disabled:cursor-not-allowed">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#edf3ff] text-[#0057e7]">
          {isImage ? <FileText size={19} /> : <File size={19} />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-black text-[#0d1b2e]">{name}</span>
          <span className="mt-1 block truncate text-[10px] font-bold uppercase tracking-wide text-[#0057e7]">{type?.name || "Sem tipo"}</span>
          <span className="mt-1 block text-[10px] text-[#7c899c]">{loading ? "Carregando..." : error ? "Arquivo indisponível" : "Clique para abrir"}</span>
        </span>
      </button>
      <div className="mt-3 flex items-center justify-between border-t border-[#0d1b2e]/7 pt-2">
        {url ? <a href={url} target="_blank" rel="noreferrer" download={name} className="inline-flex items-center gap-1 text-[10px] font-bold text-[#0057e7]"><Download size={12} /> Baixar</a> : <span />}
        {canRemove && <button type="button" disabled={removing} onClick={() => onRemove(document)} className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 disabled:opacity-50"><X size={12} /> Remover</button>}
      </div>
    </article>
  );
}

function NewAttachmentModal({
  situation,
  controller,
  onClose,
  onSuccess,
}: {
  situation: OrderSituation;
  controller: Controller;
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [attachmentTypeId, setAttachmentTypeId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const uploading = controller.uploadingSituationId === situation.id;

  const chooseFiles = (list: FileList | null) => {
    setFiles(Array.from(list || []));
    setError("");
  };

  const submit = async () => {
    setError("");
    if (!attachmentTypeId) {
      setError("Selecione o tipo de anexo.");
      return;
    }
    if (!files.length) {
      setError("Selecione um arquivo ou abra a câmera.");
      return;
    }
    try {
      const result = await controller.upload(situation, attachmentTypeId, files);
      onSuccess(`${result.count} ${result.count === 1 ? "arquivo anexado" : "arquivos anexados"} em ${result.situation}.`);
      onClose();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Não foi possível anexar.");
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true" aria-label="Novo anexo">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#0d1b2e]/10 px-5 py-4">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-[#0057e7]">Situação · {situation.name}</p><h2 className="mt-1 text-lg font-black text-[#0d1b2e]">Novo anexo</h2></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-[#5a6a82] hover:bg-[#f5f7fa]" aria-label="Fechar"><X size={18} /></button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#5a6a82]">Tipo de anexo</span>
            <select value={attachmentTypeId} onChange={event => setAttachmentTypeId(event.target.value)} className="w-full rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2.5 text-sm text-[#0d1b2e] outline-none focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/15">
              <option value="">Selecione o tipo</option>
              {controller.attachmentTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </label>
          <div>
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#5a6a82]">Arquivo</span>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={event => chooseFiles(event.target.files)} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => chooseFiles(event.target.files)} />
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#0057e7]/35 bg-[#f7faff] px-4 py-4 text-xs font-black text-[#0057e7] hover:bg-[#edf3ff]"><Upload size={17} /> Adicionar arquivo</button>
              <button type="button" onClick={() => cameraRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#0057e7]/35 bg-white px-4 py-4 text-xs font-black text-[#0057e7] hover:bg-[#f7faff]"><Camera size={17} /> Abrir câmera</button>
            </div>
            {files.length > 0 && <div className="mt-3 rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] px-3 py-2 text-xs text-[#0d1b2e]"><Paperclip size={13} className="mr-1.5 inline" />{files.length === 1 ? files[0].name : `${files.length} arquivos selecionados`}</div>}
          </div>
          {controller.attachmentTypes.length === 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Cadastre pelo menos um tipo em Operação → Documentos → Anexos.</p>}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#0d1b2e]/10 bg-[#f8fafc] px-5 py-4">
          <BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>
          <BtnPrimary onClick={() => void submit()} disabled={uploading || controller.attachmentTypes.length === 0}>{uploading ? "Enviando..." : "Anexar"}</BtnPrimary>
        </div>
      </div>
    </div>
  );
}

export function OrderDocumentsPage({
  open,
  order,
  currentSituationId,
  controller,
  onClose,
  onView,
}: {
  open: boolean;
  order: any;
  currentSituationId?: string | null;
  controller: Controller;
  onClose: () => void;
  onView: (image: OrderImage) => void;
}) {
  const [newForSituation, setNewForSituation] = useState<OrderSituation | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  if (!open) return null;

  const remove = async (document: OrderSituationDocument) => {
    if (!window.confirm("Remover este anexo da OS?")) return;
    try {
      await controller.remove(document);
      setMessage({ text: "Anexo removido.", type: "success" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Não foi possível remover.", type: "error" });
    }
  };

  return (
    <>
      <AdminPage open onClose={onClose} breadcrumb={`Ordens de Serviço > ${order.os_number || "OS"} > Documentos`} title="Situação > Anexos" subtitle="Arquivos e imagens organizados por situação da ordem de serviço" maxW="max-w-4xl">
        <div className="space-y-4 p-5">
          {message && <div className={cn("flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-xs", message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700")}><span className="flex items-center gap-2">{message.type === "success" ? <CheckCircle size={14} /> : <FileText size={14} />}{message.text}</span><button type="button" onClick={() => setMessage(null)}><X size={13} /></button></div>}
          {controller.loading ? <p className="py-8 text-center text-sm text-[#5a6a82]">Carregando anexos...</p>
            : controller.flowSituations.length === 0 ? <p className="py-8 text-center text-sm text-[#5a6a82]">Este tipo de atendimento não possui situações configuradas.</p>
            : controller.flowSituations.map(situation => {
              const attachments = controller.documents.filter(item => item.situation_id === situation.id);
              const canUpload = controller.canUpload(situation.id);
              const current = situation.id === currentSituationId;
              return <section key={situation.id} className={cn("overflow-hidden rounded-xl border", current ? "border-[#0057e7]/30 bg-[#f7faff]" : "border-[#0d1b2e]/10 bg-white")}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#0d1b2e]/8 px-4 py-3">
                  <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: situation.color || "#0057e7" }} /><div><p className="text-xs font-black text-[#0d1b2e]">{situation.name}</p><p className="text-[10px] text-[#5a6a82]">{attachments.length} anexo{attachments.length !== 1 ? "s" : ""}{current ? " · situação atual" : ""}</p></div></div>
                  {canUpload && <button type="button" onClick={() => setNewForSituation(situation)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0057e7] px-3 py-2 text-[11px] font-black text-white hover:bg-[#0046bd]"><Plus size={14} /> Anexar novo</button>}
                </div>
                <div className="p-4">
                  {attachments.length ? <div className="grid gap-3 sm:grid-cols-2">{attachments.map(document => <AttachmentCard key={document.id} document={document} canRemove={controller.canRemove} removing={controller.removingId === document.id} onView={onView} onRemove={remove} />)}</div>
                    : <div className="rounded-lg border border-dashed border-[#0d1b2e]/10 px-3 py-6 text-center text-[11px] text-[#5a6a82]">Nenhum anexo registrado nesta situação.</div>}
                </div>
              </section>;
            })}
        </div>
        <div className="sticky bottom-0 border-t border-[#0d1b2e]/8 bg-white px-5 py-4"><BtnSecondary onClick={onClose}>Voltar para a OS</BtnSecondary></div>
      </AdminPage>
      {newForSituation && <NewAttachmentModal situation={newForSituation} controller={controller} onClose={() => setNewForSituation(null)} onSuccess={text => setMessage({ text, type: "success" })} />}
    </>
  );
}
