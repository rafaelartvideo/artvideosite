export function normalizeCpfLookupPayload(payload) {
  if (!payload || payload.success !== true) {
    throw new Error(String(payload?.error || "Não foi possível consultar o CPF."));
  }

  const name = String(payload.name || "").trim();
  if (!name) throw new Error("A consulta não retornou o nome da pessoa.");

  const rawBirthDate = String(payload.birth_date || "").trim();
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(rawBirthDate) ? rawBirthDate : null;
  const source = payload.source === "local" ? "local" : "external";
  const registrationId = source === "local" && payload.registration_id
    ? String(payload.registration_id)
    : null;

  return { name, birthDate, source, registrationId };
}
