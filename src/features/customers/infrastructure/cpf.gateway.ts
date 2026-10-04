import { supabase } from "@/lib/supabase";
import { normalizeCpfLookupPayload } from "../domain/cpf-lookup.mjs";

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

export async function lookupCpf(
  cpf: string,
  organizationId: string,
  excludeRegistrationId?: string | null,
  options: CpfLookupOptions = {},
): Promise<CpfLookupResult> {
  const digits = cpf.replace(/\D/g, "");
  if (!organizationId) throw new Error("Empresa ativa não informada para a consulta de CPF.");

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

  await invokeCpfLookup({
    cpf: digits,
    organization_id: organizationId,
    exclude_registration_id: excludeRegistrationId || null,
    check_only: true,
  }, "Não foi possível verificar se o CPF já está cadastrado.");
}
