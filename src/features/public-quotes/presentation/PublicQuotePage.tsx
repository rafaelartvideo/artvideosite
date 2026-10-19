import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowRight, ClipboardList, Loader2, MonitorCog, Search, Wrench } from "lucide-react";
import { PublicPageHeader } from "@/features/public-shell/presentation/PublicPageHeader";
import { useServices, useServiceDetailBySlug } from "@/features/public-catalog/application/usePublicCatalog";
import { ServiceQuoteWizard } from "@/features/public-services/presentation/ServiceQuoteWizard";
import { RepairQuoteWizard } from "./RepairQuoteWizard";
import { PublicButton } from "@/features/public-shell/presentation/PublicUi";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export function PublicQuotePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const slug = params.get("servico");
  const mode = params.get("tipo");
  const { detail, loading, error } = useServiceDetailBySlug(slug);
  const { services, loading: catalogLoading, error: catalogError } = useServices();
  const [search, setSearch] = useState("");

  // Deep links from a specific service must keep their complete booking workflow.
  if (slug && loading) return <div role="status" className="flex min-h-[55vh] items-center justify-center gap-3"><Loader2 className="animate-spin" size={20}/> Carregando serviço...</div>;
  if (slug && detail) return <>
    <PublicPageHeader title="Solicitar orçamento" description={detail.service.title}/>
    <ServiceQuoteWizard key={detail.service.id} detail={detail} initialCep={params.get("cep") || ""} initialVariant={params.get("opcao") || ""}/>
  </>;
  if (slug && (error || !detail)) return <section className="mx-auto max-w-xl px-5 py-20 text-center">
    <h1 className="text-2xl font-semibold">Serviço indisponível</h1>
    <p className="my-5 text-slate-600">Escolha outro serviço ou solicite um orçamento de conserto.</p>
    <PublicButton onClick={() => navigate("/orcamento")}>Ver opções de orçamento</PublicButton>
  </section>;

  if (mode === "conserto") return <>
    <PublicPageHeader title="Orçamento de conserto" description="Informe o equipamento e o defeito. A Artvideo avaliará os detalhes e entrará em contato com você."/>
    <RepairQuoteWizard/>
  </>;

  if (mode === "servico") {
    const filtered = services.filter(service => normalize([service.title, service.short_description || ""].join(" ")).includes(normalize(search.trim())));
    return <>
      <PublicPageHeader title="Solicitar orçamento de serviço" description="Escolha o serviço, informe o local de atendimento e envie sua solicitação para avaliação.">
        <label className="relative block max-w-4xl">
          <span className="sr-only">Buscar serviço para orçamento</span>
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Busque pelo nome do serviço"
            className="art-input !min-h-[60px] !rounded-lg !border-white/20 !bg-white !pl-5 !pr-14"/>
          <Search size={21} className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-[var(--art-primary)]"/>
        </label>
      </PublicPageHeader>
      <section className="mx-auto w-full max-w-[1200px] px-5 py-12 sm:px-8 sm:py-16">
        <button type="button" onClick={() => navigate("/orcamento")} className="mb-8 text-sm font-semibold text-[var(--art-primary)] hover:underline">← Alterar tipo de atendimento</button>
        <div className="mb-6"><h2 className="text-[24px] font-semibold tracking-tight">Escolha o serviço</h2><p className="mt-2 text-sm text-slate-600">Selecione para consultar as opções e preencher o pedido.</p></div>
        {catalogLoading ? <p role="status" className="flex items-center gap-2 py-8 text-sm text-slate-600"><Loader2 className="animate-spin" size={18}/> Carregando serviços...</p>
          : catalogError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{catalogError}</p>
          : filtered.length ? <div className="grid gap-4 md:grid-cols-2">{filtered.map(service =>
            <button key={service.id} type="button" onClick={() => navigate("/orcamento?servico=" + encodeURIComponent(service.slug))}
              className="group flex min-h-[130px] items-center justify-between gap-5 rounded-xl border border-[#dce5ef] bg-white p-6 text-left transition-all hover:border-blue-400 hover:bg-blue-50/50 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[var(--art-primary)]">
              <div><h3 className="text-[17px] font-semibold">{service.title}</h3>{service.short_description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{service.short_description}</p>}</div>
              <ArrowRight size={21} className="shrink-0 text-[var(--art-primary)] transition-transform group-hover:translate-x-1"/>
            </button>)}</div>
          : <p role="status" className="rounded-xl bg-[#f5f7fa] p-6 text-sm text-slate-600">Nenhum serviço encontrado. Tente outro termo ou escolha conserto de equipamento.</p>}
      </section>
    </>;
  }

  return <>
    <PublicPageHeader title="Solicitar orçamento" description="Precisa contratar um serviço ou consertar um equipamento? Escolha abaixo para começar."/>
    <section className="mx-auto w-full max-w-[1200px] px-5 py-12 sm:px-8 sm:py-16">
      <div className="mb-8"><h2 className="text-[26px] font-semibold tracking-tight sm:text-[30px]">Como podemos ajudar você?</h2><p className="mt-2 text-[15px] leading-7 text-slate-600">Escolha o tipo de orçamento. Cada opção terá as informações adequadas ao atendimento solicitado.</p></div>
      <div className="grid gap-6 md:grid-cols-2">
        <button type="button" onClick={() => navigate("/orcamento?tipo=servico")}
          className="group flex min-h-[255px] flex-col items-start rounded-2xl border border-[#dce5ef] bg-white p-7 text-left transition-all hover:-translate-y-1 hover:border-blue-400 hover:shadow-[0_15px_40px_rgba(10,40,70,.09)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)]">
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#eaf3ff] text-[var(--art-primary)]"><ClipboardList size={29} strokeWidth={1.6}/></span>
          <h3 className="mt-6 text-[22px] font-semibold tracking-tight">Contratar um serviço</h3>
          <p className="mt-3 flex-1 text-[15px] leading-7 text-slate-600">Instalação, manutenção programada, limpeza e outros serviços disponíveis no catálogo da Artvideo.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--art-primary)]">Escolher serviço <ArrowRight size={18} className="transition-transform group-hover:translate-x-1"/></span>
        </button>
        <button type="button" onClick={() => navigate("/orcamento?tipo=conserto")}
          className="group flex min-h-[255px] flex-col items-start rounded-2xl border border-[#dce5ef] bg-white p-7 text-left transition-all hover:-translate-y-1 hover:border-blue-400 hover:shadow-[0_15px_40px_rgba(10,40,70,.09)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)]">
          <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#eaf3ff] text-[var(--art-primary)]"><MonitorCog size={29} strokeWidth={1.6}/></span>
          <h3 className="mt-6 text-[22px] font-semibold tracking-tight">Consertar um equipamento</h3>
          <p className="mt-3 flex-1 text-[15px] leading-7 text-slate-600">TV, computador, eletrodoméstico ou outro aparelho com defeito. Descreva o problema e solicite uma avaliação.</p>
          <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--art-primary)]">Solicitar avaliação <ArrowRight size={18} className="transition-transform group-hover:translate-x-1"/></span>
        </button>
      </div>
      <p className="mt-7 flex items-start gap-2 text-sm leading-6 text-slate-500"><Wrench size={18} className="mt-0.5 shrink-0"/> Os valores, a disponibilidade e a forma de atendimento serão confirmados antes da execução. Não há pagamento nesta etapa.</p>
    </section>
  </>;
}
