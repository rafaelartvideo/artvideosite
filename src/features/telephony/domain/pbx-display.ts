/** Brazilian telephone formatting is presentation-only. Never change the dial target. */
export function formatPbxNumber(value: string): string {
  const raw = (value || "").trim();
  const digits = raw.replace(/\D/g, "");
  const national = digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits.slice(2) : digits;
  if (national.length === 11) return `(${national.slice(0,2)}) ${national.slice(2,7)}-${national.slice(7)}`;
  if (national.length === 10) return `(${national.slice(0,2)}) ${national.slice(2,6)}-${national.slice(6)}`;
  return raw;
}
