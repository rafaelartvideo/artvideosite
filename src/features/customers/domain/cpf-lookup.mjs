export function cpfAlreadyRegisteredMessage(name) {
  const normalizedName = String(name || "").trim();
  return normalizedName
    ? `CPF já cadastrado nesta empresa para ${normalizedName}. Abra o cadastro existente.`
    : "CPF já cadastrado nesta empresa. Abra o cadastro existente.";
}

export function normalizeCpfLookupPayload(payload) {
  if (!payload || payload.success !== true) {
    throw new Error(String(payload?.error || "Não foi possível consultar o CPF."));
  }

  const name = String(payload.name || "").trim();
  const source = payload.source === "local" ? "local" : "external";
  if (source === "local") {
    throw new Error(cpfAlreadyRegisteredMessage(name));
  }
  if (!name) throw new Error("A consulta não retornou o nome da pessoa.");

  const rawBirthDate = String(payload.birth_date || "").trim();
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(rawBirthDate) ? rawBirthDate : null;
  return { name, birthDate, source, registrationId: null };
}
