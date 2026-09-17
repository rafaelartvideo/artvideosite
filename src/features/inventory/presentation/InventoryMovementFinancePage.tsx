import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Package } from "lucide-react";
import { buildInstallments, inventoryPurchaseTotal } from "@/features/finance/domain/finance-integration.mjs";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import { formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, FCurrencyInput, FInput, FIntegerInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminCard, AdminPage, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { recordInventoryPurchaseWithFinance } from "../infrastructure/inventory-finance.repository";
import {
  getInventoryItem,
  listInventoryItemSuppliers,
  recordInventoryMovement,
} from "../infrastructure/inventory.repository";

type Props = {
  itemId: string;
  onClose: () => void;
};

type MovementType = "in" | "out" | "adjust";

type Form = {
  type: MovementType;
  quantity: string;
  input_unit: "un" | "cx";
  supplier_entity_id: string;
  input_unit_cost: string;
  purchase_reference: string;
  discount: string;
  freight: string;
  other_costs: string;
  installment_count: string;
  first_due_date: string;
  reason: string;
  notes: string;
  service_order_id: string;
};

function todayIsoDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function emptyForm(unit: "un" | "cx" = "un"): Form {
  return {
    type: "in",
    quantity: "",
    input_unit: unit,
    supplier_entity_id: "",
    input_unit_cost: "",
    purchase_reference: "",
    discount: "0",
    freight: "0",
    other_costs: "0",
    installment_count: "1",
    first_due_date: todayIsoDate(),
    reason: "",
    notes: "",
    service_order_id: "",
  };
}

function conversionFactor(item: any) {
  return Math.max(1, Number(item?.conversion_factor ?? 1) || 1);
}

function unitLabel(unit?: string | null) {
  return unit === "cx" ? "cx" : "un";
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String((error as any).message || "Erro desconhecido");
  return error instanceof Error ? error.message : String(error || "Erro desconhecido");
}

export function InventoryMovementFinancePage({ itemId, onClose }: Props) {
  const { activeOrganizationId, hasPermission, hasModule } = useAuth();
  const organizationId = activeOrganizationId || "";
  const queryClient = useQueryClient();
  const canCreateMovements = hasPermission("inventory.movements.create");
  const canViewCosts = hasPermission("inventory.costs.view");
  const canViewSuppliers = hasPermission("inventory.suppliers.view") || hasPermission("inventory.suppliers.manage");
  const financeEnabled = hasModule("finance");
  const [form, setForm] = useState<Form>(() => emptyForm());
  const [initializedItemId, setInitializedItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const dataQuery = useQuery({
    queryKey: [...queryKeys.inventory.all, "movement-finance", organizationId, itemId, canViewCosts, canViewSuppliers],
    enabled: Boolean(organizationId && itemId && canCreateMovements),
    queryFn: async () => {
      const item = await getInventoryItem(itemId, organizationId, canViewCosts);
      if (!item) throw new Error("O item do estoque não foi encontrado.");
      const suppliers = canViewSuppliers ? await listInventoryItemSuppliers(itemId, organizationId) : [];
      return { item, suppliers };
    },
  });

  const item = dataQuery.data?.item as any;
  const suppliers = (dataQuery.data?.suppliers || []).filter((supplier: any) => supplier.is_active !== false);

  useEffect(() => {
    if (!item || initializedItemId === item.id) return;
    setInitializedItemId(item.id);
    setForm(current => ({ ...current, input_unit: item.unit === "cx" ? "cx" : "un" }));
  }, [item, initializedItemId]);

  const quantity = Number(form.quantity || 0);
  const cost = Number(form.input_unit_cost || 0);
  const discount = Number(form.discount || 0);
  const freight = Number(form.freight || 0);
  const otherCosts = Number(form.other_costs || 0);
  const purchaseSubtotal = quantity > 0 && Number.isFinite(cost) ? Math.round(quantity * cost * 100) / 100 : 0;
  const purchaseTotal = useMemo(() => inventoryPurchaseTotal({ quantity, unitCost: cost, discount, freight, otherCosts }), [quantity, cost, discount, freight, otherCosts]);
  const inputUnit = form.type === "adjust" ? (item?.unit === "cx" ? "cx" : "un") : form.input_unit;
  const baseQuantity = inputUnit === "cx" ? quantity * conversionFactor(item) : quantity;
  const changeType = (type: MovementType) => {
    setForm(emptyForm(type === "adjust" ? (item?.unit === "cx" ? "cx" : "un") : (item?.unit === "cx" ? "cx" : "un")));
    setForm(current => ({ ...current, type }));
  };

  const save = async () => {
    if (!item || !canCreateMovements || !organizationId) return;
    const movementType = form.type === "in" ? "IN" : form.type === "out" ? "OUT" : "ADJUST";
    if (!Number.isInteger(quantity) || quantity < 0 || (movementType !== "ADJUST" && quantity <= 0)) {
      setToast({ msg: movementType === "ADJUST" ? "Informe o novo saldo inteiro e não negativo." : "Informe uma quantidade inteira maior que zero.", type: "error" });
      return;
    }
    if (movementType === "ADJUST" && !form.reason.trim()) {
      setToast({ msg: "Informe a justificativa do ajuste de estoque.", type: "error" });
      return;
    }

    if (movementType === "IN") {
      if (!Number.isFinite(cost) || cost < 0 || form.input_unit_cost.trim() === "") {
        setToast({ msg: "Informe o valor pago por unidade/caixa nesta entrada.", type: "error" });
        return;
      }
      if (financeEnabled && !form.supplier_entity_id) {
        setToast({ msg: "Informe o fornecedor da compra para gerar o pré-lançamento no Financeiro.", type: "error" });
        return;
      }
      if ([discount, freight, otherCosts].some(value => !Number.isFinite(value) || value < 0)) {
        setToast({ msg: "Desconto, frete e outros custos devem ser valores não negativos.", type: "error" });
        return;
      }
      if (financeEnabled && purchaseTotal <= 0) {
        setToast({ msg: "O total financeiro da compra deve ser maior que zero.", type: "error" });
        return;
      }
    }

    setSaving(true);
    try {
      if (movementType === "IN" && financeEnabled) {
        const installments = buildInstallments(
          purchaseTotal,
          Math.trunc(Number(form.installment_count) || 0),
          form.first_due_date,
        );
        const result = await recordInventoryPurchaseWithFinance(organizationId, {
          inventory_item_id: item.id,
          input_quantity: quantity,
          input_unit: form.input_unit,
          supplier_entity_id: form.supplier_entity_id,
          input_unit_cost: cost,
          purchase_reference: form.purchase_reference.trim() || null,
          notes: form.notes.trim() || null,
          discount,
          freight,
          other_costs: otherCosts,
          document_reference: form.purchase_reference.trim() || null,
          installments,
        });
        setToast({
          msg: `Compra registrada e enviada ao Financeiro para ${result.required_approvals} ${result.required_approvals === 1 ? "aprovação" : "aprovações"}.`,
          type: "success",
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
          queryClient.invalidateQueries({ queryKey: queryKeys.finance.all }),
        ]);
        onClose();
        return;
      }

      await recordInventoryMovement({
        inventory_item_id: item.id,
        movement_type: movementType,
        input_quantity: quantity,
        input_unit: inputUnit,
        supplier_entity_id: movementType === "IN" ? (form.supplier_entity_id || null) : null,
        input_unit_cost: movementType === "IN" ? cost : null,
        purchase_reference: movementType === "IN" ? form.purchase_reference : null,
        reason: form.reason.trim() || (movementType === "IN" ? "Entrada de compra" : movementType === "OUT" ? "Saída manual" : null),
        service_order_id: form.service_order_id.trim() || null,
        movement_origin: movementType === "IN" ? "purchase" : "manual",
        notes: form.notes.trim() || null,
      }, organizationId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
      onClose();
    } catch (error) {
      setToast({ msg: `Erro na movimentação: ${errorMessage(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (!canCreateMovements) return <AdminCard className="p-6"><EmptyState icon={ArrowLeftRight} title="Sem permissão" message="Você não possui permissão para registrar movimentações." /></AdminCard>;
  if (dataQuery.isLoading) return <AdminCard className="p-8"><LoadingState text="Carregando item do estoque..." /></AdminCard>;
  if (dataQuery.error || !item) return <AdminCard className="p-6"><EmptyState icon={Package} title="Item não encontrado" message={dataQuery.error instanceof Error ? dataQuery.error.message : "Não foi possível carregar este item."} /></AdminCard>;

  return <AdminPage
    open
    onClose={onClose}
    breadcrumb="Estoque"
    title={`Movimentação — ${item.name}`}
    subtitle={financeEnabled ? "Compras geram pré-lançamentos pendentes no Financeiro; saídas e ajustes permanecem operacionais." : "Registre compras, saídas e ajustes com histórico completo."}
    maxW="max-w-3xl"
  >
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <div className="space-y-5 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <AdminCard className="bg-[#f8fafc] p-4 shadow-none"><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Quantidade atual</p><p className="mt-1 text-lg font-black">{formatNumber(Number(item.quantity ?? 0))} {unitLabel(item.unit)}</p></AdminCard>
        <AdminCard className="bg-[#f8fafc] p-4 shadow-none"><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Integração financeira</p><p className="mt-1 text-sm font-bold">{financeEnabled ? "Ativa para compras" : "Módulo Financeiro desativado"}</p></AdminCard>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Tipo de movimentação</label><AdminSelect value={form.type} onValueChange={value => changeType(value === "out" ? "out" : value === "adjust" ? "adjust" : "in")} options={[{ value: "in", label: "Entrada / Compra" }, { value: "out", label: "Saída" }, { value: "adjust", label: "Ajuste de saldo" }]} ariaLabel="Tipo de movimentação" /></div>
        {form.type !== "adjust" && <div><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Unidade da movimentação</label><AdminSelect value={form.input_unit} onValueChange={value => setForm(current => ({ ...current, input_unit: value === "cx" ? "cx" : "un" }))} options={[{ value: "un", label: "Unidade (un)" }, { value: "cx", label: `Caixa (cx) · ${formatNumber(conversionFactor(item))} un/cx` }]} ariaLabel="Unidade da movimentação" /></div>}
      </div>

      <FIntegerInput label={form.type === "adjust" ? `Novo saldo (${unitLabel(item.unit)})` : `Quantidade (${inputUnit})`} value={form.quantity} onChange={(event: any) => setForm(current => ({ ...current, quantity: event.target.value }))} />
      {inputUnit === "cx" && form.quantity !== "" && quantity >= 0 && <AdminCard className="border-blue-100 bg-blue-50 p-3 shadow-none"><p className="text-sm font-black text-blue-800">{formatNumber(quantity)} cx × {formatNumber(conversionFactor(item))} = {formatNumber(baseQuantity)} un</p></AdminCard>}

      {form.type === "in" && <Section title="Compra">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Fornecedor {financeEnabled ? "*" : ""}</label><AdminSelect value={form.supplier_entity_id} onValueChange={value => setForm(current => ({ ...current, supplier_entity_id: value }))} options={[{ value: "", label: financeEnabled ? "Selecione" : "Nenhum" }, ...suppliers.map((supplier: any) => ({ value: supplier.id, label: supplier.name }))]} ariaLabel="Fornecedor da entrada" /></div>
            <FCurrencyInput label={`Valor pago por ${form.input_unit} *`} value={form.input_unit_cost} onChange={(event: any) => setForm(current => ({ ...current, input_unit_cost: event.target.value }))} />
            <div className="sm:col-span-2"><FInput label="Documento / referência" value={form.purchase_reference} onChange={(event: any) => setForm(current => ({ ...current, purchase_reference: event.target.value }))} placeholder="NF, pedido, cupom, referência..." /></div>
          </div>

          {financeEnabled && <div className="space-y-4 border-t border-[#0d1b2e]/8 pt-4">
            <div><p className="text-xs font-black uppercase tracking-[0.12em] text-[#0d1b2e]">Pré-lançamento financeiro</p><p className="mt-1 text-xs text-[#5a6a82]">Os dados abaixo sobem preenchidos para Contas a Pagar e ainda precisarão ser aprovados no Financeiro.</p></div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FCurrencyInput label="Desconto" value={form.discount} onChange={(event: any) => setForm(current => ({ ...current, discount: event.target.value }))} />
              <FCurrencyInput label="Frete" value={form.freight} onChange={(event: any) => setForm(current => ({ ...current, freight: event.target.value }))} />
              <FCurrencyInput label="Outros custos" value={form.other_costs} onChange={(event: any) => setForm(current => ({ ...current, other_costs: event.target.value }))} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FIntegerInput label="Parcelas" value={form.installment_count} onChange={(event: any) => setForm(current => ({ ...current, installment_count: event.target.value }))} />
              <FInput label="Primeiro vencimento" type="date" value={form.first_due_date} onChange={(event: any) => setForm(current => ({ ...current, first_due_date: event.target.value }))} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <AdminCard className="bg-[#f8fafc] p-3 shadow-none"><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Subtotal dos itens</p><p className="mt-1 text-base font-black text-[#0d1b2e]">{formatCurrency(purchaseSubtotal)}</p></AdminCard>
              <AdminCard className="border-blue-100 bg-blue-50 p-3 shadow-none"><p className="text-[10px] font-bold uppercase text-blue-700">Total do Contas a Pagar</p><p className="mt-1 text-base font-black text-blue-900">{formatCurrency(purchaseTotal)}</p></AdminCard>
            </div>
          </div>}

          {!financeEnabled && quantity > 0 && form.input_unit_cost !== "" && <AdminCard className="bg-[#f8fafc] p-3 shadow-none"><p className="text-xs text-[#5a6a82]">Total desta entrada</p><p className="mt-1 text-base font-black text-[#0d1b2e]">{formatCurrency(purchaseSubtotal)}</p></AdminCard>}
          {financeEnabled && !canViewSuppliers && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">Para registrar uma compra integrada, seu perfil também precisa visualizar os fornecedores vinculados ao item.</div>}
        </div>
      </Section>}

      <FInput label={form.type === "adjust" ? "Justificativa *" : "Motivo"} value={form.reason} onChange={(event: any) => setForm(current => ({ ...current, reason: event.target.value }))} placeholder={form.type === "adjust" ? "Explique por que o saldo foi ajustado" : "Opcional"} />
      <FTextarea label="Observações" value={form.notes} onChange={(event: any) => setForm(current => ({ ...current, notes: event.target.value }))} rows={3} />
      {form.type !== "in" && <FInput label="OS relacionada (opcional)" value={form.service_order_id} onChange={(event: any) => setForm(current => ({ ...current, service_order_id: event.target.value }))} />}
    </div>
    <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5">
      <BtnSecondary onClick={onClose} disabled={saving}>Cancelar</BtnSecondary>
      <BtnPrimary onClick={() => void save()} loading={saving} loadingText="Registrando...">Registrar</BtnPrimary>
    </div>
  </AdminPage>;
}
