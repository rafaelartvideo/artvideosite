// Endpoint legado desativado: sem processamento externo.
Deno.serve((_request: Request) => new Response(
  JSON.stringify({ error: "Integração Uniq desativada." }),
  { status: 410, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } },
));
