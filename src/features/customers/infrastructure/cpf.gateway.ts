import { supabase } from "@/lib/supabase";
import { normalizeCpfLookupPayload } from "../domain/cpf-lookup.mjs";

export type CpfLookupResult = {
  name: string;
  birthDate: string | null;
  source: "local" | "external";
  registrationId: string | null;
};

export async function lookupCpf(
  cpf: string,
  organizationId: string,
  excludeRegistrationId?: string | null,
): Promise<CpfLookupResult> {
  const digits = cpf.replace(/\D/g, "");
  if (!organizationId) throw new Error("Empresa ativa não informada para a consulta de CPF.");

  const { data, error } = await supabase.functions.invoke("lookup-cpf", {
    body: {
      cpf: digits,
      organization_id: organizationId,
      exclude_registration_id: excludeRegistrationId || null,
    },
  });

  if (error) {
    throw new Error("Não foi possível acessar o serviço de consulta de CPF.");
  }

  return normalizeCpfLookupPayload(data) as CpfLookupResult;
}
