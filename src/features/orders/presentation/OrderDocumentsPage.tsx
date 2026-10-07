import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CheckCircle,
  Download,
  File,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Upload,
  X,
} from "lucide-react";
import type { PrintTemplate } from "@/features/documents/domain/print-template";
import { cn } from "@/shared/domain/formatters";
import {
  AdminCard,
  AdminCardHeader,
  AdminDialog,
  AdminPage,
  AdminStickyToolbar,
  BtnPrimary,
  BtnSecondary,
} from "@/shared/ui/admin/AdminLayout";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { LoadingSpinner, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { PdfPreviewDialog } from "@/shared/ui/admin/PdfPreviewDialog";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { OrderImageThumb, type OrderImage } from "./OrderImages";
import { OrderChecklistDocumentsSection } from "./OrderChecklistDocumentsSection";
import { OrderSignatureRequestsSection } from "./OrderSignatureRequestsSection";
import type { useOrderSituationDocuments } from "../application/useOrderSituationDocuments";
import {
  situationDocumentMedia,
  situationDocumentType,
  type OrderSituation,
  type OrderSituationDocument,
} from "../domain/order-situation-document";

type Controller = ReturnType<typeof useOrderSituationDocuments>;
type PermissionCheck = (permission: string) => boolean;

type DocumentsTab = "situations" | "solution" | "checklist" | "attachments" | "signatures";

type SignatureContext = {
  usedItems: any[];
  partRequests: any[];
  history: any[];
  printedBy?: string | null;
};

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
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const media = situationDocumentMedia(document);
  const type = situationDocumentType(document);
  const name = media?.file_name || "Arquivo anexado";
  const isImage = Boolean(media?.mime_type?.startsWith("image/"));
  const isPdf = media?.mime_type === "application/pdf" || /\.pdf$/i.test(name);
  const classification = type?.name || (document.situation_id ? "Imagem da situação" : "Sem tipo");

  const openAttachment = () => {
    if (!url) return;
    if (isImage) onView({ key: document.id, mediaId: document.media_id, name });
    else if (isPdf) setPdfPreviewOpen(true);
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  return (<>
    <PdfPreviewDialog
      open={pdfPreviewOpen}
      source={pdfPreviewOpen ? url : null}
      title={`Pré-visualização · ${name}`}
      fileName={name}
      onClose={() => setPdfPreviewOpen(false)}
    />
    <AdminCard className="group relative min-w-0 max-w-full overflow-hidden p-0 transition-shadow hover:shadow-md">
      {isImage ? (
        <button
          type="button"
          onClick={openAttachment}
          disabled={loading || !url}
          className="relative block h-40 w-full overflow-hidden bg-[#eef2f7] text-left disabled:cursor-not-allowed"
          aria-label={`Visualizar ${name}`}
        >
          {loading ? (
            <span className="flex h-full w-full items-center justify-center"><LoadingSpinner size="sm" /></span>
          ) : url ? (
            <img src={url} alt={name} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
          ) : (
            <span className="flex h-full w-full flex-col items-center justify-center gap-2 text-xs text-[#7c899c]"><ImageIcon size={22} />{error ? "Imagem indisponível" : "Sem preview"}</span>
          )}
          {url && <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#07111f]/65 to-transparent px-3 pb-2 pt-8 text-[10px] font-bold text-white">Clique para ampliar</span>}
        </button>
      ) : (
        <button
          type="button"
          onClick={openAttachment}
          disabled={loading || !url}
          className="flex min-h-28 w-full items-center justify-center gap-3 bg-muted px-4 py-5 text-left disabled:cursor-not-allowed"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#edf3ff] text-[#0057e7]"><File size={21} /></span>
          <span className="min-w-0"><span className="block truncate text-xs font-black text-[#0d1b2e]">{name}</span><span className="mt-1 block text-[10px] text-[#7c899c]">{loading ? "Carregando..." : error ? "Arquivo indisponível" : isPdf ? "Clique para visualizar PDF" : "Clique para abrir"}</span></span>
        </button>
      )}

      <div className="min-w-0 p-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-black text-[#0d1b2e]" title={name}>{name}</p>
          <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide text-[#0057e7]">{classification}</p>
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-[#0d1b2e]/7 pt-2">
          {url ? <a href={url} target="_blank" rel="noreferrer" download={name} aria-label={`Baixar ${name}`} title="Baixar" className="inline-flex min-w-0 items-center gap-1 text-[10px] font-bold text-[#0057e7]"><Download size={12} className="shrink-0" /><span className="hidden sm:inline">Baixar</span></a> : <span />}
          {canRemove && <button type="button" disabled={removing} onClick={() => onRemove(document)} aria-label={`Remover ${name}`} title="Remover" className="inline-flex min-w-0 items-center gap-1 text-[10px] font-bold text-red-600 disabled:opacity-50"><X size={12} className="shrink-0" /><span className="hidden sm:inline">Remover</span></button>}
        </div>
      </div>
    </AdminCard>
  </>);
}

function SelectedFilePreview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith("image/");

  useEffect(() => {
    if (!isImage) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-white">
      {isImage && previewUrl ? (
        <img src={previewUrl} alt={file.name} className="h-28 w-full object-cover" />
      ) : (
        <div className="flex h-20 items-center justify-center bg-muted text-[#0057e7]"><FileText size={22} /></div>
      )}
      <div className="min-w-0 px-2.5 py-2 pr-9">
        <p className="truncate text-[11px] font-bold text-[#0d1b2e]" title={file.name}>{file.name}</p>
        <p className="mt-0.5 text-[10px] text-[#7c899c]">{isImage ? "Preview da imagem" : "Arquivo selecionado"}</p>
      </div>
      <button type="button" onClick={onRemove} className="absolute right-2 top-2 rounded-full bg-[#07111f]/75 p-1.5 text-white hover:bg-[#07111f]" aria-label={`Remover ${file.name}`}><X size={12} /></button>
    </div>
  );
}

function NewAttachmentModal({ controller, onClose, onSuccess }: { controller: Controller; onClose: () => void; onSuccess: (message: string) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [attachmentTypeId, setAttachmentTypeId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const uploading = controller.uploadingAttachment;

  const chooseFiles = (list: FileList | null) => {
    setFiles(Array.from(list || []));
    setError("");
  };

  const removeSelectedFile = (index: number) => {
    setFiles(current => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const submit = async () => {
    setError("");
    if (!attachmentTypeId) { setError("Selecione o tipo de anexo."); return; }
    if (!files.length) { setError("Selecione um arquivo ou abra a câmera."); return; }
    try {
      const result = await controller.uploadAttachment(attachmentTypeId, files);
      onSuccess(`${result.count} ${result.count === 1 ? "arquivo anexado" : "arquivos anexados"} à OS.`);
      onClose();
    } catch (uploadError) {
      setError(systemErrorMessage(uploadError, "Não foi possível anexar."));
    }
  };

  return (
    <AdminDialog
      open
      onClose={onClose}
      title="Novo anexo"
      description="Confira o preview antes de anexar."
      className="max-w-lg"
      footer={<div className="flex justify-end gap-2">
        <BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>
        <BtnPrimary onClick={() => void submit()} disabled={uploading || controller.attachmentTypes.length === 0}>{uploading ? "Enviando..." : "Anexar"}</BtnPrimary>
      </div>}
    >
      <div className="space-y-4">
          <div className="min-w-0">
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#5a6a82]">Tipo de anexo</label>
            <AdminSelect
              value={attachmentTypeId}
              onValueChange={setAttachmentTypeId}
              ariaLabel="Tipo de anexo"
              options={[
                { value: "", label: "Selecione o tipo" },
                ...controller.attachmentTypes.map(type => ({ value: type.id, label: type.name })),
              ]}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#5a6a82]">Arquivo</span>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={event => { chooseFiles(event.target.files); event.currentTarget.value = ""; }} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { chooseFiles(event.target.files); event.currentTarget.value = ""; }} />
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#0057e7]/35 bg-[#f7faff] px-4 py-4 text-xs font-black text-[#0057e7] hover:bg-[#edf3ff]"><Upload size={17} /> Adicionar arquivo</button>
              <button type="button" onClick={() => cameraRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#0057e7]/35 bg-white px-4 py-4 text-xs font-black text-[#0057e7] hover:bg-[#f7faff]"><Camera size={17} /> Abrir câmera</button>
            </div>

            {files.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#0d1b2e]"><Paperclip size={13} />{files.length} {files.length === 1 ? "arquivo selecionado" : "arquivos selecionados"}</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {files.map((file, index) => <SelectedFilePreview key={`${file.name}-${file.lastModified}-${index}`} file={file} onRemove={() => removeSelectedFile(index)} />)}
                </div>
              </div>
            )}
          </div>

          {controller.attachmentTypes.length === 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Cadastre pelo menos um tipo em Operação → Documentos → Anexos.</p>}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      </div>
    </AdminDialog>
  );
}

function SituationQuickUploads({ situation, controller, onSuccess, onError }: { situation: OrderSituation; controller: Controller; onSuccess: (message: string) => void; onError: (message: string) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const uploading = controller.uploadingSituationId === situation.id;

  const upload = async (list: FileList | null) => {
    const files = Array.from(list || []);
    if (!files.length) return;
    try {
      const result = await controller.uploadQuick(situation, files);
      onSuccess(`${result.count} ${result.count === 1 ? "imagem adicionada" : "imagens adicionadas"} em ${result.situation}.`);
    } catch (uploadError) {
      onError(systemErrorMessage(uploadError, "Não foi possível adicionar a imagem."));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
      if (cameraRef.current) cameraRef.current.value = "";
    }
  };

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={event => void upload(event.target.files)} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => void upload(event.target.files)} />
      <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#0057e7]/25 bg-white px-3 py-2 text-[11px] font-black text-[#0057e7] hover:bg-[#edf3ff] disabled:opacity-50"><Upload size={14} /> Adicionar</button>
      <button type="button" disabled={uploading} onClick={() => cameraRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#0057e7]/25 bg-white px-3 py-2 text-[11px] font-black text-[#0057e7] hover:bg-[#f7faff] disabled:opacity-50"><Camera size={14} /> Tirar foto</button>
    </div>
  );
}

export function OrderDocumentsPage({
  open,
  order,
  currentSituationId,
  controller,
  solutionImages,
  signatureTemplates,
  signatureContext,
  hasPermission,
  onClose,
  onView,
  readOnly = false,
}: {
  open: boolean;
  order: any;
  currentSituationId?: string | null;
  controller: Controller;
  solutionImages: OrderImage[];
  signatureTemplates: PrintTemplate[];
  signatureContext: SignatureContext;
  hasPermission: PermissionCheck;
  onClose: () => void;
  onView: (image: OrderImage) => void;
  readOnly?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<DocumentsTab>("attachments");
  const [newAttachmentOpen, setNewAttachmentOpen] = useState(false);
  const [signatureSendRequestNonce, setSignatureSendRequestNonce] = useState(0);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [browserBottomInset, setBrowserBottomInset] = useState(0);
  const canViewSignatures = hasPermission("documents.signatures.view");
  const canSendSignature = !readOnly && hasPermission("documents.signatures.send");
  const hasOnlineSignatureTemplate = signatureTemplates.some(template => template.is_active !== false && template.allow_online_signature === true);

  useEffect(() => {
    if (!open) { setBrowserBottomInset(0); return; }
    const viewport = window.visualViewport;
    if (!viewport) return;
    const updateBottomInset = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      setBrowserBottomInset(Math.min(110, Math.round(inset)));
    };
    updateBottomInset();
    viewport.addEventListener("resize", updateBottomInset);
    viewport.addEventListener("scroll", updateBottomInset);
    window.addEventListener("resize", updateBottomInset);
    return () => {
      viewport.removeEventListener("resize", updateBottomInset);
      viewport.removeEventListener("scroll", updateBottomInset);
      window.removeEventListener("resize", updateBottomInset);
    };
  }, [open]);

  useEffect(() => {
    if (!canViewSignatures && activeTab === "signatures") setActiveTab("attachments");
  }, [canViewSignatures, activeTab]);

  if (!open) return null;

  const remove = async (document: OrderSituationDocument) => {
    if (!window.confirm("Remover este anexo da OS?")) return;
    try {
      await controller.remove(document);
      setMessage({ text: "Anexo removido.", type: "success" });
    } catch (error) {
      setMessage({ text: systemErrorMessage(error, "Não foi possível remover."), type: "error" });
    }
  };

  const solutionMediaIds = new Set(solutionImages.map(image => image.mediaId).filter(Boolean));
  const visibleDocuments = controller.documents.filter(item => !solutionMediaIds.has(item.media_id));
  const typedAttachments = visibleDocuments.filter(item => Boolean(item.attachment_type_id));

  return (
    <>
      <AdminPage open onClose={onClose} breadcrumb={`Ordens de Serviço > ${order.os_number || "OS"} > Documentos`} title="Documentos" subtitle="Arquivos, imagens e assinaturas da ordem de serviço" maxW="max-w-4xl">
        <div className="border-b border-border px-5 pt-2">
          <nav className="flex items-center gap-6 overflow-x-auto" aria-label="Seções de documentos">
            <button type="button" onClick={() => setActiveTab("attachments")} className={cn("shrink-0 border-b-2 px-1 py-3 text-xs font-black transition-colors", activeTab === "attachments" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82] hover:text-[#0d1b2e]")}>Anexos</button>
            {canViewSignatures && <button type="button" onClick={() => setActiveTab("signatures")} className={cn("shrink-0 border-b-2 px-1 py-3 text-xs font-black transition-colors", activeTab === "signatures" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82] hover:text-[#0d1b2e]")}>Assinaturas</button>}
            <button type="button" onClick={() => setActiveTab("checklist")} className={cn("shrink-0 border-b-2 px-1 py-3 text-xs font-black transition-colors", activeTab === "checklist" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82] hover:text-[#0d1b2e]")}>Checklist</button>
            <button type="button" onClick={() => setActiveTab("situations")} className={cn("shrink-0 border-b-2 px-1 py-3 text-xs font-black transition-colors", activeTab === "situations" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82] hover:text-[#0d1b2e]")}>Situações</button>
            <button type="button" onClick={() => setActiveTab("solution")} className={cn("shrink-0 border-b-2 px-1 py-3 text-xs font-black transition-colors", activeTab === "solution" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82] hover:text-[#0d1b2e]")}>Solução</button>
          </nav>
        </div>

        <div className="min-w-0 max-w-full space-y-4 overflow-hidden p-5">
          {message && <div className={cn("flex min-w-0 items-start justify-between gap-3 rounded-lg border px-3 py-2 text-xs", message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700")}><span className="flex min-w-0 items-center gap-2"><span className="shrink-0">{message.type === "success" ? <CheckCircle size={14} /> : <FileText size={14} />}</span><span className="min-w-0 break-words">{message.text}</span></span><button type="button" onClick={() => setMessage(null)} className="shrink-0"><X size={13} /></button></div>}

          {activeTab !== "solution" && activeTab !== "checklist" && activeTab !== "signatures" && controller.loading ? (
            <LoadingState text="Carregando documentos..." />
          ) : activeTab === "situations" ? (
            controller.flowSituations.length === 0 ? (
              <p className="py-8 text-center text-sm text-[#5a6a82]">Este tipo de atendimento não possui situações configuradas.</p>
            ) : controller.flowSituations.map(situation => {
              const situationImages = visibleDocuments.filter(item => item.situation_id === situation.id && !item.attachment_type_id);
              const canUpload = !readOnly && controller.canUpload(situation.id);
              const current = situation.id === currentSituationId;
              return (
                <AdminCard key={situation.id} className={cn("min-w-0 max-w-full shadow-none", current && "border-[#0057e7]/30 bg-[#f7faff]")}>
                  <AdminCardHeader className={current ? "bg-[#f7faff]" : undefined}>
                    <div className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: situation.color || "#0057e7" }} /><div className="min-w-0"><p className="truncate text-xs font-black text-[#0d1b2e]">{situation.name}</p><p className="text-[10px] text-[#5a6a82]">{current ? "Situação atual" : "Situação da OS"} · {situationImages.length} {situationImages.length === 1 ? "imagem" : "imagens"}</p></div></div>
                    {canUpload && <SituationQuickUploads situation={situation} controller={controller} onSuccess={text => setMessage({ text, type: "success" })} onError={text => setMessage({ text, type: "error" })} />}
                  </AdminCardHeader>
                  {situationImages.length > 0 ? (
                    <div className="grid min-w-0 max-w-full grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">{situationImages.map(document => <AttachmentCard key={document.id} document={document} canRemove={!readOnly && controller.canRemove} removing={controller.removingId === document.id} onView={onView} onRemove={remove} />)}</div>
                  ) : (
                    <div className="px-4 py-6 text-center text-xs text-[#7c899c]">Nenhuma imagem registrada nesta situação.</div>
                  )}
                </AdminCard>
              );
            })
          ) : activeTab === "solution" ? (
            <div className="min-w-0 max-w-full space-y-4 overflow-hidden">
              {solutionImages.length === 0 ? (
                <div className="max-w-full rounded-xl border border-dashed border-border px-3 py-10 text-center text-xs text-[#5a6a82]">Nenhuma imagem da solução registrada nesta OS.</div>
              ) : (
                <div className="rounded-xl border border-border bg-muted p-4">
                  <div className="flex flex-wrap gap-3">{solutionImages.map(image => <OrderImageThumb key={image.key} image={image} onView={() => onView(image)} />)}</div>
                </div>
              )}
            </div>
          ) : activeTab === "checklist" ? (
            <OrderChecklistDocumentsSection orderId={order.id} onView={onView} />
          ) : activeTab === "signatures" ? (
            <OrderSignatureRequestsSection
              order={order}
              templates={signatureTemplates}
              usedItems={signatureContext.usedItems}
              partRequests={signatureContext.partRequests}
              history={signatureContext.history}
              printedBy={signatureContext.printedBy}
              hasPermission={hasPermission}
              sendRequestNonce={signatureSendRequestNonce}
              onSendRequestHandled={() => setSignatureSendRequestNonce(0)}
            />
          ) : (
            <div className="min-w-0 max-w-full space-y-4 overflow-hidden">
              {typedAttachments.length === 0 ? (
                <div className="max-w-full rounded-xl border border-dashed border-border px-3 py-10 text-center text-xs text-[#5a6a82]">Nenhum anexo registrado nesta OS.</div>
              ) : (
                <div className="grid min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{typedAttachments.map(document => <AttachmentCard key={document.id} document={document} canRemove={!readOnly && controller.canRemove} removing={controller.removingId === document.id} onView={onView} onRemove={remove} />)}</div>
              )}
            </div>
          )}
        </div>

        <div aria-hidden="true" className="h-[5.5rem] md:hidden" />
        <AdminStickyToolbar className="fixed inset-x-0 z-[70] block px-3 pt-3 md:sticky md:bottom-0 md:z-auto md:px-5 md:py-4" style={{ bottom: browserBottomInset ? `${browserBottomInset}px` : 0, paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
          <div className="mx-auto flex w-full max-w-6xl items-center gap-2">
            <BtnSecondary onClick={onClose}>Voltar</BtnSecondary>
            {activeTab === "attachments" && !readOnly && controller.canUploadAttachment && <BtnPrimary onClick={() => setNewAttachmentOpen(true)}>Novo</BtnPrimary>}
            {activeTab === "signatures" && canSendSignature && <BtnPrimary disabled={!hasOnlineSignatureTemplate} onClick={() => setSignatureSendRequestNonce(current => current + 1)}>Enviar</BtnPrimary>}
          </div>
        </AdminStickyToolbar>
      </AdminPage>

      {!readOnly && newAttachmentOpen && <NewAttachmentModal controller={controller} onClose={() => setNewAttachmentOpen(false)} onSuccess={text => setMessage({ text, type: "success" })} />}
    </>
  );
}
