import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, History, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminCard, AdminDialog, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, FInput } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import {
  listAuditActors,
  listAuditLogs,
  type AuditLogEntry,
} from "../infrastructure/audit-log.repository";

const MODULE_LABELS: Record<string, string> = {
  orders: "Ordens de Serviço",
  customers: "Clientes",
  registrations: "Cadastros",
  agenda: "Agenda",
  inventory: "Estoque",
  finance: "Financeiro",
  equipment: "Equipamentos",
  employees: "Funcionários e Permissões",
  service_types: "Tipos de Atendimento",
  order_situations: "Situações da OS",
  order_statuses: "Status da OS",
  documents: "Documentos",
  quotes: "Orçamentos",
  services: "Serviços Gerais",
  site_services: "Serviços do Site",
  site_products: "Produtos do Site",
  site_brands: "Marcas do Site",
  site_settings: "Site",
  company_settings: "Dados da Empresa",
  organizations: "Empresas",
  system: "Sistema",
};

const ENTITY_LABELS: Record<string, string> = {
  service_orders: "Ordem de Serviço",
  service_order_checklists: "Checklist da OS",
  service_order_checklist_stages: "Etapa do checklist",
  service_order_checklist_items: "Item do checklist",
  service_order_checklist_item_media: "Foto do checklist",
  service_order_part_requests: "Pedido de peças",
  service_order_part_request_items: "Item do pedido de peças",
  service_order_used_items: "Peça utilizada",
  service_order_situation_media: "Anexo da situação",
  service_order_situation_visits: "Histórico de situação",
  service_order_technical_values: "Campo técnico da OS",
  service_order_technicians: "Técnico da OS",
  service_order_sellers: "Vendedor da OS",
  customers: "Cliente",
  customer_addresses: "Endereço do cliente",
  customer_equipments: "Equipamento do cliente",
  entities: "Cadastro",
  entity_addresses: "Endereço do cadastro",
  entity_contacts: "Contato do cadastro",
  entity_records: "Registro do cadastro",
  inventory_items: "Item do estoque",
  inventory_movements: "Movimentação de estoque",
  financial_entries: "Lançamento financeiro",
  financial_settlements: "Baixa financeira",
  financial_transfers: "Transferência financeira",
  appointments: "Agendamento",
  employees: "Funcionário",
  roles: "Função",
  user_permission_overrides: "Permissão individual",
  services: "Serviço do site",
  products: "Produto",
  brands: "Marca",
};

const FIELD_LABELS: Record<string, string> = {
  full_name: "Nome",
  name: "Nome",
  title: "Título",
  description: "Descrição",
  status: "Status",
  situation_id: "Situação",
  status_id: "Status",
  assigned_to: "Responsável",
  technician_id: "Técnico",
  seller_id: "Vendedor",
  service_type_id: "Tipo de atendimento",
  service_id: "Serviço",
  customer_id: "Cliente",
  estimated_price: "Valor estimado",
  service_price: "Valor do serviço",
  parts_total: "Total de peças",
  subtotal: "Subtotal",
  discount_percentage: "Desconto (%)",
  discount_amount: "Desconto",
  final_total: "Total final",
  diagnosis: "Diagnóstico",
  solution: "Solução",
  internal_notes: "Observações internas",
  customer_notes: "Observações do cliente",
  response_code: "Resposta",
  response_text: "Resposta",
  response_number: "Resposta numérica",
  observation: "Observação",
  quantity: "Quantidade",
  sale_price: "Valor de venda",
  purchase_price: "Valor de compra",
  is_active: "Ativo",
  role_id: "Função",
  organization_id: "Empresa",
};

const MODULE_OPTIONS = [
  { value: "", label: "Todos os módulos" },
  ...Object.entries(MODULE_LABELS)
    .filter(([key]) => key !== "system")
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
    .map(([value, label]) => ({ value, label })),
];

const OPERATION_OPTIONS = [
  { value: "", label: "Todas as ações" },
  { value: "insert", label: "Criação" },
  { value: "update", label: "Edição" },
  { value: "delete", label: "Exclusão" },
];

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function operationLabel(operation: AuditLogEntry["operation"]) {
  if (operation === "insert") return "Criação";
  if (operation === "delete") return "Exclusão";
  return "Edição";
}

