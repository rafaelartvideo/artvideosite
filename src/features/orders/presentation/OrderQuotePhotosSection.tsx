import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, ImagePlus, Trash2, X } from "lucide-react";
import { AdminDialog, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { LoadingSpinner, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  addOrderQuotePhoto, listOrderQuotePhotos, removeOrderQuotePhoto,
  validateOrderQuotePhoto, type OrderQuotePhoto,
} from "../infrastructure/order-quote-photos.repository";

const MAX_PHOTOS = 20;

export function OrderQuotePhotosSection({
  organizationId, orderId, canUpload, canRemove,
}: {
  organizationId: string;
  orderId: string;
  canUpload: boolean;
  canRemove: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["orders", "quote-photos", organizationId, orderId] as const;
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [viewing, setViewing] = useState<OrderQuotePhoto | null>(null);
  const [removeTarget, setRemoveTarget] = useState<OrderQuotePhoto | null>(null);

  const previews = useMemo(() => selected.map(file => ({ file, url: URL.createObjectURL(file) })), [selected]);
  useEffect(() => () => previews.forEach(item => URL.revokeObjectURL(item.url)), [previews]);
  useEffect(() => {
    setSelected([]);
    setViewing(null);
    setRemoveTarget(null);
  }, [organizationId, orderId]);

  const { data: photos = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => listOrderQuotePhotos(organizationId, orderId),
    enabled: Boolean(organizationId && orderId),
    staleTime: 120_000,
    refetchOnWindowFocus: false,
  });

  const choose = (files: FileList | null) => {
    const next = Array.from(files || []);
    if (!next.length) return;
    try {
      next.forEach(validateOrderQuotePhoto);
      if (photos.length + selected.length + next.length > MAX_PHOTOS) {
        throw new Error(`São permitidas até ${MAX_PHOTOS} fotos por orçamento.`);
      }
      setSelected(previous => [...previous, ...next]);
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível selecionar as fotos."), "error");
    }
  };

  const upload = async () => {
    if (!canUpload || uploading || !selected.length) return;
    setUploading(true);
    let sent = 0;
    try {
      for (const file of selected) {
        await addOrderQuotePhoto(organizationId, orderId, file);
        sent++;
      }
      setSelected([]);
      notifyAdmin(`${sent} ${sent === 1 ? "foto adicionada" : "fotos adicionadas"} ao orçamento.`, "success");
    } catch (error) {
      // Preserve only the files that were not sent.
      setSelected(previous => previous.slice(sent));
      notifyAdmin(systemErrorMessage(error, "Não foi possível enviar todas as fotos."), "error");
    } finally {
      setUploading(false);
      if (sent) await queryClient.invalidateQueries({ queryKey });
    }
  };

  const remove = async () => {
    if (!removeTarget || removing || !canRemove) return;
    setRemoving(true);
    try {
      await removeOrderQuotePhoto(removeTarget.id);
      setRemoveTarget(null);
      if (viewing?.id === removeTarget.id) setViewing(null);
      await queryClient.invalidateQueries({ queryKey });
      notifyAdmin("Foto removida do orçamento.", "success");
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível remover a foto."), "error");
    } finally {
      setRemoving(false);
    }
  };

  return <>
    <Section title="Fotos do orçamento">
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          As imagens anexadas aqui serão incluídas automaticamente na impressão e no PDF do orçamento.
        </p>
        {canUpload && <div className="flex flex-wrap gap-2">
          <input ref={fileRef} className="hidden" type="file" multiple
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            onChange={event => { choose(event.target.files); event.currentTarget.value = ""; }} />
          <input ref={cameraRef} className="hidden" type="file" accept="image/*" capture="environment"
            onChange={event => { choose(event.target.files); event.currentTarget.value = ""; }} />
          <BtnSecondary disabled={uploading || photos.length + selected.length >= MAX_PHOTOS}
            onClick={() => fileRef.current?.click()}><ImagePlus size={15}/> Adicionar fotos</BtnSecondary>
          <BtnSecondary disabled={uploading || photos.length + selected.length >= MAX_PHOTOS}
            onClick={() => cameraRef.current?.click()}><Camera size={15}/> Usar câmera</BtnSecondary>
        </div>}
        {selected.length > 0 && <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs font-semibold">Prévia antes de enviar ({selected.length})</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {previews.map((preview, index) => <div key={preview.url} className="relative min-w-0 overflow-hidden rounded-lg border border-border bg-card">
              <img src={preview.url} alt={preview.file.name} className="h-32 w-full object-contain"/>
              <p className="truncate px-2 py-1.5 text-[11px] text-muted-foreground" title={preview.file.name}>{preview.file.name}</p>
              <button type="button" disabled={uploading} aria-label={`Retirar ${preview.file.name} da seleção`}
                onClick={() => setSelected(files => files.filter((_, i) => i !== index))}
                className="absolute right-1 top-1 rounded-md bg-background/90 p-1.5 text-foreground shadow-sm hover:text-destructive disabled:opacity-50">
                <X size={13}/>
              </button>
            </div>)}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <BtnSecondary disabled={uploading} onClick={() => setSelected([])}>Cancelar</BtnSecondary>
            <BtnPrimary disabled={uploading} loading={uploading} onClick={() => void upload()}>
              {uploading ? "Enviando fotos" : `Enviar ${selected.length} ${selected.length === 1 ? "foto" : "fotos"}`}
            </BtnPrimary>
          </div>
        </div>}
        {isLoading && <div className="flex justify-center py-5"><LoadingSpinner /></div>}
        {error && <p role="alert" className="text-xs text-destructive">
          {systemErrorMessage(error, "Não foi possível carregar as fotos do orçamento.")}
        </p>}
        {!isLoading && !error && !photos.length && !selected.length &&
          <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma foto adicionada ao orçamento.</p>}
        {photos.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((photo, index) => <div key={photo.id} className="relative min-w-0 overflow-hidden rounded-lg border border-border bg-card">
            <button type="button" onClick={() => setViewing(photo)} className="block w-full"
              aria-label={`Visualizar foto ${index + 1} do orçamento`}>
              <img src={photo.url} alt={`Foto ${index + 1} do orçamento`}
                className="h-36 w-full object-contain" loading="lazy"/>
            </button>
            <div className="flex items-center justify-between gap-2 px-2 py-2">
              <span className="truncate text-[11px] text-muted-foreground" title={photo.fileName}>Foto {index + 1}</span>
              {canRemove && <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Remover foto ${index + 1}`} onClick={() => setRemoveTarget(photo)}>
                <Trash2 size={14}/>
              </button>}
            </div>
          </div>)}
        </div>}
      </div>
    </Section>
    <AdminDialog open={Boolean(viewing)} onClose={() => setViewing(null)} title="Foto do orçamento"
      className="max-w-4xl" footer={<div className="flex justify-end"><BtnSecondary onClick={() => setViewing(null)}>Fechar</BtnSecondary></div>}>
      {viewing && <img src={viewing.url} alt={viewing.fileName}
        className="max-h-[70vh] w-full rounded-lg bg-muted object-contain"/>}
    </AdminDialog>
    <AdminDialog open={Boolean(removeTarget)} onClose={() => { if (!removing) setRemoveTarget(null); }}
      title="Remover foto" description="A foto será retirada deste orçamento."
      footer={<div className="flex justify-end gap-2">
        <BtnSecondary disabled={removing} onClick={() => setRemoveTarget(null)}>Cancelar</BtnSecondary>
        <BtnPrimary disabled={removing} loading={removing} onClick={() => void remove()}>Remover foto</BtnPrimary>
      </div>}>
      <p className="text-sm text-muted-foreground">Confirma a exclusão desta foto do orçamento?</p>
    </AdminDialog>
  </>;
}
