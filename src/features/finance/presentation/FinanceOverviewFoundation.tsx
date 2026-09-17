import { CreditCard, Landmark, Settings2, Tags, Target } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AdminCard } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import type { FinancialEntryType } from "../domain/finance.types";
import { FinancePendingApprovals } from "./FinancePendingApprovals";

function ReadinessCard({ title, value, detail, icon: Icon }: { title: string; value: string | number; detail: string; icon: typeof Landmark }) {
  return <AdminCard className="p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf1ff] text-[#0057e7]"><Icon size={19} /></div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-[#7b899c]">{title}</p>
        <p className="mt-1 break-words text-xl font-black text-[#0d1b2e]">{value}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#5a6a82]">{detail}</p>
      </div>
    </div>
  </AdminCard>;
}

export function FinanceOverviewFoundation({ onSelectEntry }: { onSelectEntry: (type: FinancialEntryType, id: string) => void }) {
  const { hasPermission } = useAuth();
  const finance = useFinanceFoundation();
  const canViewAccounts = hasPermission("finance.accounts.view") || hasPermission("finance.accounts.manage");
  const loading = finance.categoriesQuery.isLoading
    || finance.costCentersQuery.isLoading
    || finance.paymentMethodsQuery.isLoading
    || finance.settingsQuery.isLoading
    || (canViewAccounts && finance.accountsQuery.isLoading);

  if (loading) return <AdminCard className="p-8"><LoadingState text="Carregando fundação financeira..." /></AdminCard>;

  const accounts = finance.accountsQuery.data || [];
  const categories = finance.categoriesQuery.data || [];
  const costCenters = finance.costCentersQuery.data || [];
  const paymentMethods = finance.paymentMethodsQuery.data || [];
  const settings = finance.settingsQuery.data;
  const errors = [
    canViewAccounts ? finance.accountsQuery.error : null,
    finance.categoriesQuery.error,
    finance.costCentersQuery.error,
    finance.paymentMethodsQuery.error,
    finance.settingsQuery.error,
  ].filter(Boolean);

  return <div className="space-y-4">
    <div>
      <h2 className="text-lg font-black text-[#0d1b2e]">Visão geral financeira</h2>
      <p className="mt-1 text-xs leading-relaxed text-[#5a6a82]">Acompanhe pendências de aprovação e a estrutura configurada para a operação financeira.</p>
    </div>

    {errors.length > 0 && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {errors[0] instanceof Error ? errors[0].message : "Não foi possível carregar uma parte da configuração financeira."}
    </div>}

    <FinancePendingApprovals onSelectEntry={onSelectEntry} />

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <ReadinessCard title="Caixas e contas" value={canViewAccounts ? accounts.filter(item => item.is_active).length : "Sem acesso"} detail="Contas financeiras ativas configuradas." icon={Landmark} />
      <ReadinessCard title="Categorias" value={categories.filter(item => item.is_active).length} detail="Categorias de receita e despesa ativas." icon={Tags} />
      <ReadinessCard title="Centros de custo" value={costCenters.filter(item => item.is_active).length} detail="Centros de custo disponíveis para rateios." icon={Target} />
      <ReadinessCard title="Formas de pagamento" value={paymentMethods.filter(item => item.is_active).length} detail="Formas de pagamento ativas, com taxas e prazos configuráveis." icon={CreditCard} />
      <ReadinessCard title="Limite de 2 aprovações" value={settings?.second_approval_threshold == null ? "Não definido" : settings.second_approval_threshold.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} detail="Contas a pagar acima desse valor exigem duas aprovações distintas." icon={Settings2} />
      <ReadinessCard title="Sessão de caixa" value={settings?.cash_session_enabled ? "Ativada" : "Desativada"} detail="Controle opcional de abertura e fechamento do caixa físico." icon={Landmark} />
    </div>
  </div>;
}
