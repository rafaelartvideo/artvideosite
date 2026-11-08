/**
 * Preferências de paginação compartilhadas: lê antes da primeira consulta,
 * evitando carregar 5 itens e depois fazer outra consulta para 50/100.
 */
export const DEFAULT_ADMIN_PAGE_SIZE = 5;
export const DEFAULT_ADMIN_PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 50, 100];
export const ADMIN_PAGE_SIZE_STORAGE_KEY = "union-admin-page-size-v1";

export function readPersistedPageSize(options: readonly number[], storageKey: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isInteger(value) && options.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function initialPageSize(options: readonly number[], storageKey: string, fallback: number): number {
  return readPersistedPageSize(options, storageKey) ?? fallback;
}

export function persistPageSize(value: number, storageKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, String(value));
  } catch {
    // Bloqueios de armazenamento não podem impedir a paginação.
  }
}
