import { useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createAppQueryClient } from "@/infrastructure/query/query-client";
import {
  ORGANIZATION_CHANGED_EVENT,
  LEGACY_ORGANIZATION_CHANGED_EVENT,
  addCompatibleEventListener,
} from "@/lib/platform-identifiers";

type OrganizationChangeDetail = {
  previousOrganizationId?: string | null;
  organizationId?: string | null;
};

// Cada empresa recebe um QueryClient independente. Limpar o único cache
// global a cada troca provocava o recarregamento de OS, Agenda e referências
// ao voltar à empresa anterior, além de descartar dados ainda válidos.
export function AppQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient, setQueryClient] = useState(createAppQueryClient);
  const currentClientRef = useRef(queryClient);
  const currentOrganizationRef = useRef<string | null>(null);
  const clientsByOrganizationRef = useRef(new Map<string, QueryClient>());
  const lastChangeDetailRef = useRef<unknown>(null);

  useEffect(() => {
    const onOrganizationChange: EventListener = event => {
      const detail = (event as CustomEvent<OrganizationChangeDetail>).detail;
      // dispatchCompatibleEvent emite o evento novo e o legado com o MESMO
      // objeto detail. Processar ambos recriava o cache e duplicava consultas.
      if (detail && lastChangeDetailRef.current === detail) return;
      lastChangeDetailRef.current = detail || null;

      const nextOrganizationId = typeof detail?.organizationId === "string"
        ? detail.organizationId
        : null;
      const previousOrganizationId = typeof detail?.previousOrganizationId === "string"
        ? detail.previousOrganizationId
        : currentOrganizationRef.current;

      if (!nextOrganizationId) {
        // Logout / troca de usuário: não manter nenhum dado da conta anterior.
        const clients = new Set([...clientsByOrganizationRef.current.values(), currentClientRef.current]);
        clientsByOrganizationRef.current.clear();
        currentOrganizationRef.current = null;
        for (const client of clients) {
          void client.cancelQueries();
          client.clear();
        }
        const freshClient = createAppQueryClient();
        currentClientRef.current = freshClient;
        setQueryClient(freshClient);
        return;
      }

      // Na primeira entrada não há evento; associa-se o cliente inicial à
      // empresa de origem somente quando ocorre a primeira troca real.
      if (currentOrganizationRef.current === null && previousOrganizationId) {
        clientsByOrganizationRef.current.set(previousOrganizationId, currentClientRef.current);
      }
      if (nextOrganizationId === currentOrganizationRef.current) return;

      const previousClient = currentClientRef.current;
      const nextClient = clientsByOrganizationRef.current.get(nextOrganizationId)
        || createAppQueryClient();
      clientsByOrganizationRef.current.set(nextOrganizationId, nextClient);
      currentOrganizationRef.current = nextOrganizationId;
      currentClientRef.current = nextClient;

      // A empresa anterior deixa de ter observadores quando o contexto muda.
      // Interromper consultas pendentes evita carregar duas empresas em paralelo.
      if (previousClient !== nextClient) void previousClient.cancelQueries();
      setQueryClient(nextClient);
    };

    return addCompatibleEventListener(
      ORGANIZATION_CHANGED_EVENT,
      LEGACY_ORGANIZATION_CHANGED_EVENT,
      onOrganizationChange,
    );
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
