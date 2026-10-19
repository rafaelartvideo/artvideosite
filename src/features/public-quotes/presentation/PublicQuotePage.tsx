import { PublicPageHeader } from "@/features/public-shell/presentation/PublicPageHeader";
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowRight, Loader2, Search } from 'lucide-react';
import { useServices, useServiceDetailBySlug } from '@/features/public-catalog/application/usePublicCatalog';
import { ServiceQuoteWizard } from '@/features/public-services/presentation/ServiceQuoteWizard';
import { PublicButton } from '@/features/public-shell/presentation/PublicUi';

export function PublicQuotePage() {
 const [params]=useSearchParams();const navigate=useNavigate();const slug=params.get('servico');
 const {detail,loading,error}=useServiceDetailBySlug(slug);
 const {services,loading:catalogLoading}=useServices();const [search,setSearch]=useState('');
 if(slug&&loading)return <div role="status" className="flex min-h-[55vh] items-center justify-center gap-3"><Loader2 className="animate-spin" size={20}/> Carregando serviço...</div>;
 if(slug&&detail)return <><PublicPageHeader title="Solicitar orçamento" description={detail.service.title}/><ServiceQuoteWizard key={detail.service.id} detail={detail} initialCep={params.get('cep')||''} initialVariant={params.get('opcao')||''}/></>;
 if(slug&&(error||!detail))return <section className="mx-auto max-w-xl px-5 py-20 text-center"><h1 className="text-2xl font-semibold">Serviço indisponível</h1><p className="my-5 text-slate-600">Escolha outro serviço para solicitar seu orçamento.</p><PublicButton onClick={()=>navigate('/orcamento')}>Escolher serviço</PublicButton></section>;
 const normalized=(text:string)=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const filtered=services.filter(s=>normalized(s.title).includes(normalized(search)));
 return <><PublicPageHeader title="Qual serviço você precisa?" description="Escolha o serviço, informe o local e envie sua solicitação. A Artvideo entrará em contato com o orçamento."><label className="relative block max-w-3xl"><Search size={19} className="absolute left-4 top-4 text-slate-400"/><input type="search" aria-label="Buscar serviço para orçamento" placeholder="Busque pelo nome do serviço" value={search} onChange={e=>setSearch(e.target.value)} className="art-input !min-h-[60px] !pl-12"/></label></PublicPageHeader><section className="mx-auto max-w-3xl px-5 py-10 sm:py-12"><div className="space-y-3">{catalogLoading?<p role="status">Carregando serviços...</p>:filtered.map(service=><button key={service.id} type="button" onClick={()=>navigate(`/orcamento?servico=${encodeURIComponent(service.slug)}`)} className="group flex w-full items-center justify-between gap-5 rounded-xl border border-slate-200 p-5 text-left transition-all hover:border-blue-400 hover:bg-blue-50"><div><h2 className="font-semibold">{service.title}</h2>{service.short_description&&<p className="mt-2 text-sm leading-6 text-slate-500">{service.short_description}</p>}</div><ArrowRight size={20} className="shrink-0 text-[var(--art-primary)] transition-transform group-hover:translate-x-1"/></button>)}{!catalogLoading&&!filtered.length&&<p className="rounded-xl bg-slate-50 p-6 text-slate-600">Nenhum serviço encontrado. Tente outro nome.</p>}</div></section></>;
}
