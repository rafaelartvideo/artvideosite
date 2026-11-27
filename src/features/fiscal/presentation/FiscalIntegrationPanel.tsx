import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { supabase } from "@/lib/supabase";
type Account={id:string;provider:string;label:string;cnpj_limit:number;is_active:boolean;inventory_verified_at:string|null;used:number};
type Company={name:string;cnpj:string};
type EmissionDiagnosis={emitterId:number;environment:2;identity:"confirmed"|"unverified";models:unknown;profileCount:number|null;productionEnabled:false};
export function FiscalIntegrationPanel({organizationId,targetCompany,onActivated}:{organizationId:string;targetCompany:{id:string;name:string}|null;onActivated:(id:string)=>void}){
  const [busy,setBusy]=useState<string|null>(null);
  const [editing,setEditing]=useState<string|null>(null);
  const [label,setLabel]=useState("");
  const [cnpjLimit,setCnpjLimit]=useState("6");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [diagnostic,setDiagnostic]=useState<{accountId:string;companies:Company[]}|null>(null);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [emitterId,setEmitterId]=useState("");
  const [emission,setEmission]=useState<{accountId:string;result:EmissionDiagnosis}|null>(null);
  const [confirmAccount,setConfirmAccount]=useState<string|null>(null);
  const accounts=useQuery({queryKey:["fiscal-admin-accounts",organizationId],queryFn:async()=>{
    const r=await supabase.functions.invoke("fiscal-admin",{body:{action:"status"}});
    if(r.error||!Array.isArray(r.data?.data))throw new Error("Integração indisponível.");
    return r.data.data as Account[];
  },retry:false,staleTime:15000});
  function startConnect(account?:Account){
    setEditing(account?.id||"new");setLabel(account?.label||"");setCnpjLimit(String(account?.cnpj_limit||6));setEmail("");setPassword("");setError("");setDiagnostic(null);
  }
  async function connect(){
    if(!editing||busy)return;
    setBusy(editing);setError("");setDiagnostic(null);
    try{
      const r=await supabase.functions.invoke("fiscal-admin",{body:{action:"connect",...(editing==="new"?{}:{accountId:editing}),label,cnpjLimit:Number(cnpjLimit),email,password}});
      if(r.error||typeof r.data?.data?.accountId!=="string"||!Array.isArray(r.data?.data?.companies))throw new Error("Não foi possível conectar.");
      setDiagnostic({accountId:r.data.data.accountId,companies:r.data.data.companies});setEditing(null);setEmail("");void accounts.refetch();
    }catch{setError("Não foi possível conectar e salvar a conta. Confira os dados, a disponibilidade do servidor e o limite contratado.");}
    finally{setPassword("");setBusy(null);}
  }
  async function bind(accountId:string){
    if(!targetCompany||busy||confirmAccount!==accountId)return;
    setBusy(accountId);setError("");setNotice("");
    try{
      const r=await supabase.functions.invoke("fiscal-admin",{body:{action:"bind_read",accountId,organizationId:targetCompany.id,confirm:true}});
      if(r.error||r.data?.data?.readEnabled!==true)throw new Error("Vínculo não confirmado.");
      onActivated(targetCompany.id);setNotice("Consulta fiscal habilitada para "+targetCompany.name+". Nenhuma emissão foi autorizada.");void accounts.refetch();
    }catch{setError("Não foi possível habilitar a empresa. Confira o CNPJ, a conta do provedor e as vagas contratadas.");}
    finally{setConfirmAccount(null);setBusy(null);}
  }
  async function checkEmission(accountId:string){
    if(!targetCompany||busy)return;
    setBusy(accountId);setError("");setEmission(null);setNotice("");
    try{
      const numericId=emitterId.trim()?Number(emitterId.trim()):undefined;
      if(numericId!==undefined&&(!Number.isSafeInteger(numericId)||numericId<1)){setError("Informe um ID de empresa válido, com números.");return;}
      const r=await supabase.functions.invoke("fiscal-admin",{body:{action:"emission_diagnosis",accountId,organizationId:targetCompany.id,...(numericId===undefined?{}:{emitterId:numericId})}});
      if(r.error||!r.data?.data){
        let code="";
        try{const response=(r.error as {context?:Response}|null)?.context;if(response instanceof Response)code=(await response.json()).error;}catch{/* no raw error display */}
        const messages:Record<string,string>={
          EMITTER_ID_REQUIRED:"Informe o ID numérico da empresa no Fiscontrole (não é o CNPJ). A API de consulta não retornou esse identificador.",
          EMITTER_ID_MISMATCH:"O ID informado não corresponde à empresa vinculada. Confira o cadastro no Fiscontrole.",
          FISCAL_BINDING_REQUIRED:"Vincule e habilite a empresa antes de consultar a emissão.",
          CNPJ_NOT_AUTHORIZED_BY_PROVIDER:"O CNPJ da empresa não foi localizado entre as empresas acessíveis.",
          FISCAL_BOOTSTRAP_SCHEMA_UNRECOGNIZED:"O Fiscontrole respondeu com um formato de diagnóstico não reconhecido.",
          EMISSION_DIAGNOSIS_FAILED:"Não foi possível consultar a preparação de emissão no Fiscontrole."
        };
        setError(messages[code]||"Não foi possível consultar a preparação fiscal. Confira a conexão e o identificador da empresa.");return;
      }
      setEmission({accountId,result:r.data.data as EmissionDiagnosis});
    }catch{setError("Não foi possível consultar a preparação fiscal.");}
    finally{setBusy(null);}
  }
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
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Contas fiscais</h2><p className="text-xs text-muted-foreground">Contas compartilhadas, CNPJs e diagnóstico de conexão.</p></div><div className="flex gap-2"><AdminButton variant="secondary" size="sm" disabled={accounts.isFetching} onClick={()=>void accounts.refetch()}>Atualizar</AdminButton><AdminButton size="sm" disabled={!accounts.isSuccess||busy!==null} onClick={()=>startConnect()}>Nova conta</AdminButton></div></div>
    {targetCompany&&<p className="rounded-lg border border-border bg-muted/20 p-3 text-sm">Empresa selecionada: <strong>{targetCompany.name}</strong>. O servidor verificará o CNPJ antes de habilitar a leitura.</p>}
    {editing!==null&&<form onSubmit={e=>{e.preventDefault();void connect();}} className="space-y-3 rounded-lg border border-border p-3">
      <h3 className="font-semibold text-sm">{editing==="new"?"Conectar Fiscontrole":"Renovar sessão"}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Identificação da conta <span className="text-destructive">*</span><input required maxLength={120} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3" value={label} onChange={e=>setLabel(e.target.value)}/></label>
        <label className="text-sm">Limite contratado de CNPJs <span className="text-destructive">*</span><input required type="number" min={1} max={10000} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3" value={cnpjLimit} onChange={e=>setCnpjLimit(e.target.value)}/></label>
        <label className="text-sm">E-mail Fiscontrole <span className="text-destructive">*</span><input required type="email" autoComplete="username" maxLength={254} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3" value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label className="text-sm">Senha <span className="text-destructive">*</span><input required type="password" autoComplete="current-password" maxLength={512} className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3" value={password} onChange={e=>setPassword(e.target.value)}/></label>
      </div>
      <p className="text-xs text-muted-foreground">A senha será usada apenas para obter o token de sessão. A conta não será ativada automaticamente. Renovar a sessão suspende a ativação anterior até nova verificação.</p>
      <div className="flex justify-end gap-2"><AdminButton type="button" variant="secondary" disabled={busy!==null} onClick={()=>{setEditing(null);setPassword("");setEmail("");}}>Cancelar</AdminButton><AdminButton type="submit" disabled={busy!==null}>{busy?"Conectando…":"Conectar e salvar"}</AdminButton></div>
    </form>}
    {accounts.isPending?<p className="text-sm text-muted-foreground">Consultando contas…</p>:accounts.isError?<p role="alert" className="text-sm text-muted-foreground">A administração fiscal ainda não está disponível no servidor.</p>:accounts.data.length===0?<p className="text-sm text-muted-foreground">Nenhuma conta fiscal configurada.</p>:accounts.data.map(a=><div key={a.id} className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-semibold">{a.label}</div><div className="text-xs text-muted-foreground">{a.provider} · {a.used} de {a.cnpj_limit} vagas registradas · {a.is_active?"Ativa":"Inativa"}</div></div>
      {a.provider==="fiscontrole"&&<div className="flex gap-2"><AdminButton variant="secondary" size="sm" disabled={busy!==null} onClick={()=>startConnect(a)}>Renovar sessão</AdminButton><AdminButton variant="secondary" size="sm" disabled={busy!==null} onClick={()=>void test(a.id)}>{busy===a.id?"Consultando…":"Testar conexão"}</AdminButton>{targetCompany&&<AdminButton size="sm" disabled={busy!==null} onClick={()=>setConfirmAccount(a.id)}>Vincular empresa</AdminButton>}</div>}</div>
      {confirmAccount===a.id&&targetCompany&&<div className="space-y-2 rounded-lg border border-border p-3"><p className="text-sm">Habilitar consulta e captura fiscal para <strong>{targetCompany.name}</strong> nesta conta? Nenhuma nota será emitida.</p><div className="flex justify-end gap-2"><AdminButton variant="secondary" size="sm" disabled={busy!==null} onClick={()=>setConfirmAccount(null)}>Cancelar</AdminButton><AdminButton size="sm" disabled={busy!==null} onClick={()=>void bind(a.id)}>Confirmar vínculo</AdminButton></div></div>}
      {a.provider==="fiscontrole"&&a.is_active&&targetCompany&&<div className="space-y-3 border-t border-border pt-3">
        <div><h3 className="text-sm font-semibold">Preparação para emissão</h3><p className="text-xs text-muted-foreground">Homologação · {targetCompany.name}. Consulta de certificado, perfis, séries e disponibilidade fiscal.</p></div>
        <form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();void checkEmission(a.id);}}>
          <label className="text-sm flex-1 min-w-[180px]">ID da empresa no Fiscontrole<input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={15} placeholder="Identificador numérico (opcional para busca automática)" className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm" value={emitterId} onChange={e=>setEmitterId(e.target.value)}/></label>
          <AdminButton type="submit" size="sm" disabled={busy!==null}>{busy===a.id?"Consultando…":"Verificar emissão"}</AdminButton>
        </form>
        {emission?.accountId===a.id&&<div className="space-y-2 rounded-lg border border-border p-3">
          <p role="status" className="text-sm font-medium">Diagnóstico recebido · ID {emission.result.emitterId}</p>
          <p className="text-xs text-muted-foreground">{emission.result.identity==="confirmed"?"Identidade retornada pelo provedor confirmada.":"O retorno não confirmou explicitamente a identidade fiscal; o vínculo de emissão permanece pendente."}</p>
          {emission.result.profileCount!==null&&<p className="text-sm">Perfis retornados: {emission.result.profileCount}</p>}
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 p-3 text-xs">{JSON.stringify(emission.result.models,null,2)}</pre>
          <p className="text-xs text-muted-foreground">A consulta não cria rascunhos, não habilita produção e não transmite notas.</p>
        </div>}
      </div>}
      <p className="text-xs text-muted-foreground">{a.inventory_verified_at?"Inventário verificado em "+new Date(a.inventory_verified_at).toLocaleString("pt-BR"):"Inventário ainda não verificado"}</p>
      {diagnostic?.accountId===a.id&&<div className="space-y-2 border-t border-border pt-2"><p className="text-sm font-medium">CNPJs acessíveis no provedor</p>{diagnostic.companies.length===0?<p className="text-xs text-muted-foreground">Nenhuma empresa retornada.</p>:diagnostic.companies.map((c,i)=><div key={c.cnpj+":"+i} className="flex flex-wrap justify-between gap-2 text-sm"><span>{c.name||"Empresa sem nome"}</span><span className="text-muted-foreground">{c.cnpj}</span></div>)}<p className="text-xs text-muted-foreground">A consulta não cria vínculos, não confirma capacidade de emissão e não modifica o inventário.</p></div>}
    </div>)}
    {notice&&<p role="status" className="text-sm text-foreground">{notice}</p>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    <p className="text-xs text-muted-foreground">O token permanece no servidor. A vinculação e ativação de CNPJs dependem da confirmação do cadastro no provedor.</p>
  </section>;
}
