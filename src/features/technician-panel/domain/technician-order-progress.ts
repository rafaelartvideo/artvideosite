// A situação exibida no painel é técnica, independente do encerramento comercial da OS.
// Considera somente os serviços vinculados ao técnico que está consultando o painel.
export function isTechnicianOrderCompleted(services: ReadonlyArray<{ status: string }>): boolean {
  return services.length > 0 && services.every(service => service.status === "completed");
}
