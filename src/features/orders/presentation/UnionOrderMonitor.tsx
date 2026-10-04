import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileText, MessageCircle, Package, Phone, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  AdminButton,
  AdminCard,
  AdminCardContent,
  AdminCardHeader,
  AdminPage,
  AdminStickyToolbar,
  BtnSecondary,
  PageHeader,
} from "@/shared/ui/admin/AdminLayout";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import {
  getUnionMonitoredOrder,
  getUnionOrderMonitorOptions,
  listUnionMonitoredOrders,
  type UnionOrderMonitorRow,
} from "../infrastructure/union-order-monitor.repository";
import { OrderProductsServicesSection } from "./OrderProductsServicesSection";

type UnionOrderMonitorProps = {
  initialOrderId?: string | null;
  onOrderRouteChange?: (orderId: string | null) => void;
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

function formatMoney(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
}

function partnerPhoneDigits(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
}

function TextField({ label, value }: { label: string; value: unknown }) {
  const text = value == null || String(value).trim() === "" ? "—" : String(value);
  return <div className="min-w-0">
    <p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</p>
    <p className="mt-1 break-words text-sm font-semibold leading-5 text-[#0d1b2e]">{text}</p>
  </div>;
}

function ColorBadge({ name, color }: { name?: string | null; color?: string | null }) {
  return <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#f1f5f9] px-2.5 py-1 text-xs font-bold text-[#0d1b2e]">
    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color || "#94a3b8" }} />
    <span className="truncate">{name || "—"}</span>
  </span>;
}

