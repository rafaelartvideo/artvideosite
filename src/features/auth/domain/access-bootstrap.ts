export type MyEmployeeAccessWindow = {
  allowed: boolean;
  restricted: boolean;
  timezone: string;
  server_now: string | null;
  next_end_at: string | null;
};

export function normalizeAccessWindow(value: unknown): MyEmployeeAccessWindow {
  const result = value && typeof value === "object"
    ? value as Partial<MyEmployeeAccessWindow> : {};
  if (typeof result.allowed !== "boolean" || typeof result.restricted !== "boolean") {
    throw new Error("Resposta inválida ao verificar o horário de acesso.");
  }
  if (result.allowed && result.restricted) {
    const serverNow = typeof result.server_now === "string" ? Date.parse(result.server_now) : NaN;
    const endAt = typeof result.next_end_at === "string" ? Date.parse(result.next_end_at) : NaN;
    if (!Number.isFinite(serverNow) || !Number.isFinite(endAt) || endAt <= serverNow) {
      throw new Error("Resposta inválida ao verificar o horário de acesso.");
    }
  }
  return {
    allowed: result.allowed,
    restricted: result.restricted,
    timezone: typeof result.timezone === "string" && result.timezone ? result.timezone : "America/Sao_Paulo",
    server_now: typeof result.server_now === "string" ? result.server_now : null,
    next_end_at: typeof result.next_end_at === "string" ? result.next_end_at : null,
  };
}

export async function resolveBootstrapAccessWindow(
  bootstrap: Record<string, unknown>,
  loadLegacyWindow: () => Promise<MyEmployeeAccessWindow>,
): Promise<MyEmployeeAccessWindow> {
  // Somente a ausência do campo indica um backend anterior. Um campo presente
  // inválido é erro; nunca trocar uma negativa por uma nova tentativa.
  return normalizeAccessWindow(Object.prototype.hasOwnProperty.call(bootstrap, "accessWindow")
    ? bootstrap.accessWindow
    : await loadLegacyWindow());
}

export function shouldBlockAccessLoad(
  activeOrganizationId: string | null,
  requestedOrganizationId: string | null,
  background = false,
): boolean {
  return !background || !activeOrganizationId || activeOrganizationId !== requestedOrganizationId;
}
