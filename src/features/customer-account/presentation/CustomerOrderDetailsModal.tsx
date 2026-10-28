import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Download, FileText, Image as ImageIcon, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { CustomerOrderDetails, CustomerServiceOrder } from "../infrastructure/customer-account.repository";
import { customerAccessRequest } from "@/lib/customer-access";
import { CustomerSectionLoading } from "./CustomerSectionLoading";

const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
type Props = { order: CustomerServiceOrder; onClose: () => void };
type Action = string | null;

const isFilled = (value: unknown) => value !== null && value !== undefined
  && String(value).trim() !== "" && String(value).trim() !== "—";

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="min-w-0">
    <dt className="text-[10px] font-semibold uppercase tracking-wide text-[#7d90a5] sm:text-[11px]">{title}</dt>
    <dd className="mt-1 break-words text-[13px] font-medium text-[#223e5c]">{children}</dd>
  </div>;
}
function OrderProgress({ order, situations }: {
  order: CustomerOrderDetails["order"];
  situations: CustomerOrderDetails["situations"];
}) {
  if (!situations.length) {
    return <p className="rounded-lg border border-dashed border-[#dce5f1] px-3 py-6 text-center text-xs text-[#72849b]">
      Nenhuma situação vinculada a esta ordem de serviço.
    </p>;
  }
  const ended = Boolean(order.completed_at || order.cancelled_at);
  return <ol className="space-y-0" aria-label="Situações vinculadas à ordem de serviço">
    {situations.map((situation,index) => {
      const active = situation.current && !ended;
      const visited = Boolean(situation.visited);
      const completed = visited && !active;
      const color = /^#[0-9a-f]{6}$/i.test(situation.color || "") ? situation.color! : "#1032DC";
      return <li key={situation.id} className="relative flex min-w-0 gap-3 pb-3 last:pb-0">
        {index < situations.length-1 && <span aria-hidden="true" className="absolute bottom-0 left-[15px] top-8 w-px bg-[#dce5f1]"/>}
        <span aria-hidden="true" className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${active
          ? "border-[#1032DC] bg-[#1032DC] text-white"
          : completed ? "border-[#c9d9fb] bg-[#eef4ff] text-[#1032DC]"
            : "border-[#dce5f1] bg-white text-[#8a9ab0]"}`}>
          {completed ? <Check size={15} strokeWidth={2.5}/> : index+1}
        </span>
        <div className={`min-w-0 flex-1 rounded-lg border border-l-[3px] px-3 py-2.5 ${active
          ? "border-[#c9d9fb] bg-[#f4f7ff]"
          : "border-[#e5ebf3] bg-white"}`}
          style={{borderLeftColor:active || completed ? color : "#e5ebf3"}}>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <p className={`min-w-0 break-words text-[13px] font-semibold ${active ? "text-[#1032DC]" : "text-[#233d59]"}`}>{situation.name}</p>
            <span className={`text-[10px] font-semibold ${active ? "text-[#1032DC]" : completed ? "text-[#527399]" : "text-[#8a9ab0]"}`}>
              {active ? "Atual" : completed ? "Registrada" : "Sem registro"}
            </span>
          </div>
        </div>
      </li>;
    })}
  </ol>;
}

function WarrantyCertificate({ item, detail, busy, onBusy, onError }: {
  item: NonNullable<CustomerOrderDetails["certificate"]>;
  detail: CustomerOrderDetails;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onError: (error: string) => void;
}) {
  async function download() {
    onBusy(true); onError("");
    try {
      const code="CG-"+item.starts_at.slice(0,4)+"-"+String(item.number).padStart(6,"0");
      const html2pdf=(await import("html2pdf.js")).default;
      const escape=(value:unknown)=>String(value??"").replace(/[&<>"']/g,m=>({
        "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
      }[m]||m));
      const root=document.createElement("div");
      root.style.cssText="box-sizing:border-box;width:190mm;min-height:260mm;padding:20mm 16mm;color:#173450;background:#fff;font-family:Arial,sans-serif";
      root.innerHTML=`
        <div style="border-bottom:3px solid #1032dc;padding-bottom:17px">
          <div style="font-size:12px;font-weight:700;letter-spacing:.15em;color:#1032dc">ELETRÔNICA ARTVIDEO</div>
          <h1 style="font-size:23px;margin:13px 0 4px">Certificado de Garantia</h1>
          <p style="font-size:12px;color:#63758a;margin:0">Segunda via simplificada das informações registradas na OS</p>
        </div>
        <div style="margin-top:28px;font-size:14px;line-height:2.3">
          <p><b>Certificado:</b> ${escape(code)}</p>
          <p><b>Ordem de Serviço:</b> ${escape(detail.order.os_number)}</p>
          <p><b>Equipamento:</b> ${escape([detail.order.equipment_type,detail.order.brand,detail.order.equipment_model||detail.order.model].filter(Boolean).join(" · "))}</p>
          <p><b>Modalidade:</b> ${escape(item.warranty)}</p>
          <p><b>Data de emissão:</b> ${escape(date(item.issued_at))}</p>
          <p><b>Início:</b> ${escape(date(item.starts_at))}</p>
          <p><b>Válida até:</b> ${escape(date(item.expires_at))}</p>
        </div>
        <p style="margin-top:40px;padding:18px;background:#f0f4ff;border-radius:8px;font-size:12px;line-height:1.7">
          Este arquivo é uma segunda via simplificada dos dados da garantia emitida.
          As condições de cobertura são as definidas pela Eletrônica Artvideo no certificado original.
        </p>`;
      await html2pdf().set({margin:0,filename:"Certificado-Garantia-"+code+".pdf",
        html2canvas:{scale:2},jsPDF:{unit:"mm",format:"a4",orientation:"portrait"}}).from(root).save();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Não foi possível preparar o certificado.");
    } finally { onBusy(false); }
  }
  return <section className="rounded-xl border border-[#dce5f1] bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-sm font-bold text-[#193756]"><ShieldCheck size={17}/> Certificado de garantia</h3>
        <p className="mt-1 text-xs text-[#6b8099]">Emitido em {date(item.issued_at)} · Válido até {date(item.expires_at)}</p></div>
      <button type="button" disabled={busy} onClick={()=>void download()}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-blue-200 px-3 text-xs font-semibold text-[var(--art-primary)] disabled:opacity-60">
        {busy?<LoaderCircle size={16} className="animate-spin"/>:<Download size={15}/>} {busy?"":"Baixar certificado"}
      </button>
    </div>
  </section>;
}
export function CustomerOrderDetailsModal({ order, onClose }: Props) {
  const [detail,setDetail]=useState<CustomerOrderDetails|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState<Action>(null);
  const [photos,setPhotos]=useState<Record<string,string>>({});
  useEffect(()=>{
    let active=true;
    setLoading(true);setError("");setDetail(null);setPhotos({});
    void supabase.rpc("artvideo_customer_order_details_v1",{p_order_id:order.id})
      .then(({data,error:rpcError})=>{if(!active)return;if(rpcError)throw rpcError;setDetail(data as CustomerOrderDetails);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"Não foi possível abrir a OS.");})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[order.id]);
  useEffect(()=>{
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    return ()=>{document.body.style.overflow=previousOverflow;};
  },[]);
  useEffect(()=>{
    function keydown(event:KeyboardEvent){if(event.key==="Escape")onClose();}
    window.addEventListener("keydown",keydown);
    return ()=>window.removeEventListener("keydown",keydown);
  },[onClose]);
  useEffect(()=>{
    if(!detail?.photos?.length)return;
    let active=true;
    for(const photo of detail.photos.slice(0,12)){
      void customerAccessRequest("customer_order_media",{order_id:order.id,media_id:photo.id})
        .then(response=>{if(active)setPhotos(current=>({...current,[photo.id]:response.url}));})
        .catch(()=>{});
    }
    return ()=>{active=false;};
  },[detail,order.id]);
  async function openSigned(id:string){
    const tab=window.open("about:blank","_blank");if(tab)tab.opener=null;
    setBusy(id);setError("");
    try {
      const result=await customerAccessRequest("signed_document",{document_id:id});
      if(tab)tab.location.replace(result.url);else window.location.assign(result.url);
    }catch(e){tab?.close();setError(e instanceof Error?e.message:"Documento indisponível.");}
    finally{setBusy(null);}
  }
  async function openInvoice(id:string, download=false){
    const tab=window.open("about:blank","_blank");if(tab)tab.opener=null;
    const actionKey=(download?"download:":"invoice:")+id;
    setBusy(actionKey);setError("");
    try {
      const result=await customerAccessRequest("customer_invoice_file",{
        order_id:order.id,attachment_id:id,download,
      });
      if(tab)tab.location.replace(result.url);else window.location.assign(result.url);
    }catch(e){tab?.close();setError(e instanceof Error?e.message:"Nota fiscal indisponível.");}
    finally{setBusy(null);}
  }
  const data=detail?.order;
  const equipmentFields = data ? [
    { title: "Equipamento", value: data.equipment_type },
    { title: "Marca", value: data.brand },
    { title: "Modelo", value: data.equipment_model || data.model },
    { title: "Nº de série", value: data.serial_number },
    { title: "Acessórios", value: data.accessories },
    { title: "Relato", value: data.problem },
  ].filter(field=>isFilled(field.value)) : [];
  return createPortal(<div className="fixed inset-0 z-[1000] flex items-stretch justify-center bg-[#09172b]/60 sm:items-center sm:p-5"
    onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section role="dialog" aria-modal="true" aria-label={"Detalhes da OS "+order.os_number}
      className="flex h-screen h-[100dvh] min-h-0 w-full min-w-0 flex-col overflow-hidden bg-[#f6f8fc] shadow-2xl sm:h-auto sm:max-h-[90dvh] sm:max-w-[850px] sm:rounded-xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#dce5f1] bg-white px-4 py-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-5 sm:py-4">
        <div><h2 className="text-lg font-bold text-[#193756]">OS {order.os_number}</h2>
          <p className="text-xs text-[#72849b]">Detalhes da sua ordem de serviço</p></div>
        <button type="button" onClick={onClose} aria-label="Fechar detalhes"
          className="rounded-lg border border-[#dce5f1] p-2 text-[#546b84] hover:bg-[#f3f6fa]"><X size={19}/></button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 pb-[max(20px,env(safe-area-inset-bottom))] sm:space-y-4 sm:p-5">
        {loading?<CustomerSectionLoading label="Carregando detalhes da OS"/> :
          !data?<p className="py-10 text-center text-sm text-red-700">{error||"Não foi possível carregar esta OS."}</p> : <>
          {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
          <section className="space-y-3 rounded-xl border border-[#dce5f1] bg-white p-3.5 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[#193756]">Situações da OS</h3>
                <p className="mt-1 text-[11px] text-[#72849b]">Acompanhamento das etapas vinculadas a esta OS</p>
              </div>
              <span className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${data.cancelled_at
                ? "border-red-200 bg-red-50 text-red-700"
                : data.completed_at ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                Status: {data.status}
              </span>
            </div>
            <OrderProgress order={data} situations={detail.situations || []}/>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-[#e6ebf3] pt-3 sm:grid-cols-3">
              {isFilled(data.created_at) && <Field title="Aberta em">{date(data.created_at)}</Field>}
              {isFilled(data.scheduled_at) && <Field title="Agendada para">{date(data.scheduled_at)}</Field>}
              {isFilled(data.completed_at || data.cancelled_at) &&
                <Field title="Encerramento">{date(data.completed_at || data.cancelled_at)}</Field>}
            </dl>
          </section>
          <section className="rounded-xl border border-[#dce5f1] bg-white p-3.5 sm:p-4">
            <h3 className="mb-3 text-sm font-bold text-[#193756]">Dados do equipamento</h3>
            {equipmentFields.length ? <dl className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3">
              {equipmentFields.map(field=><Field key={field.title} title={field.title}>{field.value}</Field>)}
            </dl> : <p className="py-6 text-center text-xs text-[#72849b]">Nenhum dado do equipamento informado.</p>}
          </section>
          <section className="rounded-xl border border-[#dce5f1] bg-white p-4">
            <h3 className="mb-3 text-sm font-bold text-[#193756]">Produtos e serviços associados</h3>
            {detail.items.length?<div className="divide-y divide-[#edf1f6]">
              {detail.items.map((item,index)=><div key={index} className="flex justify-between gap-3 py-3 text-[13px]">
                <div className="min-w-0"><p className="font-semibold text-[#223e5c]">{item.title}</p>
                  {item.description&&<p className="mt-1 text-xs text-[#72849b]">{item.description}</p>}</div>
                <span className="shrink-0 text-xs text-[#60758e]">Qtd. {item.quantity}</span>
              </div>)}</div>
              :<p className="py-6 text-center text-xs text-[#72849b]">Nenhum serviço ou produto associado disponível.</p>}
          </section>
          <section className="rounded-xl border border-[#dce5f1] bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#193756]"><ImageIcon size={17}/> Fotos do equipamento e da etiqueta</h3>
            {detail.photos.length?<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {detail.photos.map(photo=><div key={photo.id} className="overflow-hidden rounded-lg border border-[#e3e9f2] bg-[#f6f8fc]">
                {photos[photo.id] ? <a href={photos[photo.id]} target="_blank" rel="noopener noreferrer"
                  className="block"><img src={photos[photo.id]} alt={photo.name||"Foto anexada à OS"} className="aspect-square w-full object-cover" loading="lazy"/></a>
                  : <div className="flex aspect-square items-center justify-center"><LoaderCircle size={22} className="animate-spin text-[#1032DC]"/></div>}
                <p className="truncate px-2 py-2 text-[11px] text-[#60758e]">{photo.name||"Foto da OS"}</p>
              </div>)}</div> : <p className="py-6 text-center text-xs text-[#72849b]">Nenhuma foto disponibilizada nesta OS.</p>}
          </section>
          {detail.certificate&&<WarrantyCertificate item={detail.certificate} detail={detail}
            busy={busy==="certificate"} onBusy={value=>setBusy(value?"certificate":null)} onError={setError}/>}
          <section className="rounded-xl border border-[#dce5f1] bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-[#193756]"><FileText size={17}/> Documentos da OS</h3>
            {detail.documents.length?<div className="space-y-2">
              {detail.documents.map(doc=>{
                const invoice=doc.type==="invoice";
                const invoiceBusy=busy==="invoice:"+doc.id||busy==="download:"+doc.id;
                return <div key={doc.type+":"+doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e8edf4] p-3">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-xs font-semibold text-[#193756]">{invoice?"Nota Fiscal":doc.title||"Documento assinado"}</p>
                    {invoice&&doc.file_name&&<p className="mt-1 truncate text-[11px] text-[#506885]" title={doc.file_name}>{doc.file_name}</p>}
                    <p className="mt-1 text-[11px] text-[#72849b]">{invoice?"Anexada em "+date(doc.created_at):"Assinado em "+date(doc.signed_at)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={invoice?invoiceBusy:busy===doc.id}
                      onClick={()=>void (invoice?openInvoice(doc.id):openSigned(doc.id))}
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-200 px-3 text-xs font-semibold text-[var(--art-primary)] disabled:opacity-60">
                      {(invoice?invoiceBusy:busy===doc.id)?<LoaderCircle size={16} className="animate-spin"/>:invoice?"Visualizar nota fiscal":"Abrir documento"}
                    </button>
                    {invoice&&<button type="button" disabled={invoiceBusy} onClick={()=>void openInvoice(doc.id,true)}
                      aria-label="Baixar nota fiscal"
                      className="inline-flex h-9 items-center gap-1 rounded-lg border border-blue-200 px-3 text-xs font-semibold text-[var(--art-primary)] disabled:opacity-60">
                      {busy==="download:"+doc.id?<LoaderCircle size={16} className="animate-spin"/>:<Download size={16}/>}
                      Baixar
                    </button>}
                  </div>
                </div>;
              })}</div>
              :<p className="py-6 text-center text-xs text-[#72849b]">Nenhum documento disponível nesta OS.</p>}
          </section>
        </>}
      </div>
    </section>
  </div>, document.body);
}
