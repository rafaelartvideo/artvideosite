import { useEffect, useState } from "react";

const STORAGE_PREFIX = "union-workspace-loaded-v1";

function wasOpened(key: string) {
  if (!key || typeof window === "undefined") return false;
  try { return window.sessionStorage.getItem(key) === "1"; }
  catch { return false; }
}

/**
 * Full-page skeleton only on the first load of this module, user and company
 * in the current browser session. Subsequent tabs/routes keep the real shell
 * and only their content area may show a skeleton.
 *
 * ready must mean the initial queries for the currently displayed section
 * have finished (success or error), not that a background refetch is idle.
 */
export function useWorkspaceFirstVisit(
  moduleId: string,
  scope: string,
  ready: boolean,
) {
  const key = scope ? `${STORAGE_PREFIX}:${moduleId}:${scope}` : "";
  const [completed, setCompleted] = useState<Record<string, true>>({});
  const alreadyLoaded = Boolean(key && (completed[key] || wasOpened(key)));

  useEffect(() => {
    if (!key || !ready || alreadyLoaded) return;
    setCompleted(previous => previous[key] ? previous : { ...previous, [key]: true });
    try { window.sessionStorage.setItem(key, "1"); }
    catch { /* Memory state still preserves tab switching if storage is disabled. */ }
  }, [key, ready, alreadyLoaded]);

  return !key || (!alreadyLoaded && !ready);
}
