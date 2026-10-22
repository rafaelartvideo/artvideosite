import { supabase } from "@/lib/supabase";

/** Reserva um protocolo curto, único e sequencial no banco (ORC-000002...). */
export async function reservePublicQuoteProtocol(): Promise<string> {
  const { data, error } = await supabase.rpc("artvideo_next_quote_protocol_v1");
  if (error || typeof data !== "string" || !/^ORC-[0-9]{6,}$/.test(data)) {
    throw new Error("Não foi possível gerar o protocolo. Tente novamente.");
  }
  return data;
}
