import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ClipboardList,
  Clock,
  FileText,
  Package,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { cn, formatDateOnly } from "@/shared/domain/formatters";
import { LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, AdminCardHeader, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { loadDashboardOverview } from "../infrastructure/dashboard.repository";
import { queryKeys } from "@/infrastructure/query/query-keys";

export function TabDashboard() {
  const dashboardQuery = useQuery({
    queryKey: queryKeys.admin.dashboard(),
    queryFn: async () => {
      const [qAll, oAll, sActive, pActive, rQuotes, rOrders] = await loadDashboardOverview();
      const quotes = qAll.data || [];
      const orders = oAll.data || [];
      return {
        stats: {
          quotesPending: quotes.filter((q: any) => ((q.request_status as any)?.name || "").toLowerCase().includes("pend")).length,
          quotesAnalysis: quotes.filter((q: any) => { const n = ((q.request_status as any)?.name || "").toLowerCase(); return n.includes("anál") || n.includes("analise") || n.includes("análise"); }).length,
          ordersActive: orders.filter((o: any) => { const n = ((o.order_status as any)?.name || "").toLowerCase(); return n.includes("manutenç") || n.includes("andamento") || n.includes("execuç"); }).length,
          ordersWaiting: orders.filter((o: any) => { const n = ((o.order_status as any)?.name || "").toLowerCase(); return n.includes("aguard") || n.includes("client"); }).length,
          servicesActive: sActive.count || 0,
          productsActive: pActive.count || 0,
        },
        recentQuotes: rQuotes.data || [],
        recentOrders: rOrders.data || [],
      };
    },
  });
  const stats = dashboardQuery.data?.stats ?? { quotesPending: 0, quotesAnalysis: 0, ordersActive: 0, ordersWaiting: 0, servicesActive: 0, productsActive: 0 };
  const recentQuotes = dashboardQuery.data?.recentQuotes ?? [];
  const recentOrders = dashboardQuery.data?.recentOrders ?? [];

  const cards = [
    { label: "Orçamentos pendentes", val: stats.quotesPending, icon: FileText, color: "text-amber-600 bg-amber-50 border-amber-100" },
    { label: "Orçamentos em análise", val: stats.quotesAnalysis, icon: Activity, color: "text-blue-600 bg-blue-50 border-blue-100" },
    { label: "OS em andamento", val: stats.ordersActive, icon: ClipboardList, color: "text-indigo-600 bg-indigo-50 border-indigo-100" },
    { label: "OS aguardando cliente", val: stats.ordersWaiting, icon: Clock, color: "text-orange-600 bg-orange-50 border-orange-100" },
    { label: "Serviços ativos", val: stats.servicesActive, icon: Wrench, color: "text-emerald-600 bg-emerald-50 border-emerald-100" },
    { label: "Produtos ativos", val: stats.productsActive, icon: Package, color: "text-purple-600 bg-purple-50 border-purple-100" },
  ];

  const fmtDate = (value?: string | null) => formatDateOnly(value, "—");

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Visão geral do sistema em tempo real" actions={
        <AdminButton variant="secondary" onClick={() => dashboardQuery.refetch()} loading={dashboardQuery.isFetching} loadingText="Atualizando..." className="border-[#0057e7]/30 text-[#0057e7] hover:bg-[#0057e7]/5 text-xs">
          <RefreshCw size={13} /> Atualizar
        </AdminButton>
      } />

      {dashboardQuery.isPending ? <LoadingState /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <AdminCard key={c.label} className="flex items-center justify-between gap-3 p-5">
                  <div>
                    <p className="text-xs font-semibold text-[#5a6a82] mb-1 leading-tight">{c.label}</p>
                    <p className="text-3xl font-black text-[#0d1b2e]" style={{ fontFamily: "'Barlow Condensed', sans-serif" }}>{c.val}</p>
                  </div>
                  <div className={cn("p-3 rounded-xl border flex-shrink-0", c.color)}>
                    <Icon size={22} />
                  </div>
                </AdminCard>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-2 gap-5">
            <AdminCard>
              <AdminCardHeader>
                <h3 className="font-bold text-[#0d1b2e] text-sm">Orçamentos Recentes</h3>
                <FileText size={16} className="text-[#5a6a82]" />
              </AdminCardHeader>
              {recentQuotes.length === 0 ? (
                <p className="text-sm text-[#5a6a82] text-center py-8">Nenhuma solicitação.</p>
              ) : (
                <div className="divide-y divide-[#0d1b2e]/5">
                  {recentQuotes.map(q => (
                    <div key={q.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-[#0d1b2e] text-sm truncate">{(q.customer as any)?.full_name || "Cliente"}</p>
                        <p className="text-xs text-[#5a6a82] truncate">{(q.service as any)?.title || (q.brand as any)?.name || q.protocol || "—"}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <StatusBadge status={(q.request_status as any)?.name || "Pendente"} />
                        <p className="text-[10px] text-[#5a6a82] mt-1">{fmtDate(q.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>

            <AdminCard>
              <AdminCardHeader>
                <h3 className="font-bold text-[#0d1b2e] text-sm">Ordens de Serviço Recentes</h3>
                <ClipboardList size={16} className="text-[#5a6a82]" />
              </AdminCardHeader>
              {recentOrders.length === 0 ? (
                <p className="text-sm text-[#5a6a82] text-center py-8">Nenhuma OS cadastrada.</p>
              ) : (
                <div className="divide-y divide-[#0d1b2e]/5">
                  {recentOrders.map(o => (
                    <div key={o.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-[#0057e7] text-sm">#{typeof o.id === "string" ? o.id.slice(0, 8) : o.id}</p>
                        <p className="text-xs text-[#5a6a82] truncate">{(o.customer as any)?.full_name || (o.service as any)?.title || "Assistência Técnica"}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <StatusBadge status={(o.order_status as any)?.name || "Em andamento"} color={(o.order_status as any)?.color} />
                        <p className="text-[10px] text-[#5a6a82] mt-1">{fmtDate(o.updated_at || o.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>
          </div>
        </>
      )}
    </div>
  );
}
