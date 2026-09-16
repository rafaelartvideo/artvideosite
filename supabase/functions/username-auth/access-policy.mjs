export function normalizeClientIp(value) {
  const ip = String(value ?? "").trim();
  return ip.toLowerCase().startsWith("::ffff:") ? ip.slice(7) : ip;
}

export function extractClientIp(headers) {
  const cloudflareIp = normalizeClientIp(headers.get("cf-connecting-ip"));
  if (cloudflareIp) return cloudflareIp;

  const forwardedIp = normalizeClientIp(headers.get("x-forwarded-for")?.split(",")[0]);
  if (forwardedIp) return forwardedIp;

  return normalizeClientIp(headers.get("x-real-ip")) || null;
}

export function isIpAllowed(restrictByIp, allowedIps, clientIp) {
  if (!restrictByIp) return true;
  const normalizedClientIp = normalizeClientIp(clientIp);
  if (!normalizedClientIp) return false;
  return allowedIps.some(ip => normalizeClientIp(ip) === normalizedClientIp);
}
