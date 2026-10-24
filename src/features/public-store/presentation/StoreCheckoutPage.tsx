import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router";
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2,
  CreditCard, LoaderCircle,
  LockKeyhole, MapPin, Minus, Package, Plus, ShieldCheck, ShoppingBag, Store, Truck, UserRound,
} from "lucide-react";
import { useProductDetailBySlug, useProducts } from "@/features/public-catalog/application/usePublicCatalog";
import { useStoreCart } from "../application/store-cart";
import { getStoreProductExtras, loadStorePickupOption, loadStorePaymentStatus, checkStoreHomologationAccess, loadEmbeddedCheckoutAvailability, prepareEmbeddedStoreCheckout, refreshEmbeddedPayment, resumeEmbeddedStoreCheckout, quoteStoreShipping, startStoreCheckout, type EmbeddedCheckoutSession,type EmbeddedPaymentResult,type ShippingOption } from "@/features/public-store/infrastructure/storefront.repository";
import { formatCurrency } from "@/shared/domain/formatters";
import {QRCodeSVG} from "qrcode.react";
import {EmbeddedMercadoPagoPayment} from "./EmbeddedMercadoPagoPayment";

type Step = 1 | 2 | 3 | 4;
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
  { value: 3, name: "Revisão", sub: "Confira o pedido", Icon: Package },
  { value: 4, name: "Pagamento", sub: "Finalize aqui no site", Icon: CreditCard },
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
function formatCheckoutPhone(value: string, previousValue = "", cursorPosition?: number | null) {
  let digits = value.replace(/\D/g, "");
  // Aceita também números colados com o código do Brasil (+55).
  if (digits.length > 11 && digits.startsWith("55")) digits = digits.slice(2);
  digits = digits.slice(0, 11);

  const format = (phoneDigits: string) => {
    if (!phoneDigits) return "";
    if (phoneDigits.length <= 2) return "(" + phoneDigits;
    const ddd = phoneDigits.slice(0, 2);
    const number = phoneDigits.slice(2);
    const firstPart = phoneDigits.length === 11 ? 5 : 4;
    return "(" + ddd + ") " + number.slice(0, firstPart)
      + (number.length > firstPart ? "-" + number.slice(firstPart) : "");
  };

  const formatted = format(digits);
  // Ao apagar um separador da máscara, apaga também o dígito anterior.
  if (value.length < previousValue.length && formatted === previousValue) {
    const chars = value.split("");
    let index = Math.min(Math.max((cursorPosition ?? value.length) - 1, 0), chars.length - 1);
    while (index >= 0 && !/\d/.test(chars[index] || "")) index--;
    if (index >= 0) {
      chars.splice(index, 1);
      return format(chars.join("").replace(/\D/g, "").slice(0, 11));
    }
  }
  return formatted;
}

function validPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11;
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
  const [homologationToken]=useState(()=>{
    try{return sessionStorage.getItem("artvideo-store-homologation")||"";}
    catch{return "";}
  });
  const testAccess=useQuery({
    queryKey:["artvideo-homologation-access",homologationToken],
    queryFn:()=>checkStoreHomologationAccess(homologationToken),
    enabled:homologationToken.length===64,
    staleTime:0,refetchOnWindowFocus:true,
  });
  const homologationAvailable=homologationToken.length===64 && testAccess.data===true;
  const paymentsAvailable=paymentQuery.data?.available===true || homologationAvailable;
  const embeddedQuery=useQuery({
    queryKey:["artvideo-embedded-payment",homologationToken],
    queryFn:()=>loadEmbeddedCheckoutAvailability(homologationToken),
    enabled:paymentsAvailable,staleTime:15_000,
  });
  const embeddedAvailable=embeddedQuery.data===true;
  const [brickSession,setBrickSession]=useState<EmbeddedCheckoutSession|null>(null);
  const [brickResult,setBrickResult]=useState<EmbeddedPaymentResult|null>(null);
  const [brickRefreshing,setBrickRefreshing]=useState(false);
  const [resumingBrick,setResumingBrick]=useState(false);
  const [lastBrickAccess]=useState(()=>{
    try{
      const orderId=sessionStorage.getItem("artvideo-last-order")||"";
      const token=sessionStorage.getItem("artvideo-store-tracking")||"";
      if(/^[0-9a-f-]{36}$/i.test(orderId)&&/^[a-f0-9]{64}$/.test(token))
        return {orderId,token};
    }catch{/* navegador sem sessionStorage */}
    return null;
  });
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

  const placeOrder = async (mode:"hosted"|"bricks"="hosted") => {
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
      const checkoutPayload={
        ...(homologationAvailable ? {homologation_token:homologationToken}:{}),
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
      };
      if(mode==="bricks"){
        const session=await prepareEmbeddedStoreCheckout(checkoutPayload);
        try{
          sessionStorage.setItem("artvideo-last-order",session.orderId);
          sessionStorage.setItem("artvideo-last-email",buyer.buyer_email.trim());
          sessionStorage.setItem("artvideo-store-tracking",session.trackingToken);
        }catch{/* navegador com sessao restrita */}
        setBrickSession(session);
        setBrickResult(null);
        move(4);
        return;
      }
      const checkout=await startStoreCheckout(checkoutPayload);
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

  const resumeBrick=async()=>{
    if(!lastBrickAccess||resumingBrick)return;
    setResumingBrick(true);
    setError("");
    try{
      const session=await resumeEmbeddedStoreCheckout(
        lastBrickAccess.orderId,lastBrickAccess.token);
      setBuyer(current=>({...current,buyer_email:session.buyerEmail}));
      setBrickSession(session);
      setBrickResult(null);
      move(4);
    }catch(err){
      setError(err instanceof Error?err.message:"Nao foi possivel retomar o pedido.");
      mainRef.current?.scrollIntoView({behavior:"smooth",block:"start"});
    }finally{setResumingBrick(false);}
  };
  const refreshBrickStatus=async()=>{
    if(!brickSession||brickRefreshing)return;
    setBrickRefreshing(true);
    setError("");
    try{
      const result=await refreshEmbeddedPayment(brickSession);
      if(result.status==="not_started"){
        setError("Aguardando o envio do pagamento pelo formulário.");
      }else{
        setBrickResult(result);
      }
    }catch(err){setError(err instanceof Error?err.message:"Nao foi possivel atualizar o pagamento.");}
    finally{setBrickRefreshing(false);}
  };

  if (productLoading || (cartMode && catalogLoading)) return <div className="flex min-h-[65vh] items-center justify-center gap-3 bg-[#f8fbff] text-sm text-[#53647b]"><LoaderCircle className="animate-spin text-[var(--art-primary)]" size={21}/> {cartMode ? "Carregando seu carrinho..." : "Preparando seu pedido..."}</div>;
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
  </div>;

  const backAction = <button type="button" disabled={paying || Boolean(brickSession)}
    onClick={() => step === 1 ? navigate(backToProduct) : move((step - 1) as Step)}
    className="inline-flex min-h-[52px] min-w-0 items-center justify-center gap-1.5 rounded-[7px] border border-[var(--art-primary)] bg-[#ecf2ff] px-2 text-center text-[12px] font-bold leading-tight text-[var(--art-primary)] transition-colors hover:bg-[#dfeaff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-12 md:px-5 md:text-[13px]">
    <ArrowLeft size={16} className="shrink-0"/>
    <span>{step === 1 ? cartMode ? "Voltar ao carrinho" : "Voltar ao produto" : "Anterior"}</span>
  </button>;
  const nextAction = step < 3 ? <button type="button" disabled={!purchasable || shippingLoading || paying}
    onClick={() => {
      if (step === 1 && checkIdentity()) move(2);
      if (step === 2 && checkDelivery()) move(3);
    }}
    className="inline-flex min-h-[52px] min-w-0 items-center justify-center gap-1.5 rounded-[7px] bg-[var(--art-primary)] px-2 text-center text-[13px] font-bold leading-tight text-white transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-12 md:px-6">
    Continuar <ArrowRight size={16} className="shrink-0"/>
  </button> : step===3 ? <button type="button" disabled={!purchasable || paying || !selectedShipping || !paymentsAvailable}
    onClick={() => void placeOrder(embeddedAvailable?"bricks":"hosted")}
    className="inline-flex min-h-[52px] min-w-0 items-center justify-center gap-1.5 rounded-[7px] bg-[var(--art-primary)] px-2 text-center text-[12px] font-bold leading-tight text-white transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--art-primary)] disabled:cursor-not-allowed disabled:opacity-50 md:min-h-12 md:px-6 md:text-[13px]">
    {paying ? <><LoaderCircle size={17} className="shrink-0 animate-spin"/> Verificando...</> :
      paymentsAvailable ? <><LockKeyhole size={16} className="shrink-0"/> {embeddedAvailable?"Pagar aqui no site":"Ir para pagamento"}</> :
      "Pagamento indisponível"}
  </button> : null;

  return <div className="art-checkout-page min-h-screen bg-[#f6f9fd] text-[#10243d]">
    {(homologationAvailable||Boolean(brickSession))&&<div role="status" className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-center text-[12px] font-semibold leading-5 text-amber-900">
      Homologação privada ativa. Este é um pedido REAL: a compra será cobrada pelo Mercado Pago
      e, se aprovada, poderá baixar o estoque da Artvideo.
    </div>}
    {homologationToken&&!homologationAvailable&&!brickSession&&!lastBrickAccess&&!testAccess.isPending&&<div role="alert"
      className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-center text-[12px] font-semibold text-amber-900">
      O convite privado expirou ou já foi utilizado. Gere outro convite na Union World.
    </div>}
    {!brickSession&&lastBrickAccess&&<div className="border-b border-[#dce6f4] bg-[#f1f7ff] px-5 py-3 text-center">
      <button type="button" onClick={()=>void resumeBrick()} disabled={resumingBrick}
        className="inline-flex min-h-10 items-center gap-2 text-[12px] font-bold text-[var(--art-primary)] disabled:opacity-50">
        {resumingBrick?<LoaderCircle className="animate-spin" size={17}/>:<CreditCard size={17}/>}
        Retomar pagamento do último pedido de homologação
      </button>
    </div>}
    <div className="bg-gradient-to-r from-[#0b1c34] via-[#0e2a51] to-[#114577]">
      <div className="mx-auto max-w-7xl px-4 py-6 text-white sm:px-6 sm:py-10 lg:px-8">
        <h1 className="text-[26px] font-extrabold tracking-[-.035em] sm:text-[38px]">Finalizar compra</h1>
        <p className="mt-1.5 text-[12px] leading-relaxed text-white/75 sm:mt-2 sm:text-[13px]">Mais alguns passos e seu pedido estará pronto para o pagamento.</p>
      </div>
    </div>

    <div ref={mainRef} className="mx-auto max-w-7xl scroll-mt-24 px-4 pb-28 pt-5 sm:px-6 sm:py-8 lg:px-8">
      <nav aria-label="Etapas da compra" className={cardStyle + " mb-5 p-2.5 sm:mb-7 sm:p-5"}>
        <ol className="grid grid-cols-4 gap-1 sm:gap-3">
          {steps.map(({ value, name, sub, Icon }) => {
            const done = step > value;
            const active = step === value;
            return <li key={value} className="min-w-0">
              <button type="button" disabled={paying || value > step || Boolean(brickSession)}
                onClick={() => { if (value <= step && !brickSession) move(value); }}
                aria-label={name + " · etapa " + value + " de 4"}
                aria-current={active ? "step" : undefined}
                className={"flex min-h-[81px] w-full min-w-0 flex-col items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-center transition-colors sm:min-h-0 sm:flex-row sm:justify-start sm:gap-3 sm:p-3 sm:text-left " +
                  (active ? "bg-[#eff6ff]" : done ? "hover:bg-[#f7faff]" : "cursor-default")}>
                <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-full border sm:h-11 sm:w-11 " +
                  (done ? "border-[#b6e2d1] bg-[#e5f8ef] text-[#198d5e]" : active ? "border-[var(--art-primary)] bg-[var(--art-primary)] text-white" : "border-[#d9e4f1] bg-[#f3f7fc] text-[#9aafc5]")}>
                  {done ? <Check size={18}/> : <Icon size={18}/>}
                </span>
                <span className="min-w-0 max-w-full">
                  <span className={"block text-[10px] font-bold leading-tight sm:text-[13px] sm:font-extrabold " + (active ? "text-[var(--art-primary)]" : "text-[#203852]")}>
                    <span className="sm:hidden">{value === 3 ? "Revisão" : name}</span>
                    <span className="hidden sm:inline">{name}</span>
                  </span>
                  <span className="mt-0.5 hidden text-[11px] text-[#8492a7] sm:block">{sub}</span>
                </span>
              </button>
            </li>;
          })}
        </ol>
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#e9eff7] sm:mt-3">
          <div className="h-full rounded-full bg-[var(--art-primary)] transition-all duration-300"
            style={{ width: (step / 4 * 100) + "%" }}/>
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
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--art-primary)]">Etapa 1 de 4</span>
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
                  <input className={inputStyle} type="tel" inputMode="tel" autoComplete="tel-national" maxLength={24}
                    value={buyer.buyer_phone}
                    onChange={e => updateBuyer("buyer_phone", formatCheckoutPhone(e.target.value, buyer.buyer_phone, e.target.selectionStart))}
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
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--art-primary)]">Etapa 2 de 4</span>
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
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--art-primary)]">Etapa 3 de 4</span>
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
                      {paymentsAvailable ? "Pagamento com " + (homologationAvailable?"Mercado Pago · Homologação privada":paymentQuery.data?.providerName || "provedor seguro") : "Pagamento online em preparação"}
                    </h3>
                    <p className="mt-1 text-[12px] leading-relaxed text-[#58728e]">
                      {paymentsAvailable
                        ? embeddedAvailable
                          ? "Você pode pagar no próximo passo, sem sair do site. Os dados do cartão são tratados pelo SDK seguro do Mercado Pago."
                          : "Ao continuar, você será direcionado ao ambiente seguro de pagamento. A Artvideo não solicita dados do cartão nesta página."
                        : "Estamos preparando uma nova forma de pagamento para a loja. Você pode consultar os produtos e o frete, mas novas cobranças estão temporariamente indisponíveis."}
                    </p>
                  </div>
                </div>
              </div>
              <p className="flex items-start gap-2 text-[11px] leading-5 text-[#71839a]">
                <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#278a61]"/>
                O pedido só será considerado pago após a confirmação do provedor.
              </p>
              {embeddedAvailable && <button type="button"
                disabled={paying || !selectedShipping}
                onClick={()=>void placeOrder("hosted")}
                className="text-[12px] font-bold text-[var(--art-primary)] hover:underline disabled:opacity-50">
                Prefiro pagar na página do Mercado Pago (Checkout Pro)
              </button>}
              {!paymentsAvailable && <Link to="/contato"
                className="inline-flex min-h-10 items-center gap-2 text-[12px] font-bold text-[var(--art-primary)] hover:underline">
                Entre em contato com a Artvideo para consultar opções de compra <ArrowRight size={16}/>
              </Link>}
            </div>
          </section>}

          {step===4 && brickSession && <section aria-labelledby="checkout-pagamento" className={cardStyle+" overflow-hidden"}>
            <div className="border-b border-[#e9eef6] px-5 py-5 sm:px-7">
              <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--art-primary)]">Etapa 4 de 4</span>
              <h2 id="checkout-pagamento" className="mt-1 text-[22px] font-extrabold tracking-tight">Pagamento seguro</h2>
              <p className="mt-1 text-[13px] text-[#647791]">Finalize o pedido no próprio site com Pix ou cartão. Outros meios continuam disponíveis no Checkout Pro.</p>
            </div>
            <div className="space-y-5 p-5 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#dce7f5] bg-[#f7faff] p-4">
                <div>
                  <p className="text-[12px] font-semibold text-[#667b95]">Pedido #{brickSession.orderId.slice(0,8).toUpperCase()}</p>
                  <p className="mt-1 text-[12px] text-[#667b95]">Valor calculado e reservado no servidor</p>
                </div>
                <strong className="text-[22px] text-[#173b64]">{formatCurrency(brickSession.amount)}</strong>
              </div>
              {!brickResult ? <EmbeddedMercadoPagoPayment
                session={brickSession} buyerEmail={buyer.buyer_email}
                onResult={setBrickResult}/> : <>
                <div className={"rounded-lg border p-4 text-[13px] "+
                  (brickResult.status==="approved"?"border-emerald-200 bg-emerald-50 text-emerald-900":
                   ["pending","in_process","authorized"].includes(brickResult.status)?
                   "border-blue-200 bg-blue-50 text-blue-900":"border-amber-200 bg-amber-50 text-amber-900")}>
                  <strong>{brickResult.status==="approved"?"Pagamento confirmado":
                    brickResult.status==="pending"?"Pagamento aguardando confirmação":
                    brickResult.status==="in_process"?"Pagamento em análise":
                    ["rejected","cancelled"].includes(brickResult.status)?"Pagamento não aprovado":
                    "Situação do pagamento: "+brickResult.status}</strong>
                  <p className="mt-1 leading-5">O estoque somente será baixado após a confirmação válida do pagamento.</p>
                </div>
                {brickResult.qrCode && <div className="flex flex-col items-center gap-4 rounded-lg border border-[#e2e9f4] p-4">
                  <p className="text-sm font-bold">Pague com Pix</p>
                  <QRCodeSVG value={brickResult.qrCode} size={192}/>
                  <button type="button" onClick={()=>void navigator.clipboard.writeText(brickResult.qrCode!)}
                    className="rounded-lg border border-[#c8def5] px-4 py-3 text-[12px] font-bold text-[var(--art-primary)]">
                    Copiar código Pix
                  </button>
                </div>}
                {brickResult.ticketUrl&&<a href={brickResult.ticketUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center rounded-lg border border-[#bcd6f2] px-4 text-xs font-bold text-[var(--art-primary)]">
                  Ver boleto bancário
                </a>}
              </>}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={brickRefreshing} onClick={()=>void refreshBrickStatus()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#c8dff9] px-4 text-xs font-bold text-[var(--art-primary)] disabled:opacity-50">
                  {brickRefreshing?<LoaderCircle size={16} className="animate-spin"/>:<CheckCircle2 size={16}/>}
                  Atualizar situação
                </button>
                <Link to={"/#acompanhar-servico&c="+brickSession.trackingToken}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--art-primary)] px-4 text-xs font-bold text-white">
                  Acompanhar pedido <ArrowRight size={16}/>
                </Link>
              </div>
              <p className="text-xs leading-5 text-[#627895]">
                Se a confirmação demorar, acompanhe seu pedido sem gerar outro pagamento.
                Você pode sair desta página depois de salvar o link de acompanhamento.
              </p>
            </div>
          </section>}

          {error && <div role="alert" aria-live="assertive" className="mt-5 hidden items-start gap-3 rounded-lg border border-[#edcacc] bg-[#fff4f4] px-4 py-4 text-[13px] leading-5 text-[#a83e45] md:flex">
            <AlertCircle size={19} className="mt-0.5 shrink-0"/><span>{error}</span>
          </div>}

          {step!==4&&<div className="mt-6 hidden items-center justify-between gap-3 md:flex">
            {backAction}
            {nextAction}
          </div>}
        </div>

        <aside className="min-w-0 lg:sticky lg:top-[95px]">
          {summary}
        </aside>
      </div>
    </div>

    {/* Mesmas ações e validações em todas as etapas; visíveis no celular sem rolagem. */}
    {step!==4&&<div className="art-checkout-mobile-actions fixed inset-x-0 bottom-0 z-[60] border-t border-[#e0e8f2] bg-white/95 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom,0px))] shadow-[0_-5px_20px_rgba(15,38,73,.10)] backdrop-blur-md md:hidden" aria-label="Navegação do checkout">
      {error && <p role="alert" aria-live="assertive" className="mx-3 mb-2 rounded-lg border border-[#edcacc] bg-[#fff4f4] px-3 py-2.5 text-[12px] leading-relaxed text-[#a83e45]">{error}</p>}
      <div className="mx-auto grid max-w-lg grid-cols-2 gap-2 px-3">
        {backAction}
        {nextAction}
      </div>
    </div>}
  </div>;
}
