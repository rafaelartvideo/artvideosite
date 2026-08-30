import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, FileText, RefreshCw, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  createServiceOrderFromQuote,
  deleteQuote,
  findServiceOrderByQuote,
  insertQuoteStatusHistory,
  listOrderStatuses,
  listQuotes,
  listRequestStatuses,
  updateQuoteStatus,
} from "../infrastructure/quotes.repository";
import type { AdminTab } from "@/features/admin-shell/domain/admin.types";
import { initialOrderStatus } from "@/features/orders/domain/order-status";
import {
  AdminPage,
  BtnSecondary,
  PageHeader,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import {
  cn,
  formatCnpj,
  formatCpf,
  formatFoundationDate,
  formatPhone,
} from "@/shared/domain/formatters";
import {
  ConfirmDialog,
  EmptyState,
  LoadingState,
  Toast,
} from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";

export function TabQuotes({ onNavigate }: { onNavigate?: (tab: AdminTab) => void }) {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const quotesQuery = useQuery({
    queryKey: queryKeys.quotes.lists(),
    queryFn: async () => {
      const [quotesResult, statusResult] = await Promise.all([
        listQuotes(),
        listRequestStatuses(),
      ]);
      if (quotesResult.error) throw quotesResult.error;
      if (statusResult.error) throw statusResult.error;
      return {
        quotes: (quotesResult.data || []).map((quote: any) => ({
          ...quote,
          statusName: quote.request_status?.name || "Sem status",
        })),
        statuses: statusResult.data || [],
      };
    },
  });
  const quotes = quotesQuery.data?.quotes ?? [];
  const statuses = quotesQuery.data?.statuses ?? [];
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [detail, setDetail] = useState<any>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!quotesQuery.error) return;
    setToast({
      msg: `Erro ao carregar orçamentos: ${quotesQuery.error instanceof Error ? quotesQuery.error.message : String(quotesQuery.error)}`,
      type: "error",
    });
  }, [quotesQuery.error]);

  const syncQuotes = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.dashboard() }),
    ]);
  };

  const updateStatus = async (id: string, statusId: string) => {
    if (!hasPermission("quotes.update") && !hasPermission("quotes.edit")) return;
    const selectedStatus = statuses.find((status) => status.id === statusId);
    const { error: updateError } = await updateQuoteStatus(id, statusId);
    if (updateError) { console.error("[ADMIN] quote status update error:", updateError); setToast({ msg: `Erro ao atualizar status: ${updateError.message}`, type: "error" }); return; }
    const { error: historyError } = await insertQuoteStatusHistory(id, statusId, user?.id || null);
    if (historyError) console.warn("[ADMIN] quote status history warning:", historyError.message);
    if (detail?.id === id) setDetail({ ...detail, status_id: statusId, statusName: selectedStatus?.name || "Sem status" });
    setToast({ msg: "Status atualizado!", type: "success" });
    await syncQuotes();
  };

  const handleDeleteQuote = async (id: string) => {
    if (!hasPermission("quotes.delete")) return;
    const { error } = await deleteQuote(id);
    if (error) {
      setToast({ msg: `Não foi possível excluir o orçamento: ${error.message}`, type: "error" });
      setDeleteId(null);
      return;
    }
    setToast({ msg: "Orçamento excluído.", type: "success" });
    setDeleteId(null);
    setDetail(null);
    await syncQuotes();
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  const filtered = quotes.filter(q => {
    const customerName = (q.customer as any)?.full_name || "";
    const customerWa = (q.customer as any)?.whatsapp || "";
    const customerDoc = (q.customer as any)?.document || (q.customer as any)?.cnpj || "";
    const customerTradeName = (q.customer as any)?.trade_name || "";
    const protocol = q.protocol || "";
    const matchSearch = !search || customerName.toLowerCase().includes(search.toLowerCase()) || customerTradeName.toLowerCase().includes(search.toLowerCase()) || customerWa.includes(search) || customerDoc.includes(search) || protocol.includes(search);
    const matchStatus = !filterStatus || q.status_id === filterStatus;
    return matchSearch && matchStatus;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedQuotes = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [search, filterStatus]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const InfoRow = ({ label, value }: { label: string; value?: string | null }) =>
    value ? <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-0.5">{label}</p><p className="text-sm font-medium text-[#0d1b2e] whitespace-pre-line">{value}</p></div> : null;

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {deleteId && <ConfirmDialog message="Excluir este orçamento? Esta ação remove o registro da tabela de cotações." onConfirm={() => { void handleDeleteQuote(deleteId); }} onCancel={() => setDeleteId(null)} />}

      <PageHeader title="Orçamentos" subtitle={`${quotes.length} solicitaç${quotes.length !== 1 ? "ões" : "ão"} recebida${quotes.length !== 1 ? "s" : ""}`} actions={
        <button onClick={() => void quotesQuery.refetch()} disabled={quotesQuery.isFetching} className="flex items-center gap-1.5 text-xs text-[#0057e7] font-bold border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5 transition-colors disabled:opacity-60">
          <RefreshCw size={13} className={quotesQuery.isFetching ? "animate-spin" : ""} /> Atualizar
        </button>
      } />

      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#0d1b2e]/8 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por cliente, CPF, protocolo..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
          </div>
          <div className="sm:w-48"><AdminSelect value={filterStatus} onValueChange={value => { setFilterStatus(value); setPage(1); }} options={[{ value: "", label: "Todos os status" }, ...statuses.map(status => ({ value: status.id, label: status.name }))]} className="min-h-9 py-2 text-xs" ariaLabel="Filtrar orçamentos por status" /></div>
        </div>

        {quotesQuery.isPending ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={FileText} title="Nenhuma solicitação" message="As solicitações de orçamento aparecem aqui." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Protocolo</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Tipo / documento</th>
                  <th className="px-4 py-3 text-left">Serviço / Marca</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {pagedQuotes.map(q => (
                  <tr key={q.id} onClick={() => setDetail(q)} className="hover:bg-[#f8fafc]/80 cursor-pointer">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2"><span aria-label={`Cor do status ${(q.request_status as any)?.name || "Sem status"}`} className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: (q.request_status as any)?.color || "transparent" }} /><span className="font-mono text-xs font-bold text-[#0057e7]">{q.protocol || q.id.slice(0, 8)}</span></div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-[#0d1b2e] text-sm">{(q.customer as any)?.customer_type === "PJ" ? ((q.customer as any)?.trade_name || (q.customer as any)?.full_name || "—") : ((q.customer as any)?.full_name || "—")}</p>
                      <p className="text-xs text-[#5a6a82]">{formatPhone((q.customer as any)?.whatsapp)}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-mono text-[#5a6a82]"><span className="font-bold text-[#0057e7]">{(q.customer as any)?.customer_type === "PJ" ? "PJ" : "PF"}</span> · {(q.customer as any)?.customer_type === "PJ" ? ((q.customer as any)?.cnpj ? formatCnpj((q.customer as any).cnpj) : "—") : ((q.customer as any)?.document ? formatCpf((q.customer as any).document) : "—")}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">
                      {(q.service as any)?.title && <div className="font-medium text-[#0d1b2e]">{(q.service as any).title}</div>}
                      {(q.brand as any)?.name && <div>{(q.brand as any).name}</div>}
                      {!(q.service as any)?.title && !(q.brand as any)?.name && "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      {(hasPermission("quotes.update") || hasPermission("quotes.edit")) && <div className="w-36" onClick={event => event.stopPropagation()}><AdminSelect value={q.status_id || ""} onValueChange={value => updateStatus(q.id, value)} options={statuses.map(status => ({ value: status.id, label: status.name }))} className="min-h-8 py-1 text-xs font-bold" ariaLabel={`Status do orçamento ${q.protocol || ""}`} /></div>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{fmtDate(q.created_at)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setDetail(q)} className="flex items-center gap-1 text-xs font-bold text-[#0057e7] hover:underline ml-auto">Ver detalhes</button>
                        {hasPermission("quotes.delete") && (
                          <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteId(q.id); }} title="Excluir orçamento" aria-label="Excluir orçamento" className="p-1.5 text-[#5a6a82] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          page={safePage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, totalPages)))}
          onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
        />
      </div>

      {/* Quote Detail Page */}
      {detail && (
        <AdminPage open={true} onClose={() => setDetail(null)} breadcrumb={`Orçamentos > ${detail.protocol || detail.id.slice(0, 8)}`} title={detail.protocol || `Orçamento #${detail.id.slice(0, 8)}`} subtitle="Detalhes da solicitação de orçamento">
            <div className="space-y-4">
              <Section title="Dados pessoais / empresariais">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Tipo" value={(detail.customer as any)?.customer_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"} />
                  {(detail.customer as any)?.customer_type === "PJ" ? <>
                    <InfoRow label="Nome fantasia" value={(detail.customer as any)?.trade_name || (detail.customer as any)?.full_name} />
                    <InfoRow label="Razão social" value={(detail.customer as any)?.legal_name} />
                    <InfoRow label="CNPJ" value={(detail.customer as any)?.cnpj ? formatCnpj((detail.customer as any).cnpj) : null} />
                    <InfoRow label="Inscrição estadual" value={(detail.customer as any)?.state_registration} />
                    <InfoRow label="Data de fundação" value={(detail.customer as any)?.foundation_date ? new Date((detail.customer as any).foundation_date).toLocaleDateString("pt-BR") : null} />
                  </> : <InfoRow label="Nome completo" value={(detail.customer as any)?.full_name} />}
                  {(detail.customer as any)?.customer_type !== "PJ" && <InfoRow label="CPF" value={(detail.customer as any)?.document ? formatCpf((detail.customer as any).document) : null} />}
                  <InfoRow label="E-mail" value={(detail.customer as any)?.email} />
                  <InfoRow label="Telefone" value={formatPhone((detail.customer as any)?.phone)} />
                  <InfoRow label="WhatsApp" value={formatPhone((detail.customer as any)?.whatsapp)} />
                </div>
              </Section>
              <Section title="Endereço">
                <div className="grid sm:grid-cols-2 gap-3">
                  {(["zip_code", "street", "number", "complement", "neighborhood", "city", "state", "reference"] as const).map(key => {
                    const address = ((detail.customer as any)?.addresses || []).find((item: Address) => item.is_default) || (detail.customer as any)?.addresses?.[0];
                    const labels: Record<string, string> = { zip_code: "CEP", street: "Rua", number: "Número", complement: "Complemento", neighborhood: "Bairro", city: "Cidade", state: "Estado", reference: "Referência" };
                    return address?.[key] ? <InfoRow key={key} label={labels[key]} value={address[key]} /> : null;
                  })}
                </div>
              </Section>
              <Section title="Dados do orçamento">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Protocolo" value={detail.protocol || detail.id} />
                  <InfoRow label="Serviço" value={(detail.service as any)?.title} />
                  <InfoRow label="Marca" value={(detail.brand as any)?.name} />
                  <InfoRow label="Produto" value={(detail.product as any)?.name} />
                  <InfoRow label="Data de criação" value={fmtDate(detail.created_at)} />
                  <InfoRow label="Atualizado em" value={fmtDate(detail.updated_at)} />
                  <InfoRow label="Valor estimado" value={detail.estimated_price == null ? null : `R$ ${Number(detail.estimated_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                  <InfoRow label="Valor final" value={detail.final_price == null ? null : `R$ ${Number(detail.final_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
                </div>
                {detail.customer_message && <div className="mt-4"><InfoRow label="Mensagem do cliente" value={detail.customer_message} /></div>}
              </Section>
            </div>
            <div className="sticky bottom-0 -mx-5 mt-5 border-t border-[#0d1b2e]/8 bg-white px-5 py-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {(hasPermission("quotes.update") || hasPermission("quotes.edit")) && <div className="min-w-36"><AdminSelect value={detail.status_id || ""} onValueChange={value => updateStatus(detail.id, value)} options={statuses.map(status => ({ value: status.id, label: status.name }))} className="py-2 text-sm" ariaLabel="Alterar status do orçamento" /></div>}
                {hasPermission("quotes.delete") && <button type="button" onClick={() => setDeleteId(detail.id)} className="flex items-center gap-2 whitespace-nowrap bg-red-600 text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-red-700 transition-colors"><Trash2 size={13} /> Excluir</button>}
                {hasPermission("quotes.convert") && <button onClick={async () => {
                if (!detail) return;
                if (!hasPermission("quotes.convert")) { setToast({ msg: "Você não possui permissão para converter orçamentos.", type: "error" }); return; }
                const { data: existing } = await findServiceOrderByQuote(detail.id);
                if (existing) { setToast({ msg: `OS ${existing.os_number || existing.id.slice(0,8)} já existe para este orçamento.`, type: "error" }); return; }
                const { data: availableStatuses, error: statusError } = await listOrderStatuses();
                const status = initialOrderStatus(availableStatuses || []);
                if (statusError || !status?.id) { setToast({ msg: "Não foi possível identificar um status inicial válido para a OS.", type: "error" }); return; }
                const { error } = await createServiceOrderFromQuote({
                  service_id: detail.service_id, quote_request_id: detail.id,
                  customer_id: detail.customer_id, status_id: status.id,
                  customer_notes: detail.customer_message || null,
                });
                if (error) { setToast({ msg: `Erro ao criar OS: ${error.message}`, type: "error" }); return; }
                setDetail(null);
                setToast({ msg: "OS criada com sucesso e vinculada ao orçamento.", type: "success" });
                if (onNavigate) setTimeout(() => onNavigate("orders"), 1200);
                }} className="flex items-center gap-2 whitespace-nowrap bg-[#0057e7] text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#0046c0] transition-colors">
                  <ClipboardList size={13} /> Converter em OS
                </button>}
              </div>
              <BtnSecondary onClick={() => setDetail(null)}>Fechar</BtnSecondary>
            </div>
        </AdminPage>
      )}
    </div>
  );
}
