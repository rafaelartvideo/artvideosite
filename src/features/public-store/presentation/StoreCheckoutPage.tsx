import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  AlertCircle, ArrowLeft, ArrowRight, BadgeCheck, Check, CheckCircle2,
  ChevronRight, CreditCard, Headphones, LoaderCircle,
  LockKeyhole, MapPin, Minus, Package, Plus, ShieldCheck, ShoppingBag, Store, Truck, UserRound,
} from "lucide-react";
import { useProductDetailBySlug, useProducts } from "@/features/public-catalog/application/usePublicCatalog";
import { useStoreCart } from "../application/store-cart";
import { getStoreProductExtras, loadStorePickupOption, loadStorePaymentStatus, quoteStoreShipping, startStoreCheckout, type ShippingOption } from "@/features/public-store/infrastructure/storefront.repository";
import { formatCurrency } from "@/shared/domain/formatters";

type Step = 1 | 2 | 3;
type Buyer = {
  buyer_name: string; buyer_email: string; buyer_phone: string;
  street: string; number: string; complement: string;
  district: string; city: string; state: string;
};
type BuyerKey = keyof Buyer;
const initialBuyer: Buyer = {
  buyer_name: "", buyer_email: "", buyer_phone: "",
  street: "", number: "", complement: "", district: "", city: "", state: "",
};
const inputStyle = "mt-1.5 min-h-12 w-full rounded-lg border border-[#dce5f2] bg-white px-4 py-3 text-[14px] text-[#112540] placeholder:text-[#9aabc0] shadow-sm outline-none transition-all focus:border-[#1471e9] focus:ring-4 focus:ring-blue-500/10 disabled:opacity-60";
const buttonStyle = "inline-flex min-h-12 items-center justify-center gap-2.5 rounded-lg bg-[var(--art-primary)] px-6 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:brightness-110 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0";
const steps: { value: Step; name: string; sub: string; Icon: typeof UserRound }[] = [
  { value: 1, name: "Identificação", sub: "Seus dados", Icon: UserRound },
  { value: 2, name: "Entrega", sub: "Endereço e frete", Icon: Truck },
  { value: 3, name: "Revisão e pagamento", sub: "Confira o pedido", Icon: CreditCard },
];

function Field({ label, required, children, hint }: {
  label: string; required?: boolean; children: ReactNode; hint?: string;
}) {
  return <label className="block min-w-0 text-[13px] font-bold text-[#203650]">
    {label}{required && <span className="ml-1 text-[#e04c52]">*</span>}
    {children}
    {hint && <span className="mt-1.5 block text-[11px] font-normal text-[#6c7e96]">{hint}</span>}
  </label>;
}

function displayCep(code: string) {
  const digits = code.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? digits.slice(0, 5) + "-" + digits.slice(5) : digits;
}
function validPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

