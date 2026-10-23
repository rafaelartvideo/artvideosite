import {useEffect,useRef,useState} from "react";
import {AlertCircle,LoaderCircle,ShieldCheck} from "lucide-react";
import {
  submitEmbeddedPayment,
  type EmbeddedCheckoutSession,type EmbeddedPaymentResult,
} from "../infrastructure/storefront.repository";

type BrickController={unmount:()=>void};
type BrickSDK={
  bricks:()=>{create:(
    type:string,id:string,
    settings:Record<string,unknown>
  )=>Promise<BrickController>};
};
type BrickConstructor=new (publicKey:string,config:{locale:string})=>BrickSDK;

const sdkId="artvideo-mercado-pago-payment-bricks-sdk";
let sdkPromise:Promise<void>|null=null;
function loadSdk():Promise<void>{
  if(typeof window==="undefined")return Promise.reject(new Error("Navegador indisponível."));
  if((window as any).MercadoPago)return Promise.resolve();
  if(sdkPromise)return sdkPromise;
  sdkPromise=new Promise((resolve,reject)=>{
    let script=document.getElementById(sdkId) as HTMLScriptElement|null;
    if(!script){
      script=document.createElement("script");
      script.id=sdkId;
      script.src="https://sdk.mercadopago.com/js/v2";
      script.async=true;
      script.crossOrigin="anonymous";
      document.head.appendChild(script);
    }
    script.addEventListener("load",()=>resolve(),{once:true});
    script.addEventListener("error",()=>{
      sdkPromise=null;script?.remove();
      reject(new Error("Não foi possível carregar o formulário seguro do Mercado Pago."));
    },{once:true});
  });
  return sdkPromise;
}
export function EmbeddedMercadoPagoPayment({
  session,buyerEmail,onResult,
}:{
  session:EmbeddedCheckoutSession;buyerEmail:string;
  onResult:(result:EmbeddedPaymentResult)=>void;
}){
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  // O Payment Brick envia somente e-mail para transferencia bancaria/Pix.
  // Coletamos CPF/CNPJ separadamente, apenas em memoria, para completar
  // a requisicao de pagamento conforme o contrato do Mercado Pago.
  const [pixDocument,setPixDocument]=useState("");
  const pixDocumentRef=useRef("");
  const changePixDocument=(value:string)=>{
    const digits=value.replace(/\D/g,"").slice(0,14);
    pixDocumentRef.current=digits;
    setPixDocument(digits);
    if(error)setError("");
  };
  const callback=useRef(onResult);
  useEffect(()=>{callback.current=onResult;},[onResult]);
  const containerId="artvideo-payment-brick-"+session.orderId.replace(/-/g,"");
  useEffect(()=>{
    let cancelled=false;
    let controller:BrickController|null=null;
    setLoading(true);
    setError("");
    void loadSdk().then(async()=>{
      if(cancelled)return;
      const MercadoPago=(window as any).MercadoPago as BrickConstructor|undefined;
      if(!MercadoPago)throw new Error("O formulário de pagamento não pôde ser iniciado.");
      const sdk=new MercadoPago(session.publicKey,{locale:"pt-BR"});
      controller=await sdk.bricks().create("payment",containerId,{
        initialization:{amount:session.amount,
          payer:{email:buyerEmail.trim().toLowerCase()}},
        customization:{
          paymentMethods:{
            creditCard:"all",debitCard:"all",
            bankTransfer:["pix"],
          },
          visual:{style:{theme:"default"}},
        },
        callbacks:{
          onReady:()=>{if(!cancelled)setLoading(false);},
          onError:()=>{if(!cancelled)setError("Não foi possível carregar uma das opções de pagamento.");},
          onSubmit:async({formData}:{formData:Record<string,unknown>})=>{
            if(cancelled)throw new Error("O formulário foi fechado.");
            try{
              setError("");
              const method=String(formData.payment_method_id||"");
              let payload=formData;
              if(method==="pix"){
                const digits=pixDocumentRef.current;
                if(digits.length!==11&&digits.length!==14)
                  throw new Error("Para pagar com Pix, informe o CPF (11 dígitos) ou CNPJ (14 dígitos) do pagador.");
                const payer=formData.payer&&typeof formData.payer==="object"&&!Array.isArray(formData.payer)
                  ?formData.payer as Record<string,unknown>:{};
                payload={...formData,payer:{...payer,
                  identification:{type:digits.length===11?"CPF":"CNPJ",number:digits}}};
              }
              const result=await submitEmbeddedPayment(session,payload);
              if(!cancelled)callback.current(result);
            }catch(reason){
              if(!cancelled)setError(reason instanceof Error?reason.message:"Pagamento indisponível.");
              throw reason;
            }
          },
        },
      });
      if(cancelled)controller.unmount();
    }).catch(reason=>{
      if(!cancelled){
        setLoading(false);
        setError(reason instanceof Error?reason.message:"Não foi possível abrir o pagamento.");
      }
    });
    return ()=>{cancelled=true;controller?.unmount();};
  },[session.orderId,session.publicKey,session.amount,containerId,buyerEmail]);
  return <div className="space-y-4">
    <div className="flex items-start gap-2 rounded-lg border border-[#d8e8fa] bg-[#f2f8ff] p-3 text-xs text-[#4d6987]">
      <ShieldCheck className="shrink-0 text-[var(--art-primary)]" size={19}/>
      Os dados do cartão são preenchidos no formulário seguro do Mercado Pago.
      A Artvideo não recebe o número nem o código de segurança do cartão.
    </div>
    <div className="space-y-2 rounded-lg border border-[#dbe6f4] bg-white p-4">
      <label htmlFor={"artvideo-pix-document-"+session.orderId} className="block text-[13px] font-bold text-[#203650]">
        CPF ou CNPJ do pagador · para Pix
      </label>
      <input id={"artvideo-pix-document-"+session.orderId} value={pixDocument}
        onChange={event=>changePixDocument(event.target.value)}
        type="text" inputMode="numeric" autoComplete="off"
        maxLength={18} placeholder="Digite somente os números"
        className="min-h-11 w-full rounded-lg border border-[#dce5f2] bg-white px-3 text-[14px] text-[#10243d] outline-none focus:border-[var(--art-primary)]"
        aria-describedby={"artvideo-pix-document-hint-"+session.orderId}/>
      <p id={"artvideo-pix-document-hint-"+session.orderId} className="text-[11px] leading-5 text-[#647791]">
        Necessário para gerar Pix. Se escolher cartão, preencha o documento apenas
        no formulário seguro do Mercado Pago abaixo. Este dado não fica salvo na loja.
      </p>
    </div>
    {loading&&<div className="flex min-h-20 items-center justify-center gap-2 text-sm text-[#617792]">
      <LoaderCircle className="animate-spin" size={20}/> Carregando pagamento...
    </div>}
    <div id={containerId} className="min-h-20" />
    {error&&<div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
      <AlertCircle size={18} className="shrink-0"/>{error}
    </div>}
  </div>;
}
