import { useRef, useState } from "react";
import { Camera, CheckCircle, Upload, X } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminPage, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import type { OrderImage } from "./OrderImages";
import type { useOrderSituationDocuments } from "../application/useOrderSituationDocuments";
import {
  situationDocumentMedia,
  type OrderSituation,
  type OrderSituationDocument,
} from "../domain/order-situation-document";

type Controller = ReturnType<typeof useOrderSituationDocuments>;

function DocumentThumb({
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
  const name = media?.file_name || "Anexo da situação";
  return (
    <div className="group relative h-24 w-28 overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-[#f5f7fa] shadow-sm">
      <button type="button" onClick={() => onView({ key: document.id, mediaId: document.media_id, name })} className="h-full w-full">
        {loading ? <span className="flex h-full items-center justify-center text-[10px] text-[#5a6a82]">Carregando...</span>
          : error || !url ? <span className="flex h-full items-center justify-center px-2 text-[10px] text-red-600">Imagem indisponível</span>
          : <img src={url} alt={name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />}
        <span className="absolute inset-x-0 bottom-0 truncate bg-[#0d1b2e]/70 px-2 py-1 text-[9px] font-semibold text-white">{name}</span>
      </button>
      {canRemove && <button type="button" disabled={removing} aria-label={`Remover ${name}`} onClick={event => { event.stopPropagation(); onRemove(document); }} className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-white text-red-600 shadow-md disabled:opacity-50"><X size={13} /></button>}
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
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  if (!open) return null;

  const upload = async (situation: OrderSituation, files: FileList | null) => {
    try {
      const result = await controller.upload(situation, files);
      setMessage({ text: `${result.count} ${result.count === 1 ? "imagem anexada" : "imagens anexadas"} em ${result.situation}.`, type: "success" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Não foi possível anexar.", type: "error" });
    } finally {
      if (fileRefs.current[situation.id]) fileRefs.current[situation.id]!.value = "";
      if (cameraRefs.current[situation.id]) cameraRefs.current[situation.id]!.value = "";
    }
  };

  const remove = async (document: OrderSituationDocument) => {
    if (!window.confirm("Remover este documento da OS?")) return;
    try {
      await controller.remove(document);
      setMessage({ text: "Documento removido.", type: "success" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Não foi possível remover.", type: "error" });
    }
  };

  return (
    <AdminPage open onClose={onClose} breadcrumb={`Ordens de Serviço > ${order.os_number || "OS"}`} title="Documentos da OS" subtitle="Imagens organizadas por situação" maxW="max-w-2xl">
      <div className="space-y-4 p-5">
        {message && <div className={cn("flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-xs", message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700")}><span className="flex items-center gap-2">{message.type === "success" ? <CheckCircle size={14} /> : <Camera size={14} />}{message.text}</span><button type="button" onClick={() => setMessage(null)}><X size={13} /></button></div>}
        {controller.loading ? <p className="py-8 text-center text-sm text-[#5a6a82]">Carregando documentos...</p>
          : controller.flowSituations.length === 0 ? <p className="py-8 text-center text-sm text-[#5a6a82]">Este tipo de atendimento não possui situações configuradas.</p>
          : controller.flowSituations.map(situation => {
            const documents = controller.documents.filter(item => item.situation_id === situation.id);
            const canUpload = controller.canUpload(situation.id);
            const current = situation.id === currentSituationId;
            return <section key={situation.id} className={cn("rounded-xl border p-3", current ? "border-[#0057e7]/30 bg-[#f7faff]" : "border-[#0d1b2e]/10 bg-white")}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: situation.color || "#0057e7" }} /><div><p className="text-xs font-bold text-[#0d1b2e]">{situation.name}</p><p className="text-[10px] text-[#5a6a82]">{documents.length} anexo{documents.length !== 1 ? "s" : ""}{current ? " · situação atual" : ""}</p></div></div>
                {canUpload && <div className="flex gap-2">
                  <input ref={element => { fileRefs.current[situation.id] = element; }} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={event => void upload(situation, event.target.files)} />
                  <input ref={element => { cameraRefs.current[situation.id] = element; }} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => void upload(situation, event.target.files)} />
                  <button type="button" disabled={Boolean(controller.uploadingSituationId)} onClick={() => fileRefs.current[situation.id]?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#0057e7]/25 bg-[#f0f6ff] px-2.5 py-1.5 text-[11px] font-bold text-[#0057e7] disabled:opacity-50"><Upload size={13} /> {controller.uploadingSituationId === situation.id ? "Enviando..." : "Anexar"}</button>
                  <button type="button" disabled={Boolean(controller.uploadingSituationId)} onClick={() => cameraRefs.current[situation.id]?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#0057e7]/25 bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#0057e7] disabled:opacity-50"><Camera size={13} /> Câmera</button>
                </div>}
              </div>
              {documents.length ? <div className="flex flex-wrap gap-2">{documents.map(document => <DocumentThumb key={document.id} document={document} canRemove={controller.canRemove} removing={controller.removingId === document.id} onView={onView} onRemove={remove} />)}</div>
                : <div className="rounded-lg border border-dashed border-[#0d1b2e]/10 px-3 py-4 text-center text-[11px] text-[#5a6a82]">Nenhuma imagem registrada nesta situação.</div>}
            </section>;
          })}
      </div>
      <div className="sticky bottom-0 border-t border-[#0d1b2e]/8 bg-white px-5 py-4"><BtnSecondary onClick={onClose}>Voltar para a OS</BtnSecondary></div>
    </AdminPage>
  );
}
