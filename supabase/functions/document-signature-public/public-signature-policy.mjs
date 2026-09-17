const MAX_SIGNATURE_BYTES = 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToHex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value || "").replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function hmacHex(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(String(value)))));
}

export function normalizeOtp(value) {
  return String(value ?? "").trim();
}

export function isOtpFormat(value) {
  return /^\d{6}$/.test(normalizeOtp(value));
}

export function constantTimeEqualHex(left, right) {
  const a = String(left || "").toLowerCase();
  const b = String(right || "").toLowerCase();
  if (a.length !== b.length || !/^[0-9a-f]+$/.test(a) || !/^[0-9a-f]+$/.test(b)) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export function publicRequestState(row, now = Date.now()) {
  const status = String(row?.status || "");
  if (["signed", "cancelled", "expired"].includes(status)) return status;
  const expiresAt = Date.parse(String(row?.expires_at || ""));
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return "expired";
  return status === "viewed" ? "viewed" : "pending";
}

export function otpSendPolicy({ now = Date.now(), lastSentAt = null, sendsLastHour = 0 }) {
  if (Number(sendsLastHour) >= 5) return { allowed: false, retryAfterSeconds: 3600, reason: "hourly_limit" };
  if (lastSentAt) {
    const sentAt = Date.parse(String(lastSentAt));
    if (Number.isFinite(sentAt)) {
      const elapsedSeconds = Math.floor((now - sentAt) / 1000);
      if (elapsedSeconds < 60) {
        return { allowed: false, retryAfterSeconds: Math.max(1, 60 - elapsedSeconds), reason: "cooldown" };
      }
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function buildIdentityProof(secret, binding, now = Date.now(), ttlMs = 15 * 60 * 1000) {
  const payload = {
    v: 2,
    method: "cpf_cnpj",
    request_id: String(binding.requestId || ""),
    token_hash: String(binding.tokenHash || ""),
    iat: Math.trunc(now),
    exp: Math.trunc(now + ttlMs),
  };
  const payloadPart = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacHex(secret, `document-signature-identity-proof:${payloadPart}`);
  return `${payloadPart}.${signature}`;
}

export async function verifyIdentityProof(secret, proof, expected, now = Date.now()) {
  const [payloadPart, signature, ...extra] = String(proof || "").split(".");
  if (!payloadPart || !signature || extra.length) throw new Error("Prova de identidade inválida.");
  const expectedSignature = await hmacHex(secret, `document-signature-identity-proof:${payloadPart}`);
  if (!constantTimeEqualHex(signature, expectedSignature)) throw new Error("Prova de identidade inválida.");

  let payload;
  try {
    payload = JSON.parse(decoder.decode(base64UrlToBytes(payloadPart)));
  } catch {
    throw new Error("Prova de identidade inválida.");
  }
  if (payload?.v !== 2 || payload?.method !== "cpf_cnpj" || !payload.request_id || !payload.token_hash) {
    throw new Error("Prova de identidade inválida.");
  }
  if (String(payload.request_id) !== String(expected.requestId) || String(payload.token_hash) !== String(expected.tokenHash)) {
    throw new Error("Prova de identidade inválida para este documento.");
  }
  if (!Number.isFinite(payload.exp) || payload.exp < now) {
    throw new Error("A validação de identidade expirou. Confirme o CPF/CNPJ novamente.");
  }
  return {
    requestId: String(payload.request_id),
    tokenHash: String(payload.token_hash),
    issuedAt: Number(payload.iat || 0),
    expiresAt: Number(payload.exp),
    method: "cpf_cnpj",
  };
}

export async function buildOtpProof(secret, binding, now = Date.now(), ttlMs = 15 * 60 * 1000) {
  const payload = {
    v: 1,
    method: "email_otp",
    request_id: String(binding.requestId || ""),
    token_hash: String(binding.tokenHash || ""),
    challenge_id: String(binding.challengeId || ""),
    iat: Math.trunc(now),
    exp: Math.trunc(now + ttlMs),
  };
  const payloadPart = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await hmacHex(secret, `document-signature-proof:${payloadPart}`);
  return `${payloadPart}.${signature}`;
}

export async function verifyOtpProof(secret, proof, expected, now = Date.now()) {
  const [payloadPart, signature, ...extra] = String(proof || "").split(".");
  if (!payloadPart || !signature || extra.length) throw new Error("Prova de validação inválida.");
  const expectedSignature = await hmacHex(secret, `document-signature-proof:${payloadPart}`);
  if (!constantTimeEqualHex(signature, expectedSignature)) throw new Error("Prova de validação inválida.");

  let payload;
  try {
    payload = JSON.parse(decoder.decode(base64UrlToBytes(payloadPart)));
  } catch {
    throw new Error("Prova de validação inválida.");
  }
  if (payload?.v !== 1 || !payload.request_id || !payload.token_hash || !payload.challenge_id) {
    throw new Error("Prova de validação inválida.");
  }
  if (String(payload.request_id) !== String(expected.requestId) || String(payload.token_hash) !== String(expected.tokenHash)) {
    throw new Error("Prova de validação inválida para este documento.");
  }
  if (!Number.isFinite(payload.exp) || payload.exp < now) throw new Error("A prova de validação expirou. Valide o código novamente.");
  return {
    requestId: String(payload.request_id),
    tokenHash: String(payload.token_hash),
    challengeId: String(payload.challenge_id),
    issuedAt: Number(payload.iat || 0),
    expiresAt: Number(payload.exp),
    method: "email_otp",
  };
}

export function decodePngDataUrl(value) {
  const raw = String(value || "");
  const match = raw.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("A assinatura precisa estar no formato PNG.");
  const binary = atob(match[1]);
  if (binary.length <= 0) throw new Error("Faça sua assinatura antes de confirmar.");
  if (binary.length > MAX_SIGNATURE_BYTES) throw new Error("A assinatura excede o limite de 1 MB.");
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < pngHeader.length || pngHeader.some((byte, index) => bytes[index] !== byte)) {
    throw new Error("A assinatura precisa ser uma imagem PNG válida.");
  }
  return bytes;
}
