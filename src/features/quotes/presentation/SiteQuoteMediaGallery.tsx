import { useEffect, useState } from "react";
import { Camera, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AdminSectionEmpty, Section } from "@/shared/ui/admin/AdminLayout";

type Photo={id:string;name:string;kind:string;url:string};
const labels:Record<string,string>={
  equipment:"Equipamento",label:"Etiqueta",site:"Local do serviço",
};

/** Reutilizado na solicitação do site e na OS convertida. Nunca usa URL pública. */
export function SiteQuoteMediaGallery({quoteId,organizationId}:{
  quoteId:string;organizationId:string;
}){
  const [items,setItems]=useState<Photo[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    setLoading(true);setError("");setItems([]);
    void (async()=>{
      try{
        const result=await supabase.from("quote_media")
          .select("id,storage_path,file_name,kind")
          .eq("organization_id",organizationId).eq("quote_request_id",quoteId)
          .order("created_at",{ascending:true}).limit(12);
        if(result.error)throw result.error;
        const rows=result.data||[];
        const photos=await Promise.all(rows.map(async item=>{
          const signed=await supabase.storage.from("quote-images")
            .createSignedUrl(item.storage_path,60*15);
          if(signed.error||!signed.data?.signedUrl)throw signed.error||new Error("Foto indisponível.");
          return {id:item.id,name:item.file_name,kind:item.kind,url:signed.data.signedUrl};
        }));
        if(active)setItems(photos);
      }catch{
        if(active)setError("Não foi possível carregar os anexos.");
      }finally{if(active)setLoading(false);}
    })();
    return()=>{active=false;};
  },[quoteId,organizationId]);
  return <Section title="Fotos da solicitação">
    {loading?<p className="text-xs text-muted-foreground">Carregando fotos...</p>:
      error?<p role="alert" className="text-xs text-destructive">{error}</p>:
      !items.length?<AdminSectionEmpty>Nenhuma foto anexada.</AdminSectionEmpty>:
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(photo=><a key={photo.id} href={photo.url}
          target="_blank" rel="noopener noreferrer" aria-label={"Abrir foto: "+(labels[photo.kind]||photo.name)}
          className="group overflow-hidden rounded-lg border border-border bg-muted/20 transition-colors hover:border-primary/50">
          <div className="aspect-[4/3] bg-muted/30">
            <img src={photo.url} alt={labels[photo.kind]||photo.name}
              loading="lazy" className="h-full w-full object-cover"/>
          </div>
          <div className="flex items-center justify-between gap-1 px-3 py-2 text-xs">
            <span className="min-w-0 truncate font-semibold">{labels[photo.kind]||photo.name}</span>
            <ExternalLink size={13} className="shrink-0 text-muted-foreground"/>
          </div>
        </a>)}
      </div>}
  </Section>;
}
