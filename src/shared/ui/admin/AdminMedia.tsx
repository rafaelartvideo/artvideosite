import React, { useEffect, useRef, useState } from "react";
import { Camera, Package, Tag, Upload } from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { supabaseErrorMessage, uploadMediaFile, type MediaBucket } from "@/shared/infrastructure/media.repository";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";

export function ImageUpload({ bucket, currentMediaId, onUpload, label = "Imagem", canUpload = true, organizationId, photoActions = false }: {
  bucket: MediaBucket; currentMediaId?: string | null; onUpload: (mediaId: string) => void; label?: string; canUpload?: boolean; organizationId?: string | null; photoActions?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const { url: currentUrl } = useMediaUrl(currentMediaId);

  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    try {
      onUpload(await uploadMediaFile(bucket, file, organizationId));
      setPreviewUrl(null);
      notifyAdmin("Imagem enviada com sucesso.", "success");
    } catch (error) {
      console.error("[MEDIA] image upload error:", error);
      notifyAdmin(`Erro ao enviar imagem: ${supabaseErrorMessage(error)}`, "error");
    } finally {
      setUploading(false);
      event.currentTarget.value = "";
    }
  };

  const displayUrl = previewUrl || currentUrl;
  return <div>
    <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-2">{label}</label>
    {displayUrl && <div className="mb-3 flex h-28 w-full max-w-44 items-center justify-center overflow-hidden rounded-xl border border-[#0d1b2e]/15 bg-[#f5f7fa] p-2"><img src={displayUrl} alt="" className="max-h-full max-w-full object-contain" /></div>}
    <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleFile} className="hidden" />
    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
    {canUpload && (photoActions ? <div className="grid w-full min-w-0 grid-cols-2 gap-2">
      <AdminButton variant="secondary" size="sm" onClick={() => inputRef.current?.click()} loading={uploading} loadingText="Enviando..." aria-label={displayUrl ? "Trocar imagem" : "Adicionar imagem"} title={displayUrl ? "Trocar imagem" : "Adicionar imagem"} className="h-[42px] w-full min-w-0 justify-center gap-1.5 border-[#0057e7]/30 px-2 py-0 text-[#0057e7] hover:bg-[#0057e7]/5 md:px-3"><Upload size={18} className="shrink-0" /><span className="hidden text-xs md:inline">{displayUrl ? "Trocar" : "Adicionar"}</span></AdminButton>
      <AdminButton variant="secondary" size="sm" onClick={() => cameraInputRef.current?.click()} loading={uploading} loadingText="Enviando..." aria-label="Abrir câmera" title="Abrir câmera" className="h-[42px] w-full min-w-0 justify-center gap-1.5 border-[#0057e7]/30 px-2 py-0 text-[#0057e7] hover:bg-[#0057e7]/5 md:px-3"><Camera size={18} className="shrink-0" /><span className="hidden text-xs md:inline">Câmera</span></AdminButton>
    </div> : <AdminButton variant="secondary" size="sm" onClick={() => inputRef.current?.click()} loading={uploading} loadingText="Enviando..." className="border-[#0057e7]/30 text-[#0057e7] hover:bg-[#0057e7]/5"><Upload size={13} /> {displayUrl ? "Trocar imagem" : "Selecionar imagem"}</AdminButton>)}
  </div>;
}

export function ProductAdminThumb({ mediaId, name }: { mediaId: string | null; name: string }) {
  const { url } = useMediaUrl(mediaId);
  return url ? <img src={url} alt={name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-[#0d1b2e]/10" /> : <div className="w-10 h-10 bg-[#f5f7fa] rounded-lg flex-shrink-0 border border-[#0d1b2e]/10 flex items-center justify-center"><Package size={16} className="text-[#5a6a82]" /></div>;
}

export function BrandAdminLogo({ mediaId, name }: { mediaId: string | null; name: string }) {
  const { url } = useMediaUrl(mediaId);
  return url ? <img src={url} alt={name} className="h-12 w-auto object-contain max-w-full" /> : <div className="w-12 h-12 bg-[#f5f7fa] rounded-lg flex-shrink-0 border border-[#0d1b2e]/10 flex items-center justify-center"><Tag size={20} className="text-[#5a6a82]" /></div>;
}
