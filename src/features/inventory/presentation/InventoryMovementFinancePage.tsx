import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, CalendarClock, Package, Scale } from "lucide-react";
import { buildInstallments, inventoryPurchaseTotal } from "@/features/finance/domain/finance-integration.mjs";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { cn, formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { EmptyState, LoadingState, Toast, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, FCurrencyInput, FInput, FIntegerInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminCard, AdminPage, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { recordInventoryMovementWithDetails, type InventoryPurchaseFinanceResult } from "../infrastructure/inventory-finance.repository";
import {
  getInventoryItem,
  listInventoryItemSuppliers,
} from "../infrastructure/inventory.repository";

type Props = {
  itemId: string;
  onClose: () => void;
  embedded?: boolean;
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
  ncm: string;
  sale_window_days: string;
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
    ncm: "",
    sale_window_days: "",
  };
}

function conversionFactor(item: any) {
  return Math.max(1, Number(item?.conversion_factor ?? 1) || 1);
}

function unitLabel(unit?: string | null) {
  return unit === "cx" ? "cx" : "un";
}

export function InventoryMovementFinancePage({ itemId, onClose, embedded = false }: Props) {
  const { activeOrganizationId, hasPermission, hasModule } = useAuth();
  const organizationId = activeOrganizationId || "";
  const queryClient = useQueryClient();
  const canCreateMovements = hasPermission("inventory.movements.create");
  const canViewCosts = hasPermission("inventory.costs.view");
  const canEditProductNcm = hasPermission("products.update");
  const canViewSuppliers = hasPermission("inventory.suppliers.view") || hasPermission("inventory.suppliers.manage");
  const financeEnabled = hasModule("finance");
  const [form, setForm] = useState<Form>(() => emptyForm());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [initializedItemId, setInitializedItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const dataQuery = useQuery({
    queryKey: [...queryKeys.inventory.all, "movement-finance", organizationId, itemId, canViewCosts, canViewSuppliers],
    enabled: Boolean(organizationId && itemId && canCreateMovements),
    queryFn: async () => {
      const item = await getInventoryItem(itemId, organizationId, canViewCosts);
      if (!item) throw new Error("O item do estoque não foi encontrado.");
      const [suppliers, productResult] = await Promise.all([
        canViewSuppliers ? listInventoryItemSuppliers(itemId, organizationId) : Promise.resolve([]),
        item.product_id
          ? supabase.from("products").select("id,ncm,sale_window_days")
            .eq("organization_id", organizationId).eq("id", item.product_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (productResult.error) throw productResult.error;
      return { item, suppliers, product: productResult.data };
    },
  });

  const item = dataQuery.data?.item as any;
  const canEditNcm = canEditProductNcm || Boolean(item && !item.product_id);
  const productInfo = dataQuery.data?.product as { id: string; ncm: string | null; sale_window_days: number | null } | null | undefined;
  const suppliers = (dataQuery.data?.suppliers || []).filter((supplier: any) => supplier.is_active !== false);

  useEffect(() => {
    if (dataQuery.error) notifyAdmin(`Erro ao carregar movimentação: ${systemErrorMessage(dataQuery.error)}`, "error");
  }, [dataQuery.error]);

  useEffect(() => {
    if (!item || initializedItemId === item.id) return;
    setInitializedItemId(item.id);
    setForm(current => ({
      ...current,
      input_unit: item.unit === "cx" ? "cx" : "un",
      ncm: productInfo?.ncm || "",
      sale_window_days: productInfo?.sale_window_days == null ? "" : String(productInfo.sale_window_days),
    }));
  }, [item, initializedItemId, productInfo]);

  const quantity = Number(form.quantity || 0);
  const cost = Number(form.input_unit_cost || 0);
  const discount = Number(form.discount || 0);
  const freight = Number(form.freight || 0);
  const otherCosts = Number(form.other_costs || 0);
  const purchaseSubtotal = quantity > 0 && Number.isFinite(cost) ? Math.round(quantity * cost * 100) / 100 : 0;
  const purchaseTotal = useMemo(() => inventoryPurchaseTotal({ quantity, unitCost: cost, discount, freight, otherCosts }), [quantity, cost, discount, freight, otherCosts]);
  const inputUnit = form.type === "adjust" ? (item?.unit === "cx" ? "cx" : "un") : form.input_unit;
  const baseQuantity = inputUnit === "cx" ? quantity * conversionFactor(item) : quantity;
  const stockUnit = item?.unit === "cx" ? "cx" : "un";
  const displayFactor = stockUnit === "cx" ? conversionFactor(item) : 1;
  const currentBase = Number(item?.quantity || 0);
  const nextBase = form.type === "adjust" ? baseQuantity : form.type === "in" ? currentBase + baseQuantity : currentBase - baseQuantity;
  const dayCount = form.sale_window_days.trim() ? Number(form.sale_window_days) : null;
  const validDayCount = dayCount !== null && Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 3650;
  const saleDeadline = validDayCount ? new Date(Date.now() + dayCount * 86_400_000).toLocaleDateString("pt-BR") : null;
  const ncmChanged = form.ncm.trim() !== String(productInfo?.ncm || "").trim();
  const changeType = (type: MovementType) => {
    setFieldErrors({});
    setForm(current => ({
      ...emptyForm(item?.unit === "cx" ? "cx" : "un"),
      type, ncm: current.ncm, sale_window_days: current.sale_window_days,
    }));
  };

  const clearFieldError = (field: keyof Form) => {
    setFieldErrors(current => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const save = async () => {
    if (!item || !canCreateMovements || !organizationId) return;
    const movementType = form.type === "in" ? "IN" : form.type === "out" ? "OUT" : "ADJUST";
    const nextErrors: Partial<Record<keyof Form, string>> = {};

    if (!Number.isInteger(quantity) || quantity < 0 || (movementType !== "ADJUST" && quantity <= 0)) {
      nextErrors.quantity = movementType === "ADJUST"
        ? "Informe o novo saldo inteiro e não negativo."
        : "Informe uma quantidade inteira maior que zero.";
    }
    if (movementType === "OUT" && baseQuantity > currentBase) {
      nextErrors.quantity = "A saída ultrapassa o saldo disponível.";
    }
    if (movementType === "ADJUST" && !form.reason.trim()) {
      nextErrors.reason = "Informe a justificativa do ajuste de estoque.";
    }

    if (movementType === "IN") {
      if (ncmChanged && !canEditNcm) nextErrors.ncm = "Você não tem permissão para alterar o NCM.";
      if (ncmChanged && form.ncm.trim() && !/^\d{8}$/.test(form.ncm.trim())) nextErrors.ncm = "O NCM deve ter 8 dígitos.";
      if (dayCount !== null && !validDayCount) nextErrors.sale_window_days = "Informe entre 1 e 3650 dias ou deixe em branco.";
      if (!Number.isFinite(cost) || cost < 0 || form.input_unit_cost.trim() === "") {
        nextErrors.input_unit_cost = "Informe o valor pago por unidade/caixa nesta entrada.";
      }
      if (financeEnabled && !form.supplier_entity_id) {
        nextErrors.supplier_entity_id = "Informe o fornecedor da compra para gerar o pré-lançamento no Financeiro.";
      }
      if (!Number.isFinite(discount) || discount < 0) nextErrors.discount = "Informe um desconto válido e não negativo.";
      if (!Number.isFinite(freight) || freight < 0) nextErrors.freight = "Informe um frete válido e não negativo.";
      if (!Number.isFinite(otherCosts) || otherCosts < 0) nextErrors.other_costs = "Informe outros custos válidos e não negativos.";
      if (financeEnabled && purchaseTotal <= 0 && !nextErrors.input_unit_cost) {
        nextErrors.input_unit_cost = "O total financeiro da compra deve ser maior que zero.";
      }
      if (financeEnabled) {
        const installmentCount = Number(form.installment_count);
        if (!Number.isInteger(installmentCount) || installmentCount < 1 || installmentCount > 60) {
          nextErrors.installment_count = "Informe entre 1 e 60 parcelas.";
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(form.first_due_date) || Number.isNaN(new Date(`${form.first_due_date}T00:00:00`).getTime())) {
          nextErrors.first_due_date = "Informe uma data de primeiro vencimento válida.";
        }
      }
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      if (movementType === "IN" && financeEnabled) {
        const installments = buildInstallments(
          purchaseTotal,
          Math.trunc(Number(form.installment_count) || 0),
          form.first_due_date,
        );
        const result = await recordInventoryMovementWithDetails(organizationId, {
          inventory_item_id: item.id, movement_type: "IN",
          input_quantity: quantity, input_unit: form.input_unit,
          supplier_entity_id: form.supplier_entity_id,
          input_unit_cost: cost,
          purchase_reference: form.purchase_reference.trim() || null,
          notes: form.notes.trim() || null, movement_origin: "purchase",
          ncm: form.ncm.trim() || null, update_ncm: ncmChanged,
          sale_window_days: dayCount ?? 0,
          finance_payload: {
            discount, freight, other_costs: otherCosts,
            document_reference: form.purchase_reference.trim() || null,
            installments,
          },
        }) as InventoryPurchaseFinanceResult;
        setToast({
          msg: `Compra registrada e enviada ao Financeiro para ${result.required_approvals} ${result.required_approvals === 1 ? "aprovação" : "aprovações"}.`,
          type: "success",
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
          queryClient.invalidateQueries({ queryKey: queryKeys.catalog.products() }),
          queryClient.invalidateQueries({ queryKey: queryKeys.finance.all }),
        ]);
        onClose();
        return;
      }

      await recordInventoryMovementWithDetails(organizationId, {
        inventory_item_id: item.id, movement_type: movementType,
        input_quantity: quantity, input_unit: inputUnit,
        supplier_entity_id: movementType === "IN" ? (form.supplier_entity_id || null) : null,
        input_unit_cost: movementType === "IN" ? cost : null,
        purchase_reference: movementType === "IN" ? form.purchase_reference.trim() || null : null,
        reason: form.reason.trim() || (movementType === "IN" ? "Entrada de compra" : movementType === "OUT" ? "Saída manual" : null),
        service_order_id: form.service_order_id.trim() || null,
        movement_origin: movementType === "IN" ? "purchase" : "manual",
        notes: form.notes.trim() || null,
        ncm: movementType === "IN" ? form.ncm.trim() || null : null,
        update_ncm: movementType === "IN" && ncmChanged,
        sale_window_days: movementType === "IN" ? (dayCount ?? 0) : null,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.catalog.products() }),
      ]);
      onClose();
    } catch (error) {
      setToast({ msg: `Erro na movimentação: ${systemErrorMessage(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (!canCreateMovements) return <AdminCard className="p-6"><EmptyState icon={ArrowLeftRight} title="Sem permissão" message="Você não possui permissão para registrar movimentações." /></AdminCard>;
  if (dataQuery.isLoading) return <AdminCard className="p-8"><LoadingState text="Carregando item do estoque..." /></AdminCard>;
  if (dataQuery.error || !item) return <AdminCard className="p-6"><EmptyState icon={Package} title="Item não encontrado" message="Não foi possível carregar este item." /></AdminCard>;


  const typeOptions = [
    { type: "in" as const, label: "Entrada", icon: ArrowDownToLine },
    { type: "out" as const, label: "Saída", icon: ArrowUpFromLine },
    { type: "adjust" as const, label: "Ajuste", icon: Scale },
  ];
  const content = <>
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <div className="space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 p-3">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">Saldo atual</p>
          <p className="mt-1 text-xl font-black tabular-nums text-blue-600">{formatNumber(currentBase / displayFactor)} {stockUnit}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-muted-foreground">Saldo após movimentação</p>
          <p className={cn("mt-1 text-xl font-black tabular-nums", !form.quantity.trim() ? "text-muted-foreground" : nextBase < 0 ? "text-destructive" : "text-emerald-600")}>
            {!form.quantity.trim() ? "—" : formatNumber(nextBase / displayFactor) + " " + stockUnit}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-xs font-bold text-foreground">Tipo de movimentação</p>
        <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-muted/30 p-1">
          {typeOptions.map(option => <button key={option.type} type="button" disabled={saving}
            aria-pressed={form.type === option.type} onClick={() => changeType(option.type)}
            className={cn("flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-bold transition-colors disabled:opacity-50",
              form.type === option.type ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-card hover:text-foreground")}>
            <option.icon size={16} /> {option.label}
          </button>)}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FIntegerInput label={form.type === "adjust" ? "Novo saldo (" + stockUnit + ")" : "Quantidade (" + inputUnit + ")"}
          value={form.quantity} error={fieldErrors.quantity}
          onChange={(event: any) => { clearFieldError("quantity"); setForm(current => ({ ...current, quantity: event.target.value })); }} />
        {form.type !== "adjust" ? <div>
          <label className="mb-1.5 block text-[11px] font-bold text-foreground">Unidade</label>
          <AdminSelect value={form.input_unit} onValueChange={value => setForm(current => ({ ...current, input_unit: value === "cx" ? "cx" : "un" }))}
            options={[{ value: "un", label: "Unidade (un)" }, { value: "cx", label: "Caixa · " + formatNumber(conversionFactor(item)) + " un" }]} ariaLabel="Unidade da movimentação" />
        </div> : <p className="flex items-center text-xs text-muted-foreground">O ajuste define o saldo final do item.</p>}
      </div>
      {inputUnit === "cx" && form.quantity.trim() !== "" && Number.isFinite(baseQuantity) &&
        <p className="text-xs font-semibold text-primary">{formatNumber(quantity)} caixa(s) = {formatNumber(baseQuantity)} unidades</p>}
      {form.type === "in" && <section className="space-y-3 border-t border-border pt-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Dados da entrada</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">Identifique a compra e informe o prazo de venda desta entrada.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold text-foreground">Fornecedor {financeEnabled ? "*" : "(opcional)"}</label>
            <AdminSelect value={form.supplier_entity_id} ariaLabel="Fornecedor"
              onValueChange={value => { clearFieldError("supplier_entity_id"); setForm(current => ({ ...current, supplier_entity_id: value })); }}
              options={[{ value: "", label: "Selecione um fornecedor" }, ...suppliers.map((supplier: any) => ({ value: supplier.id, label: supplier.name }))]} />
            {fieldErrors.supplier_entity_id && <p role="alert" className="mt-1 text-xs text-destructive">{fieldErrors.supplier_entity_id}</p>}
          </div>
          <FCurrencyInput label={"Custo por " + form.input_unit + " *"} value={form.input_unit_cost} error={fieldErrors.input_unit_cost}
            onChange={(event: any) => { clearFieldError("input_unit_cost"); setForm(current => ({ ...current, input_unit_cost: event.target.value })); }} />
          <FInput label="Nota fiscal / referência" value={form.purchase_reference} placeholder="Número da NF-e ou pedido"
            onChange={(event: any) => setForm(current => ({ ...current, purchase_reference: event.target.value }))} />
          <FInput label="NCM (Mercosul)" value={form.ncm} placeholder="8 dígitos, opcional"
            disabled={!canEditNcm} error={fieldErrors.ncm}
            onChange={(event: any) => { clearFieldError("ncm"); setForm(current => ({ ...current, ncm: String(event.target.value).replace(/\D/g, "").slice(0,8) })); }} />
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          NCM é a classificação fiscal do produto, não o número da nota. {canEditNcm ? "Quando alterado, atualiza o cadastro do produto." : "Seu perfil pode consultar, mas não editar."}
        </p>
        <div className="grid items-end gap-3 border-t border-border/70 pt-3 sm:grid-cols-2">
          <FIntegerInput label="Prazo para vender (dias)" placeholder="Sem prazo" value={form.sale_window_days}
            error={fieldErrors.sale_window_days}
            onChange={(event: any) => { clearFieldError("sale_window_days"); setForm(current => ({ ...current, sale_window_days: event.target.value })); }} />
          <div className="flex min-h-[42px] items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
            <CalendarClock size={18} className="text-primary" />
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">Data-limite estimada</p>
              <p className="text-sm font-bold text-foreground">{saleDeadline || "Sem prazo definido"}</p>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {productInfo?.sale_window_days ? "Padrão do produto: " + productInfo.sale_window_days + " dias. " : "Produto sem prazo padrão. "}
          Cada entrada tem seu prazo independente; não é validade nem bloqueio automático de venda.
        </p>
      </section>}
      {form.type === "in" && financeEnabled && <section className="space-y-3 border-t border-border pt-4">
        <div>
          <h3 className="text-sm font-bold text-foreground">Contas a Pagar</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">O título será criado para aprovação no Financeiro.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FIntegerInput label="Parcelas" value={form.installment_count} error={fieldErrors.installment_count}
            onChange={(event: any) => { clearFieldError("installment_count"); setForm(current => ({ ...current, installment_count: event.target.value })); }} />
          <FInput label="Primeiro vencimento" type="date" value={form.first_due_date} error={fieldErrors.first_due_date}
            onChange={(event: any) => { clearFieldError("first_due_date"); setForm(current => ({ ...current, first_due_date: event.target.value })); }} />
        </div>
        <details className="rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-foreground">Desconto, frete e outros custos (opcional)</summary>
          <div className="grid gap-3 pt-3 sm:grid-cols-3">
            <FCurrencyInput label="Desconto" value={form.discount} error={fieldErrors.discount}
              onChange={(event: any) => { clearFieldError("discount"); setForm(current => ({ ...current, discount: event.target.value })); }} />
            <FCurrencyInput label="Frete" value={form.freight} error={fieldErrors.freight}
              onChange={(event: any) => { clearFieldError("freight"); setForm(current => ({ ...current, freight: event.target.value })); }} />
            <FCurrencyInput label="Outros custos" value={form.other_costs} error={fieldErrors.other_costs}
              onChange={(event: any) => { clearFieldError("other_costs"); setForm(current => ({ ...current, other_costs: event.target.value })); }} />
          </div>
        </details>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-primary/5 px-3 py-3">
          <span className="text-xs text-muted-foreground">Subtotal: {formatCurrency(purchaseSubtotal)}</span>
          <strong className="text-base text-primary">Total a pagar: {formatCurrency(purchaseTotal)}</strong>
        </div>
        {!canViewSuppliers && <p role="alert" className="text-xs font-semibold text-amber-700">É necessário visualizar os fornecedores vinculados para registrar compras integradas.</p>}
      </section>}
      {form.type === "in" && !financeEnabled && form.input_unit_cost.trim() && <div className="border-t border-border pt-3 text-sm font-semibold">Total da entrada: {formatCurrency(purchaseSubtotal)}</div>}
      <section className="space-y-3 border-t border-border pt-4">
        {form.type === "adjust" && <FInput label="Justificativa do ajuste *" value={form.reason} error={fieldErrors.reason}
          onChange={(event: any) => { clearFieldError("reason"); setForm(current => ({ ...current, reason: event.target.value })); }}
          placeholder="Por que o saldo será alterado?" />}
        <details className="rounded-lg border border-border px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-foreground">Informações adicionais (opcional)</summary>
          <div className="space-y-3 pt-3">
            {form.type !== "adjust" && <FInput label="Motivo" value={form.reason}
              onChange={(event: any) => setForm(current => ({ ...current, reason: event.target.value }))} placeholder="Ex.: reposição, consumo interno" />}
            {form.type !== "in" && <FInput label="ID interno da OS relacionada" value={form.service_order_id}
              placeholder="Opcional" onChange={(event: any) => setForm(current => ({ ...current, service_order_id: event.target.value }))} />}
            <FTextarea label="Observações" rows={2} value={form.notes}
              onChange={(event: any) => setForm(current => ({ ...current, notes: event.target.value }))} />
          </div>
        </details>
      </section>
    </div>
    <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 border-t border-border bg-card/95 px-3 py-3 backdrop-blur sm:px-4">
      <BtnSecondary onClick={onClose} disabled={saving}>{embedded ? "Voltar" : "Cancelar"}</BtnSecondary>
      <BtnPrimary onClick={() => void save()} loading={saving} loadingText="Registrando..." disabled={saving || !form.quantity.trim()}>
        {form.type === "in" ? "Registrar entrada" : form.type === "out" ? "Registrar saída" : "Salvar ajuste"}
      </BtnPrimary>
    </div>
  </>;

  if (embedded) return <div className="space-y-1">{content}</div>;
  return <AdminPage open onClose={onClose} breadcrumb="Estoque"
    title={`Movimentação — ${item.name}`}
    subtitle={financeEnabled ? "Compras geram pré-lançamentos pendentes no Financeiro; saídas e ajustes permanecem operacionais." : "Registre compras, saídas e ajustes com histórico completo."}
    maxW="max-w-3xl">{content}</AdminPage>;
}
