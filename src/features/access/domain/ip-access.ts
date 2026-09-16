export function parseAllowedIps(value: string) {
  return Array.from(new Set(
    value
      .split(/[\n,;]+/)
      .map(ip => ip.trim())
      .filter(Boolean),
  ));
}

export function isValidIpAddress(value: string) {
  const ip = value.trim();
  if (!ip) return false;

  if (ip.includes(":")) {
    try {
      const parsed = new URL(`http://[${ip}]/`);
      return parsed.hostname.length > 2;
    } catch {
      return false;
    }
  }

  const parts = ip.split(".");
  return parts.length === 4 && parts.every(part => {
    if (!/^\d{1,3}$/.test(part)) return false;
    if (part.length > 1 && part.startsWith("0")) return false;
    const octet = Number(part);
    return octet >= 0 && octet <= 255;
  });
}

export function invalidAllowedIps(value: string) {
  return parseAllowedIps(value).filter(ip => !isValidIpAddress(ip));
}
