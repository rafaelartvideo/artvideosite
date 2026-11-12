/** Brazilian telephone formatting is presentation-only. Never change the dial target. */
export function formatPbxNumber(value: string): string {
  const raw = (value || "").trim();
  const digits = raw.replace(/\D/g, "");
  const withoutTrunk = /^0(?:55[1-9][0-9]{9,10}|[1-9][0-9]{9,10})$/.test(digits) ? digits.slice(1) : digits;
  const national = withoutTrunk.startsWith("55") && (withoutTrunk.length === 12 || withoutTrunk.length === 13)
    ? withoutTrunk.slice(2) : withoutTrunk;
  if (national.length === 11) return `(${national.slice(0,2)}) ${national.slice(2,7)}-${national.slice(7)}`;
  if (national.length === 10) return `(${national.slice(0,2)}) ${national.slice(2,6)}-${national.slice(6)}`;
  return raw;
}
