/**
 * Identifica apenas códigos GTIN/UPC/EAN completos.
 * Nunca remove letras de um MPN: AKB75675304 não é um código de barras.
 */
export function isValidGtin(raw) {
  const code = String(raw ?? "").trim();
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;

  let sum = 0;
  for (let index = code.length - 2, weight = 3; index >= 0; index -= 1) {
    sum += Number(code[index]) * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]);
}

/** O catálogo pode rejeitar identificadores sem dígito verificador válido. */
export function isInvalidUpcResponse(status, payload) {
  if (status !== 400) return false;
  const code = String(payload?.code || "").toUpperCase();
  const message = String(payload?.message || "").toLowerCase();
  return code === "INVALID_UPC"
    || message.includes("not a valid upc")
    || message.includes("invalid upc");
}
