import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, ExternalLink, RefreshCw, Server, ShieldCheck, Wrench } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminCard, AdminCardContent, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { checkUnionWhatsAppEngine, type UnionWhatsAppEngineStatus } from "../infrastructure/union-whatsapp-engine.repository";

function when(value:string|null) {
  if(!value)return "Não verificado";
  const dt=new Date(value);
  return Number.isNaN(dt.getTime())?"Não verificado":dt.toLocaleString("pt-BR");
}
function Info({title,value,hint}:{title:string;value:string;hint?:string}) {
  return <div className="min-w-0 border border-border bg-card p-4">
    <p className="text-xs font-semibold text-muted-foreground">{title}</p>
    <p className="mt-2 break-all text-base font-bold text-foreground">{value}</p>
    {hint&&<p className="mt-1 text-xs leading-5 text-muted-foreground">{hint}</p>}
  </div>;
}
export function UnionWhatsAppEnginePage({onBack}:{onBack:()=>void}) {
  const {activeOrganizationId,activeOrganization,hasPermission}=useAuth();
  const authorized=activeOrganization?.is_platform_operator===true&&hasPermission("platform.management.manage");
  const [checking,setChecking]=useState(false);
  const [status,setStatus]=useState<UnionWhatsAppEngineStatus|null>(null);
  const [failure,setFailure]=useState("");
  const check=useCallback(async()=>{
    if(!authorized||!activeOrganizationId)return;
    setChecking(true);setFailure("");
    try{
      const result=await checkUnionWhatsAppEngine(activeOrganizationId);
      setStatus(result);
    }catch(err){
      const message=systemErrorMessage(err,"Não foi possível verificar as versões.");
      setFailure(message);
      notifyAdmin(message,"error");
    }finally{setChecking(false);}
  },[activeOrganizationId,authorized]);
  useEffect(()=>{if(authorized)void check();},[authorized,check]);
  if(!authorized)return <div className="space-y-4">
    <PageHeader title="Motor WhatsApp" subtitle="Acesso restrito à administração central da Union."
      actions={<AdminButton variant="secondary" onClick={onBack}><ArrowLeft size={16}/>Voltar</AdminButton>}/>
    <p className="text-sm text-muted-foreground">Sem permissão para administrar o motor global.</p>
  </div>;
  const bridge=status?.bridge;
  return <div className="min-w-0 space-y-5" data-testid="union-whatsapp-engine-global">
    <PageHeader title="Motor WhatsApp" subtitle="Infraestrutura compartilhada · administração exclusiva da Union World"
      actions={<div className="flex flex-wrap items-center gap-2">
        <AdminButton variant="secondary" onClick={onBack}><ArrowLeft size={16}/>Voltar</AdminButton>
        <AdminButton onClick={()=>void check()} disabled={checking} loading={checking}><RefreshCw size={16}/>Verificar atualizações</AdminButton>
      </div>}/>
    <div className="flex gap-3 border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-foreground" role="note">
      <CircleAlert size={20} className="mt-0.5 shrink-0 text-amber-600"/>
      <div><p className="font-semibold">Uma atualização aqui afeta todas as empresas conectadas à mesma instância.</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">O painel das empresas parceiras não pode modificar o motor. Não faça upgrades em produção sem cópia de segurança, testes de compatibilidade e plano de retorno.</p></div>
    </div>
    {checking&&!status?<LoadingState text="Verificando motor WhatsApp"/>:null}
    {failure&&<p role="alert" className="text-sm text-destructive">{failure}</p>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Info title="Versão instalada (VPS)" value={bridge?.version||"Não identificada"}
        hint={bridge?.observed_at?"Última leitura do Docker: "+when(bridge.observed_at):"Necessário instalar o relatório de versão na VPS."}/>
      <Info title="Última versão estável (WuzAPI)" value={status?.latest.tag||"Não verificada"}
        hint={status?.latest.published_at?"Publicada em "+when(status.latest.published_at):"Consulta direta às versões oficiais do projeto."}/>
      <Info title="Ponte Union" value={!status?"Aguardando consulta":bridge?.reachable?"Respondendo":"Não confirmada"}
        hint={!bridge?.reachable?"A VPS pode estar inacessível ou com a ponte antiga.":"Consulta assinada com autenticação HMAC."}/>
      <Info title="Motor WuzAPI" value={!status?"Aguardando consulta":bridge?.engine_reachable===true?"Respondendo":bridge?.engine_reachable===false?"Sem resposta":"Não confirmado"}
        hint="Saúde local do serviço, não a conexão individual de cada número."/>
    </div>
    <AdminCard square>
      <AdminCardContent>
        <div className="flex items-start gap-3">
          {status?.update_available===true?<CircleAlert className="mt-0.5 shrink-0 text-amber-600" size={20}/>:
            <CheckCircle2 className="mt-0.5 shrink-0 text-primary" size={20}/>}
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground">
              {status?.update_available===true?"Existe uma versão mais recente":
                status?.update_available===false?"Nenhuma versão mais recente identificada":"Atualização ainda não pode ser determinada"}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {status?.update_available===true?"Revise as notas da versão, valide o backup e planeje a janela de manutenção.":
               status?.update_available===false?"Comparação feita entre a versão reportada pela VPS e a versão estável publicada.":
               "A versão instalada ou a versão oficial não pôde ser confirmada. Isso não significa que o motor esteja desatualizado."}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">Última verificação: {when(status?.checked_at||null)}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <a href="https://github.com/asternic/wuzapi/releases" target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-2 border border-border bg-card px-3 py-2 text-xs font-semibold text-primary hover:bg-muted">
            <ExternalLink size={15}/>Notas das versões
          </a>
          <a href="https://github.com/rafaelartvideo/artvideosite/blob/main/docs/union-wuzapi-engine-maintenance.md"
            target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-9 items-center gap-2 border border-border bg-card px-3 py-2 text-xs font-semibold text-primary hover:bg-muted">
            <Wrench size={15}/>Procedimento de manutenção
          </a>
        </div>
      </AdminCardContent>
    </AdminCard>
    <AdminCard square>
      <AdminCardContent>
        <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={18} className="text-primary"/>Controle de produção</h3>
        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
          <p><strong className="text-foreground">Atualização remota:</strong> bloqueada até existir executor privilegiado com autorização, backup íntegro e rollback testados.</p>
          <p><strong className="text-foreground">Instâncias das parceiras:</strong> não recebem acesso a comandos de Docker ou da VPS.</p>
          <p><strong className="text-foreground">Arquivo Docker:</strong> {bridge?.image||"Não identificado"}.</p>
          <p><strong className="text-foreground">SAC Digital:</strong> integração independente, não participa dessa atualização.</p>
        </div>
      </AdminCardContent>
    </AdminCard>
  </div>;
}
