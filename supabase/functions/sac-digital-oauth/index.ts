import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { handleSacOAuthCallback } from '../_shared/sac-oauth-callback.mjs';
import { operatorTokenError, responseEnvelope } from '../_shared/sac-gateway.ts';

// Public callback is authenticated by a one-time scoped state, never a client JWT.
Deno.serve(async request=>{
 const supabaseUrl=Deno.env.get('SUPABASE_URL');const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!supabaseUrl || !serviceKey) return new Response('Serviço indisponível.',{status:503,headers:{'Cache-Control':'no-store'}});
 const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 return handleSacOAuthCallback(request,admin,{operatorTokenError,profileAccepted:(body,status)=>responseEnvelope(body,status).success});
});
