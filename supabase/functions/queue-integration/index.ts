import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

function publicKey() {
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
    return keys.default || Object.values(keys)[0] || "";
  } catch {
    return "";
  }
}

function secretKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return keys.default || Object.values(keys)[0] || "";
  } catch {
    return "";
  }
}

function uuid(value: unknown) {
  const text = String(value ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function permissionSet(rows: unknown) {
  return new Set((Array.isArray(rows) ? rows : []).map((item: any) =>
    String(typeof item === "string" ? item : item?.permission_key || item?.key || "")
  ));
}

async function parseResponse(response: Response) {
  const payload = await response.json().catch(() => ({}));
  return { response, payload: payload as any };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publishable = publicKey();
    const privileged = secretKey();

    if (!authorization || !supabaseUrl || !publishable || !privileged) {
      return json({ success: false, error: "Integração do CRM não configurada." }, 500);
    }

    const userClient = createClient(supabaseUrl, publishable, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = createClient(supabaseUrl, privileged, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ success: false, error: "Usuário não autenticado." }, 401);

    const body = await request.json().catch(() => ({})) as any;
    const action = String(body?.action || "").trim();
    const organizationId = uuid(body?.organization_id);
    if (!organizationId) return json({ success: false, error: "Empresa inválida." }, 400);

    const [{ data: permissions, error: permissionError }, { data: settings, error: settingsError }] = await Promise.all([
      userClient.rpc("my_organization_permissions", { p_organization_id: organizationId }),
      userClient
        .from("queue_integration_settings")
        .select("enabled,require_code_for_orders,reservation_ttl_seconds,outage_policy")
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);

    if (permissionError || settingsError) {
      return json({ success: false, error: "Não foi possível validar a integração da fila." }, 403);
    }

    const permissionsSet = permissionSet(permissions);

    const currentSettings = settings || {
      enabled: false,
      require_code_for_orders: false,
      reservation_ttl_seconds: 600,
      outage_policy: "manager_override",
    };

    if (action === "usage") {
      if (!currentSettings.enabled) {
        return json({ success: false, error: "A integração com a fila está desativada.", code: "integration_disabled" }, 409);
      }

      const bridgeUrl = String(Deno.env.get("QUEUE_BRIDGE_URL") || "").trim();
      const sharedSecret = String(Deno.env.get("QUEUE_BRIDGE_SHARED_SECRET") || "").trim();
      if (!/^https:\/\//i.test(bridgeUrl) || !sharedSecret) {
        return json({ success: false, error: "A ponte com o sistema de filas ainda não foi configurada.", code: "queue_unavailable" }, 503);
      }

      const remote = await parseResponse(await fetch(bridgeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-union-integration-secret": sharedSecret,
        },
        body: JSON.stringify({ action: "usage" }),
      }));

      if (!remote.response.ok || !remote.payload?.ok || !remote.payload?.usage) {
        return json({
          success: false,
          error: String(remote.payload?.error || "Não foi possível medir o consumo da fila."),
          code: remote.payload?.code || "queue_unavailable",
        }, remote.response.status || 503);
      }

      const { error: syncError } = await userClient.rpc("sync_union_queue_usage_v1", {
        p_organization_id: organizationId,
        p_usage: remote.payload.usage,
      });
      if (syncError) {
        return json({ success: false, error: "Sem permissão para sincronizar o consumo da fila." }, 403);
      }

      return json({ success: true, usage: remote.payload.usage });
    }

    if (!permissionsSet.has("orders.create")) {
      return json({ success: false, error: "Sem permissão para abrir OS nesta empresa." }, 403);
    }

    if (action === "reserve") {
      if (!currentSettings.enabled) {
        return json({ success: false, error: "A integração com a fila está desativada.", code: "integration_disabled" }, 409);
      }

      const code = String(body?.code ?? "").trim();
      if (!/^\d{4}$/.test(code)) {
        return json({ success: false, error: "Informe os 4 dígitos do código da fila." }, 400);
      }

      const bridgeUrl = String(Deno.env.get("QUEUE_BRIDGE_URL") || "").trim();
      const sharedSecret = String(Deno.env.get("QUEUE_BRIDGE_SHARED_SECRET") || "").trim();
      if (!/^https:\/\//i.test(bridgeUrl) || !sharedSecret) {
        return json({
          success: false,
          error: "A ponte com o sistema de filas ainda não foi configurada.",
          code: "queue_unavailable",
          outage_policy: currentSettings.outage_policy,
        }, 503);
      }

      let remote: Awaited<ReturnType<typeof parseResponse>>;
      try {
        remote = await parseResponse(await fetch(bridgeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-union-integration-secret": sharedSecret,
          },
          body: JSON.stringify({
            action: "reserve",
            code,
            ttl_seconds: Number(currentSettings.reservation_ttl_seconds || 600),
          }),
        }));
      } catch {
        return json({
          success: false,
          error: "O sistema de filas está indisponível no momento.",
          code: "queue_unavailable",
          outage_policy: currentSettings.outage_policy,
        }, 503);
      }

      if (!remote.response.ok || !remote.payload?.ok) {
        const invalid = remote.payload?.code === "invalid_code";
        return json({
          success: false,
          error: String(remote.payload?.error || (invalid ? "Código inválido, expirado ou já utilizado." : "Não foi possível consultar a fila.")),
          code: invalid ? "invalid_code" : remote.payload?.code || "queue_unavailable",
          outage_policy: currentSettings.outage_policy,
        }, invalid ? 404 : remote.response.status || 503);
      }

      const ticketId = uuid(remote.payload.ticket_id);
      const reservationToken = uuid(remote.payload.reservation_token);
      const expiresAt = String(remote.payload.expires_at || "");
      if (!ticketId || !reservationToken || !expiresAt) {
        return json({ success: false, error: "A fila retornou uma reserva inválida." }, 502);
      }

      await admin
        .from("queue_os_reservations")
        .update({ state: "expired", updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("external_ticket_id", ticketId)
        .eq("state", "reserved")
        .lte("expires_at", new Date().toISOString());

      const { data: reservation, error: reservationError } = await admin
        .from("queue_os_reservations")
        .insert({
          organization_id: organizationId,
          external_ticket_id: ticketId,
          ticket_number: String(remote.payload.ticket_number || ""),
          service_type_name: remote.payload.service_type_name ? String(remote.payload.service_type_name) : null,
          service_priority: remote.payload.service_priority ? String(remote.payload.service_priority) : null,
          external_reservation_token: reservationToken,
          reserved_by: authData.user.id,
          expires_at: expiresAt,
          state: "reserved",
        })
        .select("id,ticket_number,service_type_name,service_priority,expires_at")
        .single();

      if (reservationError || !reservation) {
        try {
          await fetch(bridgeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-union-integration-secret": sharedSecret },
            body: JSON.stringify({ action: "release", reservation_token: reservationToken }),
          });
        } catch {}
        return json({ success: false, error: "Esta senha já possui uma reserva ativa ou não pôde ser vinculada." }, 409);
      }

      return json({ success: true, reservation });
    }

    const reservationId = uuid(body?.reservation_id);
    if (!reservationId) return json({ success: false, error: "Reserva inválida." }, 400);

    const { data: reservation, error: reservationError } = await admin
      .from("queue_os_reservations")
      .select("id,organization_id,external_reservation_token,reserved_by,state,expires_at")
      .eq("id", reservationId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (reservationError || !reservation || reservation.reserved_by !== authData.user.id) {
      return json({ success: false, error: "Reserva não encontrada." }, 404);
    }

    const bridgeUrl = String(Deno.env.get("QUEUE_BRIDGE_URL") || "").trim();
    const sharedSecret = String(Deno.env.get("QUEUE_BRIDGE_SHARED_SECRET") || "").trim();

    if (action === "release") {
      if (reservation.state !== "reserved") return json({ success: true, released: false });
      if (/^https:\/\//i.test(bridgeUrl) && sharedSecret) {
        try {
          await fetch(bridgeUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-union-integration-secret": sharedSecret },
            body: JSON.stringify({ action: "release", reservation_token: reservation.external_reservation_token }),
          });
        } catch {}
      }
      await admin
        .from("queue_os_reservations")
        .update({ state: "released", updated_at: new Date().toISOString() })
        .eq("id", reservation.id)
        .eq("state", "reserved");
      return json({ success: true, released: true });
    }

    if (action === "consume-order") {
      const orderId = uuid(body?.order_id);
      if (!orderId) return json({ success: false, error: "OS inválida." }, 400);

      const { data: order, error: orderError } = await admin
        .from("service_orders")
        .select("id,organization_id,assigned_to,queue_reservation_id")
        .eq("id", orderId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (orderError || !order || order.queue_reservation_id !== reservation.id || order.assigned_to !== authData.user.id) {
        return json({ success: false, error: "A OS não corresponde à reserva informada." }, 409);
      }

      if (!/^https:\/\//i.test(bridgeUrl) || !sharedSecret) {
        await admin
          .from("queue_os_reservations")
          .update({ external_sync_status: "failed", last_error: "Ponte da fila não configurada.", updated_at: new Date().toISOString() })
          .eq("id", reservation.id);
        return json({ success: false, error: "A OS foi criada, mas a confirmação na fila ficou pendente.", code: "sync_pending" }, 503);
      }

      try {
        const remote = await parseResponse(await fetch(bridgeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-union-integration-secret": sharedSecret },
          body: JSON.stringify({
            action: "consume",
            reservation_token: reservation.external_reservation_token,
            crm_order_id: order.id,
          }),
        }));
        if (!remote.response.ok || !remote.payload?.ok) throw new Error(String(remote.payload?.error || "Falha ao consumir reserva."));

        await admin
          .from("queue_os_reservations")
          .update({
            external_sync_status: "synced",
            external_synced_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", reservation.id);
        return json({ success: true, synced: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao confirmar a reserva na fila.";
        await admin
          .from("queue_os_reservations")
          .update({ external_sync_status: "failed", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() })
          .eq("id", reservation.id);
        return json({ success: false, error: "A OS foi criada, mas a confirmação na fila ficou pendente.", code: "sync_pending" }, 502);
      }
    }

    return json({ success: false, error: "Ação inválida." }, 400);
  } catch (error) {
    console.error("[QUEUE INTEGRATION]", error);
    return json({ success: false, error: "Não foi possível processar a integração da fila." }, 500);
  }
});