export function UnionOrderMonitor({ initialOrderId, onOrderRouteChange }: UnionOrderMonitorProps) {
  const queryClient = useQueryClient();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId || null);
  const [search, setSearch] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [serviceTypeId, setServiceTypeId] = useState("");
  const [situationId, setSituationId] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [productsRevision, setProductsRevision] = useState(0);
  const [detailSection, setDetailSection] = useState<"details" | "products-services">("details");

  useEffect(() => {
    setSelectedOrderId(initialOrderId || null);
  }, [initialOrderId]);

  useEffect(() => {
    setDetailSection("details");
  }, [selectedOrderId]);

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

  const detailQuery = useQuery({
    queryKey: ["union-order-monitor", "detail", selectedOrderId],
    enabled: Boolean(selectedOrderId),
    queryFn: () => getUnionMonitoredOrder(selectedOrderId!),
  });

  useEffect(() => {
    const invalidate = () => {
      setProductsRevision(current => current + 1);
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
    onOrderRouteChange?.(row.id);
  };

  const closeOrder = () => {
    setSelectedOrderId(null);
    onOrderRouteChange?.(null);
  };

  const detail = detailQuery.data;
  const order = detail?.order ?? {};
  const customer = detail?.customer ?? {};
  const organization = detail?.organization ?? {};
  const serviceType = detail?.serviceType ?? {};
  const status = detail?.status ?? {};
  const situation = detail?.situation ?? {};
  const technicians = Array.isArray(detail?.technicians) ? detail.technicians : [];
  const sellers = Array.isArray(detail?.sellers) ? detail.sellers : [];
  const statusHistory = Array.isArray(detail?.statusHistory) ? detail.statusHistory : [];
  const phoneDigits = partnerPhoneDigits(organization.phone);

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
          className="text-xs font-semibold text-white underline decoration-white/70 underline-offset-4 transition-opacity hover:opacity-80"
        >
          Limpar filtros
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
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border px-4 py-3 text-[11px] text-muted-foreground">
          <span className="font-black uppercase tracking-[0.12em] text-foreground">Legenda</span>
          <span className="inline-flex items-center gap-2"><span className="h-5 w-1.5 rounded-full bg-muted-foreground" />A cor ao lado da OS acompanha a situação atual.</span>
          <span><strong className="font-bold text-foreground">OS Externa</strong> é o número informado pela empresa parceira.</span>
        </div>
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[980px]">
            <thead><tr>
              <th className="text-left">OS</th>
              <th className="text-left">Empresa</th>
              <th className="text-left">Cliente</th>
              <th className="text-left">Tipo</th>
              <th className="text-left">Situação</th>
              <th className="text-left">Atualização</th>
            </tr></thead>
            <tbody>{rows.map(row => <tr key={row.id} className="cursor-pointer" onClick={() => openOrder(row)}>
              <td><div className="flex items-center gap-2"><span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: row.situation_color || "#94a3b8" }} /><div><p className="font-mono text-base font-black text-primary">{row.os_number}</p>{row.external_os_number && <p className="text-[11px] font-semibold text-muted-foreground">OS Externa {row.external_os_number}</p>}</div></div></td>
              <td><p className="font-bold text-foreground">{row.organization_name}</p></td>
              <td><p className="max-w-[240px] truncate text-sm font-semibold text-foreground">{row.customer_name || "—"}</p></td>
              <td className="text-sm text-muted-foreground">{row.service_type_title}</td>
              <td><ColorBadge name={row.situation_name} color={row.situation_color} /></td>
              <td className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(row.updated_at)}</td>
            </tr>)}</tbody>
          </table>
        </div>

        <div className="divide-y divide-[#0d1b2e]/8 md:hidden">
          {rows.map(row => <button key={row.id} type="button" onClick={() => openOrder(row)} className="w-full p-4 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-black text-primary">OS {row.os_number}</p>
                {row.external_os_number && <p className="mt-0.5 text-[11px] font-semibold text-muted-foreground">OS Externa {row.external_os_number}</p>}
                <p className="mt-1 truncate text-xs font-bold text-muted-foreground">{row.organization_name}</p>
                <p className="mt-1 truncate text-sm font-semibold text-[#0d1b2e]">{row.customer_name || "—"}</p>
              </div>
              <Eye size={16} className="mt-1 shrink-0 text-[#0057e7]" />
            </div>
            <p className="mt-2 text-xs text-[#5a6a82]">{row.service_type_title}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <ColorBadge name={row.situation_name} color={row.situation_color} />
            </div>
            <p className="mt-3 text-[11px] text-[#5a6a82]">Atualizada em {formatDateTime(row.updated_at)}</p>
          </button>)}
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

    <AdminPage
      open={Boolean(selectedOrderId)}
      onClose={closeOrder}
      breadcrumb="Monitoramento de OS"
      title={order.os_number ? `OS ${order.os_number}` : "Ordem de serviço"}
      subtitle={organization.name ? `${organization.name} · somente leitura` : "Somente leitura"}
      titleVariant="order-number"
      maxW="max-w-6xl"
      fullPage
    >
      {detailQuery.isPending ? <LoadingState text="Carregando OS..." /> : detailQuery.isError ? (
        <div className="p-5">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {systemErrorMessage(detailQuery.error, "Não foi possível carregar a OS monitorada.")}
          </div>
        </div>
      ) : <div className="space-y-5 p-4 sm:p-5">
        <div className="rounded-xl border border-[#0057e7]/15 bg-[#eef5ff] px-4 py-3 text-xs font-semibold leading-5 text-[#0057e7]">
          Esta visualização é somente leitura. Alterações feitas pela empresa parceira são atualizadas automaticamente pelo monitoramento em tempo real.
        </div>

        <div className="border-b border-border">
          <div className="flex min-w-0 gap-5 overflow-x-auto">
            <button type="button" onClick={() => setDetailSection("details")} className={`flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-xs font-bold transition-colors ${detailSection === "details" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><FileText size={15} /> Detalhes da OS</button>
            <button type="button" onClick={() => setDetailSection("products-services")} className={`flex shrink-0 items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-xs font-bold transition-colors ${detailSection === "products-services" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Package size={15} /> Produtos e Serviços</button>
          </div>
        </div>

        {detailSection === "products-services" ? <OrderProductsServicesSection
          key={`${order.id || selectedOrderId}:${productsRevision}`}
          order={order}
          canEdit={false}
          formatCurrency={value => formatMoney(value)}
          onPricingChange={() => undefined}
        /> : <>
        <AdminCard>
          <AdminCardHeader>
            <div><h3 className="text-sm font-black text-[#0d1b2e]">Resumo</h3><p className="mt-0.5 text-xs text-[#5a6a82]">Identificação e estado atual da ordem.</p></div>
          </AdminCardHeader>
          <AdminCardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TextField label="Empresa" value={organization.name} />
              <TextField label="Tipo de atendimento" value={serviceType.title} />
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Situação</p><div className="mt-1"><ColorBadge name={situation.name} color={situation.color} /></div></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">Status</p><div className="mt-1"><ColorBadge name={status.name} color={status.color} /></div></div>
              <TextField label="Prioridade" value={order.priority} />
              <TextField label="Criada em" value={formatDateTime(order.created_at)} />
              <TextField label="Atualizada em" value={formatDateTime(order.updated_at)} />
              <TextField label="Agendada para" value={formatDateTime(order.scheduled_at)} />
              <TextField label="Técnico(s)" value={technicians.map((item: any) => item.full_name).join(", ") || detail?.technician?.full_name} />
              <TextField label="Vendedor(es)" value={sellers.map((item: any) => item.full_name).join(", ") || detail?.seller?.full_name} />
              <TextField label="OS externa" value={order.external_os_number} />
              <TextField label="Tipo da OS" value={order.order_type} />
            </div>
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader><div><h3 className="text-sm font-black text-[#0d1b2e]">Cliente</h3><p className="mt-0.5 text-xs text-[#5a6a82]">Dados vinculados à ordem de serviço.</p></div></AdminCardHeader>
          <AdminCardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TextField label="Nome" value={customer.full_name || customer.trade_name || customer.legal_name} />
              <TextField label="CPF/CNPJ" value={customer.document || customer.cnpj} />
              <TextField label="Telefone" value={customer.phone} />
              <TextField label="WhatsApp" value={customer.whatsapp} />
              <TextField label="E-mail" value={customer.email} />
            </div>
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader><div><h3 className="text-sm font-black text-[#0d1b2e]">Equipamento e atendimento</h3><p className="mt-0.5 text-xs text-[#5a6a82]">Informações técnicas registradas na OS.</p></div></AdminCardHeader>
          <AdminCardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TextField label="Tipo" value={detail?.equipmentType?.name} />
              <TextField label="Marca" value={detail?.equipmentBrand?.name} />
              <TextField label="Modelo" value={detail?.equipmentModel?.name || order.model} />
              <TextField label="Número de série" value={order.serial_number} />
              <TextField label="Acessórios" value={order.accessories} />
              <TextField label="Peças soltas" value={order.loose_parts} />
              <TextField label="Condição" value={order.equipment_condition} />
              <TextField label="Serviço" value={detail?.generalService?.name} />
            </div>
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader><div><h3 className="text-sm font-black text-[#0d1b2e]">Análise da OS</h3><p className="mt-0.5 text-xs text-[#5a6a82]">Descrição, diagnóstico e solução registrados pela empresa.</p></div></AdminCardHeader>
          <AdminCardContent>
            <div className="grid gap-5 lg:grid-cols-2">
              <TextField label="Descrição do problema" value={order.customer_notes} />
              <TextField label="Observações internas" value={order.internal_notes} />
              <TextField label="Diagnóstico" value={order.diagnosis} />
              <TextField label="Solução" value={order.solution} />
              {order.cannot_be_solved && <TextField label="Motivo de não solução" value={order.cannot_be_solved_reason} />}
              {order.cancellation_reason && <TextField label="Motivo do cancelamento" value={order.cancellation_reason} />}
            </div>
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader><div><h3 className="text-sm font-black text-[#0d1b2e]">Endereço e valores</h3><p className="mt-0.5 text-xs text-[#5a6a82]">Dados adicionais vinculados ao atendimento.</p></div></AdminCardHeader>
          <AdminCardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TextField label="Cidade/UF" value={[order.service_city, order.service_state].filter(Boolean).join(" / ")} />
              <TextField label="Endereço" value={[order.service_street, order.service_number, order.service_neighborhood].filter(Boolean).join(", ")} />
              <TextField label="CEP" value={order.service_zip_code} />
              <TextField label="Complemento" value={order.service_complement} />
              <TextField label="Valor estimado" value={formatMoney(order.estimated_price)} />
              <TextField label="Serviço" value={formatMoney(order.service_price)} />
              <TextField label="Peças" value={formatMoney(order.parts_total)} />
              <TextField label="Total" value={formatMoney(order.final_total)} />
            </div>
          </AdminCardContent>
        </AdminCard>

        {statusHistory.length > 0 && <AdminCard>
          <AdminCardHeader><div><h3 className="text-sm font-black text-[#0d1b2e]">Histórico de status</h3><p className="mt-0.5 text-xs text-[#5a6a82]">Movimentações registradas para esta OS.</p></div></AdminCardHeader>
          <div className="overflow-x-auto">
            <table className="min-w-[620px]">
              <thead><tr><th className="text-left">Status</th><th className="text-left">Data</th><th className="text-left">Observação</th></tr></thead>
              <tbody>{statusHistory.map((item: any) => <tr key={item.id}>
                <td className="font-semibold text-[#0d1b2e]">{item.status_name || "—"}</td>
                <td className="whitespace-nowrap text-xs text-[#5a6a82]">{formatDateTime(item.created_at)}</td>
                <td className="text-sm text-[#5a6a82]">{item.notes || "—"}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </AdminCard>}
        </>}
      </div>}
      {detail && !detailQuery.isPending && !detailQuery.isError && <AdminStickyToolbar>
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <BtnSecondary onClick={closeOrder}>Voltar</BtnSecondary>
          {phoneDigits && <div className="flex flex-wrap items-center gap-2">
            <AdminButton variant="secondary" onClick={() => { window.location.href = `tel:+${phoneDigits}`; }}><Phone size={15} /> Ligar</AdminButton>
            <AdminButton variant="secondary" onClick={() => window.open(`https://wa.me/${phoneDigits}`, "_blank", "noopener,noreferrer")}><MessageCircle size={15} /> WhatsApp</AdminButton>
          </div>}
        </div>
      </AdminStickyToolbar>}
    </AdminPage>
  </div>;
}
