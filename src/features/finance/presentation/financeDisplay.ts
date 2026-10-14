/** Format only recognized Brazilian documents. Never truncate an unrecognized identifier. */
export function formatFinancialDocument(value?: string | null): string {
  if (!value) return "—";
  const clean = value.trim();
  const digits = clean.replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return clean;
}
