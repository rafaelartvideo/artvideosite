
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowRight, CheckCircle2, CircleHelp, FileCheck2, LockKeyhole, Mail, MessageCircle, ShieldCheck, UserRoundX } from "lucide-react";
import { PublicPageHeader } from "@/features/public-shell/presentation/PublicPageHeader";
import { useSiteSettings } from "@/features/public-shell/application/useSiteSettings";
import { getSettingText, getWhatsAppNumber } from "@/features/public-shell/application/site-settings";

const LAST_UPDATED = "19 de outubro de 2026";

const pages = [
  { to: "/politica-de-privacidade", label: "Política de Privacidade" },
  { to: "/exclusao-de-dados", label: "Exclusão de Dados" },
  { to: "/descadastramento", label: "Descadastramento" },
];

function LegalLayout({ title, description, current, children }: {
  title: string; description: string; current: string; children: ReactNode;
}) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title + " | Eletrônica Artvideo";
    return () => { document.title = previousTitle; };
  }, [title]);

  return <>
    <PublicPageHeader title={title} description={description}>
      <p className="text-xs font-medium text-white/60">Informações e direitos dos clientes</p>
    </PublicPageHeader>
    <div className="mx-auto max-w-[1200px] px-5 pb-20 pt-9 sm:px-8 lg:px-10 lg:pt-12">
      <nav aria-label="Privacidade e solicitações" className="mb-10 flex flex-wrap gap-2">
        {pages.map(item => <Link key={item.to} to={item.to}
          aria-current={current === item.to ? "page" : undefined}
          className={"inline-flex min-h-10 items-center rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)] " +
            (current === item.to
              ? "border-[var(--art-primary)] bg-[#eaf2ff] text-[var(--art-primary)]"
              : "border-[#d9e3ee] bg-white text-[#47617d] hover:border-[#a5bfde] hover:bg-[#f5f9ff]")}>
          {item.label}
        </Link>)}
      </nav>
      <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_285px] lg:gap-12">
        <article className="min-w-0 space-y-9 text-[14px] leading-7 text-[#53677f] sm:text-[15px]">
          {children}
        </article>
        <aside className="h-fit rounded-2xl border border-[#dfe8f3] bg-[#f6f9fe] p-6 lg:sticky lg:top-28">
          <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#e6efff] text-[var(--art-primary)]">
            <ShieldCheck size={24}/>
          </span>
          <h2 className="text-[18px] font-bold text-[#13294a]">Seus dados, seus direitos</h2>
          <p className="mt-3 text-[13px] leading-6 text-[#5b708a]">Você pode solicitar informações, correções ou a exclusão de dados aplicáveis ao seu cadastro e interromper mensagens promocionais.</p>
          <div className="mt-5 space-y-3 border-t border-[#dfe8f3] pt-5">
            <Link to="/exclusao-de-dados" className="flex items-center justify-between gap-3 text-[13px] font-semibold text-[var(--art-primary)] hover:underline">Solicitar exclusão <ArrowRight size={16}/></Link>
            <Link to="/descadastramento" className="flex items-center justify-between gap-3 text-[13px] font-semibold text-[var(--art-primary)] hover:underline">Parar mensagens promocionais <ArrowRight size={16}/></Link>
            <Link to="/contato" className="flex items-center justify-between gap-3 text-[13px] font-semibold text-[var(--art-primary)] hover:underline">Falar com a Artvideo <ArrowRight size={16}/></Link>
          </div>
          <p className="mt-6 border-t border-[#dfe8f3] pt-4 text-[11px] leading-5 text-[#71849b]">Última atualização: {LAST_UPDATED}</p>
        </aside>
      </div>
    </div>
  </>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3">
    <h2 className="text-[19px] font-bold leading-snug tracking-tight text-[#142c4e] sm:text-[21px]">{title}</h2>
    <div className="space-y-3">{children}</div>
  </section>;
}

function List({ items }: { items: string[] }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-[var(--art-primary)]">
    {items.map(item => <li key={item}>{item}</li>)}
  </ul>;
}

