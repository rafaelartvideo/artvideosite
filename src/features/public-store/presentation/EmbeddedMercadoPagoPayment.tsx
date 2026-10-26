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
              const result=await submitEmbeddedPayment(session,formData);
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
    {loading&&<div className="flex min-h-20 items-center justify-center gap-2 text-sm text-[#617792]">
      <LoaderCircle className="animate-spin" size={20}/> Carregando pagamento...
    </div>}
    <div id={containerId} className="min-h-20" />
    {error&&<div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
      <AlertCircle size={18} className="shrink-0"/>{error}
    </div>}
  </div>;
}
