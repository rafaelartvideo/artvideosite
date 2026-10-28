import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { CustomerSignatureRequest } from "../infrastructure/customer-account.repository";

/** Consulta protegida, compartilhada entre Visão geral e Assinaturas sem requisições duplicadas. */
export function useCustomerSignatures(userId: string | undefined, enabled = true) {
  return useQuery<CustomerSignatureRequest[]>({
    queryKey: ["artvideo-customer-signatures", userId],
    enabled: Boolean(userId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("artvideo_customer_signatures_v1");
      if (error) throw error;
      return Array.isArray(data) ? data as CustomerSignatureRequest[] : [];
    },
    staleTime: 20000,
    refetchOnWindowFocus: true,
  });
}