function ContactDetails() {
  const { settings } = useSiteSettings();
  const email = getSettingText(settings.email).trim();
  const address = getSettingText(settings.address) ||
    [settings.street, settings.number, settings.complement, settings.neighborhood, settings.city, settings.state].map(getSettingText).filter(Boolean).join(", ");
  const name = getSettingText(settings.company_name) || "Eletrônica Artvideo";
  return <div className="rounded-xl border border-[#dce6f2] bg-[#f7faff] px-5 py-4">
    <p><strong className="font-semibold text-[#173254]">Responsável pelo atendimento:</strong> {name}</p>
    {address && <p><strong className="font-semibold text-[#173254]">Endereço:</strong> {address}</p>}
    {email ? <p><strong className="font-semibold text-[#173254]">E-mail:</strong> <a className="text-[var(--art-primary)] underline underline-offset-2" href={"mailto:" + email}>{email}</a></p>
      : <p>Use a <Link className="font-semibold text-[var(--art-primary)] underline" to="/contato">página de contato</Link> para falar com nossa equipe.</p>}
  </div>;
}

export function PrivacyPolicyPage() {
  return <LegalLayout
    current="/politica-de-privacidade"
    title="Política de Privacidade"
    description="Entenda quais informações podem ser utilizadas pela Eletrônica Artvideo, para quais finalidades e como exercer seus direitos.">
    <p>Esta política explica, em linguagem acessível, como a Eletrônica Artvideo trata dados pessoais em seu site, loja, solicitações de orçamento, assistência técnica e canais de atendimento. O tratamento deve observar a Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº 13.709/2018).</p>
    <Section title="1. Quem é responsável pelos dados">
      <p>A Eletrônica Artvideo é responsável pelas decisões sobre o uso dos dados pessoais que coleta diretamente para suas atividades comerciais e de atendimento. Para esclarecer dúvidas ou solicitar o exercício de direitos, utilize os contatos abaixo.</p>
      <ContactDetails/>
    </Section>
    <Section title="2. Quais informações podem ser coletadas">
      <List items={[
        "Identificação e contato, como nome, telefone, e-mail e, quando necessário, CPF ou CNPJ.",
        "Endereço e CEP para avaliar a cobertura de serviços, entregas, retiradas e atendimentos.",
        "Informações sobre produtos adquiridos, equipamentos, defeitos relatados, orçamentos, pedidos, agendamentos e ordens de serviço.",
        "Mensagens, anexos e informações fornecidas voluntariamente em nossos canais de atendimento.",
        "Informações técnicas necessárias ao funcionamento e à segurança do site, como registros de acesso e dados de sessão."
      ]}/>
      <p>Solicitamos apenas os dados pertinentes à operação. Evite enviar senhas, documentos completos e informações sensíveis sem uma orientação específica da nossa equipe.</p>
    </Section>
    <Section title="3. Para que utilizamos os dados e com qual fundamento">
      <List items={[
        "Responder dúvidas, preparar orçamentos e executar serviços solicitados, inclusive etapas anteriores a uma contratação.",
        "Processar compras, pagamentos quando disponíveis, entregas e garantias relacionadas a produtos ou serviços.",
        "Cumprir obrigações legais ou regulatórias, como exigências fiscais, contábeis e de defesa do consumidor.",
        "Organizar agendamentos, prestar suporte e manter registros necessários para o relacionamento com o cliente.",
        "Proteger os sistemas, prevenir fraudes e exercer direitos em processos, quando aplicável.",
        "Enviar comunicações comerciais apenas quando houver base legal adequada, respeitando pedidos de descadastramento."
      ]}/>
      <p>Conforme a finalidade, o tratamento poderá estar amparado em execução de contrato, procedimentos preliminares, cumprimento de obrigação legal, exercício regular de direitos, legítimo interesse ou consentimento, quando exigido.</p>
    </Section>
    <Section title="4. Com quem os dados podem ser compartilhados">
      <p>Alguns dados poderão ser acessados por fornecedores de hospedagem e sistemas de gestão, prestadores de suporte técnico, serviços de entrega e parceiros de pagamento, quando necessários à prestação do serviço e sujeitos às obrigações aplicáveis. Também pode haver compartilhamento para cumprir obrigações legais ou ordens de autoridades competentes.</p>
      <p>Quando fornecedores operarem a partir de outros países, serão observados os mecanismos de proteção e as regras aplicáveis à transferência internacional de dados.</p>
    </Section>
    <Section title="5. Por quanto tempo guardamos informações">
      <p>O período de conservação depende da finalidade: dados de solicitações são mantidos enquanto necessários ao atendimento; registros de vendas, pagamentos, garantias e ordens de serviço podem permanecer pelo tempo exigido por lei ou necessário ao exercício de direitos.</p>
      <p>Dados que deixarem de ser necessários e não precisarem ser mantidos poderão ser eliminados ou anonimizados, conforme a situação.</p>
    </Section>
    <Section title="6. Segurança, cookies e recursos técnicos">
      <p>Adotamos medidas organizacionais e técnicas compatíveis com os riscos do tratamento, buscando restringir acessos indevidos e proteger informações. Nenhum sistema pode oferecer garantia absoluta contra incidentes.</p>
      <p>O site pode usar cookies ou armazenamento local necessários para navegação, carrinho, autenticação e preferências. Caso sejam utilizados recursos opcionais de publicidade ou medição de audiência, suas condições deverão ser comunicadas de forma apropriada.</p>
    </Section>
    <Section title="7. Quais são seus direitos">
      <p>Nos termos da LGPD, você poderá solicitar, conforme o caso, confirmação do tratamento, acesso, correção, informação sobre compartilhamentos, anonimização, bloqueio ou eliminação, portabilidade, oposição e revogação de consentimento.</p>
      <p>Os pedidos são avaliados individualmente. A exclusão não é necessariamente imediata ou integral: algumas informações devem ser preservadas em razão de obrigações legais e outras hipóteses previstas na LGPD.</p>
      <div className="flex flex-wrap gap-3">
        <Link to="/exclusao-de-dados" className="inline-flex items-center gap-2 rounded-lg bg-[var(--art-primary)] px-4 py-2.5 text-[13px] font-semibold text-white hover:brightness-110"><UserRoundX size={16}/> Solicitar exclusão de dados</Link>
        <Link to="/descadastramento" className="inline-flex items-center gap-2 rounded-lg border border-[#cedbec] px-4 py-2.5 text-[13px] font-semibold text-[#21466f] hover:bg-[#edf5ff]"><MessageCircle size={16}/> Descadastramento</Link>
      </div>
    </Section>
    <Section title="8. Contatos e comunicações">
      <p>Podemos entrar em contato sobre pedidos, orçamentos, assistência técnica e solicitações iniciadas por você. Comunicações promocionais são diferentes de mensagens necessárias à execução de um pedido ou serviço; é possível pedir para deixar de receber as primeiras sem cancelar o atendimento em andamento.</p>
    </Section>
    <Section title="9. Atualizações desta política">
      <p>Este aviso pode ser ajustado quando nossos serviços ou práticas de tratamento mudarem. A data da última atualização fica indicada nesta página. Em caso de dúvidas, <Link to="/contato" className="font-semibold text-[var(--art-primary)] underline underline-offset-2">fale com nossa equipe</Link>.</p>
    </Section>
  </LegalLayout>;
}

