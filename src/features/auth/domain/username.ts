export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const INTERNAL_AUTH_DOMAIN = "auth.artvideo.app";

export function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidUsername(value: unknown) {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}

export function authEmailForUsername(value: unknown) {
  const username = normalizeUsername(value);
  return username ? `${username}@${INTERNAL_AUTH_DOMAIN}` : "";
}

export function usernameFromAuthEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return "";
  return normalizeUsername(email.slice(0, atIndex));
}

export async function usernameHash(value: unknown) {
  const normalized = normalizeUsername(value);
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
