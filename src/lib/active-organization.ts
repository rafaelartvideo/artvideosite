import { supabase } from "./supabase";
import {
  ACTIVE_ORGANIZATION_STORAGE_PREFIX,
  LEGACY_ACTIVE_ORGANIZATION_STORAGE_PREFIX,
} from "./platform-identifiers";

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

  const currentKey = `${ACTIVE_ORGANIZATION_STORAGE_PREFIX}:${userId}`;
  const legacyKey = `${LEGACY_ACTIVE_ORGANIZATION_STORAGE_PREFIX}:${userId}`;
  const organizationId = window.localStorage.getItem(currentKey)
    || window.localStorage.getItem(legacyKey);

  if (organizationId) window.localStorage.setItem(currentKey, organizationId);

  if (!organizationId) {
    throw new Error("Nenhuma empresa ativa foi selecionada.");
  }

  return organizationId;
}
