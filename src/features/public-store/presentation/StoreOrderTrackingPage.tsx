import { useCallback, useEffect, useState } from "react";
import { Check, CheckCircle2, ClipboardList, Clock3, Copy, LockKeyhole, MapPin, Package, PackageCheck, Store, Truck } from "lucide-react";
import { getStoreTracking, getStoreTrackingByPickupCode, type StoreTracking, type PickupTrackingLookup } from "../infrastructure/storefront.repository";
import { TrackingLoading } from "@/features/service-tracking/presentation/TrackingLoading";

const pickupSteps = [
  { key: "pending", name: "Pedido recebido", Icon: ClipboardList },
  { key: "preparing", name: "Separação", Icon: Package },
  { key: "ready", name: "Pronto para retirada", Icon: Store },
  { key: "picked_up", name: "Retirado", Icon: CheckCircle2 },
];
const deliverySteps = [
  { key: "pending", name: "Pedido recebido", Icon: ClipboardList },
  { key: "preparing", name: "Separação", Icon: Package },
  { key: "ready", name: "Pronto", Icon: PackageCheck },
  { key: "out_for_delivery", name: "Em rota", Icon: Truck },
  { key: "delivered", name: "Entregue", Icon: CheckCircle2 },
];
const card = "rounded-xl border border-[#dbe7f6] bg-white p-5 sm:p-7";
const zip = (value: string) => value.replace(/\D/g, "").replace(/^(\d{5})(\d{3})$/, "$1-$2");

type Props = {
  token?: string;
  pickupLookup?: PickupTrackingLookup;
  onReady: (trackingKey: string) => void;
};

