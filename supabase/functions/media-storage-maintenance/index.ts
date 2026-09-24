// Função mantida desativada após a manutenção extraordinária de mídia.
// A rotina operacional foi executada em produção e esta função não deve
// realizar novas alterações sem uma nova revisão explícita.

Deno.serve(() => new Response(
  JSON.stringify({ success: false, error: "maintenance_disabled" }),
  {
    status: 410,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  },
));
