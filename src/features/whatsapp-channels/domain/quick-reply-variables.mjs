// Shared by the Atendimentos inbox and its OS conversation modal.
// Expand only documented placeholders; unrecognized text is preserved so a
// mistyped variable is never silently replaced with invented customer data.
export const QUICK_REPLY_VARIABLES = [
  { token: "{operador}", label: "Primeiro nome do operador" },
  { token: "{operador_completo}", label: "Nome completo do operador" },
  { token: "{cliente}", label: "Nome do cliente da conversa" },
  { token: "{horario}", label: "Bom dia, boa tarde ou boa noite (automático)" },
  { token: "{saudacao}", label: "Saudação automática (igual a {horario})" },
  { token: "{hora}", label: "Horário atual" },
  { token: "{data}", label: "Data atual" },
  { token: "{protocolo}", label: "Protocolo do atendimento" },
];

export const whatsappTimeGreeting = (date = new Date()) => {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23",
  }).format(date));
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
};

export function renderWhatsAppQuickReply(template, context = {}, date = new Date()) {
  const name = String(context.operatorName || "").trim();
  const replacements = {
    operador: name.split(/\s+/)[0] || "",
    operador_completo: name,
    cliente: String(context.customerName || "").trim(),
    horario: whatsappTimeGreeting(date),
    saudacao: whatsappTimeGreeting(date),
    hora: new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
    }).format(date),
    data: new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
    }).format(date),
    protocolo: String(context.protocol || "").trim(),
  };
  return String(template || "").replace(/\{\s*([\wÀ-ÿ]+)\s*\}/g, (original, key) => {
    const normalized = key.toLowerCase();
    return Object.hasOwn(replacements, normalized) && replacements[normalized]
      ? replacements[normalized] : original;
  });
}
