// A situação exibida no painel é técnica, independente do encerramento comercial da OS.
// A RPC retorna um booleano de conclusão de TODOS os serviços da OS.
// Enquanto a migração não estiver aplicada, o indicador mantém compatibilidade com os serviços visíveis.
export function isTechnicianOrderCompleted(services: ReadonlyArray<{
  status: string;
  order_services_completed?: boolean | null;
}>): boolean {
  if (!services.length) return false;
  const fullOrderCompleted = services[0].order_services_completed;
  return typeof fullOrderCompleted === "boolean"
    ? fullOrderCompleted
    : services.every(service => service.status === "completed");
}
