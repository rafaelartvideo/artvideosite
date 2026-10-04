import { supabase } from "@/lib/supabase";
import { cpfAlreadyRegisteredMessage, normalizeCpfLookupPayload } from "../domain/cpf-lookup.mjs";

export type CpfLookupResult = {
  name: string;
  birthDate: string | null;
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
  if (error) throw new Error("Não foi possível acessar o serviço de consulta de CPF.");
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