type RequestKind = "exclusao" | "descadastramento";

function RightsRequest({ kind }: { kind: RequestKind }) {
  const { settings } = useSiteSettings();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [details, setDetails] = useState("");
  const [opened, setOpened] = useState(false);
  const email = getSettingText(settings.email).trim();
  const whatsapp = getWhatsAppNumber(settings);
  const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const hasWhatsapp = Boolean(whatsapp);
  const canPrepare = hasEmail || hasWhatsapp;
  const subject = kind === "exclusao" ? "Solicitação LGPD - Exclusão de dados" : "Solicitação de descadastramento de mensagens";
  const body = [
    "Olá, Eletrônica Artvideo.",
    "",
    kind === "exclusao" ? "Quero solicitar a análise da exclusão de meus dados pessoais." : "Solicito que interrompam o envio de mensagens promocionais para meu contato.",
    "",
    "Nome: " + name.trim(),
    "E-mail ou telefone para identificação: " + contact.trim(),
    details.trim() ? "Informações adicionais: " + details.trim() : "",
    "",
    "Aguardo a confirmação do recebimento e as instruções necessárias."
  ].filter(Boolean).join("\n");

  function prepareRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPrepare) return;
    setOpened(true);
    if (hasEmail) {
      window.location.href = "mailto:" + email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    } else {
      window.open("https://wa.me/" + whatsapp + "?text=" + encodeURIComponent(subject + "\n\n" + body), "_blank", "noopener,noreferrer");
    }
  }

  return <div className="rounded-2xl border border-[#dae5f3] bg-[#f8fbff] p-5 sm:p-7">
    <div className="mb-5 flex items-center gap-3">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#e5efff] text-[var(--art-primary)]">
        {kind === "exclusao" ? <LockKeyhole size={20}/> : <MessageCircle size={20}/>}
      </span>
      <div>
        <h2 className="text-[19px] font-bold leading-tight text-[#152c4c]">Prepare sua solicitação</h2>
        <p className="text-[12px] leading-5 text-[#69809a]">Sem cadastro e sem envio automático pelo site</p>
      </div>
    </div>
    {canPrepare ? <form onSubmit={prepareRequest} className="space-y-4">
      <div>
        <label htmlFor={"rights-name-" + kind} className="mb-1.5 block text-[13px] font-semibold text-[#263f5e]">Seu nome <span className="text-red-600">*</span></label>
        <input id={"rights-name-" + kind} required maxLength={120} autoComplete="name" value={name} onChange={event => { setName(event.target.value); setOpened(false); }}
          className="min-h-11 w-full rounded-lg border border-[#cbd9ea] bg-white px-3.5 text-[14px] text-[#152c4c] outline-none focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-100"/>
      </div>
      <div>
        <label htmlFor={"rights-contact-" + kind} className="mb-1.5 block text-[13px] font-semibold text-[#263f5e]">E-mail ou telefone vinculado ao atendimento <span className="text-red-600">*</span></label>
        <input id={"rights-contact-" + kind} required maxLength={150} autoComplete="email" value={contact} onChange={event => { setContact(event.target.value); setOpened(false); }}
          className="min-h-11 w-full rounded-lg border border-[#cbd9ea] bg-white px-3.5 text-[14px] text-[#152c4c] outline-none focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-100"
          placeholder="Informe o contato utilizado com a Artvideo"/>
      </div>
      <div>
        <label htmlFor={"rights-details-" + kind} className="mb-1.5 block text-[13px] font-semibold text-[#263f5e]">Observações (opcional)</label>
        <textarea id={"rights-details-" + kind} rows={3} maxLength={1200} value={details} onChange={event => { setDetails(event.target.value); setOpened(false); }}
          className="w-full resize-y rounded-lg border border-[#cbd9ea] bg-white px-3.5 py-3 text-[14px] text-[#152c4c] outline-none focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-100"
          placeholder="Se necessário, explique sua solicitação sem informar senhas ou documentos."/>
      </div>
      <p className="text-[12px] leading-5 text-[#6b8098]">Não informe CPF completo, senhas ou fotos de documentos aqui. Se for necessário confirmar sua identidade, nossa equipe solicitará informações adequadas pelo canal de atendimento.</p>
      <button type="submit" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--art-primary)] px-5 text-[13px] font-semibold text-white transition-all hover:brightness-110 sm:w-auto">
        {hasEmail ? <Mail size={17}/> : <MessageCircle size={17}/>}
        {hasEmail ? "Abrir e-mail para enviar" : "Abrir WhatsApp para enviar"}
        <ArrowRight size={16}/>
      </button>
      {opened && <div role="status" className="flex gap-2 rounded-lg border border-[#bdd3ef] bg-[#edf5ff] px-4 py-3 text-[12px] leading-5 text-[#24517e]">
        <CircleHelp size={18} className="mt-0.5 shrink-0"/>
        <span>A mensagem foi preparada. Confira e confirme o envio no {hasEmail ? "aplicativo de e-mail" : "WhatsApp"}. Isso ainda não significa que a Artvideo recebeu a solicitação.</span>
      </div>}
    </form> : <div className="space-y-3">
      <p>O canal de solicitação ainda não está configurado nas informações de contato do site. Acesse a página de contato para consultar as opções disponíveis.</p>
      <Link to="/contato" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--art-primary)] px-5 text-[13px] font-semibold text-white">Ver contato <ArrowRight size={16}/></Link>
    </div>}
  </div>;
}

