import { ArrowLeft, ArrowRight, CircleAlert, ExternalLink, FileCheck2, Link2, LockKeyhole, Mail, Package, Smartphone, Wrench } from "lucide-react";
import { AdminButton, PageHeader } from "@/shared/ui/admin/AdminLayout";

const developerDocs = "https://developers.olx.com.br/anuncio/api/home.html";
const supportedCategories = "https://developers.olx.com.br/anuncio/home.html";
const helpCenter = "https://ajuda.olx.com.br/s/article/como-cadastrar-integrador";
const emailBody = [
  "Olá, equipe de integrações da OLX.",
  "",
  "Somos da Eletrônica Artvideo e utilizamos o sistema Union World (https://unionworld.com.br) para gerenciar nosso catálogo de produtos e serviços, publicado no site https://eletronicaartvideo.com.br.",
  "",
  "Gostaríamos de solicitar a avaliação/homologação do Union World como integrador, para publicar e atualizar automaticamente os anúncios elegíveis na conta OLX da empresa.",
  "",
  "Por favor, confirmem:",
  "1. Se nossa conta e plano são elegíveis para integração via API/autoupload;",
  "2. Quais categorias de eletrônicos além de Celulares e telefonia e quais serviços podem ser integrados;",
  "3. O procedimento para cadastrar a aplicação, os redirect URIs e obter client_id/client_secret;",
  "4. Os procedimentos para validar a integração com a conta anunciante.",
  "",
  "Podemos encaminhar os demais dados cadastrais e URLs de retorno após a confirmação das categorias e da elegibilidade.",
  "",
  "Aguardamos orientações. Obrigado!",
].join("\n");
const requestMailto = "mailto:suporteintegrador@olxbr.com?subject=" +
  encodeURIComponent("Solicitação de homologação OLX — Union World / Eletrônica Artvideo") +
  "&body=" + encodeURIComponent(emailBody);

export function OlxIntegrationPage({ onBack }: { onBack: () => void }) {
  return <div className="space-y-5">
    <PageHeader title="Integração OLX"
      subtitle="Publicação e sincronização de anúncios da Eletrônica Artvideo com uma conta OLX autorizada."
      actions={<AdminButton variant="secondary" onClick={onBack}><ArrowLeft size={16}/> Voltar</AdminButton>} />

    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
      <div className="flex items-start gap-3">
        <CircleAlert size={22} className="mt-0.5 shrink-0 text-amber-700"/>
        <div>
          <p className="text-sm font-semibold">Aguardando liberação da OLX</p>
          <p className="mt-1 text-[13px] leading-6 text-amber-900">
            Esta empresa ainda não está conectada à API da OLX. A publicação automática permanece
            desativada até a homologação do integrador, confirmação do plano e autorização da conta
            via OAuth. Nenhum anúncio será enviado sem essas etapas.
          </p>
        </div>
      </div>
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Smartphone size={19} className="text-primary"/> Categorias documentadas</h2>
        <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
          A API oficial documenta a categoria <strong>Celulares e telefonia</strong>, além de imóveis,
          veículos/peças automotivas e agro, sujeitos à habilitação da conta.
        </p>
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
          <Package size={17} className="mt-0.5 shrink-0 text-muted-foreground"/>
          <p className="text-[12px] leading-5 text-muted-foreground">TVs, acessórios de informática, áudio e outros eletrônicos não têm importação automática oficialmente disponível nas categorias consultadas.</p>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/70 bg-muted/30 p-3">
          <Wrench size={17} className="mt-0.5 shrink-0 text-muted-foreground"/>
          <p className="text-[12px] leading-5 text-muted-foreground">A categoria Serviços também não é suportada pela API de importação de anúncios documentada atualmente.</p>
        </div>
        <a href={supportedCategories} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline">
          Consultar categorias na OLX <ExternalLink size={14}/>
        </a>
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold"><LockKeyhole size={19} className="text-primary"/> Etapas para habilitar</h2>
        <ol className="mt-4 space-y-3 text-[13px] leading-6 text-muted-foreground">
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">1</span><span>Confirme com a OLX se o plano profissional da empresa permite o uso de integradores.</span></li>
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">2</span><span>Solicite a homologação do Union World para as categorias que pretende anunciar.</span></li>
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">3</span><span>Após a aprovação, registre as URLs de retorno e receba as credenciais OAuth da aplicação.</span></li>
          <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">4</span><span>Autorize a conta e valide a publicação, atualização e retirada de anúncios elegíveis.</span></li>
        </ol>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={requestMailto} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-[12px] font-semibold text-primary-foreground hover:opacity-90"><Mail size={16}/> Solicitar homologação <ArrowRight size={14}/></a>
          <a href={helpCenter} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-4 text-[12px] font-semibold hover:bg-muted"><FileCheck2 size={16}/> Instruções oficiais <ExternalLink size={13}/></a>
        </div>
        <p className="mt-4 text-[12px] leading-5 text-muted-foreground">Suporte de integração da OLX: <a className="font-semibold text-primary hover:underline" href="mailto:suporteintegrador@olxbr.com">suporteintegrador@olxbr.com</a>.</p>
      </section>
    </div>

    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Link2 size={19} className="text-primary"/> Sincronização prevista para anúncios autorizados</h2>
      <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
        Após a liberação e conexão segura da conta, o objetivo é manter o cadastro do CRM como origem
        do anúncio: criar na OLX ao anunciar, atualizar preço, descrição e fotos após edições e retirar
        o anúncio quando o item deixar de estar disponível. O histórico precisará distinguir
        <strong> enviado para análise</strong>, <strong>publicado</strong> e <strong>rejeitado</strong> conforme o retorno real da OLX.
      </p>
      <a href={developerDocs} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline">
        Documentação da API oficial <ExternalLink size={14}/>
      </a>
    </section>
  </div>;
}
