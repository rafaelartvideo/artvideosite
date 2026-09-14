import { supabase } from "@/lib/supabase";

export type CpfLookupResult = {
  name: string;
  birthDate: string | null;
};

async function ensureCpfIsNotRegistered(cpf: string, organizationId: string, excludeRegistrationId?: string | null) {
  let query = supabase
    .from("entities")
    .select("id,name")
    .eq("organization_id", organizationId)
    .eq("document", cpf);

  if (excludeRegistrationId) query = query.neq("id", excludeRegistrationId);
  const { data, error } = await query.maybeSingle();

  if (error) {
    console.error("[CPF LOOKUP] local registration check failed", error);
    throw new Error("Não foi possível verificar se este CPF já está cadastrado. A consulta externa não foi realizada.");
  }

  if (data) {
    const registrationName = String(data.name || "").trim();
    throw new Error(registrationName
      ? `Cadastro já existente: ${registrationName}. Use o cadastro existente.`
      : "CPF já cadastrado. Use o cadastro existente.");
  }
}

export async function lookupCpf(
  cpf: string,
  organizationId: string,
  excludeRegistrationId?: string | null,
): Promise<CpfLookupResult> {
  const digits = cpf.replace(/\D/g, "");
  if (!organizationId) throw new Error("Empresa ativa não informada para a consulta de CPF.");

  // Sempre consulta a base interna primeiro para evitar consumo desnecessário da API externa.
  await ensureCpfIsNotRegistered(digits, organizationId, excludeRegistrationId);

  const { data, error } = await supabase.functions.invoke("lookup-cpf", {
    body: { cpf: digits },
  });

  if (error) {
    throw new Error("Não foi possível acessar o serviço de consulta de CPF.");
  }
  if (!data?.success) {
    throw new Error(data?.error || "Não foi possível consultar o CPF.");
  }

  const name = String(data.name || "").trim();
  if (!name) throw new Error("A consulta não retornou o nome da pessoa.");

  const rawBirthDate = String(data.birth_date || "").trim();
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(rawBirthDate) ? rawBirthDate : null;
  return { name, birthDate };
}
