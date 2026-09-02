import { useQuery } from "@tanstack/react-query";
import type { PrintTemplate } from "@/features/documents/domain/print-template";
import { listPrintTemplates } from "@/features/documents/infrastructure/documents.repository";

const ACTIVE_ORDER_PRINT_TEMPLATES_KEY = ["documents", "print-templates", "active"] as const;

export function useOrderPrintTemplates(enabled: boolean) {
  const query = useQuery({
    queryKey: ACTIVE_ORDER_PRINT_TEMPLATES_KEY,
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await listPrintTemplates();
      if (error) throw error;
      return (data || []).filter((template: PrintTemplate) => template.is_active);
    },
  });

  return {
    templates: query.data || [],
    loading: query.isLoading,
    error: query.error,
  };
}
