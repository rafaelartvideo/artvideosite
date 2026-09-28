type ErrorLike = {
  message?: unknown;
  error?: unknown;
  error_description?: unknown;
  details?: unknown;
  hint?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
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
  const normalized = raw.toLocaleLowerCase("pt-BR");

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
    return raw && !normalized.includes("violates check constraint")
      ? raw
      : "Um dos valores informados é inválido.";
  }

  return raw || fallback;
}
