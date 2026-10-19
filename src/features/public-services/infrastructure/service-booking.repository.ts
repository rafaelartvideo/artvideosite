import { supabase } from '@/lib/supabase';
import type { Address } from '@/lib/address';
import type { PublicQuoteForm } from '@/features/public-quotes/domain/public-quote';
export async function submitServiceBooking(form:PublicQuoteForm,address:Address,selection:{variant_id:string;quantity:number;date:string;slot:string},protocol:string) {
 const {data,error}=await supabase.rpc('submit_public_service_quote_v1',{p_form:form,p_address:address,p_selection:selection,p_protocol:protocol});
 if(error) throw new Error('Não foi possível enviar o orçamento. Tente novamente.');
 if(!data?.success) throw new Error(data?.error || 'Não foi possível enviar o orçamento.');
 return data.protocol as string;
}
