import { useLayoutEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowRight, LoaderCircle, Search } from "lucide-react";
import { PublicPageHeader } from "@/features/public-shell/presentation/PublicPageHeader";
import { useServices, useServiceDetailBySlug } from "@/features/public-catalog/application/usePublicCatalog";
import { ServiceQuoteWizard } from "@/features/public-services/presentation/ServiceQuoteWizard";
import { PublicButton } from "@/features/public-shell/presentation/PublicUi";
import { scrollToQuoteStep } from "@/features/public-quotes/application/quote-scroll";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
export function PublicQuotePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const slug = params.get("servico");
    const { detail, loading, error } = useServiceDetailBySlug(slug);
  const { services, loading: catalogLoading, error: catalogError } = useServices();
  const [search, setSearch] = useState("");
  const selectedService = slug ? services.find(service => service.slug === slug) : null;
  // Também reposiciona a tela enquanto o serviço é buscado, antes do primeiro frame visível.
  // O loader e o formulário usam a mesma âncora para não saltar ao concluir o carregamento.
  useLayoutEffect(() => {
    scrollToQuoteStep(slug && loading ? "auto" : "smooth");
  }, [slug, loading]);

  const openQuoteStep = (destination: string) => {
    scrollToQuoteStep("auto");
    navigate(destination);
  };

  // Mantém a área branca e a âncora já durante a consulta do serviço.
  if (slug && loading) return <>
    <PublicPageHeader title="Solicitar orçamento" description={selectedService?.title || "Estamos preparando o seu atendimento."}/>
    <section data-quote-scroll-anchor className="mx-auto flex min-h-[60vh] w-full max-w-[1200px] items-center justify-center bg-white px-5 py-16 sm:px-8">
      <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-4 text-center text-sm font-semibold text-[#53647b]">
        <LoaderCircle size={34} strokeWidth={2} className="animate-spin text-[var(--art-primary)]" aria-hidden="true"/>
        <span>Preparando seu serviço...</span>
      </div>
    </section>
  </>;
  if (slug && detail) return <>
    <PublicPageHeader title="Solicitar orçamento" description={detail.service.title}/>
    <ServiceQuoteWizard key={detail.service.id} detail={detail} backTo="/orcamento" initialCep={params.get("cep") || ""} initialVariant={params.get("opcao") || ""}/>
  </>;
  if (slug && (error || !detail)) return <section data-quote-scroll-anchor className="mx-auto max-w-xl px-5 py-20 text-center">
    <h1 className="text-2xl font-semibold">Serviço indisponível</h1>
    <p className="my-5 text-slate-600">Escolha outro serviço para solicitar seu orçamento.</p>
    <PublicButton onClick={() => navigate("/orcamento")}>Ver opções de orçamento</PublicButton>
  </section>;

  // Rotas antigas de conserto e serviço convergem para a mesma escolha de serviço.
  {
    const filtered = services.filter(service => normalize([service.title, service.short_description || ""].join(" ")).includes(normalize(search.trim())));
    return <>
      <PublicPageHeader title="Solicitar orçamento" description="Escolha o serviço. Depois informe se o atendimento será no local ou se levará o equipamento à loja.">
        <label className="relative block max-w-4xl">
          <span className="sr-only">Buscar serviço para orçamento</span>
          <input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Busque pelo nome do serviço"
            className="art-input !min-h-[60px] !rounded-lg !border-white/20 !bg-white !pl-12 !pr-5"/>
          <Search size={19} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7991ae]"/>
        </label>
      </PublicPageHeader>
      <section data-quote-scroll-anchor className="mx-auto w-full max-w-[1200px] px-5 py-12 sm:px-8 sm:py-16">
        <div className="mb-6"><h2 className="text-[24px] font-semibold tracking-tight">Escolha o serviço</h2><p className="mt-2 text-sm text-slate-600">Selecione para consultar as opções e preencher o pedido.</p></div>
        {catalogLoading ? <p role="status" className="flex items-center gap-2 py-8 text-sm text-slate-600"><LoaderCircle className="animate-spin text-[var(--art-primary)]" size={18}/> Carregando serviços...</p>
          : catalogError ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{catalogError}</p>
          : filtered.length ? <div className="grid gap-4 md:grid-cols-2">{filtered.map(service =>
            <button key={service.id} type="button" onClick={() => openQuoteStep("/orcamento?servico=" + encodeURIComponent(service.slug) + "&origem=orcamento")}
              className="group flex min-h-[130px] items-center justify-between gap-5 rounded-xl border border-[#dce5ef] bg-white p-6 text-left transition-all hover:border-blue-400 hover:bg-blue-50/50 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[var(--art-primary)]">
              <div><h3 className="text-[17px] font-semibold">{service.title}</h3>{service.short_description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{service.short_description}</p>}</div>
              <ArrowRight size={21} className="shrink-0 text-[var(--art-primary)] transition-transform group-hover:translate-x-1"/>
            </button>)}</div>
          : <p role="status" className="rounded-xl bg-[#f5f7fa] p-6 text-sm text-slate-600">Nenhum serviço encontrado. Tente outro termo.</p>}
      </section>
    </>;
  }

}
