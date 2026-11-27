import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, RefreshCw, ShieldCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AdminButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";

const models = [
  ["","Todos os modelos"],["nfe","NF-e"],["nfce","NFC-e"],["nfse","NFS-e"],["cte","CT-e"],["eventonfe","Eventos NF-e"],["eventocte","Eventos CT-e"],
] as const;
type Status = { provider:string; cnpj:string; syncEnabled:boolean; productionEnabled:boolean };
type DocumentRow = { id:string; document_type:string; fiscal_key:string; issued_at_raw:string|null; captured_at:string };
type DocumentPage = { data:DocumentRow[]; pagination:{page:number;limit:number;hasMore:boolean} };
async function invoke<T>(body:Record<string,unknown>):Promise<T>{
  const result=await supabase.functions.invoke("fiscal-read",{body});
  if(result.error || !result.data) throw new Error("Não foi possível consultar a integração fiscal. Confira a habilitação e o vínculo da empresa.");
  return result.data as T;
}
export function FiscalPage(){
  const {activeOrganizationId,hasPermission,hasModule}=useAuth();
  if(!activeOrganizationId || !hasModule("fiscal") || !hasPermission("fiscal.documents.view")) return null;
  return <FiscalWorkspace key={activeOrganizationId} organizationId={activeOrganizationId}/>;
}
function FiscalWorkspace({organizationId}:{organizationId:string}){
  const {hasPermission}=useAuth();
  const [type,setType]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const [page,setPage]=useState(1);
  const status=useQuery({queryKey:["fiscal-status",organizationId],queryFn:()=>invoke<{data:Status}>({action:"status",organizationId}),retry:false,staleTime:30000});
  const documents=useQuery({
    queryKey:["fiscal-documents",organizationId,type,page],
    queryFn:()=>invoke<DocumentPage>({action:"list",organizationId,...(type?{type}:{}),page,limit:25}),
    enabled:status.isSuccess,retry:false,staleTime:15000,
  });
  async function sync(){
    if(!type||busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const result=await invoke<{data:{processed:number;hasMore:boolean}}>({action:"sync",organizationId,type});
      setNotice(result.data.processed+" documento(s) processado(s)."+(result.data.hasMore?" Há mais documentos. Sincronize novamente para continuar.":" Lote finalizado."));
      setPage(1);void documents.refetch();
    }catch{setError("Não foi possível sincronizar o lote. Confira a disponibilidade e a sessão do provedor.");}
    finally{setBusy(false);}
  }
  async function download(documentId:string){
    setError("");
    try{
      const result=await invoke<{data:{url:string}}>({action:"download",organizationId,documentId});
      const link=document.createElement("a");link.href=result.data.url;link.rel="noopener noreferrer";link.click();
    }catch{setError("Não foi possível baixar o XML.");}
  }
  const modelLabel=(key:string)=>models.find(([value])=>value===key)?.[1]||key;
  return <div className="min-w-0 space-y-4">
    <PageHeader title="Fiscal" subtitle="Documentos fiscais e integração da empresa." actions={<AdminButton variant="secondary" onClick={()=>{void status.refetch(); if(status.isSuccess)void documents.refetch();}} disabled={status.isFetching||documents.isFetching}><RefreshCw size={16}/> Atualizar</AdminButton>}/>
    {status.isPending?<AdminWorkspaceSkeleton/>:status.isError?<div role="alert" className="rounded-lg border border-border bg-card p-4 text-sm">
      <div className="font-semibold">Integração fiscal indisponível</div>
      <p className="mt-1 text-muted-foreground">O módulo precisa de vínculo ativo, autorização e configuração no Fiscontrole. Consulte a administração da Union World.</p>
    </div>:<>
      <section className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
        <ShieldCheck size={22} className="text-primary"/>
        <div className="flex-1"><div className="text-sm font-semibold">{status.data.data.provider==="fiscontrole"?"Fiscontrole":status.data.data.provider}</div><div className="text-xs text-muted-foreground">CNPJ {status.data.data.cnpj} · {status.data.data.syncEnabled?"Sincronização habilitada":"Sincronização desabilitada"}</div></div>
        <span className="text-xs text-muted-foreground">Emissão em produção indisponível</span>
      </section>
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><FileText size={17}/> Documentos capturados</h2>
          <div className="flex flex-wrap gap-2"><select aria-label="Modelo fiscal" className="h-9 rounded-lg border border-border bg-background px-3 text-sm" value={type} onChange={e=>{setType(e.target.value);setPage(1);}}>{models.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>{hasPermission("fiscal.sync.manage")&&status.data.data.syncEnabled&&<AdminButton size="sm" variant="secondary" disabled={!type||busy} onClick={()=>void sync()}>{busy?"Sincronizando…":"Sincronizar lote"}</AdminButton>}</div>
        </div>
        {notice&&<p role="status" className="text-sm">{notice}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
        {documents.isPending?<AdminWorkspaceSkeleton/>:documents.isError?<p role="alert" className="text-sm text-destructive">Não foi possível carregar os documentos.</p>:documents.data?.data.length===0?<p className="py-8 text-center text-sm text-muted-foreground">Nenhum documento capturado nesta consulta.</p>:<div className="overflow-x-auto">
          <table className="w-full text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="p-3">Modelo</th><th className="p-3">Identificador</th><th className="p-3">Data informada</th>{hasPermission("fiscal.documents.download")&&<th className="p-3">XML</th>}</tr></thead><tbody className="divide-y divide-border">
            {documents.data?.data.map(doc=><tr key={doc.id}><td className="whitespace-nowrap p-3">{modelLabel(doc.document_type)}</td><td className="break-all p-3 font-mono text-xs">{doc.fiscal_key}</td><td className="whitespace-nowrap p-3">{doc.issued_at_raw||"—"}</td>{hasPermission("fiscal.documents.download")&&<td className="p-3"><AdminButton size="sm" variant="secondary" onClick={()=>void download(doc.id)}>Baixar</AdminButton></td>}</tr>)}
          </tbody></table>
        </div>}
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground"><span>Página {page}</span>
          <AdminButton variant="secondary" size="sm" disabled={page===1||documents.isFetching} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/> Anterior</AdminButton>
          <AdminButton variant="secondary" size="sm" disabled={!documents.data?.pagination.hasMore||documents.isFetching} onClick={()=>setPage(p=>p+1)}>Próxima <ChevronRight size={16}/></AdminButton>
        </div>
        <p className="text-xs text-muted-foreground">A listagem mostra documentos capturados, não confirma a totalidade das emissões nem a situação fiscal atual.</p>
      </section>
    </>}
  </div>;
}
