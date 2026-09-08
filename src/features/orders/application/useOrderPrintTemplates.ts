import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { PrintTemplate } from "@/features/documents/domain/print-template";
import { listPrintTemplates } from "@/features/documents/infrastructure/documents.repository";

export function useOrderPrintTemplates(enabled: boolean) {
  const { activeOrganizationId } = useAuth();
  const query = useQuery({
    queryKey: ["documents", activeOrganizationId || "none", "print-templates", "active"],
    enabled: enabled && Boolean(activeOrganizationId),
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
