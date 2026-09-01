import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle, Upload, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useMediaUrl } from "@/lib/hooks";
import { supabase } from "@/lib/supabase";
import { cn, createMediaRecord, supabaseErrorMessage } from "./shared";

type Situation = { id: string; name: string; color?: string | null; sort_order?: number | null };
type ServiceTypeSituation = { service_type_id: string; situation_id: string; sort_order?: number | null; situation?: Situation | Situation[] | null };
type SituationMedia = { id: string; service_order_id: string; situation_id: string; media_id: string; created_at: string; media?: { id: string; file_name?: string | null } | { id: string; file_name?: string | null }[] | null };

type Props = {
  orderId: string;
  serviceTypeId?: string | null;
  currentSituationId?: string | null;
  situations: Situation[];
  serviceTypeSituations: ServiceTypeSituation[];
  onView?: (image: { key: string; mediaId: string; name: string }) => void;
};

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const permissionKey = (situationId: string) => `orders.images.situation.${situationId}.upload`;
const mediaRecord = (row: SituationMedia) => Array.isArray(row.media) ? row.media[0] : row.media;

function SituationImageThumb({ row, onView, canRemove, removing, onRemove }: { row: SituationMedia; onView?: Props["onView"]; canRemove: boolean; removing: boolean; onRemove: (row: SituationMedia) => void }) {
  const { url, loading, error } = useMediaUrl(row.media_id);
  const media = mediaRecord(row);
  const name = media?.file_name || "Anexo da situação";
  return <div className="group relative h-24 w-28 overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-[#f5f7fa] shadow-sm">
    <button type="button" onClick={() => onView?.({ key: row.id, mediaId: row.media_id, name })} className="h-full w-full text-left">
      {loading ? <span className="flex h-full items-center justify-center text-[10px] text-[#5a6a82]">Carregando...</span> : error || !url ? <span className="flex h-full items-center justify-center px-2 text-center text-[10px] text-red-600">Imagem indisponível</span> : <img src={url} alt={name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />}
      <span className="absolute inset-x-0 bottom-0 truncate bg-[#0d1b2e]/70 px-2 py-1 text-[9px] font-semibold text-white">{name}</span>
    </button>
    {canRemove && <button type="button" disabled={removing} title="Remover documento" aria-label={`Remover ${name}`} onClick={event => { event.stopPropagation(); onRemove(row); }} className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white text-red-600 shadow-md transition hover:bg-red-50 disabled:opacity-50"><X size={13} /></button>}
  </div>;
}

export function OrderSituationImages({ orderId, serviceTypeId, currentSituationId, situations, serviceTypeSituations, onView }: Props) {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<SituationMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingSituationId, setUploadingSituationId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const cameraRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const flowSituations = useMemo(() => {
    if (!serviceTypeId) return situations.slice().sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    return serviceTypeSituations
      .filter(link => link.service_type_id === serviceTypeId)
      .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
      .map(link => {
        const linked = Array.isArray(link.situation) ? link.situation[0] : link.situation;
        return linked || situations.find(item => item.id === link.situation_id) || null;
      })
      .filter((item): item is Situation => Boolean(item));
  }, [serviceTypeId, serviceTypeSituations, situations]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("service_order_situation_media").select("id,service_order_id,situation_id,media_id,created_at,media:media(id,file_name)").eq("service_order_id", orderId).order("created_at", { ascending: true });
    if (error) {
      setItems([]);
      setMessage({ text: `Não foi possível carregar os anexos: ${supabaseErrorMessage(error)}`, type: "error" });
    } else setItems((data || []) as SituationMedia[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [orderId]);

  const upload = async (situation: Situation, files: FileList | null) => {
    const selected = Array.from(files || []).filter(file => acceptedTypes.has(file.type));
    if (selected.length === 0 || uploadingSituationId) return;
    if (!hasPermission(permissionKey(situation.id))) {
      setMessage({ text: `Você não possui permissão para anexar imagens em ${situation.name}.`, type: "error" });
      return;
    }
    setUploadingSituationId(situation.id);
    setMessage(null);
    try {
      for (const file of selected) {
        const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `orders/${orderId}/situations/${situation.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
        const { error: storageError } = await supabase.storage.from("service-images").upload(path, file, { upsert: false });
        if (storageError) throw storageError;
        let mediaId: string;
        try {
          mediaId = await createMediaRecord({ bucket: "service-images", path, file });
        } catch (mediaError) {
          await supabase.storage.from("service-images").remove([path]);
          throw mediaError;
        }
        const { error: linkError } = await supabase.rpc("attach_service_order_situation_media", { p_service_order_id: orderId, p_situation_id: situation.id, p_media_id: mediaId });
        if (linkError) throw linkError;
      }
      await load();
      setMessage({ text: `${selected.length} ${selected.length === 1 ? "imagem anexada" : "imagens anexadas"} em ${situation.name}.`, type: "success" });
    } catch (error) {
      setMessage({ text: `Não foi possível anexar: ${supabaseErrorMessage(error)}`, type: "error" });
    } finally {
      setUploadingSituationId(null);
      if (fileRefs.current[situation.id]) fileRefs.current[situation.id]!.value = "";
      if (cameraRefs.current[situation.id]) cameraRefs.current[situation.id]!.value = "";
    }
  };

  const removeDocument = async (row: SituationMedia) => {
    if (removingId) return;
    if (!hasPermission("orders.documents.remove")) {
      setMessage({ text: "Você não possui permissão para remover documentos.", type: "error" });
      return;
    }
    if (!window.confirm("Remover este documento da OS?")) return;
    setRemovingId(row.id);
    setMessage(null);
    try {
      const { error } = await supabase.rpc("remove_service_order_situation_media", { p_link_id: row.id });
      if (error) throw error;
      await load();
      setMessage({ text: "Documento removido.", type: "success" });
    } catch (error) {
      setMessage({ text: `Não foi possível remover: ${supabaseErrorMessage(error)}`, type: "error" });
    } finally {
      setRemovingId(null);
    }
  };

  if (!hasPermission("orders.section.images")) return null;

  return <div className="space-y-3">
    {message && <div className={cn("flex items-start justify-between gap-3 rounded-lg border px-3 py-2 text-xs", message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700")}><span className="flex items-center gap-2">{message.type === "success" ? <CheckCircle size={14} /> : <Camera size={14} />}{message.text}</span><button type="button" onClick={() => setMessage(null)}><X size={13} /></button></div>}
    {loading ? <p className="text-xs text-[#5a6a82]">Carregando imagens por situação...</p> : flowSituations.length === 0 ? <p className="text-xs text-[#5a6a82]">Este tipo de atendimento ainda não possui situações configuradas.</p> : flowSituations.map(situation => {
      const situationItems = items.filter(item => item.situation_id === situation.id);
      const canUpload = hasPermission(permissionKey(situation.id));
      const isCurrent = situation.id === currentSituationId;
      return <div key={situation.id} className={cn("rounded-xl border p-3", isCurrent ? "border-[#0057e7]/30 bg-[#f7faff]" : "border-[#0d1b2e]/10 bg-white")}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: situation.color || "#0057e7" }} /><div><p className="text-xs font-bold text-[#0d1b2e]">{situation.name}</p><p className="text-[10px] text-[#5a6a82]">{situationItems.length} anexo{situationItems.length !== 1 ? "s" : ""}{isCurrent ? " · situação atual" : ""}</p></div></div>
          {canUpload && <div className="flex flex-wrap gap-2">
            <input ref={element => { fileRefs.current[situation.id] = element; }} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={event => void upload(situation, event.target.files)} />
            <input ref={element => { cameraRefs.current[situation.id] = element; }} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => void upload(situation, event.target.files)} />
            <button type="button" disabled={Boolean(uploadingSituationId)} onClick={() => fileRefs.current[situation.id]?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#0057e7]/25 bg-[#f0f6ff] px-2.5 py-1.5 text-[11px] font-bold text-[#0057e7] disabled:opacity-50"><Upload size={13} />{uploadingSituationId === situation.id ? "Enviando..." : "Anexar"}</button>
            <button type="button" disabled={Boolean(uploadingSituationId)} onClick={() => cameraRefs.current[situation.id]?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#0057e7]/25 bg-white px-2.5 py-1.5 text-[11px] font-bold text-[#0057e7] disabled:opacity-50"><Camera size={13} /> Câmera</button>
          </div>}
        </div>
        {situationItems.length > 0 ? <div className="flex flex-wrap gap-2">{situationItems.map(row => <SituationImageThumb key={row.id} row={row} onView={onView} canRemove={hasPermission("orders.documents.remove")} removing={removingId === row.id} onRemove={removeDocument} />)}</div> : <div className="rounded-lg border border-dashed border-[#0d1b2e]/10 px-3 py-4 text-center text-[11px] text-[#5a6a82]">Nenhuma imagem registrada nesta situação.{canUpload ? " Use Anexar ou Câmera para adicionar fotos." : " Você não possui permissão para anexar aqui."}</div>}
      </div>;
    })}
  </div>;
}