export function DataDeletionPage() {
  return <LegalLayout
    current="/exclusao-de-dados"
    title="Exclusão de Dados"
    description="Saiba como solicitar a análise da exclusão dos seus dados pessoais mantidos pela Eletrônica Artvideo.">
    <div className="flex items-start gap-3 rounded-xl border border-[#d5e4f5] bg-[#f5f9ff] px-5 py-4">
      <FileCheck2 className="mt-0.5 shrink-0 text-[var(--art-primary)]" size={22}/>
      <p>Esta página recebe pedidos relativos aos seus dados pessoais. Solicitar exclusão não cancela automaticamente compras, contratos, garantias ou atendimentos em andamento.</p>
    </div>
    <Section title="Como funciona o pedido">
      <List items={[
        "Você identifica o contato usado em seu relacionamento com a Artvideo e prepara a solicitação.",
        "Nossa equipe recebe a mensagem pelo canal escolhido e pode realizar verificações proporcionais para evitar pedidos de terceiros.",
        "Analisamos quais dados podem ser excluídos, bloqueados ou anonimizados e quais precisam ser preservados por exigência legal ou outra hipótese prevista na LGPD.",
        "A resposta é encaminhada ao contato informado, com as informações cabíveis sobre o atendimento do pedido."
      ]}/>
    </Section>
    <Section title="O que pode permanecer armazenado">
      <p>Mesmo após uma solicitação, registros fiscais, comprovantes de compra, documentos de garantia, ordens de serviço e informações necessárias para cumprimento de obrigações legais ou exercício de direitos poderão ser mantidos pelo período aplicável.</p>
    </Section>
    <RightsRequest kind="exclusao"/>
    <Section title="Quer apenas deixar de receber mensagens?">
      <p>Para interromper comunicações promocionais sem pedir a exclusão do histórico de compras ou atendimentos, utilize o <Link to="/descadastramento" className="font-semibold text-[var(--art-primary)] underline underline-offset-2">descadastramento de mensagens</Link>.</p>
    </Section>
  </LegalLayout>;
}

