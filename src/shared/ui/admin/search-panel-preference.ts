// Match the compact search CSS, including touch tablets.
export const COMPACT_SEARCH_MEDIA = "(max-width: 1023px), (pointer: coarse)";
export const SEARCH_PANEL_PREFERENCE_KEY = "union:search-panel:v2:expanded";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
let memory: boolean | undefined;
const listeners = new Set<() => void>();

function browserStorage(): PreferenceStorage | undefined {
  try { return typeof window !== "undefined" ? window.localStorage : undefined; }
  catch { return undefined; }
}

export function readSearchPanelExpanded(compact: boolean, storage = browserStorage()) {
  if (memory !== undefined) return memory;
  try {
    const value = storage?.getItem(SEARCH_PANEL_PREFERENCE_KEY);
    if (value === "true" || value === "false") return value === "true";
  } catch { /* Browser storage can be unavailable. */ }
  return !compact;
}

export function writeSearchPanelExpanded(expanded: boolean, storage = browserStorage()) {
  memory = expanded;
  try { storage?.setItem(SEARCH_PANEL_PREFERENCE_KEY, String(expanded)); }
  catch { /* Keep the choice for the current session. */ }
  listeners.forEach(listener => listener());
}

// All mounted search panels use the same store, regardless of route or title.
export function subscribeSearchPanelExpanded(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SEARCH_PANEL_PREFERENCE_KEY && event.key !== null) return;
    memory = undefined;
    listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}
