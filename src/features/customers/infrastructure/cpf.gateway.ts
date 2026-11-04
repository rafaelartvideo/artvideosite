import { supabase } from "@/lib/supabase";
import { cpfAlreadyRegisteredMessage, normalizeCpfLookupPayload } from "../domain/cpf-lookup.mjs";

export type CpfLookupResult = {
  name: string;
  birthDate: string | null;
  gender: "M" | "F" | "I" | null;
  source: "local" | "external";
  registrationId: string | null;
};

type CpfLookupOptions = {
  checkExisting?: boolean;
};

function cpfLookupError(data: any, fallback: string) {
  const error = new Error(String(data?.error || fallback)) as Error & { code?: string };
  if (data?.code) error.code = String(data.code);
  return error;
}

async function invokeCpfLookup(body: Record<string, unknown>, fallback: string) {
  const { data, error } = await supabase.functions.invoke("lookup-cpf", { body });
  if (error) {
    // A Edge Function pode responder 401/403/429 com JSON útil. Não ocultar
    // erros de autorização ou de limite sob uma mensagem genérica de conexão.
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const payload = await context.clone().json().catch(() => null);
      if (payload && typeof payload.error === "string" && payload.error.length <= 300) {
        throw cpfLookupError(payload, fallback);
      }
      if (context.status === 401) throw new Error("Sua sessão expirou. Entre novamente para consultar o CPF.");
      if (context.status === 403) throw new Error("Seu perfil não tem permissão para consultar CPF nesta empresa.");
      if (context.status === 429) throw new Error("Limite temporário de consultas de CPF atingido. Tente novamente mais tarde.");
    }
    throw new Error("Não foi possível acessar o serviço de consulta de CPF. Verifique a conexão e tente novamente.");
  }
  if (!data?.success) throw cpfLookupError(data, fallback);
  return data;
}

async function assertAccessibleCpfIsAvailable(
  cpf: string,
  organizationId: string,
  excludeRegistrationId?: string | null,
) {
  let query = supabase
    .from("entities")
    .select("id,name")
    .eq("organization_id", organizationId)
    .eq("document", cpf)
    .limit(1);

  if (excludeRegistrationId) query = query.neq("id", excludeRegistrationId);
  const { data, error } = await query.maybeSingle();

  // O servidor continua sendo a autoridade para escopos administrativos entre empresas.
  // Quando o RLS permite leitura local, este atalho evita consulta externa e avisa na hora.
  if (error) {
    console.warn("[CPF LOOKUP] local duplicate preflight unavailable", error);
    return;
  }
  if (!data) return;

  const duplicate = new Error(cpfAlreadyRegisteredMessage(data.name)) as Error & { code?: string };
  duplicate.code = "cpf_already_exists";
  throw duplicate;
}

export async function lookupCpf(
  cpf: string,
  organizationId: string,
  excludeRegistrationId?: string | null,
  options: CpfLookupOptions = {},
): Promise<CpfLookupResult> {
  const digits = cpf.replace(/\D/g, "");
  if (!organizationId) throw new Error("Empresa ativa não informada para a consulta de CPF.");

  if (options.checkExisting !== false) {
    await assertAccessibleCpfIsAvailable(digits, organizationId, excludeRegistrationId);
  }

  const data = await invokeCpfLookup({
    cpf: digits,
    organization_id: organizationId,
    exclude_registration_id: excludeRegistrationId || null,
    check_existing: options.checkExisting !== false,
  }, "Não foi possível consultar o CPF.");

  return normalizeCpfLookupPayload(data) as CpfLookupResult;
}

export async function ensureCpfAvailable(
  cpf: string,
  organizationId: string,
  excludeRegistrationId?: string | null,
) {
  const digits = cpf.replace(/\D/g, "");
  if (!organizationId) throw new Error("Empresa ativa não informada para validar o CPF.");

  await assertAccessibleCpfIsAvailable(digits, organizationId, excludeRegistrationId);

  const data = await invokeCpfLookup({
    cpf: digits,
    organization_id: organizationId,
    exclude_registration_id: excludeRegistrationId || null,
    check_only: true,
  }, "Não foi possível verificar se o CPF já está cadastrado.");

  // Compatibilidade defensiva com versões anteriores da Edge Function:
  // se a base interna responder como source=local, continua sendo duplicidade.
  if (data?.source === "local") normalizeCpfLookupPayload(data);
}
