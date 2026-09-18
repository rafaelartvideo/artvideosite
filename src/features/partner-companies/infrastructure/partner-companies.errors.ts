import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

export type PartnerCompanyErrorCode =
  | "duplicate_document"
  | "duplicate_slug"
  | "duplicate_data"
  | "permission_denied"
  | "invalid_reference"
  | "invalid_data"
  | "not_found_or_forbidden"
  | "resource_unavailable"
  | "catalog_initialization_failed"
  | "connection_error"
  | "edge_http_error"
  | "edge_relay_error"
  | "edge_fetch_error"
  | string;

export class PartnerCompanyError extends Error {
  code: PartnerCompanyErrorCode;
  technicalCode?: string;
  status?: number;
  details?: string;

  constructor(
    message: string,
    code: PartnerCompanyErrorCode,
    options: { technicalCode?: string; status?: number; details?: string } = {},
  ) {
    super(message);
    this.name = "PartnerCompanyError";
    this.code = code;
    this.technicalCode = options.technicalCode;
    this.status = options.status;
    this.details = options.details;
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function databaseErrorMessage(
  error: any,
  fallback: string,
): PartnerCompanyError {
  const technicalCode = stringValue(error?.code);
  const message = stringValue(error?.message);
  const details = stringValue(error?.details);
  const hint = stringValue(error?.hint);
  const combined = `${message} ${details} ${hint}`.toLowerCase();

  if (technicalCode === "23505") {
    if (
      combined.includes("organizations_document_unique_idx") ||
      combined.includes("regexp_replace(document")
    ) {
      return new PartnerCompanyError(
        "Este CPF/CNPJ já está cadastrado em outra empresa.",
        "duplicate_document",
        { technicalCode, details: details || undefined },
      );
    }
    if (combined.includes("organizations_slug_unique_idx")) {
      return new PartnerCompanyError(
        "Já existe uma empresa com este identificador interno. Tente salvar novamente.",
        "duplicate_slug",
        { technicalCode, details: details || undefined },
      );
    }
    if (combined.includes("employees_organization_cpf_unique")) {
      return new PartnerCompanyError(
        "Este CPF já está cadastrado para outro usuário desta empresa.",
        "cpf_already_exists",
        { technicalCode, details: details || undefined },
      );
    }
    if (combined.includes("profiles_username_unique_idx")) {
      return new PartnerCompanyError(
        "Este usuário já está em uso. Escolha outro usuário.",
        "username_already_exists",
        { technicalCode, details: details || undefined },
      );
    }
    if (combined.includes("organization_members_organization_id_user_id_key")) {
      return new PartnerCompanyError(
        "Este usuário já está vinculado à empresa.",
        "user_already_member",
        { technicalCode, details: details || undefined },
      );
    }
    return new PartnerCompanyError(
      "Já existe um cadastro com estes dados.",
      "duplicate_data",
      { technicalCode, details: details || undefined },
    );
  }

  if (technicalCode === "42501") {
    return new PartnerCompanyError(
      "Seu usuário não possui permissão para executar esta operação na empresa parceira.",
      "permission_denied",
      { technicalCode, details: details || undefined },
    );
  }

  if (technicalCode === "23503") {
    return new PartnerCompanyError(
      "Um dos vínculos informados não existe mais. Atualize a página e tente novamente.",
      "invalid_reference",
      { technicalCode, details: details || undefined },
    );
  }

  if (technicalCode === "23514" || technicalCode === "22P02") {
    return new PartnerCompanyError(
      "Há um dado inválido no cadastro. Revise os campos informados.",
      "invalid_data",
      { technicalCode, details: details || undefined },
    );
  }

  if (technicalCode === "PGRST116") {
    return new PartnerCompanyError(
      "A empresa não foi encontrada ou seu usuário não possui acesso a ela.",
      "not_found_or_forbidden",
      { technicalCode, details: details || undefined },
    );
  }

  if (technicalCode === "PGRST205" || technicalCode === "42P01") {
    return new PartnerCompanyError(
      "Um recurso necessário para o cadastro da empresa não está disponível no banco de dados.",
      "resource_unavailable",
      { technicalCode, details: details || undefined },
    );
  }

  if (
    technicalCode === "P0002" ||
    combined.includes("organização raiz da artvideo não foi encontrada")
  ) {
    return new PartnerCompanyError(
      "Não foi possível inicializar o catálogo compartilhado da nova empresa.",
      "catalog_initialization_failed",
      { technicalCode, details: details || undefined },
    );
  }

  if (
    combined.includes("failed to fetch") ||
    combined.includes("networkerror") ||
    combined.includes("network request failed")
  ) {
    return new PartnerCompanyError(
      "Não foi possível conectar ao servidor. Verifique a conexão e tente novamente.",
      "connection_error",
      { technicalCode: technicalCode || undefined, details: details || undefined },
    );
  }

  return new PartnerCompanyError(
    message || fallback,
    technicalCode || "unknown_error",
    {
      technicalCode: technicalCode || undefined,
      details: details || hint || undefined,
    },
  );
}

export function toPartnerCompanyError(
  error: unknown,
  fallback = "Não foi possível concluir a operação.",
): PartnerCompanyError {
  if (error instanceof PartnerCompanyError) return error;
  if (error && typeof error === "object") {
    return databaseErrorMessage(error, fallback);
  }
  if (error instanceof Error) {
    return databaseErrorMessage(error, fallback);
  }
  const message = stringValue(error);
  return new PartnerCompanyError(message || fallback, "unknown_error");
}

function errorFromFunctionPayload(
  payload: any,
  fallback: string,
  status?: number,
): PartnerCompanyError | null {
  if (!payload || typeof payload !== "object") return null;
  const hasFailure =
    payload.success === false ||
    Boolean(stringValue(payload.error)) ||
    (status !== undefined && status >= 400);
  if (!hasFailure) return null;

  const code = stringValue(payload.code) || "edge_http_error";
  const message =
    stringValue(payload.error) ||
    stringValue(payload.message) ||
    fallback;

  return new PartnerCompanyError(message, code, {
    technicalCode: code,
    status,
    details: stringValue(payload.details) || undefined,
  });
}

export async function toPartnerFunctionError(
  error: unknown,
  data: unknown,
  fallback = "Não foi possível concluir a operação na função do servidor.",
): Promise<PartnerCompanyError | null> {
  const bodyError = errorFromFunctionPayload(data, fallback);
  if (bodyError) return bodyError;

  if (error instanceof FunctionsHttpError) {
    let payload: unknown = null;
    try {
      payload = await error.context.json();
    } catch {
      // Keep the SDK fallback below when the function did not return JSON.
    }
    return (
      errorFromFunctionPayload(payload, fallback, error.context.status) ||
      new PartnerCompanyError(
        fallback,
        "edge_http_error",
        { status: error.context.status, technicalCode: "edge_http_error" },
      )
    );
  }

  if (error instanceof FunctionsRelayError) {
    return new PartnerCompanyError(
      "A função do servidor foi executada, mas a resposta não chegou corretamente. Tente novamente.",
      "edge_relay_error",
      { technicalCode: stringValue((error as any)?.code) || undefined },
    );
  }

  if (error instanceof FunctionsFetchError) {
    return new PartnerCompanyError(
      "Não foi possível acessar a função do servidor. Verifique a conexão e tente novamente.",
      "edge_fetch_error",
      { technicalCode: stringValue((error as any)?.code) || undefined },
    );
  }

  if (error) return toPartnerCompanyError(error, fallback);
  return null;
}
