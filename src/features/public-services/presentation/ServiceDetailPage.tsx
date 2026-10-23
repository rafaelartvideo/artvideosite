import { PublicBreadcrumb } from "@/features/public-shell/presentation/PublicPageHeader";
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, CheckCircle2, Clock3, FileText, Info, MapPin, Plus, Wrench, X } from 'lucide-react';
import { useServiceDetailBySlug, useServices } from '@/features/public-catalog/application/usePublicCatalog';
import { resolvePublicMediaUrl } from '@/features/public-catalog/infrastructure/public-media';
import { useSiteSettings } from '@/features/public-shell/application/useSiteSettings';
import { homeServiceDisplay, inferredServiceIcon, publicIcon } from '@/features/public-shell/domain/site-appearance';
import type { PublicPage } from '@/features/public-shell/domain/navigation';
import { PublicButton, PublicHeading } from '@/features/public-shell/presentation/PublicUi';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/shared/ui/primitives/dialog';
import { ServiceCard } from '@/features/public-catalog/presentation/PublicCatalogCards';
import { formatCurrency } from '@/shared/domain/formatters';
import { useMediaUrl } from '@/shared/application/useMediaUrl';
import { bookingConfig } from '../domain/service-booking.mjs';
import { ServiceCepLookup } from './ServiceCepLookup';
import { ServiceTestimonialsCarousel } from './ServiceTestimonialsCarousel';

