import {createClient} from 'npm:@supabase/supabase-js@2.112.3';
import {menuResponse,resolveMenuCustomer} from '../_shared/sac-menu.mjs';
Deno.serve(async request=>{
 if(!['GET','POST'].includes(request.method))return Response.json({sucesso:false},{status:405});
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!url||!key)return Response.json({sucesso:false},{status:503});
 const token=new URL(request.url).searchParams.get('token')||'';if(!/^[0-9a-f-]{36}$/i.test(token))return Response.json({sucesso:false},{status:401});
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try {
  const {data:integration,error}=await admin.from('sac_digital_integrations').select('organization_id,enabled').eq('webhook_token',token).maybeSingle();
  if(error||!integration?.enabled)return Response.json({sucesso:false},{status:403});
  const {data:module}=await admin.from('organization_modules').select('module_key').eq('organization_id',integration.organization_id).eq('module_key','sac_digital').eq('is_enabled',true).maybeSingle();if(!module)return Response.json({sucesso:false},{status:403});
  const {data:settings,error:configError}=await admin.from('sac_digital_menu_settings').select('enabled,text,choices,source').eq('organization_id',integration.organization_id).maybeSingle();if(configError||!settings?.enabled)return Response.json({sucesso:false,retorno:{texto:'Menu indisponível.',menus:[]}});
  let params=Object.fromEntries(new URL(request.url).searchParams);
  if(request.method==='POST') {
   const raw=await request.text();if(raw.length>16000)return Response.json({sucesso:false},{status:413});
   const body=request.headers.get('content-type')?.includes('application/json')?JSON.parse(raw||'{}'):Object.fromEntries(new URLSearchParams(raw));if(body&&typeof body==='object'&&!Array.isArray(body))params={...params,...body};
  }
  let orders=[];
  if(settings.source==='service_order_status') {
   let number=String(params.numero||'').replace(/\D/g,'');if(number.length===10||number.length===11)number='55'+number;
   if(!/^\d{8,15}$/.test(number))return Response.json({sucesso:false,retorno:{texto:'Informe um número válido.',menus:[]}});
   const variants=[number];if(number.startsWith('55')&&number.length===13&&number[4]==='9')variants.push(number.slice(0,4)+number.slice(5));
   const {data:contacts,error:contactError,count:contactCount}=await admin.from('sac_digital_contacts').select('customer_id',{count:'exact'}).eq('organization_id',integration.organization_id).in('phone',variants).not('customer_id','is',null).limit(2);
   if(contactError)throw contactError;
   // Ambiguous customer identity must not disclose another customer's orders.
   const customerId=resolveMenuCustomer(contacts||[],contactCount);
   if(customerId){const {data,error:orderError}=await admin.from('service_orders').select('os_number,status:order_statuses(name)').eq('organization_id',integration.organization_id).eq('customer_id',customerId).order('created_at',{ascending:false}).limit(5);if(orderError)throw orderError;orders=(data||[]).map((row:any)=>({...row,status:(Array.isArray(row.status)?row.status[0]:row.status)?.name || null}));}
  }
  return Response.json(menuResponse(settings,orders));
 }catch{return Response.json({sucesso:false,retorno:{texto:'Não foi possível consultar o menu.',menus:[]}},{status:503});}
});
