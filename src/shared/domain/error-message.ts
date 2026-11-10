type ErrorLike = {
  message?: unknown;
  error?: unknown;
  error_description?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
  type?: unknown;
};

const isUsefulText = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const text = value.trim();
  return Boolean(text) && text !== "[object Object]" && text !== "undefined" && text !== "null";
};

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const code = (error as ErrorLike).code;
  return typeof code === "string" || typeof code === "number" ? String(code) : "";
}

function errorStatus(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const value = error as ErrorLike;
  const status = value.status ?? value.statusCode;
  return typeof status === "string" || typeof status === "number" ? String(status) : "";
}

function extractErrorText(error: unknown, seen = new Set<unknown>()): string {
  if (isUsefulText(error)) return error.trim();
  if (error instanceof Error && isUsefulText(error.message)) return error.message.trim();
  if (!error || typeof error !== "object" || seen.has(error)) return "";
  seen.add(error);

  const value = error as ErrorLike;
  for (const candidate of [value.message, value.error_description, value.error, value.details, value.hint]) {
    const text = extractErrorText(candidate, seen);
    if (text) return text;
  }
  return "";
}

export function systemErrorMessage(
  error: unknown,
  fallback = "Não foi possível concluir a operação.",
): string {
  const code = errorCode(error);
  const status = errorStatus(error);
  const raw = extractErrorText(error);
  // Os códigos internos são úteis para diagnóstico, não para o feedback visual.
  const displayText = raw.replace(/^\s*[a-z][a-z0-9]*(?:_[a-z0-9]+)+:\s*/i, "").trim();
  const normalized = displayText.toLocaleLowerCase("pt-BR");

  // Uma conversa atribuída a outro operador deve exibir somente o responsável.
  const typed = error && typeof error === "object" ? (error as ErrorLike).type : null;
  const isOtherOperator = typed === "protocol_owned_by_other_operator"
    || /^\s*protocol_owned_by_other_operator\s*:/i.test(raw);
  if (isOtherOperator) {
    const owner = displayText.match(/(?:O cliente|Este contato) já está em atendimento com\s+(.+?)(?:\.|$)/i)
      || displayText.match(/Este atendimento pertence a\s+(.+?)(?:\.|$)/i);
    if (owner?.[1]?.trim()) return "O cliente já está em atendimento com " + owner[1].trim() + ".";
  }

  // 42501 também é usado por regras de negócio de OS (ex.: uma OS já
  // solucionada), e não apenas por falta de acesso. Preserve somente mensagens
  // explícitas e legíveis; nunca exponha nomes internos de tabelas ou RLS.
  const safeDomainMessage = /^(?:Esta OS|Uma OS|Este retorno|O retorno|O orçamento|A garantia|A conclusão|A atualização comercial|O vínculo|A classificação|Resolva a OS|Você não possui permissão para|Sem permissão para)\b/i.test(displayText)
    && displayText.length <= 280
    && !/(?:permission denied|row-level security|\b(?:schema|relation|column|table)\b|public\.|private\.)/i.test(displayText);
  if (code === "42501" && status !== "401" && status !== "403" && safeDomainMessage) {
    return displayText;
  }

  if (
    status === "401"
    || status === "403"
    || code === "42501"
    || normalized.includes("new row violates row-level security policy")
    || normalized.includes("permission denied for")
    || normalized.includes("violates row-level security policy")
    || normalized.includes("forbidden")
  ) return "Você não possui permissão para realizar esta ação nesta empresa.";

  if (code === "23505" || normalized.includes("duplicate key value violates unique constraint")) {
    return "Já existe um cadastro com estes dados.";
  }

  if (code === "23503" || normalized.includes("violates foreign key constraint")) {
    return "Não foi possível concluir porque este registro está vinculado a outros dados.";
  }

  if (code === "23502" || normalized.includes("null value in column")) {
    return "Preencha os campos obrigatórios antes de continuar.";
  }

  if (code === "23514" || normalized.includes("violates check constraint")) {
    return displayText && !normalized.includes("violates check constraint")
      ? displayText
      : "Um dos valores informados é inválido.";
  }

  return displayText || fallback;
}