/** Acompanhamento compacto: etapas, retirada, local/horários e acesso privado. */
export function StoreOrderTrackingDetails({ token, pickupLookup, onReady }: Props) {
  const trackingKey = token || (pickupLookup ? `pickup:${pickupLookup.orderNumber}:${pickupLookup.code}` : "");
  const [order, setOrder] = useState<StoreTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const fetchOrder = useCallback(async (silent = false) => {
    if (!trackingKey) return;
    if (!silent) { setLoading(true); setOrder(null); }
    try {
      const result = token
        ? await getStoreTracking(token)
        : await getStoreTrackingByPickupCode(pickupLookup!);
      setOrder(result);
      setError("");
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "Não foi possível consultar este pedido.");
        setOrder(null);
      }
    } finally {
      if (!silent) { setLoading(false); setLoaded(true); onReady(trackingKey); }
    }
  }, [token, pickupLookup, trackingKey, onReady]);

  useEffect(() => { void fetchOrder(); }, [fetchOrder]);
  useEffect(() => {
    if (!trackingKey) return;
    const interval = window.setInterval(() => { if (!document.hidden) void fetchOrder(true); }, 60000);
    return () => window.clearInterval(interval);
  }, [trackingKey, fetchOrder]);

  const copyLink = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(window.location.origin + "/#acompanhar-servico&c=" + token);
      setCopied(true);
    } catch { setError("Não foi possível copiar o link. Utilize o endereço desta página."); }
  };

  const pickup = order?.deliveryMethod === "pickup";
  const finished = order?.fulfillmentStatus === "picked_up" || order?.fulfillmentStatus === "delivered";
  const paid = order?.paymentStatus === "paid";
  const steps = pickup ? pickupSteps : deliverySteps;
  const foundIndex = order ? steps.findIndex(s => s.key === order.fulfillmentStatus) : 0;
  const currentIndex = !paid ? 0 : Math.max(0, foundIndex >= 0 ? foundIndex : order?.fulfillmentStatus === "delivery_issue" ? 3 : 0);
  const percent = !paid ? 0 : Math.round((currentIndex / (steps.length - 1)) * 100);

  return <div className="mt-5 mx-auto max-w-5xl space-y-4 text-[#112640]">
    {loading && loaded && <TrackingLoading subject="pedido"/>}
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-[13px] text-red-700">
      {error} <button type="button" onClick={() => void fetchOrder()} className="ml-2 font-bold underline">Tentar novamente</button>
    </div>}
    {order && <>
      <section className={card}>
        <div className="mb-7 text-center">
          <p className="text-[12px] font-bold text-[#607793]">Pedido {order.number}</p>
          <h2 className="mt-1 text-[19px] font-bold tracking-tight sm:text-[23px]">
            {!paid ? "Aguardando confirmação de pagamento"
              : finished ? pickup ? "Pedido retirado" : "Pedido entregue"
              : order.fulfillmentStatus === "delivery_issue" ? "Entrega em verificação"
              : pickup && order.fulfillmentStatus === "ready" ? "Pronto para retirada"
              : "Acompanhe as etapas do seu pedido"}
          </h2>
          {!paid && <p className="mt-2 text-xs text-amber-700">A preparação começa após a confirmação do pagamento.</p>}
          {pickup && paid && order.fulfillmentStatus === "ready" && <p className="mt-2 text-[12px] text-emerald-700">Seu pedido já pode ser retirado. Confira os horários abaixo.</p>}
        </div>
        <div className="mx-auto max-w-3xl" role="list" aria-label="Etapas do pedido">
          <div className="relative grid" style={{ gridTemplateColumns: `repeat(${steps.length},minmax(0,1fr))` }}>
            <div className="pointer-events-none absolute top-[20px] h-[4px] rounded-full bg-[#e7eef7]"\n              style={{left:`${50/steps.length}%`,right:`${50/steps.length}%`}} aria-hidden="true">
              <div className="h-full rounded-full bg-gradient-to-r from-[#1157bc] to-[#35a0e7] transition-[width] duration-700 ease-out"
                style={{width: `${percent}%`}}/>
              {paid && !finished && <div className="absolute inset-y-0 left-0 h-full animate-pulse rounded-full bg-blue-300/35"
                style={{width: `${percent}%`}}/>}
            </div>
            {steps.map((item, i) => {
              const done = paid && i < currentIndex;
              const active = paid && i === currentIndex;
              const Icon = item.Icon;
              return <div key={item.key} role="listitem" className="relative z-10 flex min-w-0 flex-col items-center px-0.5 text-center">
                <span className={"flex h-11 w-11 items-center justify-center rounded-full border-2 bg-white transition-colors duration-500 " +
                  (done || (active && finished) ? "border-emerald-500 text-emerald-600"
                    : active ? "border-[var(--art-primary)] text-[var(--art-primary)] shadow-[0_0_0_4px_rgba(37,99,235,.1)]"
                    : "border-[#e0e8f2] text-[#a0afc2]")}>
                  {done || (active && finished) ? <Check size={20} strokeWidth={2.5}/> : <Icon size={19}/>}
                </span>
                <span className={"mt-2 max-w-[105px] text-[10px] font-semibold leading-[1.35] sm:max-w-none sm:text-[12px] " +
                  (active ? "text-[#174b95]" : done ? "text-[#267b59]" : "text-[#7285a0]")}>{item.name}</span>
              </div>;
            })}
          </div>
        </div>
      </section>

      {pickup && <section className={card}>
        <div className="text-center">
          <p className="text-[13px] font-bold text-[#21436f]">Código de retirada</p>
          {order.pickupCode && !finished
            ? <strong className="mt-3 block text-[36px] font-extrabold tracking-[0.23em] text-[var(--art-primary)] sm:text-[42px]">
                {order.pickupCode}
              </strong>
            : <p className="mt-3 text-[13px] text-[#657d9b]">{finished ? "Retirada concluída." : "Código temporariamente indisponível."}</p>}
          {!finished && <p className="mx-auto mt-3 max-w-md text-[12px] leading-5 text-[#657d9b]">
            Apresente os quatro dígitos no balcão quando o pedido estiver pronto. Guarde também seu link privado para acompanhar as atualizações.
          </p>}
        </div>
        {order.pickupLocation && <div className="mt-6 grid gap-5 border-t border-[#e5edf7] pt-5 sm:grid-cols-2">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[12px] font-bold text-[#244b7b]"><MapPin size={16}/> Local de retirada</p>
            <p className="mt-2 text-[12px] leading-6 text-[#526986]">
              {order.pickupLocation.street}, {order.pickupLocation.number}
              {order.pickupLocation.district ? " — " + order.pickupLocation.district : ""}
              <span className="block">{order.pickupLocation.city}/{order.pickupLocation.state}
                {order.pickupLocation.postalCode ? " · CEP " + zip(order.pickupLocation.postalCode) : ""}</span>
            </p>
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[12px] font-bold text-[#244b7b]"><Clock3 size={16}/> Horário de retirada</p>
            <p className="mt-2 whitespace-pre-line text-[12px] leading-6 text-[#526986]">
              {order.pickupLocation.hours || "Consulte o horário com a loja."}
            </p>
          </div>
          {order.pickupLocation.instructions && <p className="text-[12px] leading-5 text-[#697d97] sm:col-span-2">{order.pickupLocation.instructions}</p>}
        </div>}
      </section>}

      <section className={card}>
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row sm:text-left">
          <div className="text-center sm:text-left">
            <p className="flex items-center justify-center gap-2 text-[13px] font-bold text-[#244b7b] sm:justify-start"><LockKeyhole size={16}/> Seu link privado</p>
            <p className="mt-1 max-w-md text-[12px] leading-5 text-[#647c9a]">
              {token ? "Guarde este link para acompanhar seu pedido sempre que precisar."
                : "Você também pode acompanhar pelo link privado recebido quando realizou a compra."}
            </p>
          </div>
          {token && <button type="button" onClick={() => void copyLink()}
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-[var(--art-primary)] px-5 text-[12px] font-bold text-white hover:brightness-110 sm:w-auto">
            {copied ? <CheckCircle2 size={17}/> : <Copy size={17}/>}
            {copied ? "Link copiado" : "Copiar link de acompanhamento"}
          </button>}
        </div>
      </section>
    </>}
  </div>;
}
