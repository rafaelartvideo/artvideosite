import React, { useEffect, useRef, useState } from "react";
import { Package, Tag, Upload } from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { supabaseErrorMessage, uploadMediaFile, type MediaBucket } from "@/shared/infrastructure/media.repository";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { beginAdminLoading, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";

export function ImageUpload({ bucket, currentMediaId, onUpload, label = "Imagem", canUpload = true }: {
  bucket: MediaBucket; currentMediaId?: string | null; onUpload: (mediaId: string) => void; label?: string; canUpload?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
    const endLoading = beginAdminLoading("Enviando imagem...");
    try {
      onUpload(await uploadMediaFile(bucket, file));
      setPreviewUrl(null);
      notifyAdmin("Imagem enviada com sucesso.", "success");
    } catch (error) {
      console.error("[MEDIA] image upload error:", error);
      notifyAdmin(`Erro ao enviar imagem: ${supabaseErrorMessage(error)}`, "error");
    } finally {
      endLoading();
      setUploading(false);
      event.currentTarget.value = "";
    }
  };

  const displayUrl = previewUrl || currentUrl;
  return <div>
    <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-2">{label}</label>
    {displayUrl && <div className="mb-3 w-36 h-28 rounded-xl overflow-hidden border border-[#0d1b2e]/15 bg-[#f5f7fa]"><img src={displayUrl} alt="" className="w-full h-full object-cover" /></div>}
    <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    {canUpload && <AdminButton variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading} className="border-[#0057e7]/30 text-[#0057e7] hover:bg-[#0057e7]/5"><Upload size={13} /> {uploading ? "Enviando..." : displayUrl ? "Trocar imagem" : "Selecionar imagem"}</AdminButton>}
  </div>;
}

export function ProductAdminThumb({ mediaId, name }: { mediaId: string | null; name: string }) {
  const { url } = useMediaUrl(mediaId);
  return url ? <img src={url} alt={name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-[#0d1b2e]/10" /> : <div className="w-10 h-10 bg-[#f5f7fa] rounded-lg flex-shrink-0 border border-[#0d1b2e]/10 flex items-center justify-center"><Package size={16} className="text-[#5a6a82]" /></div>;
}

export function BrandAdminLogo({ mediaId, name }: { mediaId: string | null; name: string }) {
  const { url } = useMediaUrl(mediaId);
  return url ? <img src={url} alt={name} className="h-12 w-auto object-contain max-w-full" /> : <div className="w-12 h-12 bg-[#f5f7fa] rounded-lg flex items-center justify-center"><Tag size={20} className="text-[#5a6a82]" /></div>;
}
