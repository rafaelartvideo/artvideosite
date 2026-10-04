import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function isValidCpfDigits(cpf: string) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const calculateDigit = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

function normalizeBirthDate(value: unknown) {
  const birthDate = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? birthDate : "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) return json({ success: false, error: "Usuário não autenticado." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiKey = Deno.env.get("APICPF_API_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return json({ success: false, error: "Supabase não configurado para a consulta de CPF." });
    }
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) {
      return json({ success: false, error: "Usuário não autenticado." }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const organizationId = String(body?.organization_id || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
      return json({ success: false, error: "Empresa inválida." }, 400);
    }

    const { data: permissions, error: permissionError } = await client.rpc("my_organization_permissions", {
      p_organization_id: organizationId,
    });
    if (permissionError) {
      return json({ success: false, error: "Não foi possível validar sua permissão para consultar CPF." }, 403);
    }
    const permissionKeys = new Set((permissions || []).map((item: any) =>
      String(typeof item === "string" ? item : item?.permission_key || "")
    ));
    const canLookup = [
      "customers.create",
      "customers.edit",
      "registrations.records.create",
      "employees.create",
      "employees.edit",
      "organizations.create",
      "organizations.edit",
      "organizations.members.manage",
    ].some(key => permissionKeys.has(key));
    if (!canLookup) {
      return json({ success: false, error: "Você não possui permissão para consultar CPF nesta empresa." }, 403);
    }

    const cpf = String(body?.cpf || "").replace(/\D/g, "");
    if (!isValidCpfDigits(cpf)) {
      return json({ success: false, error: "CPF inválido. Verifique os números informados." });
    }

    const excludeRegistrationId = String(body?.exclude_registration_id || "").trim();
    if (excludeRegistrationId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(excludeRegistrationId)) {
      return json({ success: false, error: "Cadastro de exclusão inválido." }, 400);
    }

    const checkExisting = body?.check_existing !== false;
    const checkOnly = body?.check_only === true;

    if (checkExisting || checkOnly) {
      let localQuery = adminClient
        .from("entities")
        .select("id,name,birth_date")
        .eq("organization_id", organizationId)
        .eq("document", cpf)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (excludeRegistrationId) localQuery = localQuery.neq("id", excludeRegistrationId);
      const { data: localRows, error: localError } = await localQuery;
      if (localError) {
        console.error("[CPF LOOKUP] local registration lookup failed", localError);
        return json({ success: false, error: "Não foi possível verificar os cadastros internos antes da consulta de CPF." });
      }
      const local = Array.isArray(localRows) ? localRows[0] : null;
      if (local) {
        const localName = String(local.name || "").trim();
        return json({
          success: false,
          code: "cpf_already_exists",
          registration_id: local.id,
          error: localName
            ? `CPF já cadastrado nesta empresa para ${localName}. Abra o cadastro existente.`
            : "CPF já cadastrado nesta empresa. Abra o cadastro existente.",
        });
      }
    }

    if (checkOnly) {
      return json({ success: true, available: true });
    }

    if (!apiKey) {
      return json({ success: false, error: "Consulta de CPF ainda não configurada no servidor." });
    }

    const response = await fetch(`https://apicpf.com/api/consulta?cpf=${encodeURIComponent(cpf)}`, {
      method: "GET",
      headers: {
        "X-API-KEY": apiKey,
        Accept: "application/json",
      },
    });

    const payload = await response.json().catch(() => null) as any;
    if (!response.ok) {
      const providerMessage = String(payload?.message || "").trim();
      if (response.status === 404) {
        return json({ success: false, error: "CPF não encontrado na base de consulta." });
      }
      if (response.status === 429) {
        return json({ success: false, error: providerMessage || "Limite temporário de consultas de CPF atingido." });
      }
      if (response.status === 401 || response.status === 403) {
        console.error("[CPF LOOKUP] provider authorization error", response.status, providerMessage);
        return json({ success: false, error: "Serviço de consulta de CPF indisponível. Verifique a configuração da integração." });
      }
      console.error("[CPF LOOKUP] provider error", response.status, payload);
      return json({ success: false, error: providerMessage || "Não foi possível consultar o CPF agora." });
    }

    const name = String(payload?.data?.nome || "").trim();
    const birthDate = normalizeBirthDate(payload?.data?.data_nascimento);
    if (!name) {
      console.error("[CPF LOOKUP] provider response without name", payload);
      return json({ success: false, error: "A consulta foi concluída, mas não retornou o nome da pessoa." });
    }

    return json({ success: true, source: "external", name, birth_date: birthDate || null });
  } catch (error) {
    console.error("[CPF LOOKUP]", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Erro inesperado ao consultar o CPF.",
    });
  }
});
