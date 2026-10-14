/** Format only recognized Brazilian documents. Never truncate an unrecognized identifier. */
export function formatFinancialDocument(value?: string | null): string {
  if (!value) return "—";
  const clean = value.trim();
  const digits = clean.replace(/\D/g, "");
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return clean;
}

/** Input mask that also supports incomplete CPF/CNPJ values while typing. */
export function maskFinancialDocumentInput(value: string): string {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 14);
  if (digits.length > 11) {
    return digits.replace(/^(\d{0,2})(\d{0,3})(\d{0,3})(\d{0,4})(\d{0,2}).*$/, (_match, a, b, c, d, e) =>
      a + (b ? "." + b : "") + (c ? "." + c : "") + (d ? "/" + d : "") + (e ? "-" + e : ""));
  }
  return digits.replace(/^(\d{0,3})(\d{0,3})(\d{0,3})(\d{0,2}).*$/, (_match, a, b, c, d) =>
    a + (b ? "." + b : "") + (c ? "." + c : "") + (d ? "-" + d : ""));
}
