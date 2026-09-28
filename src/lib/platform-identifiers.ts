export const ACTIVE_ORGANIZATION_STORAGE_PREFIX = "unionworld:active-organization";
export const LEGACY_ACTIVE_ORGANIZATION_STORAGE_PREFIX = "artvideo:active-organization";

export const ORGANIZATION_CHANGED_EVENT = "unionworld:organization-changed";
export const LEGACY_ORGANIZATION_CHANGED_EVENT = "artvideo:organization-changed";

export const PERMISSIONS_CHANGED_EVENT = "unionworld:permissions-changed";
export const LEGACY_PERMISSIONS_CHANGED_EVENT = "artvideo:permissions-changed";

export function dispatchCompatibleEvent(
  currentName: string,
  legacyName: string,
  detail?: unknown,
) {
  if (typeof window === "undefined") return;
  const create = () => detail === undefined
    ? new Event(currentName)
    : new CustomEvent(currentName, { detail });
  const createLegacy = () => detail === undefined
    ? new Event(legacyName)
    : new CustomEvent(legacyName, { detail });
  window.dispatchEvent(create());
  if (legacyName !== currentName) window.dispatchEvent(createLegacy());
}

export function addCompatibleEventListener(
  currentName: string,
  legacyName: string,
  listener: EventListener,
) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(currentName, listener);
  if (legacyName !== currentName) window.addEventListener(legacyName, listener);
  return () => {
    window.removeEventListener(currentName, listener);
    if (legacyName !== currentName) window.removeEventListener(legacyName, listener);
  };
}
