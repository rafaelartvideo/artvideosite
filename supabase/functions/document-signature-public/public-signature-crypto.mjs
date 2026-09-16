const encoder = new TextEncoder();

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export function normalizeDocument(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function maskEmail(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return "***";
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

export function randomOtp() {
  const upperBound = Math.floor(0x1_0000_0000 / 1_000_000) * 1_000_000;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= upperBound);
  return String(value[0] % 1_000_000).padStart(6, "0");
}

export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value)));
  return bytesToHex(new Uint8Array(digest));
}

export async function hmacHex(secret, value) {
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(String(value)));
  return bytesToHex(new Uint8Array(signature));
}