export function ServiceDetailPage({slug,setPage}:{slug:string|null;setPage:(page:PublicPage)=>void}) {
 const navigate=useNavigate(); const {detail,loading,error}=useServiceDetailBySlug(slug);const {services}=useServices();const {settings}=useSiteSettings();
 const [cep,setCep]=useState(''),[coverage,setCoverage]=useState('idle'),[optionOpen,setOptionOpen]=useState(false),[variant,setVariant]=useState('');
 const [modal,setModal]=useState<{title:string;content:string}|null>(null);
 useEffect(()=>{setCep('');setCoverage('idle');setOptionOpen(false);setVariant('');setModal(null);},[slug]);
 const service=detail?.service; const appearance=homeServiceDisplay(settings.home_service_display)[service?.id??''];
 const Icon=publicIcon(appearance?.icon||service?.public_icon||inferredServiceIcon(service?.title));
 const {url:customPhoto,loading:customPhotoLoading}=useMediaUrl(appearance?.media_id);
 const mediaBucket=detail?.media?.bucket_id??detail?.media?.bucket_name??'',mediaPath=detail?.media?.storage_path??'';
 const imageQuery=useQuery({queryKey:['public-service-media',mediaBucket,mediaPath],enabled:Boolean(mediaBucket&&mediaPath&&!customPhoto),queryFn:()=>resolvePublicMediaUrl(detail?.media),staleTime:30*60_000});
 const imageUrl=customPhoto||imageQuery.data||null;
 const [readyImage,setReadyImage]=useState<string|null>(null);
 useEffect(()=>{
   if(!imageUrl){setReadyImage(null);return;}
   let active=true;const photo=new Image();
   photo.onload=()=>{if(active)setReadyImage(imageUrl);};
   photo.onerror=()=>{if(active)setReadyImage(imageUrl);};
   photo.src=imageUrl;
   if(photo.complete)setReadyImage(imageUrl);
   return()=>{active=false;};
 },[imageUrl]);
 const waitingImage=customPhotoLoading || (Boolean(mediaBucket&&mediaPath&&!customPhoto)&&imageQuery.isPending) || (Boolean(imageUrl)&&readyImage!==imageUrl);
 if(loading||waitingImage)return <section role="status" aria-live="polite" aria-label="Carregando detalhes do serviço" className="min-h-[70vh] bg-white">
   <div className="mx-auto max-w-[1480px] animate-pulse px-5 py-9 sm:px-8 lg:px-12">
     <div className="mb-8 h-4 w-52 rounded-full bg-[#e2eaf3]"/>
     <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,.93fr)_minmax(0,1.3fr)] lg:gap-16">
       <div className="space-y-5 py-6">
         <div className="h-10 w-4/5 rounded-lg bg-[#e1e9f4] sm:h-14"/>
         <div className="h-10 w-3/5 rounded-lg bg-[#e1e9f4]"/>
         <div className="mt-7 h-4 w-full rounded bg-[#e8eef6]"/>
         <div className="h-4 w-5/6 rounded bg-[#e8eef6]"/>
       </div>
       <div className="aspect-[16/10] rounded-xl bg-[#e7eef7] sm:aspect-[16/9]"/>
     </div>
     <div className="mt-12 grid gap-6 lg:grid-cols-2">
       {[0,1].map(item=><div key={item} className="space-y-5 rounded-2xl border border-[#e4ebf3] bg-white p-7">
         <div className="h-7 w-1/2 rounded bg-[#e2eaf4]"/>
         <div className="h-4 w-5/6 rounded bg-[#ebf0f6]"/>
         <div className="h-12 w-full rounded-lg bg-[#e9eff7]"/>
         <div className="h-12 w-full rounded-lg bg-[#e9eff7]"/>
       </div>)}
     </div>
     <span className="sr-only">Preparando informações do serviço.</span>
   </div>
 </section>;
 if(error||!detail)return <section className="mx-auto max-w-xl px-5 py-20 text-center"><PublicHeading>{error?'Não foi possível carregar este serviço':'Serviço não encontrado'}</PublicHeading><p className="my-5 text-slate-600">Tente novamente ou escolha outro serviço disponível.</p><PublicButton onClick={()=>setPage('servicos')}>Ver serviços</PublicButton></section>;
 const {inclusions,exclusions,faqs,sections}=detail;
 const c=bookingConfig(service.public_booking);const variants=detail.variants.filter((v:any)=>v.is_active!==false);
 const related=services.filter(s=>s.id!==service.id&&(service.category_id?s.category_id===service.category_id:true)).slice(0,3);
 const price=service.price_mode==='HIDDEN'?null:service.base_price==null||service.price_mode==='QUOTE'?'Solicite seu orçamento':`${service.price_mode==='STARTING_FROM'?'A partir de ':''}${formatCurrency(service.base_price)}`;

 const relatedSection = related.length > 0 && <section className="py-12 sm:py-16">
   <div className="mx-auto w-full max-w-[1480px] px-5 sm:px-8 lg:px-12">
     <h2 className="mb-7 text-[27px] font-medium tracking-tight sm:text-[32px]">Outros serviços para você</h2>
     <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{related.map(s=><ServiceCard key={s.id} service={s} onSelectService={value=>navigate('/servicos/'+encodeURIComponent(value))}/>)}</div>
   </div>
 </section>;
 const start=(selected='')=>navigate('/orcamento?servico='+encodeURIComponent(service.slug)+'&cep='+encodeURIComponent(cep)+(selected?'&opcao='+encodeURIComponent(selected):''));
 const begin=()=>variants.length?setOptionOpen(true):start();
 const available=['available','consult'].includes(coverage);
 const orientations=(Array.isArray(c.orientations)?c.orientations:[]).filter((o:any)=>o.title&&o.content);
 const benefits=(Array.isArray(c.benefits)?c.benefits:[]).filter((b:any)=>b.title&&b.content);
 const testimonials=(Array.isArray(c.testimonials)?c.testimonials:[])
   .filter((item:any)=>typeof item.name==='string'&&item.name.trim()&&typeof item.text==='string'&&item.text.trim())
   .map((item:any)=>({name:item.name.trim(),text:item.text.trim()}));
 const extraSections=sections.filter((s:any)=>s.is_active!==false&&(s.title||s.content));
 const hasGuidance=orientations.length>0||Boolean(service.description)||extraSections.length>0||detail.priceFactors.length>0;
 const wide='mx-auto w-full max-w-[1480px] px-5 sm:px-8 lg:px-12';
 return <div className="art-service bg-white text-[#172b45]">
   <PublicBreadcrumb items={[{label:'Início',onClick:()=>setPage('home')},{label:'Serviços',onClick:()=>setPage('servicos')},{label:service.title}]}/>
   <section className={wide+' grid items-center gap-8 pb-10 pt-3 sm:pb-14 lg:grid-cols-[minmax(0,.93fr)_minmax(0,1.3fr)] lg:gap-16 lg:pb-16'}>
     <div className="py-3 lg:py-10">
       <h1 className="text-[34px] font-semibold leading-[1.14] tracking-[-.035em] sm:text-[44px] lg:text-[50px]">{service.title}</h1>
       {service.short_description&&<p className="mt-6 max-w-2xl text-[16px] leading-[1.75] text-[#485463] sm:text-[18px]">{service.short_description}</p>}
     </div>
     <div className="aspect-[16/10] overflow-hidden rounded-xl bg-[#f3f5f7] sm:aspect-[16/9]">
       {imageUrl?<img src={imageUrl} alt={service.title} fetchPriority="high" className="h-full w-full object-cover"/>:<div className="flex h-full items-center justify-center bg-[#eef3f8]"><Icon size={95} strokeWidth={1} className="text-[#8babc5]"/></div>}
     </div>
   </section>

   {/* Primary quote block: coverage and price share the same column/grid alignment. */}
   <section id="solicitar-servico" className={wide+' pb-12 sm:pb-16'}>
     <div className="grid items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
       <div className="flex h-full flex-col rounded-2xl border border-[#dfe5eb] bg-white p-6 sm:p-8 lg:p-9">
         <h2 className="text-[23px] font-semibold leading-tight tracking-tight sm:text-[28px]">Onde o serviço será realizado?</h2>
         <div className="mt-7 flex-1">
           <p className="mb-4 text-[14px] leading-6 text-slate-600">Informe o CEP para consultar a disponibilidade de atendimento na sua região.</p>
           <ServiceCepLookup config={c} value={cep} onChange={v=>{setCep(v);setCoverage('idle');}} onResolved={(_,status)=>setCoverage(status)}/>
         </div>
         <div className="mt-7">
           <PublicButton disabled={!available} onClick={begin} className="w-full !min-h-12">Solicitar orçamento <ArrowRight size={18}/></PublicButton>
           <p className="mt-3 text-center text-xs leading-5 text-slate-500">Sem pagamento antecipado. A Artvideo entrará em contato.</p>
         </div>
       </div>
       <div className="flex h-full flex-col rounded-2xl border border-[#dfe5eb] bg-[#f7f9fb] p-6 sm:p-8 lg:p-9">
         <h2 className="text-[23px] font-semibold leading-tight tracking-tight sm:text-[28px]">Preço do serviço</h2>
         <div className="mt-7">
           <p className="text-sm text-slate-500">{detail.category?.name||'Serviço Artvideo'}</p>
           {price&&<p className="mt-3 text-[29px] font-semibold leading-tight tracking-tight text-[#172b45] sm:text-[36px]">{price}</p>}
           <p className="mt-5 max-w-lg text-[15px] leading-7 text-[#556270]">Descreva o atendimento que precisa. Nossa equipe confirmará os valores e as condições do orçamento antes da execução.</p>
         </div>
         <div className="mt-auto pt-7">
           {c.duration&&<p className="mb-4 flex items-center gap-2 text-sm text-[#455363]"><Clock3 size={19} className="shrink-0 text-[var(--art-primary)]"/>{c.duration}</p>}
           <p className="flex items-start gap-2 text-sm leading-6 text-[#4e6172]"><CheckCircle2 size={19} className="mt-0.5 shrink-0 text-[var(--art-primary)]"/>Solicitação sem cobrança e sujeita à confirmação da Artvideo.</p>
         </div>
       </div>
     </div>
   </section>

   {/* Required ordering: included/excluded content is immediately after coverage and price. */}
   {(inclusions.length>0||exclusions.length>0)&&<section className={wide+' pb-12 sm:pb-16'}>
     <div className="grid items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
       {[
         {title:'O que está incluso',items:inclusions,included:true},
         {title:'O que não está incluso',items:exclusions,included:false}
       ].filter(group=>group.items.length>0).map(group=><div key={group.title} className="h-full rounded-2xl border border-[#e0e5eb] bg-white p-6 sm:p-8">
         <h2 className="text-[24px] font-semibold tracking-tight">{group.title}</h2>
         <ul className="mt-6 space-y-4">{group.items.map((item:any)=><li key={item.id} className="flex items-start gap-3 text-[15px] leading-7 text-[#485463]">
           {group.included?<Check size={19} className="mt-1 shrink-0 text-[var(--art-primary)]"/>:<X size={19} className="mt-1 shrink-0 text-rose-500"/>}
           <span>{item.description||item.title}</span>
         </li>)}</ul>
       </div>)}
     </div>
   </section>}

   {/* Guidance is a single grouped section, including supplementary text and technical details. */}
   {hasGuidance&&<section className="bg-[#f0f1f3] py-12 sm:py-16">
     <div className={wide}>
       <h2 className="text-[27px] font-medium tracking-tight sm:text-[32px]">Orientações para este serviço</h2>
       {orientations.length>0&&<div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
         {orientations.map((o:any,i:number)=>{const icons:Record<string,typeof Wrench>={wrench:Wrench,"map-pin":MapPin,info:Info,"file-text":FileText};const OIcon=icons[o.icon]||[Wrench,MapPin,Info,FileText][i%4];return <button type="button" key={i} onClick={()=>setModal(o)}
           className="group flex min-h-[174px] flex-col items-start rounded-2xl border border-[#d9dee3] bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-[#8fb6dc] hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)]">
           <OIcon size={31} strokeWidth={1.4} className="text-[#172b45]"/>
           <span className="mt-4 text-[15px] font-semibold">{o.title}</span>
           <span className="mt-auto pt-5 text-sm font-medium text-[var(--art-primary)] group-hover:underline">Saiba mais</span>
         </button>;})}
       </div>}
       {(Boolean(service.description)||extraSections.length>0||detail.priceFactors.length>0)&&<div className="mt-6 grid gap-4 md:grid-cols-2">
         {service.description&&<article className="rounded-xl border border-[#dfe3e9] bg-white p-6"><h3 className="text-[18px] font-semibold">Sobre o serviço</h3><p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-slate-600">{service.description}</p></article>}
         {extraSections.map((s:any)=><article key={s.id} className="rounded-xl border border-[#dfe3e9] bg-white p-6"><h3 className="text-[18px] font-semibold">{s.title}</h3><p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-slate-600">{s.content}</p></article>)}
         {detail.priceFactors.length>0&&<article className="rounded-xl border border-[#dfe3e9] bg-white p-6">
           <h3 className="text-[18px] font-semibold">O que pode alterar o orçamento?</h3>
           <ul className="mt-4 space-y-4">{detail.priceFactors.map((factor:any)=><li key={factor.id} className="text-[15px] leading-7 text-slate-600"><strong className="text-[#172b45]">{factor.name}</strong>{factor.description&&<p>{factor.description}</p>}</li>)}</ul>
         </article>}
       </div>}
     </div>
   </section>}

   {faqs.length>0&&<section className={wide+' py-14 sm:py-16 lg:py-20'}>
     <h2 className="mb-7 text-[27px] font-medium tracking-tight sm:text-[32px]">Dúvidas frequentes</h2>
     <div className="space-y-3">{faqs.map((faq:any)=><details key={faq.id} className="group rounded-lg bg-[#f0f1f3]">
       <summary className="flex min-h-[72px] cursor-pointer list-none items-center justify-between gap-5 px-5 py-5 text-[15px] font-medium focus-visible:outline-2 focus-visible:outline-[var(--art-primary)] sm:px-7 sm:text-[16px]">{faq.question}<Plus size={20} className="shrink-0 text-[#53606d] transition-transform group-open:rotate-45"/></summary>
       <p className="art-faq-answer whitespace-pre-line px-5 pb-6 text-[15px] leading-8 text-[#4d5b6b] sm:px-7">{faq.answer}</p>
     </details>)}</div>
   </section>}

   {/* Keep the original timeline; only give it more horizontal and vertical room. */}
   <section className="bg-[#f6f7f9] py-14 sm:py-16 lg:py-20">
     <div className={wide}><h2 className="text-center text-[28px] font-medium tracking-tight sm:text-[32px]">Como funciona?</h2>
       <div className="mt-10 grid gap-x-10 gap-y-9 sm:mt-12 sm:grid-cols-2 lg:grid-cols-4">
         {[
           {title:'Sua solicitação',text:'Escolha o serviço e informe o local do atendimento.'},
           {title:'Preferência de horário',text:'Selecione uma opção disponível ou combine com a equipe.'},
           {title:'Orçamento e confirmação',text:'A Artvideo entra em contato com os valores e os detalhes.'},
           {title:'Realização do serviço',text:'Com sua aprovação, a equipe combina a execução.'}
         ].map((step,i)=><div key={step.title} className="text-center">
           <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--art-primary)] text-lg font-semibold text-white">{i+1}</span>
           <h3 className="mt-5 text-base font-semibold">{step.title}</h3>
           <p className="mt-3 text-sm leading-7 text-slate-600">{step.text}</p>
         </div>)}
       </div>
     </div>
   </section>

   {benefits.length>0&&<section className={wide+' py-14 sm:py-16 lg:py-20'}>
     <h2 className="mb-8 text-[27px] font-medium tracking-tight sm:text-[32px]">Por que contratar?</h2>
     <div className="grid items-stretch gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-7">
       {benefits.map((b:any,i:number)=><article key={i} className="flex h-full min-w-0 flex-col rounded-xl border border-[#dfe4e9] bg-white p-5 sm:p-6">
         {typeof b.image_url==='string'&&b.image_url.startsWith('https://')
           ?<img src={b.image_url} alt="" loading="lazy" className="h-[195px] w-full rounded-lg object-cover"/>
           :<div className="flex h-[195px] w-full items-center justify-center rounded-lg bg-[#eef3f8]"><CheckCircle2 size={60} strokeWidth={1.2} className="text-[var(--art-primary)]"/></div>}
         <h3 className="mt-5 text-[19px] font-semibold tracking-tight">{b.title}</h3>
         <p className="mt-3 text-[15px] leading-7 text-[#55616d]">{b.content}</p>
       </article>)}
     </div>
   </section>}

   {c.related_position==='after_coverage'&&relatedSection}
   <ServiceTestimonialsCarousel items={testimonials}/>
   {c.related_position==='bottom'&&relatedSection}

   {c.terms&&<section className={wide+' border-t border-[#e8ebef] py-14 sm:py-16 lg:py-20'}>
     <h2 className="text-[27px] font-medium tracking-tight sm:text-[32px]">Termos de uso e condições gerais</h2>
     <p className="mt-3 text-[15px] leading-7 text-[#4f5a67]">Consulte os termos de uso e as condições deste serviço.</p>
     <PublicButton variant="outline" onClick={()=>setModal({title:'Termos de uso e condições gerais',content:c.terms})} className="mt-6">Consultar <FileText size={17}/></PublicButton>
   </section>}

  <Dialog open={Boolean(modal)} onOpenChange={open=>{if(!open)setModal(null);}}><DialogContent className="artvideo-dialog max-h-[85dvh] overflow-y-auto rounded-2xl bg-white p-7 text-[#172b45] sm:max-w-xl sm:p-9"><DialogHeader><DialogTitle className="pr-6 text-2xl font-semibold">{modal?.title}</DialogTitle><DialogDescription className="sr-only">Orientações para o atendimento</DialogDescription></DialogHeader><p className="whitespace-pre-line text-[15px] leading-8 text-slate-600">{modal?.content}</p></DialogContent></Dialog>
  <Dialog open={optionOpen} onOpenChange={setOptionOpen}><DialogContent className="artvideo-dialog max-h-[85dvh] overflow-y-auto rounded-2xl bg-white p-7 text-[#172b45] sm:max-w-lg"><DialogHeader><DialogTitle className="text-2xl font-semibold">Selecione a opção</DialogTitle><DialogDescription>Escolha o atendimento que você precisa.</DialogDescription></DialogHeader><fieldset className="space-y-3"><legend className="sr-only">Opções do serviço</legend>{variants.map((v:any)=><label key={v.id} className={`art-choice ${variant===v.id?'is-selected':''}`}><input type="radio" name="service-option" checked={variant===v.id} onChange={()=>setVariant(v.id)}/><span>{v.title}</span>{service.price_mode!=='HIDDEN'&&v.price!=null&&<strong className="ml-auto shrink-0 text-sm">{formatCurrency(v.price)}</strong>}</label>)}</fieldset><PublicButton disabled={!variant} onClick={()=>start(variant)} className="mt-3 w-full">Continuar <ArrowRight size={17}/></PublicButton></DialogContent></Dialog>
 </div>;
}