export function UnsubscribePage() {
  return <LegalLayout
    current="/descadastramento"
    title="Descadastramento de Mensagens"
    description="Solicite a interrupção de mensagens promocionais da Eletrônica Artvideo, mantendo seus atendimentos e serviços.">
    <div className="flex items-start gap-3 rounded-xl border border-[#d5e4f5] bg-[#f5f9ff] px-5 py-4">
      <CheckCircle2 className="mt-0.5 shrink-0 text-[var(--art-primary)]" size={22}/>
      <p>Este pedido se aplica a ofertas, campanhas e outras comunicações comerciais opcionais. Não é uma solicitação de exclusão do seu cadastro.</p>
    </div>
    <Section title="O que muda ao solicitar o descadastramento">
      <List items={[
        "Você pede para não receber novas mensagens de divulgação ou campanhas promocionais pelo contato informado.",
        "Mensagens necessárias a um orçamento, compra, entrega, agendamento ou ordem de serviço em andamento podem continuar sendo enviadas.",
        "O pedido será tratado manualmente pela equipe. O site não realiza o descadastramento automático ao preparar a mensagem."
      ]}/>
    </Section>
    <RightsRequest kind="descadastramento"/>
    <Section title="Deseja eliminar dados pessoais também?">
      <p>O descadastramento não apaga dados de clientes, pedidos ou ordens de serviço. Para solicitar a análise da eliminação de seus dados pessoais, acesse a <Link to="/exclusao-de-dados" className="font-semibold text-[var(--art-primary)] underline underline-offset-2">página de exclusão de dados</Link>.</p>
    </Section>
  </LegalLayout>;
}
