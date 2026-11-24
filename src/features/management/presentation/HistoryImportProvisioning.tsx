import { useEffect,useState } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AdminButton,AdminDialog } from "@/shared/ui/admin/AdminLayout";
type Company={id:string;name:string};
type Job={id:string;account_phone:string;state:string;total:number;counts:Array<{state:string;count:number}>};
export function HistoryImportProvisioning({onClose}:{onClose:()=>void}){
 const {activeOrganizationId,activeOrganization,hasPermission}=useAuth();
 const allowed=activeOrganization?.is_platform_operator===true&&hasPermission("platform.management.manage");
 const [companies,setCompanies]=useState<Company[]>([]),[company,setCompany]=useState(""),[packageId,setPackageId]=useState("");
 const [jobs,setJobs]=useState<Job[]>([]),[connected,setConnected]=useState(false),[confirmGrant,setConfirmGrant]=useState(false),[grants,setGrants]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 async function call(body:Record<string,unknown>){
   if(!allowed||!activeOrganizationId)throw Error("Acesso restrito.");
   const {data,error}=await supabase.functions.invoke("union-history-import",{body:{...body,organization_id:activeOrganizationId}});
   if(error||data?.success!==true)throw Error("Operação não confirmada.");
   return data.result;
 }
 useEffect(()=>{
   let live=true;
   if(allowed)void call({action:"platform_companies"}).then(r=>{if(live)setCompanies(r)}).catch(()=>{if(live)setError("Não foi possível consultar as empresas.")});
   return()=>{live=false};
 },[activeOrganizationId,allowed]);
 async function run(grant:boolean){
   setBusy(true);setError("");setNotice("");setJobs([]);setConnected(false);setConfirmGrant(false);setGrants([]);
   try{
     if(grant){await call({action:"grant",target_organization_id:company,package_id:packageId});setNotice("Pacote disponibilizado. A empresa deverá selecionar a conta e confirmar a validação.");setPackageId("")}
     const r=await call({action:"platform_list",target_organization_id:company});setJobs(r.jobs||[]);setGrants((r.packages||[]).map((p:{package_id:string})=>p.package_id));setConnected(true);
   }catch{setError("Operação não confirmada. O pacote pode já estar associado a uma empresa.")}
   finally{setBusy(false)}
 }
 if(!allowed)return null;
 return <AdminDialog open onClose={onClose} title="Disponibilizar históricos" description="Administração Union · nenhum dado é publicado nas conversas nesta etapa.">
   <div className="space-y-3 p-4">
    <label className="block text-sm space-y-1"><span>Empresa autorizada</span><select className="w-full bg-card border border-border rounded-lg p-2" value={company} disabled={busy} onChange={e=>{setCompany(e.target.value);setJobs([]);setNotice("");setConnected(false);setConfirmGrant(false);setGrants([])}}><option value="">Selecione</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label className="block text-sm space-y-1"><span>Identificador do pacote verificado</span><input className="w-full bg-card border border-border rounded-lg p-2" value={packageId} disabled={busy} maxLength={20} onChange={e=>{setPackageId(e.target.value.trim());setConfirmGrant(false)}}/></label>
    <p className="text-xs text-muted-foreground">A autorização é exclusiva da empresa selecionada. Confirme o destino antes de disponibilizar. A associação não pode ser transferida automaticamente.</p>
    <div className="flex gap-2 flex-wrap"><AdminButton disabled={busy||!company||!/^[a-f0-9]{20}$/.test(packageId)} onClick={()=>setConfirmGrant(true)}>Disponibilizar pacote</AdminButton><AdminButton variant="secondary" disabled={busy||!company} onClick={()=>void run(false)}>Consultar importações</AdminButton></div>
    {confirmGrant&&<div className="rounded-lg border border-border p-3 space-y-2"><p className="text-sm">Confirma disponibilizar o pacote {packageId} exclusivamente para {companies.find(c=>c.id===company)?.name}? O vínculo da empresa não será alterado automaticamente.</p><div className="flex gap-2"><AdminButton disabled={busy} onClick={()=>void run(true)}>Confirmar empresa</AdminButton><AdminButton variant="secondary" onClick={()=>setConfirmGrant(false)}>Voltar</AdminButton></div></div>}
    {connected&&<div role="status" className="rounded-lg border border-border p-3 text-sm"><strong>Conexão com importador validada</strong><p>{grants.length} pacote(s) autorizado(s) · {jobs.length} importação(ões)</p>{grants.map(id=><p key={id} className="text-xs text-muted-foreground">Pacote: {id}</p>)}</div>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{notice&&<p className="text-sm">{notice}</p>}
    {jobs.map(j=><div key={j.id} className="rounded-lg border border-border p-3 text-sm"><strong>+{j.account_phone}</strong><p>{j.counts.find(c=>c.state==="verified")?.count||0}/{j.total} contatos validados · {j.state}</p></div>)}
   </div>
 </AdminDialog>;
}
