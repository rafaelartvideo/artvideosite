import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eraser, MoreVertical, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminCard, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/primitives/dropdown-menu";
import {
  getUnionMonitoredOrder,
  getUnionOrderMonitorOptions,
  listUnionMonitoredOrders,
  type UnionOrderMonitorRow,
} from "../infrastructure/union-order-monitor.repository";
import { TabOrders } from "./TabOrders";

type UnionOrderMonitorProps = {
  initialOrderId?: string | null;
  routeSubpage?: string | null;
  onOrderRouteChange?: (orderId: string | null, subpage?: string | null) => void;
};

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function UnionOrderMonitor({ initialOrderId, routeSubpage, onOrderRouteChange }: UnionOrderMonitorProps) {
  const queryClient = useQueryClient();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId || null);
  const [search, setSearch] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [situationId, setSituationId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const orderActions = (row: UnionOrderMonitorRow) => <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        onClick={event => event.stopPropagation()}
        aria-label={`Ações rápidas da OS ${row.os_number || ""}`}
        title="Ações rápidas"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center bg-transparent text-foreground transition-opacity hover:opacity-65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <MoreVertical size={17} />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="w-48" onClick={event => event.stopPropagation()}>
      <DropdownMenuItem onSelect={() => openOrder(row)} className="font-semibold">
        Abrir OS
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;

  useEffect(() => {
    setSelectedOrderId(initialOrderId || null);
  }, [initialOrderId]);

  const optionsQuery = useQuery({
    queryKey: ["union-order-monitor", "options"],
    queryFn: getUnionOrderMonitorOptions,
  });

  const options = optionsQuery.data;
  const serviceTypeOptions = useMemo(
    () => (options?.serviceTypes ?? []).filter(item => !organizationId || item.organization_id === organizationId),
    [options?.serviceTypes, organizationId],
  );
  const situationOptions = useMemo(
    () => (options?.situations ?? []).filter(item => !organizationId || item.organization_id === organizationId),
    [options?.situations, organizationId],
  );

  const listQuery = useQuery({
    queryKey: ["union-order-monitor", "list", { search, organizationId, serviceTypeId, situationId, page, pageSize }],
    queryFn: () => listUnionMonitoredOrders({
      search,
      organizationId,
      serviceTypeId,
      situationId,
      page,
      pageSize,
    }),
    placeholderData: previous => previous,
  });

  const contextQuery = useQuery({
    queryKey: ["union-order-monitor", "detail-context", selectedOrderId],
    enabled: Boolean(selectedOrderId),
    queryFn: () => getUnionMonitoredOrder(selectedOrderId!),
  });

  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["union-order-monitor"] });
    };
    const channel = supabase
      .channel("union-order-monitor-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_order_status_history" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_order_used_items" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_order_technical_values" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_order_technicians" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "service_order_sellers" }, invalidate)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const rows = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const hasActiveFilters = Boolean(search || organizationId || serviceTypeId || situationId);
  const monitoredOrganizationId = contextQuery.data?.order?.organization_id
    || contextQuery.data?.organization?.id
    || null;

  const clearFilters = () => {
    setSearch("");
    setOrganizationId("");
    setServiceTypeId("");
    setSituationId("");
    setPage(1);
  };

  const changeOrganization = (value: string) => {
    setOrganizationId(value);
    setServiceTypeId("");
    setSituationId("");
    setPage(1);
  };

  const openOrder = (row: UnionOrderMonitorRow) => {
    setSelectedOrderId(row.id);
    onOrderRouteChange?.(row.id, null);
  };

  const closeOrder = () => {
    setSelectedOrderId(null);
    onOrderRouteChange?.(null, null);
  };

  if (selectedOrderId) {
    if (contextQuery.isPending) {
      return <div className="absolute inset-0 z-[34] flex min-h-0 items-center justify-center bg-background">
        <LoadingState text="Carregando OS..." />
      </div>;
    }

    if (contextQuery.isError || !monitoredOrganizationId) {
      return <div className="absolute inset-0 z-[34] min-h-0 overflow-y-auto bg-background p-4 sm:p-6">
        <AdminCard className="mx-auto max-w-3xl p-5">
          <p className="text-sm font-semibold text-red-600">
            {systemErrorMessage(contextQuery.error, "Não foi possível carregar a OS monitorada.")}
          </p>
          <button type="button" onClick={closeOrder} className="mt-4 text-sm font-bold text-primary hover:underline">Voltar ao monitoramento</button>
        </AdminCard>
      </div>;
    }

    return <div className="absolute inset-0 z-[34] min-h-0 overflow-hidden bg-background">
      <div className="relative h-full min-h-0 overflow-y-auto bg-background p-4 sm:p-6">
        <TabOrders
          initialOrderId={selectedOrderId}
          routeSubpage={routeSubpage}
          organizationIdOverride={monitoredOrganizationId}
          accessMode="read"
          detailOnly
          monitorView
          monitorContact={contextQuery.data?.organization || null}
          onOrderRouteChange={(orderId, subpage) => {
            setSelectedOrderId(orderId);
            onOrderRouteChange?.(orderId, subpage);
          }}
          onOrderRouteClose={closeOrder}
        />
      </div>
    </div>;
  }

  return <div className="min-w-0 space-y-5">
    <PageHeader
      title="Monitoramento de OS"
      subtitle="Acompanhamento em tempo real das ordens de serviço vinculadas aos tipos monitorados das empresas parceiras."
    />

    <AdminCard square className="overflow-hidden p-0">
      <div className="flex h-12 items-center justify-between gap-3 border-b border-white/10 px-4 text-white md:h-11 admin-primary-bar">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.10]">
            <Search size={14} className="shrink-0 text-white/90" />
          </span>
          <span className="text-xs font-black uppercase tracking-[0.14em]">Buscar OS</span>
        </div>
        {hasActiveFilters && <button
          type="button"
          onClick={clearFilters}
          aria-label="Limpar filtros"
          title="Limpar filtros"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 text-[11px] font-bold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <Eraser size={13} /> Limpar filtros
        </button>}
      </div>

      <div className="grid gap-2 p-4 md:grid-cols-2 md:p-3 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-2">
          <FInput
            label="OS / Externa"
            placeholder="Digite o número da OS ou OS externa"
            value={search}
            onChange={(event: any) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <FSelect
          label="Empresa"
          value={organizationId}
          onChange={(event: any) => changeOrganization(event.target.value)}
          options={[
            { value: "", label: "Todas as empresas" },
            ...(options?.companies ?? []).map(item => ({ value: item.id, label: item.name })),
          ]}
        />
        <FSelect
          label="Tipo de atendimento"
          value={serviceTypeId}
          onChange={(event: any) => { setServiceTypeId(event.target.value); setPage(1); }}
          options={[
            { value: "", label: "Todos os tipos" },
            ...serviceTypeOptions.map(item => ({
              value: item.id,
              label: organizationId ? item.title : `${item.organization_name} · ${item.title}`,
            })),
          ]}
        />
        <FSelect
          label="Situação"
          value={situationId}
          onChange={(event: any) => { setSituationId(event.target.value); setPage(1); }}
          options={[
            { value: "", label: "Todas as situações" },
            ...situationOptions.map(item => ({
              value: item.id,
              label: organizationId ? item.name : `${item.organization_name} · ${item.name}`,
            })),
          ]}
        />
      </div>
    </AdminCard>

    {optionsQuery.isError || listQuery.isError ? (
      <AdminCard className="p-5">
        <p className="text-sm font-semibold text-red-600">
          {systemErrorMessage(optionsQuery.error || listQuery.error, "Não foi possível carregar o monitoramento de OS.")}
        </p>
      </AdminCard>
    ) : listQuery.isPending || optionsQuery.isPending ? (
      <LoadingState text="Carregando ordens monitoradas..." />
    ) : total === 0 ? (
      <EmptyState
        icon={Search}
        title="Nenhuma OS monitorada"
        message="Não há ordens correspondentes aos tipos de atendimento e filtros selecionados."
      />
    ) : (
      <AdminCard square className="[&_th]:md:py-2 [&_td]:md:py-2.5">
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[980px]">
            <thead><tr>
              <th className="text-left">OS</th>
              <th className="text-left">Empresa</th>
              <th className="text-left">Cliente</th>
              <th className="text-left">Tipo</th>
              <th className="text-left">Situação</th>
              <th className="text-left">Atualização</th>
              <th className="w-16 text-right">Ações</th>
            </tr></thead>
            <tbody>{rows.map(row => <tr key={row.id} className="cursor-pointer" onClick={() => openOrder(row)}>
              <td><div className="flex items-center gap-2"><span aria-label={`Cor do status ${row.status_name || "Sem status"}`} className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.status_color || "transparent" }} /><div><p className="font-mono text-base font-black text-primary">{row.os_number}</p>{row.external_os_number && <p className="text-[11px] font-semibold text-muted-foreground">OS Externa {row.external_os_number}</p>}</div></div></td>
              <td><p className="font-bold text-foreground">{row.organization_name}</p></td>
              <td><p className="max-w-[240px] truncate text-sm font-semibold text-foreground">{row.customer_name || "—"}</p></td>
              <td className="text-sm text-muted-foreground">{row.service_type_title}</td>
              <td>{row.situation_name ? <StatusBadge status={row.situation_name} color={row.situation_color} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
              <td className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(row.updated_at)}</td>
              <td onClick={event => event.stopPropagation()}><div className="flex justify-end">{orderActions(row)}</div></td>
            </tr>)}</tbody>
          </table>
        </div>

        <div className="divide-y divide-border md:hidden">
          {rows.map(row => <button key={row.id} type="button" onClick={() => openOrder(row)} className="w-full p-4 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-black text-primary">OS {row.os_number}</p>
                {row.external_os_number && <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">OS Externa {row.external_os_number}</p>}
                <p className="mt-1 truncate text-xs font-bold text-muted-foreground">{row.organization_name}</p>
                <p className="mt-1 truncate text-sm font-semibold text-foreground">{row.customer_name || "—"}</p>
              </div>
              <div onClick={event => event.stopPropagation()}>{orderActions(row)}</div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{row.service_type_title}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {row.situation_name ? <StatusBadge status={row.situation_name} color={row.situation_color} /> : <span className="text-xs text-muted-foreground">—</span>}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">Atualizada em {formatDateTime(row.updated_at)}</p>
          </button>)}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-[11px] font-semibold text-muted-foreground md:py-2" aria-label="Legenda dos indicadores da ordem de serviço">
          <span className="font-bold text-foreground">Legenda:</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#16a34a]" aria-hidden="true" />Aberta</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#0057e7]" aria-hidden="true" />Fechada</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#dc2626]" aria-hidden="true" />Cancelada</span>
          <span className="inline-flex items-center border-l border-border pl-4 font-normal text-primary">OS Externa: número informado pela empresa parceira.</span>
        </div>

        <PaginationBar
          page={page}
          pageSize={pageSize}
          totalItems={total}
          onPageChange={setPage}
          onPageSizeChange={size => { setPageSize(size); setPage(1); }}
        />
      </AdminCard>
    )}
  </div>;
}
