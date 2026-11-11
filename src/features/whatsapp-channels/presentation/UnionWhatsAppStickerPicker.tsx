import { useMemo, useState } from "react";
import { Clock3, ImagePlus, LoaderCircle, Star, Trash2, X } from "lucide-react";
import type { UnionWhatsAppSavedSticker } from "../infrastructure/union-whatsapp-inbox.repository";

type StickerTab = "company" | "recent" | "favorites";

export function UnionWhatsAppStickerPicker({
  stickers, loading, busyId, onSend, onFavorite, onRemove, onUpload, onClose,
}: {
  stickers: UnionWhatsAppSavedSticker[];
  loading: boolean;
  busyId: string | null;
  onSend: (sticker: UnionWhatsAppSavedSticker) => void;
  onFavorite: (sticker: UnionWhatsAppSavedSticker) => void;
  onRemove: (sticker: UnionWhatsAppSavedSticker) => void;
  onUpload: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<StickerTab>("company");
  const displayed = useMemo(() => {
    const filtered = tab === "favorites" ? stickers.filter(item => item.is_favorite) :
      tab === "recent" ? stickers.filter(item => item.last_used_at) : [...stickers];
    return filtered.sort((a,b) => tab === "recent"
      ? Date.parse(b.last_used_at||b.created_at)-Date.parse(a.last_used_at||a.created_at)
      : tab === "favorites"
        ? Date.parse(b.created_at)-Date.parse(a.created_at)
        : Date.parse(b.created_at)-Date.parse(a.created_at));
  },[stickers,tab]);
  return <div role="dialog" aria-label="Figurinhas da empresa"
    className="absolute bottom-[calc(100%+10px)] left-0 z-50 w-[min(92vw,370px)] overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl">
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
      <strong className="text-sm">Figurinhas</strong>
      <div className="flex items-center gap-1">
        <button type="button" onClick={onUpload}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-primary hover:bg-muted"
          title="Adicionar figurinha WebP (até 1 MB)"><ImagePlus size={15}/> Adicionar</button>
        <button type="button" onClick={onClose} aria-label="Fechar figurinhas"
          className="rounded-md p-1.5 hover:bg-muted"><X size={16}/></button>
      </div>
    </div>
    <div role="tablist" aria-label="Coleção de figurinhas" className="flex gap-1 border-b border-border px-2 py-2">
      {([
        ["company","Da empresa"],
        ["recent","Recentes"],
        ["favorites","Favoritas"],
      ] as const).map(([key,label])=>
        <button type="button" key={key} role="tab" aria-selected={tab===key}
          onClick={()=>setTab(key)}
          className={`flex-1 rounded-lg px-1.5 py-2 text-[11px] font-semibold transition-colors ${tab===key?"bg-primary/10 text-primary":"text-muted-foreground hover:bg-muted"}`}>
          {label}
        </button>)}
    </div>
    <div className="max-h-[288px] min-h-32 overflow-y-auto px-2 py-3">
      {loading ? <div className="flex min-h-28 items-center justify-center gap-2 text-xs text-muted-foreground">
        <LoaderCircle className="animate-spin" size={16}/> Carregando figurinhas...
      </div> : displayed.length === 0 ?
        <div className="flex min-h-28 flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
          {tab==="recent" ? <Clock3 size={20}/> : <Star size={20}/>}
          {tab==="recent" ? "As figurinhas enviadas aparecerão aqui." :
            tab==="favorites" ? "Favorite uma figurinha para encontrá-la aqui." :
            "Envie um WebP ou salve uma figurinha recebida."}
        </div> :
        <div className="grid grid-cols-3 gap-2">
          {displayed.map(sticker=>
            <div key={sticker.id} className="group relative flex min-h-[98px] flex-col items-center rounded-lg hover:bg-muted/50">
              <button type="button" disabled={Boolean(busyId)||!sticker.preview_url}
                onClick={()=>onSend(sticker)}
                aria-label="Enviar figurinha" title="Enviar figurinha"
                className="flex h-[84px] w-full items-center justify-center p-1 disabled:opacity-50">
                {sticker.preview_url ?
                  <img src={sticker.preview_url} alt="Figurinha salva" loading="lazy" decoding="async"
                    className="max-h-[80px] max-w-[84px] object-contain"/> :
                  <span className="text-[10px] text-muted-foreground">Sem prévia</span>}
                {busyId===sticker.id && <LoaderCircle size={18} className="absolute animate-spin text-primary"/>}
              </button>
              <div className="flex w-full items-center justify-around pb-1">
                <button type="button" disabled={Boolean(busyId)} aria-label={sticker.is_favorite?"Remover dos favoritos":"Favoritar figurinha"}
                  onClick={()=>onFavorite(sticker)} title={sticker.is_favorite?"Remover dos favoritos":"Favoritar"}
                  className={`rounded-md p-1 hover:bg-muted ${sticker.is_favorite?"text-amber-500":"text-muted-foreground"}`}>
                  <Star size={14} fill={sticker.is_favorite?"currentColor":"none"}/>
                </button>
                {sticker.can_remove && <button type="button" disabled={Boolean(busyId)} onClick={()=>onRemove(sticker)}
                  aria-label="Remover figurinha da coleção" title="Remover da coleção"
                  className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 size={14}/>
                </button>}
              </div>
            </div>)}
        </div>}
    </div>
    <p className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
      Figurinhas compartilhadas apenas com esta empresa. Toque para enviar.
    </p>
  </div>;
}