function operationTone(operation: AuditLogEntry["operation"]) {
  if (operation === "insert") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (operation === "delete") return "border-red-200 bg-red-50 text-red-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function humanizeKey(value: string) {
  return FIELD_LABELS[value] || value
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/^./, char => char.toUpperCase());
}

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "Não informado";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "object") {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

function changedFieldEntries(entry: AuditLogEntry) {
  return Object.entries(entry.changed_fields || {});
}

function summary(entry: AuditLogEntry) {
  if (entry.operation === "insert") return "Registro criado";
  if (entry.operation === "delete") return "Registro excluído";
  const changes = changedFieldEntries(entry);
  if (!changes.length) return "Registro alterado";
  if (changes.length === 1) return humanizeKey(changes[0][0]);
  return `${changes.length} campos alterados`;
}

function entityLabel(entry: AuditLogEntry) {
  return ENTITY_LABELS[entry.entity_type || ""] || humanizeKey(entry.entity_type || "Registro");
}

export function TabAuditLog() {
  const { activeOrganizationId } = useAuth();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [actorUserId, setActorUserId] = useState("");
  const [moduleKey, setModuleKey] = useState("");
  const [operation, setOperation] = useState("");
  const [contextId, setContextId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const filters = useMemo(() => ({
    page,
    pageSize,
    actorUserId,
    moduleKey,
    operation,
    contextId,
    dateFrom,
    dateTo,
  }), [page, pageSize, actorUserId, moduleKey, operation, contextId, dateFrom, dateTo]);

  const logsQuery = useQuery({
    queryKey: ["audit-logs", activeOrganizationId, filters],
    enabled: Boolean(activeOrganizationId),
    queryFn: () => listAuditLogs(activeOrganizationId!, filters),
  });

  const actorsQuery = useQuery({
    queryKey: ["audit-actors", activeOrganizationId],
    enabled: Boolean(activeOrganizationId),
    queryFn: () => listAuditActors(activeOrganizationId!),
  });

  const actorOptions = [
    { value: "", label: "Todos os usuários" },
    ...(actorsQuery.data || []).map(actor => ({ value: actor.id, label: actor.name })),
  ];

  const resetFilters = () => {
    setActorUserId("");
    setModuleKey("");
    setOperation("");
    setContextId("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  const hasFilters = Boolean(actorUserId || moduleKey || operation || contextId || dateFrom || dateTo);
  const items = logsQuery.data?.items || [];
  const total = logsQuery.data?.total || 0;

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        title="Auditoria"
        subtitle="Histórico de alterações realizadas nos dados do CRM."
      />

      <AdminCard>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Usuário</label>
            <AdminSelect
              value={actorUserId}
              onValueChange={value => { setActorUserId(value); setPage(1); }}
              options={actorOptions}
              ariaLabel="Filtrar por usuário"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Módulo</label>
            <AdminSelect
              value={moduleKey}
              onValueChange={value => { setModuleKey(value); setPage(1); }}
              options={MODULE_OPTIONS}
              ariaLabel="Filtrar por módulo"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Ação</label>
            <AdminSelect
              value={operation}
              onValueChange={value => { setOperation(value); setPage(1); }}
              options={OPERATION_OPTIONS}
              ariaLabel="Filtrar por ação"
            />
          </div>
          <FInput
            label="Registro"
            value={contextId}
            onChange={(event: any) => { setContextId(event.target.value); setPage(1); }}
            placeholder="ID do registro"
          />
          <FInput
            label="De"
            type="date"
            value={dateFrom}
            onChange={(event: any) => { setDateFrom(event.target.value); setPage(1); }}
          />
          <FInput
            label="Até"
            type="date"
            value={dateTo}
            onChange={(event: any) => { setDateTo(event.target.value); setPage(1); }}
          />
        </div>

        {hasFilters && (
          <div className="flex justify-end border-t border-[#0d1b2e]/8 px-4 py-3">
            <AdminButton variant="secondary" size="sm" onClick={resetFilters}>
              <RotateCcw size={14} /> Limpar filtros
            </AdminButton>
          </div>
        )}
      </AdminCard>

      <AdminCard>
        {logsQuery.isPending ? (
          <LoadingState text="Carregando auditoria..." />
        ) : logsQuery.error ? (
          <div className="p-4 text-sm font-semibold text-red-700">
            Não foi possível carregar o histórico de auditoria.
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nenhum registro encontrado"
            message={hasFilters ? "Ajuste os filtros para ampliar a busca." : "As próximas alterações do CRM aparecerão aqui."}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[920px]">
                <thead>
                  <tr>
                    <th className="text-left">Data e hora</th>
                    <th className="text-left">Usuário</th>
                    <th className="text-left">Módulo</th>
                    <th className="text-left">Ação</th>
                    <th className="text-left">Registro</th>
                    <th className="text-left">Alteração</th>
                    <th className="text-right">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(entry => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap text-xs font-semibold text-[#52647c]">{formatDateTime(entry.created_at)}</td>
                      <td>
                        <p className="max-w-[210px] truncate text-sm font-bold text-[#0d1b2e]">
                          {entry.actor_name_snapshot || (entry.source === "system" ? "Sistema" : "Usuário")}
                        </p>
                        {entry.source === "server_on_behalf" && <p className="text-[10px] font-semibold text-[#7a8aa0]">via servidor</p>}
                      </td>
                      <td className="text-xs font-semibold text-[#52647c]">{MODULE_LABELS[entry.module_key || ""] || "Sistema"}</td>
                      <td>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black ${operationTone(entry.operation)}`}>
                          {operationLabel(entry.operation)}
                        </span>
                      </td>
                      <td>
                        <p className="text-xs font-bold text-[#0d1b2e]">{entityLabel(entry)}</p>
                        {entry.context_type === "service_order" && <p className="mt-0.5 text-[10px] font-semibold text-[#0057e7]">Vinculado a uma OS</p>}
                      </td>
                      <td className="max-w-[260px] text-xs font-semibold text-[#52647c]">{summary(entry)}</td>
                      <td>
                        <div className="flex justify-end">
                          <AdminButton
                            variant="icon"
                            size="sm"
                            ariaLabel="Ver detalhes da alteração"
                            title="Ver detalhes"
                            onClick={() => setSelected(entry)}
                          >
                            <Eye size={15} />
                          </AdminButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={page}
              pageSize={pageSize}
              totalItems={total}
              defaultPageSize={20}
              pageSizeOptions={[20, 50, 100]}
              onPageChange={setPage}
              onPageSizeChange={size => { setPageSize(size); setPage(1); }}
            />
          </>
        )}
      </AdminCard>

      <AuditDetailsDialog entry={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function AuditDetailsDialog({ entry, onClose }: { entry: AuditLogEntry | null; onClose: () => void }) {
  if (!entry) return null;
  const changes = changedFieldEntries(entry);
  const snapshot = Object.entries(entry.row_snapshot || {});

  return (
    <AdminDialog
      open
      onClose={onClose}
      title="Detalhes da alteração"
      description={`${operationLabel(entry.operation)} • ${formatDateTime(entry.created_at)}`}
      className="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="grid gap-3 rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-4 sm:grid-cols-2">
          <Detail label="Usuário" value={entry.actor_name_snapshot || (entry.source === "system" ? "Sistema" : "Usuário")} />
          <Detail label="Módulo" value={MODULE_LABELS[entry.module_key || ""] || "Sistema"} />
          <Detail label="Registro" value={entityLabel(entry)} />
          <Detail label="Origem" value={entry.source === "authenticated_user" ? "Painel" : entry.source === "server_on_behalf" ? "Servidor em nome do usuário" : "Sistema"} />
        </div>

        {entry.operation === "update" && (
          <div>
            <h3 className="mb-2 text-sm font-black text-[#0d1b2e]">Campos alterados</h3>
            <div className="divide-y divide-[#0d1b2e]/8 overflow-hidden rounded-xl border border-[#0d1b2e]/8">
              {changes.map(([field, value]) => (
                <div key={field} className="grid gap-2 bg-white p-3 sm:grid-cols-[150px_1fr_1fr]">
                  <p className="text-xs font-black text-[#0d1b2e]">{humanizeKey(field)}</p>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-[#8a96a8]">Antes</p>
                    <p className="mt-1 break-words text-xs font-semibold text-[#52647c]">{displayValue(value?.before)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-[#8a96a8]">Depois</p>
                    <p className="mt-1 break-words text-xs font-semibold text-[#0d1b2e]">{displayValue(value?.after)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {entry.operation !== "update" && snapshot.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-black text-[#0d1b2e]">{entry.operation === "delete" ? "Dados excluídos" : "Dados criados"}</h3>
            <div className="grid gap-x-4 gap-y-3 rounded-xl border border-[#0d1b2e]/8 bg-white p-4 sm:grid-cols-2">
              {snapshot.map(([field, value]) => (
                <Detail key={field} label={humanizeKey(field)} value={displayValue(value)} />
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#7a8aa0]">Identificador do evento</p>
          <p className="mt-1 font-mono text-xs font-bold text-[#34445b]">#{entry.id}</p>
        </div>
      </div>
    </AdminDialog>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-black uppercase tracking-wider text-[#8a96a8]">{label}</p>
      <p className="mt-1 break-words text-xs font-semibold text-[#0d1b2e]">{value || "—"}</p>
    </div>
  );
}
