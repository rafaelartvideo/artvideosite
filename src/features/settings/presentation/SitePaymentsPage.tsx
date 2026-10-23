import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink, LockKeyhole, PlugZap, ShieldCheck } from "lucide-react";
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
  const ready=gateway?.integration_ready===true;
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
            {p.integration_ready?"Conector homologado":"Integração técnica pendente"}
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
