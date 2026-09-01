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

function permissionKey(situationId: string) {
  return `orders.images.situation.${situationId}.upload`;
}

function mediaRecord(row: SituationMedia) {
  return Array.isArray(row.media) ? row.media[0] : row.media;
}

function SituationImageThumb({ row, onView }: { row: SituationMedia; onView?: Props["onView"] }) {
  const { url, loading, error } = useMediaUrl(row.media_id);
  const media = mediaRecord(row);
  const name = media?.file_name || "Anexo da situação";
  return <button type="button" onClick={() => onView?.({ key: row.id, mediaId: row.media_id, name })} className="group relative h-24 w-28 overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-[#f5f7fa] text-left shadow-sm">
    {loading ? <span className="flex h-full items-center justify-center text-[10px] text-[#5a6a82]">Carregando...</span> : error || !url ? <span className="flex h-full items-center justify-center px-2 text-center text-[10px] text-red-600">Imagem indisponível</span> : <img src={url} alt={name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />}
    <span className="absolute inset-x-0 bottom-0 truncate bg-[#0d1b2e]/70 px-2 py-1 text-[9px] font-semibold text-white">{name}</span>
  </button>;
}

export function OrderSituationImages({ orderId, serviceTypeId, currentSituationId, situations, serviceTypeSituations, onView }: Props) {
  const { hasPermission } = useAuth();
  const [items, setItems] = useState<SituationMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingSituationId, setUploadingSituationId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

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
    const selected = Array.from(files || []).filter(file => ["image/jpeg", "image/png", "image/webp"].includes(file.type));
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
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const path = `orders/${orderId}/situations/${situation.id}/${Date.now()}-${crypto.randomUUID()}-${safeName}.${extension}`;
        const mediaId = await createMediaRecord({ bucket: "service-images", path, file });
        const { error } = await supabase.rpc("attach_service_order_situation_media", { p_service_order_id: orderId, p_situation_id: situation.id, p_media_id: mediaId });
        if (error) throw error;
      }
      await load();
      setMessage({ text: `Anexo${selected.length > 1 ? "s" : ""} salvo${selected.length > 1 ? "s" : ""} em ${situation.name}.`, type: "success" });
    } catch (error) {
      setMessage({ text: `Não foi possível anexar: ${supabaseErrorMessage(error)}`, type: "error" });
    } finally {
      setUploadingSituationId(null);
      const input = inputRefs.current[situation.id];
      if (input) input.value = "";
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
          {canUpload && <><input ref={element => { inputRefs.current[situation.id] = element; }} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={event => void upload(situation, event.target.files)} /><button type="button" disabled={Boolean(uploadingSituationId)} onClick={() => inputRefs.current[situation.id]?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-[#0057e7]/25 bg-[#f0f6ff] px-2.5 py-1.5 text-[11px] font-bold text-[#0057e7] disabled:opacity-50"><Upload size={13} />{uploadingSituationId === situation.id ? "Enviando..." : "Anexar"}</button></>}
        </div>
        {situationItems.length > 0 ? <div className="flex flex-wrap gap-2">{situationItems.map(row => <SituationImageThumb key={row.id} row={row} onView={onView} />)}</div> : <div className="rounded-lg border border-dashed border-[#0d1b2e]/10 px-3 py-4 text-center text-[11px] text-[#5a6a82]">Nenhuma imagem registrada nesta situação.{canUpload ? " Use Anexar para adicionar fotos." : " Você não possui permissão para anexar aqui."}</div>}
      </div>;
    })}
  </div>;
}
