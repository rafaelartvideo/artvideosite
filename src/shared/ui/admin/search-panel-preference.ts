// Keep the same compact breakpoint as the CRM's search CSS, including touch tablets.
export const COMPACT_SEARCH_MEDIA = "(max-width: 1023px), (pointer: coarse)";

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
const memory = new Map<string, boolean>();

export function searchPanelPreferenceKey(pathname: string, title: string, compact: boolean) {
  return "union:search-panel:v1:" + JSON.stringify([pathname, title, compact ? "compact" : "desktop"]);
}

function browserStorage(): PreferenceStorage | undefined {
  try { return typeof window !== "undefined" ? window.localStorage : undefined; }
  catch { return undefined; }
}

export function readSearchPanelExpanded(key: string, compact: boolean, storage = browserStorage()) {
  if (memory.has(key)) return memory.get(key)!;
  try {
    const value = storage?.getItem(key);
    if (value === "true" || value === "false") return value === "true";
  } catch { /* Browser storage can be unavailable. */ }
  return !compact;
}

export function writeSearchPanelExpanded(key: string, expanded: boolean, storage = browserStorage()) {
  memory.set(key, expanded);
  try { storage?.setItem(key, String(expanded)); }
  catch { /* Preserve the preference in memory for the current CRM session. */ }
}
