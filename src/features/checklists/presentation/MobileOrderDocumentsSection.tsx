import { useState } from "react";
import { Camera, ImagePlus, Loader2 } from "lucide-react";
import { uploadMobileOrderDocument, type MobileOrderChecklistData } from "../infrastructure/order-mobile-checklist.gateway";

type Documents = NonNullable<MobileOrderChecklistData["documents"]>;
type Pairing = { id: string; token: string };
type Section = "attachments" | "situations";
type Notice = { type: "success" | "error"; text: string };

function UploadAction({
  title, camera = false, disabled, loading, accept, onFiles,
}: {
  title: string;
  camera?: boolean;
  disabled: boolean;
  loading: boolean;
  accept: string;
  onFiles: (files: File[]) => void;
}) {
  return (
    <label aria-disabled={disabled} className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black transition-colors ${disabled ? "cursor-not-allowed border-[#e0e5ec] bg-[#f4f6f9] text-[#9aa7b6]" : "border-[#0057e7]/25 bg-white text-[#0057e7] hover:bg-[#eef5ff]"}`}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : camera ? <Camera size={16} /> : <ImagePlus size={16} />}
      {loading ? "Enviando" : title}
      <input
        className="sr-only"
        type="file"
        accept={accept}
        capture={camera ? "environment" : undefined}
        multiple={!camera}
        disabled={disabled}
        onChange={event => {
          const files = Array.from(event.currentTarget.files || []);
          event.currentTarget.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </label>
  );
}

export function MobileOrderDocumentsSection({
  documents, pairing, section, onRefresh, onNotice,
}: {
  documents: Documents;
  pairing: Pairing;
  section: Section;
  onRefresh: () => Promise<void>;
  onNotice: (notice: Notice) => void;
}) {
  const [attachmentTypeId, setAttachmentTypeId] = useState("");
  const [uploadingTarget, setUploadingTarget] = useState<string | null>(null);
  const busy = uploadingTarget !== null;

  const upload = async (kind: "attachment" | "situation", targetId: string, files: File[]) => {
    if (busy || !targetId || !files.length) return;
    const target = kind + ":" + targetId;
    setUploadingTarget(target);
    let count = 0;
    try {
      for (const file of files) {
        await uploadMobileOrderDocument(pairing.id, pairing.token, kind, targetId, file);
        count += 1;
      }
      await onRefresh();
      onNotice({
        type: "success",
        text: count === 1 ? "Arquivo adicionado à OS." : count + " arquivos adicionados à OS.",
      });
    } catch (error) {
      if (count) await onRefresh().catch(() => undefined);
      onNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Não foi possível enviar o arquivo.",
      });
    } finally {
      setUploadingTarget(null);
    }
  };

  if (section === "attachments") return (
    <section className="space-y-4 rounded-2xl border border-[#d9e1ec] bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-[#0d1b2e]">Anexos</h2>
          <p className="mt-1 text-xs leading-5 text-[#64748b]">Envie fotos ou documentos diretamente à OS.</p>
        </div>
        <span className="rounded-lg bg-[#edf3ff] px-2.5 py-1.5 text-xs font-black text-[#0057e7]">{documents.attachment_count}</span>
      </div>
      {documents.attachment_types.length ? (
        <>
          <label className="block">
            <span className="mb-1.5 block text-xs font-black text-[#334155]">Tipo de anexo</span>
            <select
              value={attachmentTypeId}
              onChange={event => setAttachmentTypeId(event.target.value)}
              disabled={busy}
              className="h-12 w-full rounded-xl border border-[#cbd5e1] bg-white px-3 text-sm font-semibold text-[#0d1b2e] outline-none focus:border-[#0057e7]"
            >
              <option value="">Selecione o tipo de anexo</option>
              {documents.attachment_types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <UploadAction
              title="Adicionar arquivo"
              accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
              disabled={!attachmentTypeId || busy}
              loading={uploadingTarget === "attachment:" + attachmentTypeId}
              onFiles={files => void upload("attachment", attachmentTypeId, files)}
            />
            <UploadAction
              title="Tirar foto"
              camera
              accept="image/*"
              disabled={!attachmentTypeId || busy}
              loading={uploadingTarget === "attachment:" + attachmentTypeId}
              onFiles={files => void upload("attachment", attachmentTypeId, files)}
            />
          </div>
          <p className="text-xs text-[#64748b]">Imagens, PDF e documentos de até 20 MB por arquivo.</p>
        </>
      ) : (
        <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-4 py-5 text-center text-xs font-semibold text-[#64748b]">
          Nenhum tipo de anexo ativo. Cadastre um tipo no CRM para enviar arquivos.
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[#d9e1ec] bg-white p-4">
        <h2 className="text-base font-black text-[#0d1b2e]">Fotos das situações</h2>
        <p className="mt-1 text-xs leading-5 text-[#64748b]">As fotos serão adicionadas à situação selecionada na OS.</p>
      </div>
      {documents.situations.length ? documents.situations.map(situation => (
        <section key={situation.id} className="rounded-2xl border border-[#d9e1ec] bg-white p-4 shadow-sm">
          <div className="flex items-start gap-2">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: situation.color || "#0057e7" }} />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-black text-[#0d1b2e]">{situation.name}</h3>
              <p className="mt-1 text-xs text-[#64748b]">{situation.count} {situation.count === 1 ? "imagem registrada" : "imagens registradas"}</p>
            </div>
          </div>
          {situation.can_upload ? (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <UploadAction
                title="Adicionar"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                loading={uploadingTarget === "situation:" + situation.id}
                onFiles={files => void upload("situation", situation.id, files)}
              />
              <UploadAction
                title="Tirar foto"
                accept="image/*"
                camera
                disabled={busy}
                loading={uploadingTarget === "situation:" + situation.id}
                onFiles={files => void upload("situation", situation.id, files)}
              />
            </div>
          ) : <p className="mt-3 rounded-lg bg-[#f4f6f9] px-3 py-2 text-xs text-[#64748b]">Sem permissão para adicionar imagens nesta situação.</p>}
        </section>
      )) : (
        <div className="rounded-2xl border border-[#d9e1ec] bg-white px-4 py-8 text-center text-xs font-semibold text-[#64748b]">
          Nenhuma situação configurada para este atendimento.
        </div>
      )}
    </div>
  );
}
