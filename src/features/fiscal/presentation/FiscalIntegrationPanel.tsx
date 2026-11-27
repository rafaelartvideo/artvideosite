import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { supabase } from "@/lib/supabase";
type Account={id:string;provider:string;label:string;cnpj_limit:number;is_active:boolean;inventory_verified_at:string|null;used:number};
type Company={name:string;cnpj:string};
export function FiscalIntegrationPanel({organizationId}:{organizationId:string}){
  const [busy,setBusy]=useState<string|null>(null);
  const [diagnostic,setDiagnostic]=useState<{accountId:string;companies:Company[]}|null>(null);
  const [error,setError]=useState("");
  const accounts=useQuery({queryKey:["fiscal-admin-accounts",organizationId],queryFn:async()=>{
    const r=await supabase.functions.invoke("fiscal-admin",{body:{action:"status"}});
    if(r.error||!Array.isArray(r.data?.data))throw new Error("Integração indisponível.");
    return r.data.data as Account[];
  },retry:false,staleTime:15000});
  async function test(accountId:string){
    setBusy(accountId);setDiagnostic(null);setError("");
    try{
      const r=await supabase.functions.invoke("fiscal-admin",{body:{action:"test",accountId}});
      if(r.error||!Array.isArray(r.data?.data?.companies))throw new Error("Não foi possível validar a conexão.");
      setDiagnostic({accountId,companies:r.data.data.companies});
    }catch{setError("Não foi possível validar a conexão. Confira o token de sessão configurado no servidor e o acesso do usuário.");}
    finally{setBusy(null);}
  }
  return <section className="space-y-3 rounded-lg border border-border bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Contas fiscais</h2><p className="text-xs text-muted-foreground">Contas compartilhadas, CNPJs e diagnóstico de conexão.</p></div><AdminButton variant="secondary" size="sm" disabled={accounts.isFetching} onClick={()=>void accounts.refetch()}>Atualizar</AdminButton></div>
    {accounts.isPending?<p className="text-sm text-muted-foreground">Consultando contas…</p>:accounts.isError?<p role="alert" className="text-sm text-muted-foreground">A administração fiscal ainda não está disponível no servidor.</p>:accounts.data.length===0?<p className="text-sm text-muted-foreground">Nenhuma conta fiscal configurada.</p>:accounts.data.map(a=><div key={a.id} className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-semibold">{a.label}</div><div className="text-xs text-muted-foreground">{a.provider} · {a.used} de {a.cnpj_limit} vagas registradas · {a.is_active?"Ativa":"Inativa"}</div></div>
      {a.provider==="fiscontrole"&&<AdminButton variant="secondary" size="sm" disabled={busy!==null} onClick={()=>void test(a.id)}>{busy===a.id?"Consultando…":"Testar conexão"}</AdminButton>}</div>
      <p className="text-xs text-muted-foreground">{a.inventory_verified_at?"Inventário verificado em "+new Date(a.inventory_verified_at).toLocaleString("pt-BR"):"Inventário ainda não verificado"}</p>
      {diagnostic?.accountId===a.id&&<div className="space-y-2 border-t border-border pt-2"><p className="text-sm font-medium">CNPJs acessíveis no provedor</p>{diagnostic.companies.length===0?<p className="text-xs text-muted-foreground">Nenhuma empresa retornada.</p>:diagnostic.companies.map((c,i)=><div key={c.cnpj+":"+i} className="flex flex-wrap justify-between gap-2 text-sm"><span>{c.name||"Empresa sem nome"}</span><span className="text-muted-foreground">{c.cnpj}</span></div>)}<p className="text-xs text-muted-foreground">A consulta não cria vínculos, não confirma capacidade de emissão e não modifica o inventário.</p></div>}
    </div>)}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <p className="text-xs text-muted-foreground">O token permanece no servidor. O cadastramento seguro de contas e a vinculação de CNPJs ainda precisam ser liberados pela implantação.</p>
  </section>;
}