export function StoreCheckoutPage({ slug }: { slug: string | null }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const cartMode = slug === "carrinho";
  const { items: cartItems } = useStoreCart();
  const { products: catalog, loading: catalogLoading, error: catalogError } = useProducts();
  const productMap = new Map(catalog.map(p => [p.id, p]));
  const cartLines = cartMode ? cartItems.flatMap(item => {
    const found = productMap.get(item.productId);
    return found ? [{ product: found, quantity: item.quantity }] : [];
  }) : [];
  const { detail, loading: productLoading, error: productError } = useProductDetailBySlug(cartMode ? null : slug);
  const productId: string = cartMode ? cartItems[0]?.productId || "" : detail?.product?.id || "";
  const cartExtras = useQueries({ queries: (cartMode ? cartItems : []).map(item => ({
    queryKey: ["artvideo-storefront-extra", item.productId],
    queryFn: () => getStoreProductExtras(item.productId, null),
    staleTime: 10_000,
  })) });
  const extrasQuery = useQuery({
    queryKey: ["artvideo-storefront-extra", productId],
    queryFn: () => getStoreProductExtras(productId, detail?.media ?? null),
    enabled: Boolean(productId) && !cartMode,
    staleTime: 10_000,
  });

  const initialQuantity = Number(params.get("q") || 1);
  const [quantity, setQuantity] = useState(
    Number.isInteger(initialQuantity) ? Math.max(1, Math.min(initialQuantity, 10)) : 1
  );
  const [step, setStep] = useState<Step>(1);
  const [buyer, setBuyer] = useState<Buyer>(initialBuyer);
  const [postalCode, setPostalCode] = useState(displayCep(params.get("cep") || ""));
  const [deliveryMode, setDeliveryMode] = useState<"delivery"|"pickup">("delivery");
  const pickupQuery = useQuery({
    queryKey: ["artvideo-store-pickup"],
    queryFn: loadStorePickupOption,
    staleTime: 30_000,
  });
  const paymentQuery=useQuery({
    queryKey:["artvideo-store-payment-status"],
    queryFn:loadStorePaymentStatus,
    staleTime:10_000,
  });
  const paymentsAvailable=paymentQuery.data?.available===true;
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [quoteKey, setQuoteKey] = useState("");
  const [shippingId, setShippingId] = useState("");
  const [shippingLoading, setShippingLoading] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const mainRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);

  const product = cartMode ? cartLines[0]?.product : detail?.product;
  const stock = cartMode ? null : extrasQuery.data?.stock ?? null;
  const unitPrice = Number(product?.price ?? 0);
  const cartAvailable = cartMode && cartItems.length > 0 && cartItems.length <= 15
    && cartItems.length === cartLines.length && cartLines.every((line, i) =>
       Number(line.product.price) > 0 && Number.isInteger(line.quantity)
       && line.quantity >= 1 && line.quantity <= 10
       && !cartExtras[i]?.isPending && !cartExtras[i]?.isError
       && cartExtras[i]?.data?.stock != null && cartExtras[i].data!.stock! >= line.quantity);
  const purchasable = cartMode ? Boolean(cartAvailable)
    : !extrasQuery.isError && Number.isFinite(unitPrice)
      && unitPrice > 0 && stock !== null && stock >= quantity && quantity > 0 && quantity <= 10;
  const zipDigits = postalCode.replace(/\D/g, "");
  const key = (cartMode ? JSON.stringify(cartItems) : productId + ":" + quantity) + ":" + zipDigits;
  const quotedOptions = quoteKey === key ? options : [];
  const selectedShipping = deliveryMode==="pickup" ? pickupQuery.data ?? null :
    quotedOptions.find(item => item.id === shippingId) || null;
  const subtotal = cartMode ? cartLines.reduce((total, line) => total + Number(line.product.price) * line.quantity, 0) : unitPrice * quantity;
  const total = subtotal + (selectedShipping?.price ?? 0);
  const backToProduct = cartMode ? "/carrinho" : slug ? "/loja/" + encodeURIComponent(slug) : "/loja";
  const checkoutProductsKey = cartMode ? JSON.stringify(cartItems) : String(productId)+":"+quantity;
  useEffect(() => {
    if (step === 3 && !purchasable) {
      setStep(2);
      setError("A disponibilidade do carrinho mudou. Revise os itens antes de pagar.");
    }
  }, [checkoutProductsKey, purchasable]);

  useEffect(() => {
    setStep(1);
    setError("");
    setOptions([]);
    setQuoteKey("");
    setShippingId("");
  }, [productId]);

  const move = (next: Step) => {
    setStep(next);
    setError("");
    mainRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const updateBuyer = (field: BuyerKey, value: string) => {
    setBuyer(current => ({ ...current, [field]: value }));
    if (error) setError("");
  };
  const updateQuantity = (value: number) => {
    setQuantity(value);
    setOptions([]);
    setQuoteKey("");
    setShippingId("");
    setError("");
    if (step === 3) setStep(2);
  };
  const changePostalCode = (value: string) => {
    setPostalCode(displayCep(value));
    setOptions([]);
    setQuoteKey("");
    setShippingId("");
    setError("");
  };
  const checkIdentity = () => {
    if (buyer.buyer_name.trim().length < 3) {
      setError("Informe seu nome completo."); return false;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyer.buyer_email.trim())) {
      setError("Informe um e-mail válido para receber informações da compra."); return false;
    }
    if (!validPhone(buyer.buyer_phone)) {
      setError("Informe um telefone com DDD."); return false;
    }
    setError(""); return true;
  };
  const checkDelivery = () => {
    if (deliveryMode === "pickup") {
      if (!pickupQuery.data) { setError("A retirada na loja não está disponível no momento."); return false; }
      setError(""); return true;
    }
    if (!/^\d{8}$/.test(zipDigits) || !selectedShipping) {
      setError("Consulte seu CEP e escolha uma modalidade de entrega disponível."); return false;
    }
    const keys: BuyerKey[] = ["street", "number", "district", "city", "state"];
    if (keys.some(k => !buyer[k].trim()) || !/^[A-Z]{2}$/.test(buyer.state.trim().toUpperCase())) {
      setError("Preencha o endereço completo, incluindo número, bairro, cidade e UF."); return false;
    }
    setError(""); return true;
  };

  const fillAddress = async () => {
    if (!/^\d{8}$/.test(zipDigits)) {
      setError("Digite um CEP válido com 8 números."); return;
    }
    setAddressLoading(true);
    try {
      const response = await fetch("https://viacep.com.br/ws/" + zipDigits + "/json/", {
        signal: AbortSignal.timeout(7000),
      });
      if (!response.ok) throw new Error("Endereço indisponível");
      const data = await response.json();
      if (data.erro) throw new Error("CEP não encontrado");
      setBuyer(current => ({
        ...current, street: data.logradouro || current.street,
        district: data.bairro || current.district,
        city: data.localidade || current.city, state: data.uf || current.state,
      }));
    } catch {
      // Endereço é opcionalmente autocompletado: o cliente sempre pode digitar.
    } finally {
      setAddressLoading(false);
    }
  };

  const quoteDelivery = async () => {
    if (!/^\d{8}$/.test(zipDigits)) {
      setError("Digite um CEP válido com 8 números."); return;
    }
    if (!purchasable) {
      setError("Este produto não está disponível na quantidade selecionada."); return;
    }
    setShippingLoading(true);
    setError("");
    setOptions([]);
    setQuoteKey("");
    setShippingId("");
    try {
      const result = await quoteStoreShipping(productId, cartMode ? 1 : quantity, zipDigits);
      if (result.length === 0) {
        setError("Ainda não entregamos nesse CEP. Informe outro endereço para continuar.");
        return;
      }
      setOptions(result);
      setQuoteKey(key);
      if (result.length === 1) setShippingId(result[0].id);
      void fillAddress();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível consultar a entrega.");
    } finally {
      setShippingLoading(false);
    }
  };

  const placeOrder = async () => {
    if (inFlight.current || paying) return;
    if(!paymentsAvailable){setError("O pagamento online está sendo preparado. Nenhuma cobrança foi realizada.");return;}
    if (!checkIdentity() || !checkDelivery() || !purchasable || !selectedShipping) {
      if (!error && !purchasable) setError("Revise a disponibilidade do produto.");
      return;
    }
    inFlight.current = true;
    setPaying(true);
    setError("");
    let redirecting = false;
    try {
      if (cartMode) {
        const latest = await Promise.all(cartExtras.map(q => q.refetch()));
        if (latest.length !== cartItems.length || latest.some((result,i) =>
          result.error || result.data?.stock == null || result.data.stock < cartItems[i].quantity)) {
          setError("A disponibilidade de algum item mudou. Atualize seu carrinho.");
          return;
        }
      } else {
        const latest = await extrasQuery.refetch();
        if (latest.error || latest.data?.stock == null || latest.data.stock < quantity) {
          setError("A quantidade disponível mudou. Volte ao produto e confira o estoque.");
          return;
        }
      }
      // Confirma a modalidade e os valores com a tabela atual antes do pagamento.
      const liveQuotes = deliveryMode === "pickup"
        ? [await loadStorePickupOption()].filter((option): option is NonNullable<typeof option> => Boolean(option))
        : await quoteStoreShipping(productId, cartMode ? 1 : quantity, zipDigits);
      const current = liveQuotes.find(item => item.id === selectedShipping.id);
      if (!current) {
        if (deliveryMode === "delivery") { setOptions(liveQuotes); setQuoteKey(key); setShippingId(""); }
        setError("Essa modalidade de entrega mudou. Selecione o frete novamente.");
        setStep(2);
        return;
      }
      if (Math.abs(current.price - selectedShipping.price) > 0.009) {
        if (deliveryMode === "delivery") { setOptions(liveQuotes); setQuoteKey(key); setShippingId(current.id); }
        setError("O valor da entrega foi atualizado. Confira o novo total antes de pagar.");
        return;
      }
      const checkout = await startStoreCheckout({
        product_id: productId, quantity,
        ...(cartMode ? { items: cartItems.map(i => ({ product_id: i.productId, quantity: i.quantity })) } : {}),
        expected_items: cartMode
          ? cartLines.map(line => ({ product_id: line.product.id, unit_price: Number(line.product.price) }))
          : [{ product_id: productId, unit_price: unitPrice }],
        expected_shipping_price: selectedShipping.price,
        expected_total: total,
        postal_code: deliveryMode === "pickup" ? pickupQuery.data!.postal_code : zipDigits,
        shipping_service_id: selectedShipping.id,
        ...buyer,
        buyer_name: buyer.buyer_name.trim(),
        buyer_email: buyer.buyer_email.trim(),
        buyer_phone: buyer.buyer_phone.trim(),
        street: buyer.street.trim(), number: buyer.number.trim(),
        district: buyer.district.trim(), city: buyer.city.trim(),
        state: buyer.state.trim().toUpperCase(),
        complement: buyer.complement.trim(),
      });
      if (checkout.orderId) {
        try {
          sessionStorage.setItem("artvideo-last-order", checkout.orderId);
          sessionStorage.setItem("artvideo-last-email", buyer.buyer_email.trim());
          sessionStorage.setItem("artvideo-store-tracking", checkout.trackingToken);
        } catch {
          // Navegadores sem armazenamento não devem impedir a navegação segura.
        }
      }
      window.location.assign(checkout.url);
      redirecting = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível iniciar o pagamento.");
    } finally {
      // Mantém o checkout bloqueado até a navegação para o provedor,
      // evitando múltiplos pedidos se o redirecionamento demorar.
      if (!redirecting) {
        inFlight.current = false;
        setPaying(false);
      }
    }
  };

  if (productLoading || (cartMode && catalogLoading)) return <div className="flex min-h-[65vh] items-center justify-center gap-3 bg-[#f8fbff] text-sm text-[#53647b]"><LoaderCircle className="animate-spin text-[var(--art-primary)]" size={21}/> Preparando sua compra...</div>;
  if (productError || (cartMode && catalogError) || (!cartMode && !detail) || !product) return <section className="min-h-[65vh] bg-[#f8fbff] px-4 py-24 text-center">
    <AlertCircle className="mx-auto text-[#dc5a5a]" size={37}/>
    <h1 className="mt-4 text-2xl font-extrabold">Não foi possível abrir o checkout</h1>
    <p className="mt-2 text-sm text-[#63738b]">{productError || "O produto não está mais disponível."}</p>
    <Link to="/loja" className={buttonStyle + " mt-6"}>Voltar à loja</Link>
  </section>;

  const firstImage = cartMode ? null : extrasQuery.data?.images[0]?.url;
  const cardStyle = "rounded-xl border border-[#e0e8f3] bg-white shadow-[0_5px_22px_rgba(13,39,77,.045)]";
  const summary = <div className={cardStyle + " overflow-hidden"}>
    <div className="border-b border-[#e9eef6] px-5 py-4">
      <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-[#10243d]"><ShoppingBag size={18} className="text-[var(--art-primary)]"/> Resumo do pedido</h2>
    </div>
    {cartMode ? <div className="divide-y divide-[#edf1f7]">
      {cartLines.map(line => <div key={line.product.id} className="px-5 py-4">
        <p className="line-clamp-2 text-[13px] font-bold leading-5 text-[#172c47]">{line.product.name}</p>
        <div className="mt-1 flex justify-between gap-3 text-[12px] text-[#71839a]">
          <span>{line.quantity} × {formatCurrency(line.product.price)}</span>
          <strong className="text-[#112a4a]">{formatCurrency(Number(line.product.price)*line.quantity)}</strong>
        </div>
      </div>)}
      <button type="button" onClick={() => navigate("/carrinho")} className="w-full px-5 py-3 text-left text-[12px] font-bold text-[var(--art-primary)] hover:underline">Editar carrinho</button>
    </div> :     <div className="flex gap-3 px-5 py-5">
      <div className="flex h-[82px] w-[82px] shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#edf1f7] bg-[#f7faff] p-2">
        {firstImage ? <img src={firstImage} alt={product.name} className="h-full w-full object-contain"/> :
          <Package className="text-[#97aecb]" size={35}/>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold leading-[1.45] text-[#172c47]">{product.name}</p>
        <p className="mt-1 text-[12px] text-[#728198]">{quantity} {quantity === 1 ? "unidade" : "unidades"}</p>
        <p className="mt-1 text-sm font-extrabold text-[#112a4a]">{formatCurrency(subtotal)}</p>
        <button type="button" onClick={() => navigate(backToProduct)}
          className="mt-1 text-[11px] font-bold text-[var(--art-primary)] hover:underline">Ver produto</button>
      </div>
    </div>
    }
    <div className="border-t border-[#edf1f7] px-5 py-4">
      <div className="flex items-center justify-between gap-3 text-sm text-[#536780]"><span>Produtos ({cartMode ? cartItems.reduce((t,i)=>t+i.quantity,0) : quantity})</span><span className="font-semibold text-[#1c314d]">{formatCurrency(subtotal)}</span></div>
      <div className="mt-3 flex items-center justify-between gap-3 text-sm text-[#536780]"><span>{deliveryMode==="pickup"?"Retirada":"Entrega"}</span><span className="text-right font-semibold text-[#1c314d]">{selectedShipping ? selectedShipping.price === 0 ? "Grátis" : formatCurrency(selectedShipping.price) : "A calcular"}</span></div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#e9eef6] pt-4">
        <span className="text-[14px] font-extrabold text-[#10243d]">Total</span>
        <span className="text-[22px] font-extrabold tracking-tight text-[var(--art-primary)]">{selectedShipping ? formatCurrency(total) : formatCurrency(subtotal)}</span>
      </div>
      {!selectedShipping && <p className="mt-2 text-[11px] text-[#8793a5]">O valor da entrega será adicionado após a consulta do CEP.</p>}
    </div>
    <div className="space-y-3 border-t border-[#edf1f7] bg-[#f7faff] px-5 py-4 text-[12px] text-[#526984]">
      <p className="flex items-center gap-2"><ShieldCheck size={17} className="shrink-0 text-[var(--art-primary)]"/> Compra protegida durante o pagamento</p>
      <p className="flex items-center gap-2"><Truck size={17} className="shrink-0 text-[var(--art-primary)]"/> Entrega regional da Artvideo</p>
      <p className="flex items-center gap-2"><Headphones size={17} className="shrink-0 text-[var(--art-primary)]"/> Atendimento para suas dúvidas</p>
    </div>
  </div>;

  return <div className="min-h-screen bg-[#f6f9fd] text-[#10243d]">
    <div className="border-b border-[#e4ebf5] bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <button type="button" onClick={() => navigate(backToProduct)}
          className="inline-flex items-center gap-2 text-[12px] font-bold text-[#52677f] transition-colors hover:text-[var(--art-primary)]">
          <ArrowLeft size={17}/> Voltar ao produto
        </button>
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#668098]"><LockKeyhole size={15} className="text-[var(--art-primary)]"/> Finalização protegida</span>
      </div>
    </div>

    <div className="bg-gradient-to-r from-[#0b1c34] via-[#0e2a51] to-[#114577]">
      <div className="mx-auto max-w-7xl px-4 py-9 text-white sm:px-6 sm:py-11 lg:px-8">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.12em] text-[#8bc6ff]"><ShoppingBag size={15}/> Loja Artvideo</div>
        <h1 className="mt-2 text-[30px] font-extrabold tracking-[-.04em] sm:text-[38px]" style={{ fontFamily: "'Poppins', 'Inter', sans-serif" }}>Finalizar compra</h1>
        <p className="mt-2 text-[13px] text-white/75">Mais alguns passos e seu pedido estará pronto para o pagamento.</p>
      </div>
    </div>

    <div ref={mainRef} className="mx-auto max-w-7xl scroll-mt-24 px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="Etapas da compra" className={cardStyle + " mb-7 p-3 sm:p-5"}>
        <ol className="grid grid-cols-3 gap-1 sm:gap-3">
          {steps.map(({ value, name, sub, Icon }, index) => {
            const done = step > value;
            const active = step === value;
            return <li key={value} className="min-w-0">
              <button type="button" disabled={paying || value > step}
                onClick={() => { if (value <= step) move(value); }}
                aria-current={active ? "step" : undefined}
                className={"flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left transition-colors sm:gap-3 sm:p-3 " +
                  (active ? "bg-[#eff6ff]" : done ? "hover:bg-[#f7faff]" : "cursor-default")}>
                <span className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-extrabold sm:h-11 sm:w-11 " +
                  (done ? "border-[#b6e2d1] bg-[#e5f8ef] text-[#198d5e]" : active ? "border-[var(--art-primary)] bg-[var(--art-primary)] text-white" : "border-[#d9e4f1] bg-[#f3f7fc] text-[#9aafc5]")}>
                  {done ? <Check size={20}/> : <Icon size={19}/>}
                </span>
                <span className="min-w-0">
                  <span className={"block text-[11px] font-extrabold leading-tight sm:text-[13px] " + (active ? "text-[var(--art-primary)]" : "text-[#203852]")}>{name}</span>
                  <span className="mt-0.5 hidden text-[11px] text-[#8492a7] sm:block">{sub}</span>
                </span>
                {index < 2 && <ChevronRight size={15} className="ml-auto hidden shrink-0 text-[#b1bfd0] lg:block"/>}
              </button>
            </li>;
          })}
        </ol>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e9eff7]">
          <div className="h-full rounded-full bg-[var(--art-primary)] transition-all duration-300"
            style={{ width: (step / 3 * 100) + "%" }}/>
        </div>
      </nav>

      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-8">
        <div className="min-w-0">
          {(cartMode ? cartExtras.some(q => q.isPending) : extrasQuery.isPending) && <div className={cardStyle + " flex items-center gap-2 p-5 text-sm text-[#5f748c]"}><LoaderCircle className="animate-spin" size={18}/> Confirmando disponibilidade...</div>}
          {(!purchasable && !(cartMode ? cartExtras.some(q => q.isPending) : extrasQuery.isPending)) && <div role="alert" className="mb-5 flex items-start gap-3 rounded-lg border border-[#f1d1d1] bg-[#fff5f5] p-4 text-[13px] text-[#a83e43]">
            <AlertCircle size={19} className="shrink-0"/> A quantidade solicitada não está disponível no momento. Ajuste a quantidade ou volte ao produto.
          </div>}

          {step === 1 && <section aria-labelledby="checkout-identificacao" className={cardStyle + " overflow-hidden"}>
            <div className="border-b border-[#e9eef6] px-5 py-5 sm:px-7">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--art-primary)]">Etapa 1 de 3</span>
              <h2 id="checkout-identificacao" className="mt-1 text-[22px] font-extrabold tracking-tight">Seus dados</h2>
              <p className="mt-1 text-[13px] text-[#647791]">Como podemos identificar você e falar sobre o seu pedido?</p>
            </div>
            <div className="space-y-5 p-5 sm:p-7">
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Field label="Nome completo" required>
                    <input className={inputStyle} autoComplete="name" maxLength={150}
                      value={buyer.buyer_name} onChange={e => updateBuyer("buyer_name", e.target.value)}
                      placeholder="Seu nome e sobrenome"/>
                  </Field>
                </div>
                <Field label="E-mail" required hint="Use um e-mail que você acessa.">
                  <input className={inputStyle} type="email" autoComplete="email" maxLength={200}
                    value={buyer.buyer_email} onChange={e => updateBuyer("buyer_email", e.target.value)}
                    placeholder="voce@exemplo.com"/>
                </Field>
                <Field label="Celular com DDD" required hint="Para dúvidas sobre a entrega.">
                  <input className={inputStyle} inputMode="tel" autoComplete="tel" maxLength={24}
                    value={buyer.buyer_phone} onChange={e => updateBuyer("buyer_phone", e.target.value)}
                    placeholder="(79) 99999-9999"/>
                </Field>
              </div>
              <div className="rounded-lg border border-[#dbeafb] bg-[#f1f7ff] p-4">
                <p className="flex items-start gap-2 text-[12px] leading-5 text-[#516e90]">
                  <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[var(--art-primary)]"/>
                  Seus dados serão utilizados para identificar a compra, organizar a entrega e entrar em contato quando necessário.
                </p>
              </div>
              {!cartMode && <div className="rounded-lg border border-[#e7edf5] bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <p className="text-[13px] font-bold">Quantidade de produtos</p>
                  <div className="flex items-center overflow-hidden rounded-lg border border-[#dce6f2]">
                    <button type="button" aria-label="Diminuir quantidade" disabled={paying || quantity <= 1}
                      onClick={() => updateQuantity(quantity - 1)} className="flex h-10 w-10 items-center justify-center hover:bg-blue-50 disabled:opacity-35"><Minus size={16}/></button>
                    <span className="w-10 text-center text-sm font-extrabold">{quantity}</span>
                    <button type="button" aria-label="Aumentar quantidade" disabled={paying || quantity >= 10 || (stock !== null && quantity >= stock)}
                      onClick={() => updateQuantity(quantity + 1)} className="flex h-10 w-10 items-center justify-center hover:bg-blue-50 disabled:opacity-35"><Plus size={16}/></button>
                  </div>
                </div>
              </div>}
            </div>
          </section>}

          {step === 2 && <section aria-labelledby="checkout-entrega" className={cardStyle + " overflow-hidden"}>
            <div className="border-b border-[#e9eef6] px-5 py-5 sm:px-7">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--art-primary)]">Etapa 2 de 3</span>
              <h2 id="checkout-entrega" className="mt-1 text-[22px] font-extrabold tracking-tight">Como você quer receber?</h2>
              <p className="mt-1 text-[13px] text-[#647791]">Escolha a entrega regional ou retire seu pedido na loja.</p>
            </div>
            <div className="space-y-6 p-5 sm:p-7">
              <fieldset>
                <legend className="mb-3 text-[13px] font-bold">Forma de recebimento</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={"flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors "+
                    (deliveryMode==="delivery"?"border-[var(--art-primary)] bg-[#eff6ff]":"border-[#e1e9f4] hover:bg-blue-50")}>
                    <input type="radio" name="delivery-method" checked={deliveryMode==="delivery"}
                      onChange={()=>{setDeliveryMode("delivery");setError("");}} className="accent-blue-600"/>
                    <Truck size={22} className="text-[var(--art-primary)]"/>
                    <span><strong className="block text-[13px]">Receber no endereço</strong><span className="text-[11px] text-[#6c7e94]">Frete por CEP</span></span>
                  </label>
                  {pickupQuery.data&&<label className={"flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors "+
                    (deliveryMode==="pickup"?"border-[var(--art-primary)] bg-[#eff6ff]":"border-[#e1e9f4] hover:bg-blue-50")}>
                    <input type="radio" name="delivery-method" checked={deliveryMode==="pickup"}
                      onChange={()=>{setDeliveryMode("pickup");setError("");}} className="accent-blue-600"/>
                    <Store size={22} className="text-[var(--art-primary)]"/>
                    <span><strong className="block text-[13px]">Retirar na loja</strong><span className="text-[11px] text-emerald-600">Grátis · após confirmação</span></span>
                  </label>}
                </div>
              </fieldset>
              {deliveryMode==="pickup" && pickupQuery.data && <div className="rounded-lg border border-[#dbe6f4] bg-[#f5faff] p-5">
                <h3 className="flex items-center gap-2 text-[15px] font-extrabold"><MapPin size={18} className="text-[var(--art-primary)]"/>{pickupQuery.data.name}</h3>
                <p className="mt-3 text-[13px] text-[#536780]">{pickupQuery.data.street}, {pickupQuery.data.number}{pickupQuery.data.complement ? " · "+pickupQuery.data.complement : ""}</p>
                <p className="text-[13px] text-[#536780]">{pickupQuery.data.district}, {pickupQuery.data.city}/{pickupQuery.data.state} · CEP {displayCep(pickupQuery.data.postal_code)}</p>
                <p className="mt-3 whitespace-pre-line text-[12px] leading-5 text-[#536780]"><strong>Horários:</strong> {pickupQuery.data.opening_hours}</p>
                {pickupQuery.data.instructions&&<p className="mt-2 whitespace-pre-line text-[12px] leading-5 text-[#536780]">{pickupQuery.data.instructions}</p>}
                <p className="mt-3 text-[12px] font-semibold text-[var(--art-primary)]">Aguarde a confirmação de pedido pronto antes de ir à loja.</p>
              </div>}
              {deliveryMode==="delivery" && <>
              <div>
                <Field label="CEP de entrega" required hint="Atendemos apenas os CEPs cadastrados para nossa região.">
                  <div className="flex min-w-0 gap-2">
                    <input className={inputStyle + " min-w-0 flex-1"} inputMode="numeric" autoComplete="postal-code"
                      maxLength={9} value={postalCode} onChange={e => changePostalCode(e.target.value)} placeholder="00000-000"/>
                    <button type="button" disabled={shippingLoading || !purchasable}
                      onClick={() => void quoteDelivery()} className="mt-1.5 shrink-0 rounded-lg border border-[#a7cafa] bg-[#ecf5ff] px-4 text-[12px] font-extrabold text-[var(--art-primary)] transition-colors hover:bg-[#dcebff] disabled:opacity-50">
                      {shippingLoading ? <LoaderCircle size={17} className="animate-spin"/> : "Consultar"}
                    </button>
                  </div>
                </Field>
              </div>
              {quotedOptions.length > 0 && <fieldset>
                <legend className="mb-3 text-[13px] font-extrabold text-[#203650]">Escolha sua entrega</legend>
                <div className="space-y-3">
                  {quotedOptions.map(option => <label key={option.id} className={"flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-all " +
                    (shippingId === option.id ? "border-[var(--art-primary)] bg-[#f0f7ff] shadow-sm" : "border-[#dfe8f3] bg-white hover:border-[#a4c8f8]")}>
                    <input type="radio" className="h-4 w-4 shrink-0 accent-blue-600"
                      checked={shippingId === option.id} onChange={() => { setShippingId(option.id); setError(""); }}/>
                    <Truck size={21} className="shrink-0 text-[var(--art-primary)]"/>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-extrabold">{option.name}</span>
                      <span className="mt-1 block text-[11px] text-[#71839a]">{option.deliveryDays != null ? "Prazo informado: até " + option.deliveryDays + " dias úteis" : "Prazo a combinar"}</span>
                    </span>
                    <span className="shrink-0 text-[13px] font-extrabold text-[var(--art-primary)]">{option.price === 0 ? "Grátis" : formatCurrency(option.price)}</span>
                  </label>)}
                </div>
              </fieldset>}
              <div className="border-t border-[#edf1f7] pt-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-[15px] font-extrabold"><MapPin size={18} className="text-[var(--art-primary)]"/> Endereço</h3>
                  <button type="button" disabled={addressLoading || zipDigits.length !== 8}
                    onClick={() => void fillAddress()}
                    className="text-[12px] font-bold text-[var(--art-primary)] hover:underline disabled:opacity-50">
                    {addressLoading ? "Consultando endereço..." : "Preencher pelo CEP"}
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label="Rua ou avenida" required>
                      <input className={inputStyle} autoComplete="address-line1" maxLength={160}
                        value={buyer.street} onChange={e => updateBuyer("street", e.target.value)} placeholder="Nome do logradouro"/>
                    </Field>
                  </div>
                  <Field label="Número" required>
                    <input className={inputStyle} autoComplete="off" maxLength={30} value={buyer.number}
                      onChange={e => updateBuyer("number", e.target.value)} placeholder="123"/>
                  </Field>
                  <Field label="Complemento">
                    <input className={inputStyle} autoComplete="address-line2" maxLength={160}
                      value={buyer.complement} onChange={e => updateBuyer("complement", e.target.value)} placeholder="Apartamento, casa, referência..."/>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Bairro" required>
                      <input className={inputStyle} maxLength={120} value={buyer.district}
                        onChange={e => updateBuyer("district", e.target.value)} placeholder="Seu bairro"/>
                    </Field>
                  </div>
                  <Field label="Cidade" required>
                    <input className={inputStyle} autoComplete="address-level2" maxLength={120}
                      value={buyer.city} onChange={e => updateBuyer("city", e.target.value)} placeholder="Sua cidade"/>
                  </Field>
                  <Field label="UF" required>
                    <input className={inputStyle} autoComplete="address-level1" maxLength={2}
                      value={buyer.state} onChange={e => updateBuyer("state", e.target.value.replace(/[^a-z]/ig, "").toUpperCase().slice(0, 2))} placeholder="SE"/>
                  </Field>
                </div>
              </div>
              </>}
            </div>
          </section>}

          {step === 3 && <section aria-labelledby="checkout-revisao" className={cardStyle + " overflow-hidden"}>
            <div className="border-b border-[#e9eef6] px-5 py-5 sm:px-7">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--art-primary)]">Etapa 3 de 3</span>
              <h2 id="checkout-revisao" className="mt-1 text-[22px] font-extrabold tracking-tight">Revise antes de pagar</h2>
              <p className="mt-1 text-[13px] text-[#647791]">Confira seus dados e o total do pedido.</p>
            </div>
            <div className="space-y-4 p-5 sm:p-7">
              <div className="rounded-lg border border-[#e3ebf5] bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-[14px] font-extrabold"><UserRound size={18} className="text-[var(--art-primary)]"/> Identificação</h3>
                  <button type="button" onClick={() => move(1)} className="text-[12px] font-bold text-[var(--art-primary)] hover:underline">Alterar</button>
                </div>
                <p className="mt-3 text-[13px] font-bold">{buyer.buyer_name.trim()}</p>
                <p className="mt-1 text-[12px] text-[#63758c]">{buyer.buyer_email.trim()}</p>
                <p className="mt-1 text-[12px] text-[#63758c]">{buyer.buyer_phone.trim()}</p>
              </div>
              <div className="rounded-lg border border-[#e3ebf5] bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="flex items-center gap-2 text-[14px] font-extrabold"><MapPin size={18} className="text-[var(--art-primary)]"/> {deliveryMode==="pickup" ? "Retirada na loja" : "Endereço de entrega"}</h3>
                  <button type="button" onClick={() => move(2)} className="text-[12px] font-bold text-[var(--art-primary)] hover:underline">Alterar</button>
                </div>
                {deliveryMode==="pickup" && pickupQuery.data ? <>
                  <p className="mt-3 text-[13px] font-bold">{pickupQuery.data.name}</p>
                  <p className="mt-1 text-[12px] text-[#63758c]">{pickupQuery.data.street}, {pickupQuery.data.number} · {pickupQuery.data.district} · {pickupQuery.data.city}/{pickupQuery.data.state}</p>
                  <p className="mt-2 text-[12px] font-semibold text-[var(--art-primary)]">Grátis · aguarde a confirmação de pedido pronto</p>
                </> : <>
                  <p className="mt-3 text-[13px] font-bold">{buyer.street}, {buyer.number}{buyer.complement ? " · " + buyer.complement : ""}</p>
                  <p className="mt-1 text-[12px] text-[#63758c]">{buyer.district} · {buyer.city}/{buyer.state} · CEP {displayCep(zipDigits)}</p>
                </>}
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-[#f2f8ff] px-3 py-2.5 text-[12px] text-[#3d5d82]">
                  {deliveryMode==="pickup" ? <Store size={18} className="text-[var(--art-primary)]"/> : <Truck size={18} className="text-[var(--art-primary)]"/>}
                  <span className="flex-1">{selectedShipping?.name} {selectedShipping?.deliveryDays != null ? " · até " + selectedShipping.deliveryDays + " dias úteis" : ""}</span>
                  <strong>{selectedShipping?.price === 0 ? "Grátis" : formatCurrency(selectedShipping?.price || 0)}</strong>
                </div>
              </div>
              <div className="rounded-lg border border-[#bde0f3] bg-gradient-to-r from-[#f0f9ff] to-[#f4f9ff] p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <LockKeyhole size={22} className="mt-0.5 shrink-0 text-[var(--art-primary)]"/>
                  <div>
                    <h3 className="text-[14px] font-extrabold text-[#14385d]">
                      {paymentsAvailable ? "Pagamento com " + (paymentQuery.data?.providerName || "provedor seguro") : "Pagamento online em preparação"}
                    </h3>
                    <p className="mt-1 text-[12px] leading-relaxed text-[#58728e]">
                      {paymentsAvailable
                        ? "Ao continuar, você será direcionado ao ambiente seguro de pagamento. A Artvideo não solicita dados do cartão nesta página."
                        : "Estamos preparando uma nova forma de pagamento para a loja. Você pode consultar os produtos e o frete, mas novas cobranças estão temporariamente indisponíveis."}
                    </p>
                  </div>
                </div>
              </div>
              <p className="flex items-start gap-2 text-[11px] leading-5 text-[#71839a]">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#278a61]"/>
                O pedido só será considerado pago após a confirmação do provedor.
              </p>
              {!paymentsAvailable && <Link to="/contato"
                className="inline-flex min-h-10 items-center gap-2 text-[12px] font-bold text-[var(--art-primary)] hover:underline">
                Entre em contato com a Artvideo para consultar opções de compra <ArrowRight size={16}/>
              </Link>}
            </div>
          </section>}

          {error && <div role="alert" aria-live="assertive" className="mt-5 flex items-start gap-3 rounded-lg border border-[#edcacc] bg-[#fff4f4] px-4 py-4 text-[13px] leading-5 text-[#a83e45]">
            <AlertCircle size={19} className="mt-0.5 shrink-0"/><span>{error}</span>
          </div>}

          <div className="mt-6 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            {step === 1 ? <button type="button" onClick={() => navigate(backToProduct)}
              className="inline-flex min-h-12 items-center justify-center gap-2 px-4 text-[13px] font-bold text-[#677991] transition-colors hover:text-[var(--art-primary)]"><ArrowLeft size={17}/> Voltar ao produto</button>
              : <button type="button" onClick={() => move((step - 1) as Step)} disabled={paying}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[#dce6f2] bg-white px-5 text-[13px] font-bold text-[#415873] transition-colors hover:bg-[#e9f3ff] disabled:opacity-50"><ArrowLeft size={17}/> Voltar</button>}
            {step < 3 ? <button type="button" className={buttonStyle} disabled={!purchasable || shippingLoading}
              onClick={() => {
                if (step === 1 && checkIdentity()) move(2);
                if (step === 2 && checkDelivery()) move(3);
              }}>
              Continuar <ArrowRight size={17}/>
            </button> : <button type="button" className={buttonStyle} disabled={!purchasable || paying || !selectedShipping || !paymentsAvailable}
              onClick={() => void placeOrder()}>
              {paying ? <><LoaderCircle className="animate-spin" size={19}/> Verificando seu pedido...</> :
                paymentsAvailable ? <><LockKeyhole size={18}/> Ir para pagamento <ArrowRight size={16}/></> :
                <><LockKeyhole size={18}/> Pagamento indisponível</>}
            </button>}
          </div>
        </div>

        <aside className="min-w-0 lg:sticky lg:top-[95px]">
          {summary}
          <p className="mt-4 flex items-start gap-2 px-2 text-[11px] leading-relaxed text-[#8493a9]"><BadgeCheck size={16} className="shrink-0 text-[var(--art-primary)]"/>
            Valores e disponibilidade são conferidos novamente ao continuar para o pagamento.</p>
        </aside>
      </div>
    </div>
  </div>;
}
