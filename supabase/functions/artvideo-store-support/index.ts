import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { CORS } from "../_shared/artvideo-store.ts";

const headers={...CORS,"Cache-Control":"no-store","Content-Type":"application/json; charset=utf-8"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response(null,{headers:CORS});
  if(req.method!=="POST") return reply({error:"Método não permitido."},405);
  try {
    if(Number(req.headers.get("content-length")||0)>2500) return reply({error:"Dados muito longos."},400);
    const body=await req.json();
    const token=String(body?.token||"").trim().toLowerCase();
    const type=String(body?.type||"");
    const reason=String(body?.reason||"").trim();
    if(!/^[a-f0-9]{64}$/.test(token)||!["cancellation","exchange","return"].includes(type)
      ||reason.length<10||reason.length>1200) return reply({error:"Confira o motivo e o código de acesso."},400);
    const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{
      auth:{persistSession:false},
    });
    const {data,error}=await admin.rpc("artvideo_store_request_support_v1",{
      p_token:token,p_type:type,p_reason:reason,
    });
    if(error) {
      // A função SQL devolve somente mensagens de negócio validadas, sem PII.
      const business=error.code==="23514"||error.code==="22023";
      return reply({error:business ? error.message : "Não foi possível registrar a solicitação. Tente novamente."},
        business?409:503);
    }
    return reply({case:data},201);
  }catch{return reply({error:"Não foi possível registrar a solicitação agora."},503);}
});