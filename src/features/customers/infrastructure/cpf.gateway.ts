import { supabase } from "@/lib/supabase";

export type CpfLookupResult = {
  name: string;
};

export async function lookupCpf(cpf: string): Promise<CpfLookupResult> {
  const digits = cpf.replace(/\D/g, "");
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
  return { name };
}
