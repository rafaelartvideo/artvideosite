export function getSettingText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function getBusinessHours(value: unknown): string[] {
  let hours: unknown = value;
  if (typeof value === "string") {
    try {
      hours = JSON.parse(value);
    } catch {
      return value ? [value] : [];
    }
  }
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return [];

  const labels: Record<string, string> = {
    monday: "Segunda-feira",
    tuesday: "Terça-feira",
    wednesday: "Quarta-feira",
    thursday: "Quinta-feira",
    friday: "Sexta-feira",
    saturday: "Sábado",
    sunday: "Domingo",
  };

  return Object.entries(labels).flatMap(([key, label]) => {
    const text = getSettingText((hours as Record<string, unknown>)[key]);
    return text ? [`${label}: ${text}`] : [];
  });
}

export function getWhatsAppNumber(settings: Record<string, unknown>): string {
  const rawNumber = getSettingText(settings.whatsapp) || getSettingText(settings.whatsapp_number);
  const digits = rawNumber.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : digits ? `55${digits}` : "";
}
