import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink, LockKeyhole, PlugZap, ShieldCheck, FlaskConical, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";

type Gateway={
  provider_key:string;display_name:string;description:string;integration_ready:boolean;
};
type PaymentSettings={
  provider_key:string;
  environment:"sandbox"|"production";
  enabled:boolean;
};
const initial:PaymentSettings={provider_key:"none",environment:"sandbox",enabled:false};
export function SitePaymentsPage({onBack}:{onBack:()=>void}){
  const {activeOrganization,hasPermission}=useAuth();
  const orgId=activeOrganization?.organization_id;
  const canUpdate=hasPermission("site_settings.update");
  const [providers,setProviders]=useState<Gateway[]>([]);
  const [current,setCurrent]=useState<PaymentSettings>(initial);
  const [original,setOriginal]=useState<PaymentSettings>(initial);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [labLoading,setLabLoading]=useState(false);
  const [labCredentials,setLabCredentials]=useState<{token:boolean;seller:boolean;webhook:boolean}|null>(null);
  const [labVerified,setLabVerified]=useState(false);
  const [labMessage,setLabMessage]=useState("");
  const [labTest,setLabTest]=useState<{id:string;status:string;paymentId?:string|null;amount?:number;updatedAt?:string}|null>(null);
  const [labUrl,setLabUrl]=useState("");
  const [labHistory,setLabHistory]=useState<Array<{id:string;status:string;paymentId?:string|null;amount?:number;createdAt?:string;updatedAt?:string}>>([]);
  const [labHistoryLoading,setLabHistoryLoading]=useState(false);
  const invokeLab=async(action:"diagnose"|"create"|"status"|"latest",testId?:string)=>{
    const {data,error}=await supabase.functions.invoke("artvideo-store-payment-lab",{
      body:{action,...(testId?{test_id:testId}:{})},
    });
    if(error){
      const response=error.context;
      if(response instanceof Response){
        const payload=await response.clone().json().catch(()=>null);
        if(payload?.error)throw new Error(String(payload.error));
      }
      throw new Error("Não foi possível consultar o laboratório do Mercado Pago.");
    }
    if(data?.error)throw new Error(String(data.error));
    return data;
  };
  const labAction=async(action:"diagnose"|"create"|"status")=>{
    if(labLoading)return;
    setLabLoading(true);
    try{
      const result=await invokeLab(action,labTest?.id);
      if(result.credentials)setLabCredentials(result.credentials);
      if(typeof result.verified==="boolean")setLabVerified(result.verified);
      if(result.message)setLabMessage(String(result.message));
      if(result.test){
        setLabTest(result.test);
        setLabHistory(previous=>{
          const rest=previous.filter(t=>t.id!==result.test.id);
          return [result.test,...rest].sort((a,b)=>
            new Date(b.createdAt||0).getTime()-new Date(a.createdAt||0).getTime()).slice(0,10);
        });
      }
      if(result.checkoutUrl)setLabUrl(String(result.checkoutUrl));
      if(action==="status"&&result.test){
        setLabMessage(String(result.message||"Resultado atualizado."));
      }
    }catch(error){
      notifyAdmin(systemErrorMessage(error,"Falha ao testar o Mercado Pago."),"error");
    }finally{setLabLoading(false);}
  };
  useEffect(()=>{
    let live=true;
    if(!orgId||!canUpdate){
      setLabTest(null);setLabHistory([]);setLabMessage("");setLabUrl("");
      return;
    }
    setLabTest(null);setLabHistory([]);setLabMessage("");setLabUrl("");
    setLabHistoryLoading(true);
    void invokeLab("latest").then(result=>{
      if(!live)return;
      const recovered=Array.isArray(result.tests)?result.tests:[];
      setLabHistory(recovered);
      setLabTest(result.test||null);
      if(result.test)setLabMessage("Teste anterior recuperado. Consulte o resultado sem gerar outro pagamento.");
    }).catch(error=>{
      if(live)notifyAdmin(systemErrorMessage(error,"Não foi possível recuperar os testes anteriores."),"error");
    }).finally(()=>{if(live)setLabHistoryLoading(false);});
    return()=>{live=false;};
  },[orgId,canUpdate]);

  useEffect(()=>{
    let live=true;
    if(!orgId){setLoading(false);return;}
    setLoading(true);
    void Promise.all([
      supabase.from("artvideo_store_payment_providers")
        .select("provider_key,display_name,description,integration_ready").order("display_name"),
      supabase.from("artvideo_store_payment_settings")
        .select("provider_key,environment,enabled")
        .eq("organization_id",orgId).maybeSingle(),
    ]).then(([providerResult,settingResult])=>{
      if(!live)return;
      if(providerResult.error || settingResult.error){
        notifyAdmin(systemErrorMessage(providerResult.error||settingResult.error,"Não foi possível carregar os pagamentos."),"error");
        setLoading(false);return;
      }
      setProviders((providerResult.data||[]) as Gateway[]);
      const saved=settingResult.data ? settingResult.data as PaymentSettings : initial;
      setCurrent(saved);setOriginal(saved);setLoading(false);
    }).catch(error=>{
      if(!live)return;
      notifyAdmin(systemErrorMessage(error,"Não foi possível carregar os pagamentos."),"error");
      setLoading(false);
    });
    return ()=>{live=false;};
  },[orgId]);

  const gateway=useMemo(()=>providers.find(p=>p.provider_key===current.provider_key),[current.provider_key,providers]);
  const ready=gateway?.integration_ready===true && !(current.provider_key==="mercado_pago" && current.environment==="sandbox");
  const dirty=JSON.stringify(current)!==JSON.stringify(original);
  const patch=(changes:Partial<PaymentSettings>)=>{
    if(!canUpdate||saving)return;
    setCurrent(prev=>({...prev,...changes}));
  };
  const save=async()=>{
    if(!canUpdate||saving||loading||!orgId)return;
    const pending={...current,enabled:ready&&current.provider_key!=="none"&&current.enabled};
    if(pending.enabled&&pending.environment==="production"){
      if(!window.confirm("Ativar pagamentos reais no site com o provedor homologado?"))return;
    }
    setSaving(true);
    const {error}=await supabase.from("artvideo_store_payment_settings").upsert({
      organization_id:orgId,...pending,
    },{onConflict:"organization_id"});
    setSaving(false);
    if(error){notifyAdmin(systemErrorMessage(error,"Não foi possível salvar os pagamentos."),"error");return;}
    setCurrent(pending);setOriginal(pending);
    notifyAdmin("Configuração de pagamento salva.","success");
  };
  const back=()=>{if(dirty&&!window.confirm("Existem alterações não salvas. Deseja sair?"))return;onBack();};
  if(!activeOrganization?.is_artvideo_tenant||!hasPermission("site.view")||!hasPermission("site_settings.view"))return null;
  if(loading)return <LoadingState text="Carregando pagamentos da loja..."/>;
  return <div className="min-w-0 space-y-5">
    <PageHeader title="Pagamentos" subtitle="Escolha a integração da loja e mantenha a operação independente do provedor."/>
    <Section title="Provedor de pagamento" description="Você pode trocar o provedor sem alterar os produtos, pedidos ou entregas já cadastrados.">
      <div className="grid gap-3 md:grid-cols-2">
        {providers.map(p=><button key={p.provider_key} type="button"
          disabled={!canUpdate||saving}
          aria-pressed={current.provider_key===p.provider_key}
          onClick={()=>patch({provider_key:p.provider_key,enabled:false})}
          className={"rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 "+
            (current.provider_key===p.provider_key?"border-primary bg-primary/5 shadow-sm":"border-border hover:border-primary/50 hover:bg-muted/40")}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold">
              <CreditCard size={17} className="shrink-0 text-primary"/>{p.display_name}
            </div>
            {current.provider_key===p.provider_key&&<CheckCircle2 size={17} className="shrink-0 text-primary"/>}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{p.description}</p>
          {p.provider_key!=="none"&&<p className={"mt-3 text-[11px] font-bold "+
              (p.integration_ready?"text-emerald-600 dark:text-emerald-300":"text-amber-700 dark:text-amber-300")}>
            {p.integration_ready?"Conector homologado":p.provider_key==="mercado_pago"?"Testes pelo laboratório":"Integração técnica pendente"}
          </p>}
        </button>)}
      </div>
    </Section>

    <Section title="Ambiente e disponibilidade" description="A ativação só é permitida após a integração segura e os testes do conector.">
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-xs font-bold">Ambiente do provedor
            <select value={current.environment} disabled={!canUpdate||saving}
              onChange={e=>patch({environment:e.target.value as PaymentSettings["environment"],enabled:false})}
              className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm">
              <option value="sandbox">Homologação / testes</option>
              <option value="production">Produção</option>
            </select>
          </label>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-4 py-3">
            <div>
              <p className="text-xs font-bold">Aceitar pagamentos online</p>
              <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                {ready?"Disponível após confirmar as credenciais.":"Bloqueado até concluir a integração."}
              </p>
            </div>
            <input type="checkbox" className="h-5 w-5 accent-blue-600" aria-label="Ativar pagamentos online"
              disabled={!canUpdate||saving||!ready||current.provider_key==="none"}
              checked={current.enabled&&ready}
              onChange={e=>patch({enabled:e.target.checked})}/>
          </div>
        </div>
        {!ready&&<div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-xs leading-5">
          <AlertCircle size={18} className="shrink-0 text-amber-600"/>
          <div><strong>Pagamentos ainda desativados.</strong> O catálogo, carrinho e cálculo do frete continuam funcionando.
            Nenhuma cobrança é criada até o conector escolhido ser instalado, ter credenciais privadas e estar homologado.
          </div>
        </div>}
        <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <LockKeyhole size={17} className="mt-0.5 shrink-0 text-primary"/>
          Tokens, chaves e senhas de pagamento nunca são armazenados nos campos do site ou enviados ao navegador.
          Cada conector utiliza credenciais privadas no servidor.
        </p>
      </div>
    </Section>

    {current.provider_key==="mercado_pago"&&<Section title="Laboratório Mercado Pago" description="Teste em ambiente isolado, sem criar pedidos reais ou descontar o estoque.">
      <div className="space-y-3 text-xs leading-6">
        <p className="flex items-start gap-2 text-muted-foreground"><FlaskConical size={17} className="mt-0.5 shrink-0 text-primary"/>
          Primeiro valide as credenciais privadas. Depois gere uma preferência fictícia de R$ 1,00 para pagar com uma conta de teste compradora, preferencialmente em uma janela anônima.
        </p>
        <div className="flex flex-wrap gap-2">
          <BtnSecondary onClick={()=>void labAction("diagnose")} disabled={!canUpdate||labLoading}>
            {labLoading?"Verificando...":"Verificar credenciais"}
          </BtnSecondary>
          <BtnPrimary onClick={()=>void labAction("create")} disabled={!canUpdate||labLoading||!labVerified}>
            Gerar pagamento de teste · R$ 1,00
          </BtnPrimary>
        </div>
        {labCredentials&&<div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
          <p>Access Token de teste: {labCredentials.token?"Cadastrado":"Não encontrado"}</p>
          <p>User ID do vendedor: {labCredentials.seller?"Cadastrado":"Não encontrado"}</p>
          <p>Assinatura do webhook: {labCredentials.webhook?"Cadastrada":"Não encontrada"}</p>
          <p className="font-bold">{labVerified?"Credenciais reconhecidas pelo Mercado Pago":"Validação ainda pendente"}</p>
        </div>}
        {labMessage&&<p role="status" className="text-muted-foreground">{labMessage}</p>}
        {labUrl&&<a href={labUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-2 font-bold text-primary hover:underline">
          Abrir pagamento de teste no Mercado Pago <ExternalLink size={15}/>
        </a>}
        {labHistoryLoading&&<p className="text-muted-foreground" role="status">Recuperando testes anteriores...</p>}
        {!labHistoryLoading&&labHistory.length>0&&<div className="space-y-2">
          <p className="font-bold">Histórico de testes (últimos {labHistory.length})</p>
          <div className="flex flex-wrap gap-2">
            {labHistory.map(test=><button type="button" key={test.id}
              onClick={()=>{setLabTest(test);setLabUrl("");setLabMessage("Teste selecionado. Clique em Consultar resultado para verificar no Mercado Pago.");}}
              aria-pressed={labTest?.id===test.id}
              className={"rounded-lg border px-3 py-2 text-left transition-colors hover:border-primary/50 "+
                (labTest?.id===test.id?"border-primary bg-primary/5 text-foreground":"border-border bg-background text-muted-foreground")}>
              <span className="font-bold">{test.id.slice(0,8)}</span>
              <span className="ml-2">{test.status==="approved"?"Aprovado":test.status==="awaiting_payment"?"Aguardando":test.status}</span>
              {test.createdAt&&<span className="ml-2 text-[11px] opacity-70">{new Date(test.createdAt).toLocaleString("pt-BR")}</span>}
            </button>)}
          </div>
        </div>}
        {labTest&&<div className="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-bold">Resultado do teste · {labTest.id.slice(0,8)}</p>
            <span className={"rounded-full px-2.5 py-1 text-[11px] font-bold "+
              (labTest.status==="approved"?"bg-emerald-500/10 text-emerald-600 dark:text-emerald-300":
               labTest.status==="rejected"||labTest.status==="cancelled"?"bg-red-500/10 text-red-600 dark:text-red-300":"bg-amber-500/10 text-amber-700 dark:text-amber-300")}>
              {({approved:"Aprovado",pending:"Pendente",rejected:"Recusado",cancelled:"Cancelado",
                awaiting_payment:"Aguardando pagamento",in_process:"Em processamento",
                refunded:"Reembolsado",charged_back:"Contestado",error:"Falha no teste",
                creating:"Preparando"} as Record<string,string>)[labTest.status]||labTest.status}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-muted-foreground">
            <p>Valor: <strong className="text-foreground">R$ 1,00</strong></p>
            <p>Ambiente: <strong className="text-foreground">Sandbox</strong></p>
            {labTest.paymentId&&<p className="break-all">Transação: <strong className="text-foreground">{labTest.paymentId}</strong></p>}
            {labTest.updatedAt&&<p>Última consulta: {new Date(labTest.updatedAt).toLocaleString("pt-BR")}</p>}
          </div>
          <BtnSecondary onClick={()=>void labAction("status")} disabled={labLoading}>
            <RefreshCw size={14}/> Consultar resultado no Mercado Pago
          </BtnSecondary>
          <p className="text-muted-foreground">A consulta verifica o pagamento diretamente na API. Transações de teste podem não gerar webhook automático.</p>
        </div>}
        <p className="text-muted-foreground">O checkout público permanece desligado durante a homologação. A compra fictícia não entra nos pedidos e não altera movimentações do estoque.</p>
      </div>
    </Section>}
    <Section title="Próxima integração" description="Configure as credenciais no servidor e homologue antes de ativar pagamentos.">
      <div className="space-y-3 text-xs leading-6 text-muted-foreground">
        {current.provider_key==="mercado_pago"&&<p className="flex gap-2"><PlugZap size={17} className="mt-0.5 shrink-0 text-primary"/>O Checkout Pro usa o redirecionamento seguro do Mercado Pago. Configure no Supabase o Access Token, o ID da conta recebedora e o segredo do webhook (teste e produção). Depois valide pagamentos aprovados, recusados e pendentes.</p>}
        {current.provider_key!=="mercado_pago"&&<p className="flex gap-2"><PlugZap size={17} className="mt-0.5 shrink-0 text-primary"/>
          Para a Getnet, confirme se o contrato da loja libera a API de links GetPay ou a solução Get Checkout.
          O credenciamento da maquininha não garante, por si só, o acesso à API de e-commerce.
        </p>}
        <p className="flex gap-2"><ShieldCheck size={17} className="mt-0.5 shrink-0 text-primary"/>
          O futuro conector deverá criar a cobrança pelo valor confirmado no servidor,
          validar notificações assinadas e conciliar o pagamento antes de liberar o pedido e descontar o estoque.
        </p>
        {current.provider_key==="mercado_pago"&&<p className="break-all">Webhook: https://wmjmtcjpunmzvonlkjcu.supabase.co/functions/v1/artvideo-store-webhook</p>}
        {current.provider_key==="mercado_pago"&&<a href="https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/overview" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-bold text-primary hover:underline">Documentação Mercado Pago <ExternalLink size={15}/></a>}
        {current.provider_key!=="mercado_pago"&&<a href="https://docs.globalgetnet.com/pt/products/online-payments"
          target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-bold text-primary hover:underline">
          Documentação oficial da Getnet <ExternalLink size={15}/>
        </a>}
      </div>
    </Section>
    <AdminStickyToolbar>
      <BtnSecondary onClick={back} disabled={saving}>Voltar</BtnSecondary>
      {canUpdate&&<BtnPrimary onClick={()=>void save()} loading={saving} loadingText="Salvando..." disabled={!dirty||saving}>Salvar</BtnPrimary>}
    </AdminStickyToolbar>
  </div>;
}
