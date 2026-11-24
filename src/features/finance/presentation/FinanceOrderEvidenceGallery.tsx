import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon, LoaderCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { UnionWhatsAppMediaViewer } from "@/features/whatsapp-channels/presentation/UnionWhatsAppMediaViewer";
import {
  createFinancialAttachmentSignedUrl, createFinancialAttachmentThumbnailUrl, listFinancialAttachments,
} from "../infrastructure/finance-documents.repository";
import type { FinancialAttachment } from "../domain/finance.types";

type EvidenceKind = "payment_proof" | "delivery_evidence";
function matchesKind(attachment: FinancialAttachment, kind: EvidenceKind) {
  if (attachment.source_document_kind === kind) return true;
  return kind === "payment_proof" && attachment.source_document_kind == null && attachment.attachment_type === "proof";
}
export function isFinancialEvidenceImage(document: FinancialAttachment) {
  return Boolean(document.mime_type?.startsWith("image/") || /\.(?:jpe?g|png|webp|gif)$/i.test(document.file_name));
}

function EvidencePhoto({ document, organizationId, label }: { document: FinancialAttachment; organizationId: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible,setVisible] = useState(false);
  const [loaded,setLoaded] = useState(false);
  const [failed,setFailed] = useState(false);
  useEffect(()=>{
    if(!ref.current)return;
    if(typeof IntersectionObserver==="undefined"){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{if(entries.some(item=>item.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:"100px"});
    observer.observe(ref.current);
    return ()=>observer.disconnect();
  },[]);
  const query=useQuery({
    queryKey:["finance",organizationId,"evidence-thumbnail",document.id,document.storage_path],
    enabled:visible,staleTime:240_000,gcTime:300_000,retry:false,refetchOnWindowFocus:false,
    queryFn:()=>createFinancialAttachmentThumbnailUrl(document.storage_path,document.storage_bucket||"financial-documents"),
  });
  const url=query.data;
  return <div ref={ref} className="relative h-24 w-full overflow-hidden rounded-md bg-muted/30">
    {!loaded && !failed && !query.isError && <div role="status" aria-label="Carregando miniatura" className="absolute inset-0 flex items-center justify-center text-muted-foreground">
      {visible ? <LoaderCircle size={18} className="animate-spin"/> : <ImageIcon size={20}/>}
    </div>}
    {failed || query.isError ? <div className="flex h-full flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground"><ImageIcon size={20}/> Abrir imagem</div> : url && <img src={url} alt={label} loading="lazy" decoding="async" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)} className={`h-full w-full object-contain transition-opacity ${loaded?"opacity-100":"opacity-0"}`}/>}
  </div>;
}

/** The original is signed and downloaded only after the user opens a document. */
export function FinanceEvidenceViewer({ document, organizationId, onClose }: { document: FinancialAttachment; organizationId:string; onClose:()=>void }) {
  const query=useQuery({
    queryKey:["finance",organizationId,"evidence-original",document.id,document.storage_path],
    enabled:Boolean(organizationId),staleTime:240_000,gcTime:300_000,retry:false,refetchOnWindowFocus:false,
    queryFn:()=>createFinancialAttachmentSignedUrl(document.storage_path,document.storage_bucket||"financial-documents"),
  });
  return <AdminDialog open title={document.file_name} onClose={onClose} className="max-w-5xl">
    {query.isPending ? <div role="status" className="flex h-48 items-center justify-center gap-2 text-muted-foreground"><LoaderCircle size={20} className="animate-spin"/> Carregando arquivo...</div>
      : query.isError || !query.data ? <p role="alert" className="text-sm text-destructive">Não foi possível abrir o arquivo. <button type="button" className="underline" onClick={()=>void query.refetch()}>Tentar novamente</button></p>
      : <div className="relative h-[65vh] overflow-hidden rounded-lg"><UnionWhatsAppMediaViewer url={query.data} name={document.file_name} type={isFinancialEvidenceImage(document)?"image":"file"} onClose={onClose} placement="drawer"/></div>}
  </AdminDialog>;
}

export function FinanceOrderEvidenceGallery({ entryId, kind }: { entryId: string; kind: EvidenceKind }) {
  const {activeOrganizationId,hasPermission}=useAuth();
  const canView=hasPermission("finance.documents.view")||hasPermission("finance.documents.manage");
  const organizationId=activeOrganizationId||"";
  const label=kind==="payment_proof"?"Comprovante de pagamento":"Evidência de entrega";
  const [selected,setSelected]=useState<FinancialAttachment|null>(null);
  const query=useQuery({
    queryKey:queryKeys.finance.attachments(organizationId||"none",entryId),
    enabled: Boolean(canView && organizationId && entryId),staleTime:60_000,
    queryFn:()=>listFinancialAttachments(organizationId, entryId),
  });
  useEffect(()=>setSelected(null),[organizationId,entryId]);
  if(!canView||!organizationId)return null;
  if(query.isError)return <p role="alert" className="text-xs text-destructive">Não foi possível consultar os documentos.</p>;
  const evidence=(query.data||[]).filter(document=>matchesKind(document,kind));
  // No empty proof section, including warranty accounts and old entries without attachments.
  if(!evidence.length)return null;
  return <section aria-label={label} className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
    <div className="flex items-center gap-2"><ImageIcon size={17} className="text-primary"/><h3 className="text-sm font-bold text-foreground">{label}</h3></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {evidence.map(document=><button key={document.id} type="button" onClick={()=>setSelected(document)} className="min-w-0 space-y-1.5 rounded-lg border border-border p-2 text-left hover:border-primary/40">
        {isFinancialEvidenceImage(document)?<EvidencePhoto document={document} organizationId={organizationId} label={label}/>:<div className="flex h-24 items-center justify-center rounded-md bg-muted/40"><FileText size={28} className="text-muted-foreground"/></div>}
        <span className="block truncate text-xs font-semibold text-foreground" title={document.file_name}>{document.file_name}</span>
        <span className="block text-[11px] text-muted-foreground">Visualizar</span>
      </button>)}
    </div>
    {selected&&<FinanceEvidenceViewer document={selected} organizationId={organizationId} onClose={()=>setSelected(null)}/>}
  </section>;
}
