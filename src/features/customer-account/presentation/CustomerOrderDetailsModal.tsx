import { useEffect, useState } from "react";
import { Download, FileText, Image as ImageIcon, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { CustomerOrderDetails, CustomerServiceOrder } from "../infrastructure/customer-account.repository";
import { customerAccessRequest } from "@/lib/customer-access";
import { CustomerSectionLoading } from "./CustomerSectionLoading";

const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
type Props = { order: CustomerServiceOrder; onClose: () => void };
type Action = string | null;

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-wide text-[#7d90a5]">{title}</dt>
    <dd className="mt-1 break-words text-[13px] font-medium text-[#223e5c]">{children || "—"}</dd></div>;
}
function OrderProgress({ order }: { order: CustomerOrderDetails["order"] }) {
  const cancelled = Boolean(order.cancelled_at) || order.status_slug === "cancelada";
  const closed = Boolean(order.completed_at) || order.status_slug === "fechada";
  const stage = closed || cancelled ? 3 : order.started_at ? 2 : 1;
  const steps = ["Aberta", "Em atendimento", cancelled ? "Cancelada" : "Finalizada"];
  return <div className="grid grid-cols-3 gap-2" aria-label={"Situação atual: " + order.status}>
    {steps.map((step, index) => {
      const reached = index < stage;
      return <div key={step} className="min-w-0">
        <div className={"h-2 rounded-full " + (reached
          ? cancelled && index===2 ? "bg-red-500" : "bg-[var(--art-primary)]"
          : "bg-[#e7ecf3]")}/>
        <p className={"mt-2 text-center text-[11px] font-semibold " +
          (reached ? cancelled && index===2 ? "text-red-700" : "text-[#2447a0]" : "text-[#8c9bac]")}>{step}</p>
      </div>;
    })}
  </div>;
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
  const data=detail?.order;
  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-[#09172b]/60 p-2 sm:p-5"
    onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section role="dialog" aria-modal="true" aria-label={"Detalhes da OS "+order.os_number}
      className="flex max-h-[95vh] w-full max-w-[850px] flex-col overflow-hidden rounded-xl bg-[#f6f8fc] shadow-2xl">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[#dce5f1] bg-white px-5 py-4">
        <div><h2 className="text-lg font-bold text-[#193756]">OS {order.os_number}</h2>
          <p className="text-xs text-[#72849b]">Detalhes da sua ordem de serviço</p></div>
        <button type="button" onClick={onClose} aria-label="Fechar detalhes"
          className="rounded-lg border border-[#dce5f1] p-2 text-[#546b84] hover:bg-[#f3f6fa]"><X size={19}/></button>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
        {loading?<CustomerSectionLoading label="Carregando detalhes da OS..."/> :
          !data?<p className="py-10 text-center text-sm text-red-700">{error||"Não foi possível carregar esta OS."}</p> : <>
          {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
          <section className="space-y-4 rounded-xl border border-[#dce5f1] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#193756]">Acompanhamento</h3>
              <span className="rounded-md bg-[#eef4ff] px-2.5 py-1 text-xs font-bold text-[#2447a0]">{data.status}</span>
            </div>
            <OrderProgress order={data}/>
            <dl className="grid grid-cols-2 gap-3 border-t border-[#e6ebf3] pt-3 sm:grid-cols-3">
              <Field title="Aberta em">{date(data.created_at)}</Field>
              <Field title="Agendada para">{date(data.scheduled_at)}</Field>
              <Field title="Encerramento">{date(data.completed_at||data.cancelled_at)}</Field>
            </dl>
          </section>
          <section className="rounded-xl border border-[#dce5f1] bg-white p-4">
            <h3 className="mb-4 text-sm font-bold text-[#193756]">Dados do equipamento</h3>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Field title="Equipamento">{data.equipment_type}</Field>
              <Field title="Marca">{data.brand}</Field>
              <Field title="Modelo">{data.equipment_model||data.model}</Field>
              <Field title="Nº de série">{data.serial_number}</Field>
              <Field title="Acessórios">{data.accessories}</Field>
              <Field title="Relato">{data.problem}</Field>
            </dl>
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
              {detail.documents.map(doc=><div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#e8edf4] p-3">
                <div><p className="text-xs font-semibold text-[#193756]">{doc.title||"Documento assinado"}</p><p className="mt-1 text-[11px] text-[#72849b]">Assinado em {date(doc.signed_at)}</p></div>
                <button type="button" disabled={busy===doc.id} onClick={()=>void openSigned(doc.id)}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-blue-200 px-3 text-xs font-semibold text-[var(--art-primary)] disabled:opacity-60">
                  {busy===doc.id?<LoaderCircle size={16} className="animate-spin"/>:"Abrir documento"}
                </button>
              </div>)}</div>
              :<p className="py-6 text-center text-xs text-[#72849b]">Nenhum documento assinado disponível.</p>}
          </section>
        </>}
      </div>
    </section>
  </div>;
}
