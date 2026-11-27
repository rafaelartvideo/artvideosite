import { useState } from "react";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { supabase } from "@/lib/supabase";

type Profile={id:string|number;version:string|number;model:"55";catalogCode:string|number};
type Operation={id:string;state:string;remote_id:string|null;protocol:string|null;created_at:string;error_code:string|null};
type Status={issuerId:number;identitySource:string;ready:boolean;profiles:Profile[];series:string[];profileFields?:string[];operations?:Operation[]};
const labels:Record<string,string>={prepared:"Preparada",creating:"Criando",draft:"Rascunho remoto",create_uncertain:"Criação incerta",validating:"Validando",validated:"Validada localmente",validation_rejected:"Validação rejeitada",validation_unknown:"Validação inconclusiva",issuing:"Reservando emissão",queued:"Na fila",issue_uncertain:"Envio inconclusivo",processing:"Processando",awaiting_confirmation:"Aguardando confirmação fiscal",checking:"Consultando",authorized:"Autorizada em homologação",rejected:"Rejeitada",abandoned:"Encerrada"};
const errors:Record<string,string>={NFE_HOMOLOGATION_DISABLED:"Piloto de homologação ainda não liberado no servidor.",EMITTER_BINDING_REQUIRED:"Confirme primeiro o vínculo do emitente.",EMITTER_IDENTITY_UNVERIFIED:"O provedor não confirmou o emitente e a verificação manual de conta única não está disponível.",EMITTER_ID_MISMATCH:"O ID não corresponde à empresa.",EMITTER_CONFIRMATION_REQUIRED:"Confirme o CNPJ e o identificador exibidos no painel do Fiscontrole.",MODEL_NOT_READY:"A NF-e deixou de estar pronta em homologação.",PROFILE_OR_SERIES_UNVERIFIED:"O perfil ou a série não está mais disponível. Consulte novamente.",OPERATION_CONFLICT:"A operação já está em outro estado. Consulte o histórico antes de prosseguir.",OPERATION_NOT_AVAILABLE:"Operação indisponível nesta sessão. Não crie outra nota para tentar resolver.",FISCAL_PERSISTENCE_FAILED:"Não foi possível persistir a operação. Consulte o histórico antes de repetir.",NFE_PROVIDER_OR_PERSISTENCE_UNCERTAIN:"Resultado inconclusivo. Consulte o histórico; não repita a criação ou transmissão.",PILOT_ONLY_INTRASTATE_SE:"Este piloto aceita apenas destinatários de Sergipe.",INVALID_FIELD:"Confira os campos comerciais obrigatórios.",INVALID_AMOUNT:"Informe um valor positivo e um desconto menor que o valor do item."};
const cls="mt-1 h-9 w-full rounded-lg border border-border bg-background px-3 text-sm";
export function NfeHomologationPanel({accountId,organizationId,emitterId}:{accountId:string;organizationId:string;emitterId:number}){
  const [status,setStatus]=useState<Status|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [cnpj,setCnpj]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [profileIndex,setProfileIndex]=useState("");
  const [series,setSeries]=useState("");
  const [form,setForm]=useState({taxId:"",name:"",street:"",number:"",district:"",city:"",municipality:"",postalCode:"",description:"",price:"10.00",discount:"0.00"});
  const [requestKey,setRequestKey]=useState<string|null>(null);
  const [operation,setOperation]=useState<Operation|null>(null);
  function field(key:keyof typeof form,value:string){setForm(old=>({...old,[key]:value}));}
  async function call<T>(action:string,extra:Record<string,unknown>={}):Promise<T>{
    const r=await supabase.functions.invoke("fiscal-admin",{body:{action,accountId,organizationId,...extra}});
    if(r.error||!r.data?.data){
      let code="";try{const context=(r.error as {context?:Response}|null)?.context;if(context instanceof Response)code=(await context.json()).error;}catch{/* do not display raw response */}
      throw Error(errors[code]||"Não foi possível concluir. Consulte o estado da operação antes de repetir.");
    }
    return r.data.data as T;
  }
  async function run(task:()=>Promise<void>){
    if(busy)return;setBusy(true);setError("");setNotice("");
    try{await task();}catch(e){setError(e instanceof Error?e.message:"Falha na operação.");}finally{setBusy(false);}
  }
  async function refresh(){
    const data=await call<Status>("nfe_status");
    setStatus(data);
    const active=data.operations?.find(x=>!["authorized","rejected","abandoned"].includes(x.state));
    setOperation(active??data.operations?.[0]??null);
  }
  const open=operation&&!["authorized","rejected","abandoned"].includes(operation.state);
  const selected=status?.profiles[Number(profileIndex)];
  async function prepare(){
    if(!selected||!series||open)return;
    const key=requestKey??crypto.randomUUID();setRequestKey(key);
    const data=await call<Operation>("nfe_prepare",{requestKey:key,profileId:selected.id,profileVersion:selected.version,series,commercial:{description:form.description,unitPrice:form.price,discount:form.discount,customer:{tax_id:form.taxId,name:form.name,address:{street:form.street,number:form.number,district:form.district,city:form.city,uf:"SE",municipality:form.municipality,postal_code:form.postalCode}}}});
    setOperation(data);setNotice("Operação preparada no CRM. Nenhuma nota foi transmitida.");setRequestKey(null);
  }
  async function step(action:string,confirmation=false){
    if(!operation)return;
    const data=await call<Operation>(action,{operationId:operation.id,...(confirmation?{confirm:true}:{})});
    setOperation(data);setNotice(labels[data.state]||data.state);
  }
  return <section className="space-y-4 rounded-lg border border-border p-4">
    <div><h4 className="text-sm font-semibold">Piloto de emissão de NF-e</h4><p className="text-xs text-muted-foreground">Homologação · sem validade fiscal. Somente administração da plataforma. Um produto, venda interna de SE, pagamento à vista.</p></div>
    {!status&&<div className="space-y-2">
      <label className="block text-sm">CNPJ exibido junto ao ID {emitterId} no Fiscontrole<input className={cls} value={cnpj} onChange={e=>setCnpj(e.target.value)} placeholder="CNPJ da empresa" /></label>
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Confirmei no painel do Fiscontrole que o ID corresponde a este CNPJ. Autorizo somente a preparação do vínculo em homologação.</label>
      <div className="flex flex-wrap gap-2"><AdminButton size="sm" disabled={busy||!confirmed||cnpj.replace(/\D/g,"").length!==14} onClick={()=>void run(async()=>{await call("nfe_bind",{emitterId,confirmedCnpj:cnpj.replace(/\D/g,""),confirm:true});await refresh();})}>Confirmar emitente de teste</AdminButton><AdminButton size="sm" variant="secondary" disabled={busy} onClick={()=>void run(refresh)}>Consultar vínculo existente</AdminButton></div>
    </div>}
    {status&&<>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{status.ready?"NF-e pronta no provedor":"Preparação pendente"} · ID {status.issuerId}</span><AdminButton size="sm" variant="secondary" disabled={busy} onClick={()=>void run(refresh)}>Consultar operações</AdminButton></div>
      {!status.profiles.length&&<div className="space-y-1 text-sm text-muted-foreground"><p>Não há perfil de NF-e com ID, versão, modelo e código de catálogo reconhecidos. A emissão está bloqueada.</p>{!!status.profileFields?.length&&<p className="break-words text-xs">Campos disponíveis: {status.profileFields.join(", ")}</p>}</div>}
      {status.ready&&status.profiles.length>0&&!open&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void run(prepare);}}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Perfil fiscal<select required className={cls} value={profileIndex} onChange={e=>setProfileIndex(e.target.value)}><option value="">Selecione</option>{status.profiles.map((p,i)=><option key={i} value={i}>Perfil {p.id} · v{p.version} · código {p.catalogCode}</option>)}</select></label>
          <label className="text-sm">Série de homologação<select required className={cls} value={series} onChange={e=>setSeries(e.target.value)}><option value="">Selecione</option>{status.series.map(s=><option key={s}>{s}</option>)}</select></label>
          {([{key:"taxId",label:"CPF/CNPJ do destinatário de teste"},{key:"name",label:"Nome do destinatário de teste"},{key:"street",label:"Logradouro"},{key:"number",label:"Número"},{key:"district",label:"Bairro"},{key:"city",label:"Município (SE)"},{key:"municipality",label:"Código IBGE"},{key:"postalCode",label:"CEP"},{key:"description",label:"Descrição do produto"},{key:"price",label:"Valor unitário (R$)"},{key:"discount",label:"Desconto (R$)"}] as {key:keyof typeof form;label:string}[]).map(f=><label key={f.key} className="text-sm">{f.label}<input required className={cls} value={form[f.key]} onChange={e=>field(f.key,e.target.value)}/></label>)}
        </div>
        <p className="text-xs text-muted-foreground">Use dados válidos para o ensaio e confirme que o perfil corresponde ao produto. Os tributos são aplicados pelo Fiscontrole, não calculados nesta tela.</p>
        <AdminButton type="submit" size="sm" disabled={busy||!profileIndex||!series}>Preparar rascunho de teste</AdminButton>
      </form>}
      {operation&&<div className="space-y-2 rounded-lg border border-border p-3">
        <div className="text-sm font-semibold">{labels[operation.state]||operation.state}</div>
        <p className="break-all text-xs text-muted-foreground">Operação {operation.id}{operation.remote_id?" · Rascunho "+operation.remote_id:""}</p>
        {operation.protocol&&<p className="text-sm">Protocolo: {operation.protocol}</p>}
        <div className="flex flex-wrap gap-2">
          {operation.state==="prepared"&&<AdminButton size="sm" disabled={busy} onClick={()=>void run(()=>step("nfe_create"))}>Criar rascunho no Fiscontrole</AdminButton>}
          {operation.state==="draft"&&<AdminButton size="sm" disabled={busy} onClick={()=>void run(()=>step("nfe_validate"))}>Validar rascunho</AdminButton>}
          {operation.state==="validated"&&<AdminButton size="sm" disabled={busy} onClick={()=>{if(window.confirm("Reservar a emissão desta NF-e de teste em homologação?"))void run(()=>step("nfe_issue",true));}}>Enfileirar emissão de teste</AdminButton>}
          {operation.state==="queued"&&<AdminButton size="sm" disabled={busy} onClick={()=>{if(window.confirm("Transmitir esta NF-e em homologação, sem validade fiscal?"))void run(()=>step("nfe_process",true));}}>Transmitir em homologação</AdminButton>}
          {["awaiting_confirmation","issue_uncertain"].includes(operation.state)&&<AdminButton size="sm" disabled={busy} onClick={()=>void run(()=>step("nfe_detail"))}>Consultar autorização</AdminButton>}
        </div>
        {["creating","create_uncertain","validating","validation_unknown","validation_rejected","issuing","processing","checking"].includes(operation.state)&&<p className="text-xs text-muted-foreground">Operação bloqueada para revisão ou reconciliação; não crie uma segunda nota.</p>}
      </div>}
      {!!status.operations?.length&&<details className="text-xs"><summary className="cursor-pointer">Histórico de operações</summary>{status.operations.map(x=><p key={x.id} className="break-all py-1">{new Date(x.created_at).toLocaleString("pt-BR")} · {labels[x.state]||x.state} · {x.id}</p>)}</details>}
    </>}
    {busy&&<p className="text-xs text-muted-foreground">Consultando ou processando…</p>}
    {notice&&<p role="status" className="text-sm">{notice}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
