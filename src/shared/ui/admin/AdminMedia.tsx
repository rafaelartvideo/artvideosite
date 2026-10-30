import React, { useEffect, useRef, useState } from "react";
import { Camera, Image as ImageIcon, Package, Tag, Trash2, Upload } from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { supabaseErrorMessage, uploadMediaFile, type MediaBucket } from "@/shared/infrastructure/media.repository";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";

export function ImageUpload({ bucket, currentMediaId, onUpload, label = "Imagem", canUpload = true, organizationId, photoActions = false, onRemove, removeIconOnly = false, coverFill = false }: {
  bucket: MediaBucket; currentMediaId?: string | null; onUpload: (mediaId: string) => void; onRemove?: () => void; label?: string; canUpload?: boolean; organizationId?: string | null; photoActions?: boolean; removeIconOnly?: boolean; coverFill?: boolean;
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
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    try {
      const mediaId = await uploadMediaFile(bucket, file, organizationId);
      onUpload(mediaId);
      setPreviewUrl(null);
      notifyAdmin("Imagem enviada. Salve o cadastro para confirmar a alteração.", "success");
    } catch (error) {
      console.error("[MEDIA] image upload error:", error);
      setPreviewUrl(null);
      notifyAdmin(`Erro ao enviar imagem: ${supabaseErrorMessage(error)}`, "error");
    } finally {
      setUploading(false);
      input.value = "";
    }
  };

  const displayUrl = previewUrl || (currentMediaId ? currentUrl : null);
  const handleRemove = () => {
    if (uploading || !canUpload || !onRemove || !currentMediaId) return;
    setPreviewUrl(null);
    onRemove();
    notifyAdmin("Imagem desvinculada. Clique em Salvar para confirmar.", "success");
  };
  return <div className={coverFill ? "flex h-full min-h-0 w-full min-w-0 flex-col" : undefined}>
    <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{label}</label>
    {coverFill
      ? <div className="mb-2 flex min-h-20 w-full min-w-0 flex-1 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40 p-1.5">
          {displayUrl
            ? <img src={displayUrl} alt="Foto de capa do produto" className="h-full min-h-0 w-full object-contain" />
            : <ImageIcon size={23} aria-label="Sem foto de capa" className="text-muted-foreground/60" />}
        </div>
      : displayUrl && <div className="mb-3 flex h-28 w-full max-w-44 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted p-2"><img src={displayUrl} alt="" className="max-h-full max-w-full object-contain" /></div>}
    <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={handleFile} className="hidden" />
    <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFile} className="hidden" />
    {canUpload && (removeIconOnly
      ? <div className="flex w-full min-w-0 items-center gap-2">
          <AdminButton
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
            loading={uploading}
            aria-label={displayUrl ? "Trocar imagem" : "Adicionar imagem"}
            title={displayUrl ? "Trocar imagem" : "Adicionar imagem"}
            className="!h-9 min-w-0 flex-1 !px-2 border-primary/30 text-primary hover:bg-primary/5"
          ><Upload size={14} /> {displayUrl ? "Trocar" : "Adicionar"}</AdminButton>
          {onRemove && Boolean(currentMediaId) && <AdminButton
            variant="secondary"
            size="sm"
            onClick={handleRemove}
            disabled={uploading}
            aria-label={`Remover ${label.toLowerCase()}`}
            title={`Remover ${label.toLowerCase()}`}
            className="!h-9 !w-9 !min-w-9 shrink-0 !p-0 border-destructive/30 text-destructive hover:bg-destructive/5"
          ><Trash2 size={16} /></AdminButton>}
        </div>
      : <div className="space-y-2">
          {photoActions ? <div className="grid w-full min-w-0 grid-cols-2 gap-2">
            <AdminButton variant="secondary" size="sm" onClick={() => inputRef.current?.click()} loading={uploading} loadingText="Enviando..." aria-label={displayUrl ? "Trocar imagem" : "Adicionar imagem"} title={displayUrl ? "Trocar imagem" : "Adicionar imagem"} className="h-[42px] w-full min-w-0 justify-center gap-1.5 border-primary/30 px-2 py-0 text-primary hover:bg-primary/5 md:px-3"><Upload size={18} className="shrink-0" /><span className="hidden text-xs md:inline">{displayUrl ? "Trocar" : "Adicionar"}</span></AdminButton>
            <AdminButton variant="secondary" size="sm" onClick={() => cameraInputRef.current?.click()} loading={uploading} loadingText="Enviando..." aria-label="Abrir câmera" title="Abrir câmera" className="h-[42px] w-full min-w-0 justify-center gap-1.5 border-primary/30 px-2 py-0 text-primary hover:bg-primary/5 md:px-3"><Camera size={18} className="shrink-0" /><span className="hidden text-xs md:inline">Câmera</span></AdminButton>
          </div> : <AdminButton variant="secondary" size="sm" onClick={() => inputRef.current?.click()} loading={uploading} loadingText="Enviando..." className="border-primary/30 text-primary hover:bg-primary/5"><Upload size={13} /> {displayUrl ? "Trocar imagem" : "Selecionar imagem"}</AdminButton>}
          {onRemove && Boolean(currentMediaId) && <AdminButton
            variant="secondary"
            size="sm"
            onClick={handleRemove}
            disabled={uploading}
            aria-label={`Remover ${label.toLowerCase()}`}
            title={`Remover ${label.toLowerCase()}`}
            className="border-destructive/30 text-destructive hover:bg-destructive/5"
          ><Trash2 size={16} /> Remover imagem</AdminButton>}
        </div>
    )}
    {!coverFill && canUpload && onRemove && !currentMediaId && <p className="mt-2 text-[11px] text-muted-foreground">Sem imagem. Você pode deixar este campo vazio.</p>}
  </div>;
}

export function ProductAdminThumb({ mediaId, name }: { mediaId: string | null; name: string }) {
  const { url } = useMediaUrl(mediaId);
  return url ? <img src={url} alt={name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-border" /> : <div className="w-10 h-10 bg-muted rounded-lg flex-shrink-0 border border-border flex items-center justify-center"><Package size={16} className="text-muted-foreground" /></div>;
}

export function BrandAdminLogo({ mediaId, name }: { mediaId: string | null; name: string }) {
  const { url } = useMediaUrl(mediaId);
  return url ? <img src={url} alt={name} className="h-12 w-auto object-contain max-w-full" /> : <div className="w-12 h-12 bg-muted rounded-lg flex-shrink-0 border border-border flex items-center justify-center"><Tag size={20} className="text-muted-foreground" /></div>;
}
