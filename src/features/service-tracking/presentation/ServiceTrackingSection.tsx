import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router";
import { CheckCircle2, Package, Search, Wrench, X } from "lucide-react";
import { PublicButton as Btn, PublicHeading as H2 } from "@/features/public-shell/presentation/PublicUi";
import { findPublicServiceOrder } from "../application/find-public-service-order";
import { formatTrackingDate, type PublicTrackedOrder } from "../domain/service-tracking";
import { TrackingLoading } from "./TrackingLoading";

const StoreOrderTrackingDetails = lazy(() => import("@/features/public-store/presentation/StoreOrderTrackingPage")
  .then(module => ({ default: module.StoreOrderTrackingDetails })));
const privateToken = (value: string) => {
  const candidate = value.trim();
  if (/^[a-f0-9]{64}$/i.test(candidate)) return candidate.toLowerCase();
  return candidate.match(/(?:[?#&]c=)([a-f0-9]{64})(?=$|[&#])/i)?.[1]?.toLowerCase() || "";
};

export function ServiceTrackingSection() {
  const { hash } = useLocation();
  const [trackingToken, setTrackingToken] = useState("");
  const [osNumber, setOsNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [order, setOrder] = useState<PublicTrackedOrder | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [readyTrackingToken, setReadyTrackingToken] = useState<string | null>(null);
  const markOrderReady = useCallback((token: string) => setReadyTrackingToken(token), []);

  useEffect(() => {
    if (!hash.startsWith("#acompanhar-servico") && !hash.startsWith("#c=")) return;
    const token = new URLSearchParams(hash.replace(/^#/, "")).get("c") || "";
    if (/^[a-f0-9]{64}$/i.test(token)) {
      setTrackingToken(token.toLowerCase());
      setOsNumber("");
      setOrder(null);
      setErrorMsg("");
      setSearched(false);
    }
    window.requestAnimationFrame(() => document.getElementById("acompanhar-servico")?.scrollIntoView({ block: "start" }));
  }, [hash]);

  const handleTrack = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = osNumber.trim();
    if (!input || loading) return;
    setSearched(true); setOrder(null); setErrorMsg("");
    const token = privateToken(input);
    if (token) {
      setTrackingToken(token);
      setOsNumber("");
      window.history.replaceState(window.history.state, "", "/#acompanhar-servico&c=" + token);
      return;
    }
    setTrackingToken("");
    setReadyTrackingToken(null);
    if (window.location.hash.includes("&c=")) {
      window.history.replaceState(window.history.state, "", "/#acompanhar-servico");
    }
    if (/^(?:pedido|ped|order)[\s#:-]*\w+/i.test(input)) {
      setErrorMsg("Para acompanhar um pedido, cole o código ou link privado recebido com a compra. O número do pedido sozinho não permite acesso.");
      return;
    }
    const cleanOs = input.replace(/^OS[\s#:-]*/i, "");
    setLoading(true);
    try {
      const tracked = await findPublicServiceOrder(cleanOs);
      if (tracked) setOrder(tracked);
      else setErrorMsg("OS não encontrada. Confira o número informado ou utilize o código privado do pedido.");
    } catch {
      setErrorMsg("Não foi possível consultar sua OS agora. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const items = order?.items ?? [];
  const services = items.filter(item => item.type === "service" || item.type === "custom_service");
  const products = items.filter(item => item.type === "product");
  const publicHistory = (order?.history ?? []).filter(item => Boolean(item.notes?.trim()));

  return <section id="acompanhar-servico" className="scroll-mt-24 rounded-lg border border-[#d7e8ff] bg-gradient-to-r from-[#e4efff] via-[#eef6ff] to-[#dcecff] px-5 py-5 sm:px-7">
    <div className="grid items-center gap-x-8 gap-y-4 lg:grid-cols-[.95fr_1.05fr]">
      <div>
        <H2 className="!text-[20px] sm:!text-[23px]">Acompanhe seu serviço ou pedido</H2>
        <p className="mt-1 text-[12px] leading-relaxed text-[#5d6e86] sm:text-[13px]">Informe o número da OS ou cole o código/link privado do pedido para consultar o andamento.</p>
      </div>
      <form onSubmit={handleTrack} className="flex flex-col gap-2 sm:flex-row sm:gap-3">
        <label htmlFor="artvideo-os-number" className="sr-only">Número da OS ou código de acompanhamento do pedido</label>
        <input id="artvideo-os-number" type="text" value={osNumber}
          onChange={event=>setOsNumber(event.target.value)}
          placeholder="Número da OS ou código do pedido" autoComplete="off"
          className="min-h-11 min-w-0 flex-1 rounded-md border border-[#dbe6f4] bg-white px-4 py-2.5 text-[13px] font-medium text-[#0d1b2e] placeholder:text-[#8a98ab] shadow-sm focus:border-[var(--art-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--art-primary)]/20" required/>
        <Btn variant="primary" disabled={loading} className="!min-h-11 shrink-0 whitespace-nowrap px-6">
          {loading ? "Consultando..." : <><Search size={17}/> Acompanhar</>}
        </Btn>
      </form>
    </div>
    {loading && <TrackingLoading subject="serviço"/>}
    {!loading && !trackingToken && searched && errorMsg && <div role="alert" className="mx-auto mt-5 max-w-xl rounded-lg border border-red-200 bg-white p-5 text-center">
      <X size={21} className="mx-auto mb-2 text-red-600"/><p className="text-sm font-semibold">Não foi possível consultar</p>
      <p className="mt-1 text-[13px] text-[#64748b]">{errorMsg}</p>
    </div>}
    {!loading && !trackingToken && order && <div className="mt-5 rounded-xl border border-[#dbe6f4] bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e7edf6] pb-5">
        <div><p className="text-[11px] font-semibold uppercase tracking-wide text-[#73839a]">Ordem de serviço</p>
          <h3 className="mt-1 text-2xl font-semibold text-[#10243d]">OS {order.os_number || order.id}</h3>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--art-primary)]/15 bg-[#eef1ff] px-3 py-2 text-[12px] font-semibold text-[var(--art-primary)]">
          <CheckCircle2 size={16}/>{order.status || "Em acompanhamento"}
        </div>
      </div>
      <div className="grid gap-5 border-b border-[#e7edf6] py-5 sm:grid-cols-2 lg:grid-cols-3">
        <div><p className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#718096]"><Wrench size={16}/> Serviço</p>
          {services.length ? <ul className="space-y-1">{services.map((item,index)=><li key={index} className="text-[13px] font-medium text-[#1f3652]">{item.title}</li>)}</ul>
            : <p className="text-[13px] font-medium text-[#1f3652]">{order.title || "Assistência técnica"}</p>}
        </div>
        <div><p className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[#718096]"><Package size={16}/> Produto / equipamento</p>
          {products.length ? <ul className="space-y-1">{products.map((item,index)=><li key={index} className="text-[13px] font-medium text-[#1f3652]">{item.title}</li>)}</ul>
            : <p className="text-[13px] font-medium text-[#1f3652]">{order.product_title || order.equipment || "Não informado"}</p>}
          {order.equipment && products.length > 0 && <p className="mt-1 text-[12px] text-[#718096]">{order.equipment}</p>}
        </div>
        <div><p className="mb-2 text-[12px] font-semibold text-[#718096]">Situação atual</p>
          <p className="text-[13px] font-medium text-[#1f3652]">{order.status}</p>
        </div>
      </div>
      <div className="grid gap-4 py-5 sm:grid-cols-2 lg:grid-cols-3">
        <div><p className="text-[12px] text-[#718096]">Data de abertura</p><p className="mt-1 text-[13px] font-medium">{formatTrackingDate(order.created_at)}</p></div>
        <div><p className="text-[12px] text-[#718096]">Última atualização</p><p className="mt-1 text-[13px] font-medium">{formatTrackingDate(order.updated_at || order.created_at)}</p></div>
        {order.estimated_delivery && <div><p className="text-[12px] text-[#718096]">Data agendada</p><p className="mt-1 text-[13px] font-medium">{formatTrackingDate(order.estimated_delivery)}</p></div>}
      </div>
      {publicHistory.length > 0 && <div className="border-t border-[#e7edf6] pt-5">
        <h4 className="text-[14px] font-semibold text-[#1f3652]">Atualizações compartilhadas com o cliente</h4>
        <ol className="mt-3 space-y-3">{publicHistory.map((item,index)=><li key={index} className="border-l-2 border-[#dbe4fb] pl-3 text-[12px] text-[#52647c]">
          <p className="font-medium">{item.notes}</p><time className="mt-1 block text-[#8291a5]">{formatTrackingDate(item.created_at)}</time>
        </li>)}</ol>
      </div>}
    </div>}
    {trackingToken && <>
      {readyTrackingToken !== trackingToken && <TrackingLoading subject="pedido"/>}
      <Suspense fallback={null}>
        <StoreOrderTrackingDetails key={trackingToken} token={trackingToken} onReady={() => markOrderReady(trackingToken)}/>
      </Suspense>
    </>}
  </section>;
}
