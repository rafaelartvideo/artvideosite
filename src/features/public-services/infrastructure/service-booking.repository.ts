import { supabase } from '@/lib/supabase';
import { prepareImageForUpload } from '@/shared/application/upload-file-optimizer';
import type { Address } from '@/lib/address';
import type { PublicQuoteForm } from '@/features/public-quotes/domain/public-quote';

export type SiteQuotePhotos={equipment?:File|null;label?:File|null;site?:File|null};
export type SiteQuoteSelection={
 variant_id:string;quantity:number;date:string;slot:string;
 attendance_mode:'onsite'|'store';brand_name:string;
};

export async function submitServiceBooking(
 form:PublicQuoteForm,address:Address,selection:SiteQuoteSelection,protocol:string,
 photos:SiteQuotePhotos={},mediaSecret?:string,
) {
 // Prepare sequentially to avoid decoding three full camera images in parallel.
 const attachments: [string, File][] = [];
 for (const [kind, file] of Object.entries(photos)) {
   if (!(file instanceof File)) continue;
   const prepared = await prepareImageForUpload(file, kind === 'label' ? 'service-label' : 'service-photo', 6 * 1024 * 1024);
   attachments.push([kind, prepared]);
 }
 const secret=attachments.length?(mediaSecret||crypto.randomUUID()):'';
 const media_token_hash=secret?Array.from(new Uint8Array(
   await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)),
 ),n=>n.toString(16).padStart(2,'0')).join(''):'';
 const {data,error}=await supabase.rpc('submit_public_service_quote_v1',{
   p_form:{...form,marca_nome:selection.brand_name,
     nome:form.customerType==='PJ'?form.tradeName:form.nome},
   p_address:selection.attendance_mode==='store'?{}:address,
   p_selection:{...selection,media_token_hash},p_protocol:protocol,
 });
 if(error)throw new Error('Não foi possível enviar o orçamento. Tente novamente.');
 if(!data?.success)throw new Error(data?.error||'Não foi possível enviar o orçamento.');
 if(attachments.length){
   const body=new FormData();
   body.set('protocol',protocol);body.set('secret',secret);
   attachments.forEach(([kind,file])=>body.set(kind,file,file.name));
   const media=await supabase.functions.invoke('artvideo-site-quote-media',{body});
   if(media.error||!media.data?.success)
     throw new Error('Solicitação registrada, mas as fotos não foram anexadas. Tente novamente para concluir o envio.');
 }
 return data.protocol as string;
}
