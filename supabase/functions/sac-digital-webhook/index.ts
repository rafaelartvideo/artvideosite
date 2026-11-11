// SAC Digital desativada em 2026-11-11; nenhuma leitura/escrita no banco.
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Cache-Control": "no-store" };
Deno.serve((request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  return new Response(null, { status: 204, headers }); // Aceita sem processar para não causar tentativas repetidas do provedor.
});