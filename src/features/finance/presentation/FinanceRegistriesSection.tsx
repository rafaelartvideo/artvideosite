import { useEffect, useMemo } from "react";
import { useAuth } from "@/lib/auth";
import { AdminCard } from "@/shared/ui/admin/AdminLayout";
import type { FinanceRegistrySection } from "../domain/finance.types";
import { FinanceCategoriesSection } from "./FinanceCategoriesSection";
import { FinanceCostCentersSection } from "./FinanceCostCentersSection";
import { FinancePaymentMethodsSection } from "./FinancePaymentMethodsSection";
import { FinanceSettingsSection } from "./FinanceSettingsSection";
import { FinanceSubsectionTabs } from "./FinanceSectionTabs";

const REGISTRIES: Array<{ id: FinanceRegistrySection; label: string; permission: string }> = [
  { id: "categories", label: "Categorias", permission: "finance.categories.manage" },
  { id: "cost-centers", label: "Centros de custo", permission: "finance.cost_centers.manage" },
  { id: "payment-methods", label: "Formas de pagamento", permission: "finance.payment_methods.manage" },
  { id: "settings", label: "Configurações", permission: "finance.settings.manage" },
];

export function FinanceRegistriesSection({
  registry,
  onSelect,
}: {
  registry: FinanceRegistrySection | null;
  onSelect: (registry: FinanceRegistrySection) => void;
}) {
  const { hasPermission } = useAuth();
  const allowed = useMemo(() => REGISTRIES.filter(item => hasPermission(item.permission)), [hasPermission]);
  const selected = allowed.some(item => item.id === registry) ? registry : allowed[0]?.id || null;

  useEffect(() => {
    if (!selected || selected === registry) return;
    onSelect(selected);
  }, [selected, registry, onSelect]);

  if (!selected) return <AdminCard className="p-6"><p className="text-sm text-[#5a6a82]">Você não possui permissão para gerenciar os cadastros financeiros.</p></AdminCard>;

  return <div className="space-y-5">
    <FinanceSubsectionTabs
      value={selected}
      items={allowed.map(item => ({ id: item.id, label: item.label }))}
      onSelect={onSelect}
      ariaLabel="Cadastros financeiros"
    />

    {selected === "categories" && <FinanceCategoriesSection />}
    {selected === "cost-centers" && <FinanceCostCentersSection />}
    {selected === "payment-methods" && <FinancePaymentMethodsSection />}
    {selected === "settings" && <FinanceSettingsSection />}
  </div>;
}
