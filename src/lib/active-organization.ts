import { supabase } from "./supabase";

const ACTIVE_ORGANIZATION_STORAGE_PREFIX = "artvideo:active-organization";

export async function getActiveOrganizationId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  const userId = data.user?.id;
  if (!userId) {
    throw new Error("Usuário não autenticado.");
  }

  if (typeof window === "undefined") {
    throw new Error("Empresa ativa indisponível fora do navegador.");
  }

  const organizationId = window.localStorage.getItem(
    `${ACTIVE_ORGANIZATION_STORAGE_PREFIX}:${userId}`,
  );

  if (!organizationId) {
    throw new Error("Nenhuma empresa ativa foi selecionada.");
  }

  return organizationId;
}
