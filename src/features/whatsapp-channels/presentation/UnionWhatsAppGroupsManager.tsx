import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Plus, Send, Users } from "lucide-react";
import { operateUnionWhatsAppInbox, type UnionWhatsAppGroup, type UnionWhatsAppGroupDetails } from "../infrastructure/union-whatsapp-inbox.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { UnionWhatsAppGroupAdvanced } from "./UnionWhatsAppGroupAdvanced";
import { UnionWhatsAppGroupChat } from "./UnionWhatsAppGroupChat";

type Mode = "view"|"name"|"topic"|"participants"|"send"|"leave";
type ParticipantAction = "add"|"remove"|"promote"|"demote";
type GroupCommand = "create"|"join"|"details"|"leave"|"participants"|"name"|"topic"|"send";

const buttonClass = "rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50";
const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function parsePhones(raw:string):string[]{
  return [...new Set(raw.split(/[\n,;]+/).map(s=>s.trim()).filter(Boolean).map(raw=>{
    if(raw.includes("@"))return raw;
    const number=raw.replace(/\D/g,"");
    return (number.length===10||number.length===11)?"55"+number:number;
  }))];
}

export function UnionWhatsAppGroupsManager({
  organizationId,accountPhone,group,creating,canManage,canSend,onChanged,onCancelCreate,
}:{
  organizationId:string;accountPhone:string;group:UnionWhatsAppGroup|null;
  creating:boolean;canManage:boolean;canSend:boolean;
  onChanged:(jid?:string|null)=>void;onCancelCreate:()=>void;
}){
  const [mode,setMode]=useState<Mode>("view");
  const [name,setName]=useState("");
  const [topic,setTopic]=useState("");
  const [phones,setPhones]=useState("");
  const [message,setMessage]=useState("");
  const [creationMode,setCreationMode]=useState<"create"|"join">("create");
  const [inviteCode,setInviteCode]=useState("");
  const [action,setAction]=useState<ParticipantAction>("add");
  const [memberJid,setMemberJid]=useState("");
  const [details,setDetails]=useState<UnionWhatsAppGroupDetails|null>(null);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [revision,setRevision]=useState(0);
  const messageId=useRef(crypto.randomUUID());

  useEffect(()=>{
    setMode("view");setName(group?.name||"");setTopic(group?.topic||"");
    setPhones("");setMessage("");setMemberJid("");setInviteCode("");setCreationMode("create");
    setAction("add");setError("");setNotice("");setConfirmed(false);
    messageId.current=crypto.randomUUID();
  },[group?.jid,creating]);

  useEffect(()=>{
    if(!group||!canManage||creating){setDetails(null);return;}
    let cancelled=false;
    setLoading(true);
    void operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_groups_manage",{
      account_phone:accountPhone,group_command:"details",group_jid:group.jid,
    }).then(result=>{if(!cancelled)setDetails(result.group||null);})
      .catch(reason=>{if(!cancelled){setDetails(null);setError(systemErrorMessage(reason,"Não foi possível consultar os participantes."));}})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[organizationId,accountPhone,group?.jid,canManage,creating,revision]);

  const choose=(next:Mode)=>{
    setMode(next);setError("");setNotice("");setConfirmed(false);
    setName(group?.name||"");setTopic(group?.topic||"");
    setPhones("");setMemberJid("");setAction("add");
  };

  const submit=async()=>{
    if(busy||(!group&&!creating)||!canManage)return;
    setError("");setNotice("");
    const command:GroupCommand=creating?creationMode:mode==="view"?"details":mode;
    if(command==="details")return;
    const list=command==="create"||(command==="participants"&&action==="add")?parsePhones(phones):
      command==="participants"?[memberJid]:[];
    if(command==="join" && !inviteCode.trim()){
      setError("Informe o link ou código de convite.");return;
    }
    if((command==="create"||command==="name")&&(name.trim().length<2||name.trim().length>100)){
      setError("Informe um nome de 2 a 100 caracteres.");return;
    }
    if((command==="create"||(command==="participants"&&action==="add"))&&(!list.length||list.length>50||list.some(value=>!/^[1-9][0-9]{7,14}$/.test(value)))){
      setError("Informe de 1 a 50 números com DDI, um por linha.");return;
    }
    if(command==="participants"&&action!=="add"&&!memberJid){
      setError("Selecione um participante.");return;
    }
    if(command==="send"&&(!canSend||!message.trim()||message.length>4000)){
      setError("Digite uma mensagem válida e verifique sua permissão de envio.");return;
    }
    if(command==="topic"&&topic.length>500){setError("A descrição pode ter até 500 caracteres.");return;}
    if((command==="leave"||(command==="participants"&&action==="remove"))&&!confirmed){
      setConfirmed(true);return;
    }
    setBusy(true);
    try{
      const result=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_groups_manage",{
        account_phone:accountPhone,group_command:command,group_jid:group?.jid||"",
        group_name:name.trim(),group_topic:topic,group_phones:list,
        group_participant_action:action,group_message:message.trim(),
        group_invite_code:inviteCode.trim(),
        ...(command==="send"?{client_message_id:messageId.current}:{}),
      });
      if(command==="send"){
        setMessage("");messageId.current=crypto.randomUUID();
        setNotice("Mensagem confirmada pelo WhatsApp.");
      }else if(command==="leave"){
        onChanged(null);setNotice("Você saiu do grupo.");choose("view");
        return;
      }else if(command==="create"||command==="join"){
        onCancelCreate();onChanged(result.jid||undefined);
        return;
      }else{
        onChanged();setRevision(n=>n+1);
        setNotice("Alteração confirmada pelo WhatsApp.");
      }
      setMode("view");setPhones("");setMemberJid("");setConfirmed(false);
    }catch(reason){
      setError(systemErrorMessage(reason,"Não foi possível concluir a operação no WhatsApp."));
    }finally{setBusy(false);}
  };

  if(!group&&!creating)return <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
    <Users size={34}/><p>Selecione um grupo para consultar seus detalhes.</p>
    {canManage&&<p>Use Novo grupo para criar um grupo diretamente no WhatsApp conectado.</p>}
  </div>;

  const members=details?.participants||[];
  const chosen=members.find(item=>item.jid===memberJid);
  const formMode=creating||mode!=="view";
  return <section aria-label="Gerenciar grupo WhatsApp" className="space-y-4">
    <div className="flex items-center gap-3">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Users size={23}/></span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-bold">{creating?"Criar grupo":group?.name}</h3>
        {!creating&&<p className="text-xs text-muted-foreground">{details?.participants_count??group?.participants_count} participantes</p>}
      </div>
    </div>
    {error&&<p role="alert" className="rounded-lg border border-destructive/30 p-3 text-xs text-destructive">{error}</p>}
    {notice&&<p role="status" className="rounded-lg border border-primary/25 p-3 text-xs">{notice}</p>}
    {!formMode&&group&&<>
      <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
        <p><strong>Nome:</strong> {group.name}</p>
        <p><strong>Descrição:</strong> {details?.topic||group.topic||"Sem descrição"}</p>
        <p><strong>Envio de mensagens:</strong> {group.is_announce?"Somente administradores":"Todos os participantes"}</p>
        <p className="break-all text-muted-foreground"><strong>ID:</strong> {group.jid}</p>
      </div>
      {canManage&&<>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={()=>choose("name")}>Renomear</button>
          <button type="button" className={buttonClass} onClick={()=>choose("topic")}>Descrição</button>
          <button type="button" className={buttonClass} onClick={()=>choose("participants")}>Participantes</button>
          {canSend&&<button type="button" className={buttonClass} onClick={()=>choose("send")}><Send size={13} className="mr-1 inline"/>Escrever</button>}
          <button type="button" className={buttonClass+" text-destructive"} onClick={()=>choose("leave")}>Sair do grupo</button>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-semibold">Membros do grupo {loading&&<LoaderCircle size={13} className="inline animate-spin"/>}</p>
          {!loading&&!members.length&&<p className="text-xs text-muted-foreground">Informações de membros indisponíveis.</p>}
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {members.map(item=><div key={item.jid} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-xs last:border-b-0">
              <span className="break-all">{item.jid}</span>
              {item.is_super_admin?<span className="text-primary">Criador</span>:item.is_admin?<span className="text-primary">Admin</span>:null}
            </div>)}
          </div>
        </div>
      </>}
      <p className="text-xs text-muted-foreground">Grupos são separados dos atendimentos individuais. Ações administrativas dependem dos privilégios deste número no WhatsApp.</p>
      {canManage&&<UnionWhatsAppGroupChat
        organizationId={organizationId} accountPhone={accountPhone}
        groupJid={group.jid} canSend={canSend}
      />}
      {canManage&&details&&<UnionWhatsAppGroupAdvanced
        organizationId={organizationId} accountPhone={accountPhone} group={details}
        onChanged={()=>{setRevision(n=>n+1);onChanged();}}
      />}
    </>}
    {formMode&&<div className="space-y-3 rounded-xl border border-border p-4">
      {creating&&<div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass+(creationMode==="create"?" border-primary text-primary":"")}
          onClick={()=>{setCreationMode("create");setError("");}}>Criar grupo</button>
        <button type="button" className={buttonClass+(creationMode==="join"?" border-primary text-primary":"")}
          onClick={()=>{setCreationMode("join");setError("");}}>Entrar por convite</button>
      </div>}
      {creating&&creationMode==="join"&&<label className="block space-y-1 text-xs font-semibold">
        <span>Convite do WhatsApp</span>
        <input className={inputClass} value={inviteCode} onChange={e=>setInviteCode(e.target.value)}
          placeholder="https://chat.whatsapp.com/..." autoFocus/>
        <span className="block font-normal text-muted-foreground">Informe um convite válido. A entrada poderá depender de aprovação pelo administrador do grupo.</span>
      </label>}
      {((creating&&creationMode==="create")||mode==="name")&&<label className="block space-y-1 text-xs font-semibold">
        <span>Nome do grupo</span><input className={inputClass} maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="Nome do grupo" autoFocus/>
      </label>}
      {mode==="topic"&&!creating&&<label className="block space-y-1 text-xs font-semibold">
        <span>Descrição</span><textarea className={inputClass} rows={4} maxLength={500} value={topic} onChange={e=>setTopic(e.target.value)}/>
      </label>}
      {((creating&&creationMode==="create")||(mode==="participants"&&action==="add"))&&<label className="block space-y-1 text-xs font-semibold">
        <span>{creating?"Participantes iniciais":"Adicionar contatos"}</span>
        <textarea className={inputClass} rows={5} value={phones} onChange={e=>setPhones(e.target.value)}
          placeholder={"5599999999999\n5588888888888"}/>
        <span className="block font-normal text-muted-foreground">Um número por linha, com DDI. Até 50 contatos por operação.</span>
      </label>}
      {mode==="participants"&&<div className="space-y-3">
        <label className="block space-y-1 text-xs font-semibold">
          <span>Operação</span>
          <select className={inputClass} value={action} onChange={e=>{setAction(e.target.value as ParticipantAction);setConfirmed(false);}}>
            <option value="add">Adicionar participantes</option>
            <option value="remove">Remover participante</option>
            <option value="promote">Promover a administrador</option>
            <option value="demote">Remover privilégio de administrador</option>
          </select>
        </label>
        {action!=="add"&&<label className="block space-y-1 text-xs font-semibold">
          <span>Participante</span>
          <select className={inputClass} value={memberJid} onChange={e=>{setMemberJid(e.target.value);setConfirmed(false);}}>
            <option value="">Selecione um participante</option>
            {members.filter(item=>!item.is_super_admin && (action!=="promote"||!item.is_admin) && (action!=="demote"||item.is_admin)).map(item=>
              <option key={item.jid} value={item.jid}>{item.jid}{item.is_admin?" (Admin)":""}</option>)}
          </select>
          {!members.length&&<span className="block font-normal text-muted-foreground">Atualize os detalhes para carregar os membros.</span>}
        </label>}
        {chosen?.is_admin&&action==="remove"&&<p className="text-xs text-muted-foreground">Este participante é administrador.</p>}
      </div>}
      {mode==="send"&&<label className="block space-y-1 text-xs font-semibold">
        <span>Mensagem para o grupo</span><textarea className={inputClass} rows={5} maxLength={4000} value={message}
          onChange={e=>{setMessage(e.target.value);messageId.current=crypto.randomUUID();}} placeholder="Escreva sua mensagem..."/>
        <span className="block font-normal text-muted-foreground">O envio será feito no WhatsApp. O histórico de mensagens de grupos ainda não é exibido no atendimento individual.</span>
      </label>}
      {mode==="leave"&&<p className="text-sm text-destructive">Deseja realmente sair deste grupo? O número conectado perderá acesso às mensagens e à administração.</p>}
      {confirmed&&<p role="alert" className="text-xs font-semibold text-destructive">Confirme novamente para executar esta ação no WhatsApp.</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={buttonClass} disabled={busy}
          onClick={()=>{if(creating)onCancelCreate();else choose("view");}}>Cancelar</button>
        <button type="button" disabled={busy} onClick={()=>void submit()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">
          {busy?<LoaderCircle size={14} className="animate-spin"/>:creating?<Plus size={14}/>:mode==="send"?<Send size={14}/>:null}
          {creating?(creationMode==="join"?"Entrar no grupo":"Criar grupo"):mode==="leave"?"Confirmar saída":mode==="send"?"Enviar":mode==="participants"?(action==="add"?"Adicionar":action==="remove"?"Remover":action==="promote"?"Promover":"Revogar admin"):"Salvar"}
        </button>
      </div>
    </div>}
  </section>;
}
