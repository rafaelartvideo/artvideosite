import { supabase } from "@/lib/supabase";

export type UnionWhatsAppEngineStatus={
  success:true;
  scope:"platform";
  checked_at:string;
  latest:{tag:string|null;published_at:string|null;url:string};
  bridge:{reachable:boolean;engine_reachable:boolean|null;version:string|null;image:string|null;image_id:string|null;observed_at:string|null};
  update_available:boolean|null;
  maintenance_enabled:false;
  notice:string;
};
export async function checkUnionWhatsAppEngine(organizationId:string):Promise<UnionWhatsAppEngineStatus>{
  const {data,error}=await supabase.functions.invoke("union-whatsapp-engine",{
    body:{action:"check",organization_id:organizationId},
  });
  if(error)throw error;
  if(!data||data.success!==true||data.scope!=="platform")
    throw new Error(typeof data?.error==="string"?data.error:"Não foi possível verificar o motor.");
  return data as UnionWhatsAppEngineStatus;
}
