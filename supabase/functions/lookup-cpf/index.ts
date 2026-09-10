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
    const apiKey = Deno.env.get("APICPF_API_KEY");

    if (!supabaseUrl || !anonKey) {
      return json({ success: false, error: "Supabase não configurado para a consulta de CPF." });
    }
    if (!apiKey) {
      return json({ success: false, error: "Consulta de CPF ainda não configurada no servidor." });
    }

    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) {
      return json({ success: false, error: "Usuário não autenticado." }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const cpf = String(body?.cpf || "").replace(/\D/g, "");
    if (!isValidCpfDigits(cpf)) {
      return json({ success: false, error: "CPF inválido. Verifique os números informados." });
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

    return json({ success: true, name, birth_date: birthDate || null });
  } catch (error) {
    console.error("[CPF LOOKUP]", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Erro inesperado ao consultar o CPF.",
    });
  }
});
