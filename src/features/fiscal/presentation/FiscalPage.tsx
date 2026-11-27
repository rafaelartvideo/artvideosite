import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient=useQueryClient();
  const syncControl=useRef({running:false,stop:false,mounted:true});
  useEffect(()=>{syncControl.current.mounted=true;return()=>{syncControl.current.mounted=false;syncControl.current.stop=true;};},[]);
  const [type,setType]=useState("");
  const [busy,setBusy]=useState(false);
  const [pausing,setPausing]=useState(false);
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
    const control=syncControl.current;
    if(control.running||!control.mounted)return;
    control.running=true;control.stop=false;
    setBusy(true);setPausing(false);setError("");setNotice("");
    // Round-robin across models. A single request at a time, no automatic
    // retries on provider failure, and all progress is persisted server-side.
    const pending:string[]=type?[type]:models.filter(([key])=>key!=="").map(([key])=>key);
    let total=0, batches=0, completed=0;
    const modelCount=pending.length;
    const started=Date.now();
    let current="";
    const summary=()=>total+" documento(s) importado(s) nesta execução · "+completed+" de "+modelCount+" modelos consultados até o fim.";
    try{
      while(pending.length&&!control.stop&&control.mounted&&batches<60&&Date.now()-started<480000){
        current=pending.shift()!;
        const label=models.find(([key])=>key===current)?.[1]||current;
        setNotice(summary()+" Sincronizando "+label+"…");
        const result=await invoke<{data:{processed:number;hasMore:boolean}}>({action:"sync",organizationId,type:current});
        if(!Number.isSafeInteger(result.data?.processed)||result.data.processed<0||typeof result.data.hasMore!=="boolean"||(result.data.hasMore&&result.data.processed===0))throw new Error("INVALID_SYNC_RESULT");
        total+=result.data.processed;batches++;
        if(result.data.hasMore)pending.push(current);else completed++;
        if(control.mounted)setNotice(summary());
        if(pending.length&&!control.stop&&control.mounted&&batches<60)await new Promise<void>(resolve=>setTimeout(resolve,1500));
      }
      if(control.mounted)setNotice(summary()+(pending.length?" Sincronização pausada. Continue de onde parou quando desejar.":" Consulta concluída para os modelos selecionados."));
    }catch{
      if(control.mounted){
        const label=models.find(([key])=>key===current)?.[1]||current;
        setNotice(summary());
        setError("Não foi possível sincronizar "+label+". Os lotes concluídos foram preservados. Tente novamente mais tarde.");
      }
    }finally{
      control.running=false;
      if(control.mounted){setBusy(false);setPausing(false);setPage(1);}
      void queryClient.invalidateQueries({queryKey:["fiscal-documents",organizationId]});
    }
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
          <div className="flex flex-wrap gap-2"><select aria-label="Modelo fiscal" className="h-9 rounded-lg border border-border bg-background px-3 text-sm" value={type} disabled={busy} onChange={e=>{setType(e.target.value);setPage(1);}}>{models.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>{hasPermission("fiscal.sync.manage")&&status.data.data.syncEnabled&&(busy?<AdminButton size="sm" variant="secondary" disabled={pausing} onClick={()=>{syncControl.current.stop=true;setPausing(true);}}>{pausing?"Pausando…":"Pausar sincronização"}</AdminButton>:<AdminButton size="sm" variant="secondary" onClick={()=>void sync()}>{type?"Sincronizar modelo":"Sincronizar todos"}</AdminButton>)}</div>
        </div>
        {busy&&<p className="text-xs text-muted-foreground">Mantenha esta tela aberta. A pausa ocorre após o lote atual; os documentos já importados ficam salvos.</p>}
        {notice&&<p role="status" className="text-sm">{notice}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
        {documents.isPending?<AdminWorkspaceSkeleton/>:documents.isError?<p role="alert" className="text-sm text-destructive">Não foi possível carregar os documentos.</p>:documents.data?.data.length===0?<p className="py-8 text-center text-sm text-muted-foreground">Nenhum documento capturado nesta consulta.</p>:<div className="overflow-x-auto">
          <table className="w-full text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="p-3">Modelo</th><th className="p-3">Identificador</th><th className="p-3">Data informada</th>{hasPermission("fiscal.documents.download")&&<th className="p-3">XML</th>}</tr></thead><tbody className="divide-y divide-border">
            {documents.data?.data.map(doc=><tr key={doc.id}><td className="whitespace-nowrap p-3">{modelLabel(doc.document_type)}</td><td className="break-all p-3 font-mono text-xs">{doc.fiscal_key}</td><td className="whitespace-nowrap p-3">{doc.issued_at_raw||"—"}</td>{hasPermission("fiscal.documents.download")&&<td className="p-3"><AdminButton size="sm" variant="secondary" onClick={()=>void download(doc.id)}>Baixar</AdminButton></td>}</tr>)}
          </tbody></table>
        </div>}
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground"><span>Página {page}</span>
          <AdminButton variant="secondary" size="sm" disabled={busy||page===1||documents.isFetching} onClick={()=>setPage(p=>p-1)}><ChevronLeft size={16}/> Anterior</AdminButton>
          <AdminButton variant="secondary" size="sm" disabled={busy||!documents.data?.pagination.hasMore||documents.isFetching} onClick={()=>setPage(p=>p+1)}>Próxima <ChevronRight size={16}/></AdminButton>
        </div>
        <p className="text-xs text-muted-foreground">A listagem mostra documentos capturados, não confirma a totalidade das emissões nem a situação fiscal atual.</p>
      </section>
    </>}
  </div>;
}
