import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, CalendarClock, CircleHelp, Minus, Package, Plus, Scale } from "lucide-react";
import { buildInstallments, inventoryPurchaseTotal } from "@/features/finance/domain/finance-integration.mjs";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { cn, formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { EmptyState, LoadingState, Toast, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { AdminFieldLabel, AdminSelect, FCurrencyInput, FInput, FIntegerInput, FTextarea, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminCard, AdminPage, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { Popover, PopoverTrigger, PopoverContent } from "@/shared/ui/primitives/popover";
import { SupplierQuickCreateDialog } from "@/features/registrations/presentation/SupplierQuickCreateDialog";
import { recordInventoryMovementWithDetails, type InventoryPurchaseFinanceResult } from "../infrastructure/inventory-finance.repository";
import {
  getInventoryItem,
  listInventoryItemSuppliers,
  syncInventoryItemSuppliers,
  type InventorySupplier,
} from "../infrastructure/inventory.repository";

type Props = {
  itemId: string;
  onClose: () => void;
  embedded?: boolean;
  backToDetails?: boolean;
  onSupplierEditorChange?: (active: boolean) => void;
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

export function InventoryMovementFinancePage({ itemId, onClose, embedded = false, backToDetails = false, onSupplierEditorChange }: Props) {
  const { activeOrganizationId, hasPermission, hasModule } = useAuth();
  const organizationId = activeOrganizationId || "";
  const queryClient = useQueryClient();
  const canCreateMovements = hasPermission("inventory.movements.create");
  const canViewCosts = hasPermission("inventory.costs.view");
  const canEditProductNcm = hasPermission("products.update");
  const canViewSuppliers = hasPermission("inventory.suppliers.view") || hasPermission("inventory.suppliers.manage");
  const canAddSupplier = hasPermission("customers.create") && hasPermission("inventory.suppliers.manage");
  const financeEnabled = hasModule("finance");
  const [form, setForm] = useState<Form>(() => emptyForm());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [initializedItemId, setInitializedItemId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [linkingSupplier, setLinkingSupplier] = useState(false);
  const [newSuppliers, setNewSuppliers] = useState<InventorySupplier[]>([]);
  const [saleWindowMode, setSaleWindowMode] = useState<"default" | "custom">("default");

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
  const suppliers = [...(dataQuery.data?.suppliers || []), ...newSuppliers.filter(supplier => !(dataQuery.data?.suppliers || []).some((item: InventorySupplier) => item.id === supplier.id))]
    .filter((supplier: InventorySupplier) => supplier.is_active !== false);

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
      sale_window_days: "",
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
  const dayCount = saleWindowMode === "custom" ? (form.sale_window_days.trim() ? Number(form.sale_window_days) : null) : productInfo?.sale_window_days ?? null;
  const validDayCount = dayCount !== null && Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 3650;
  const saleDeadline = validDayCount ? new Date(Date.now() + dayCount * 86_400_000).toLocaleDateString("pt-BR") : null;
  const saleDaysToSave = saleWindowMode === "default" ? null : dayCount;
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
    if (!item || !canCreateMovements || !organizationId || linkingSupplier || creatingSupplier) return;
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
      if (saleWindowMode === "custom" && !validDayCount) nextErrors.sale_window_days = "Informe um prazo entre 1 e 3650 dias.";
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
          sale_window_days: saleDaysToSave,
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
        sale_window_days: movementType === "IN" ? saleDaysToSave : null,
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



  const openSupplierCreation = () => {
    if (!canAddSupplier || linkingSupplier || saving) return;
    setCreatingSupplier(true);
    onSupplierEditorChange?.(true);
  };
  const leaveSupplierCreation = () => {
    setCreatingSupplier(false);
    onSupplierEditorChange?.(false);
  };
  const handleSupplierCreated = (supplier: InventorySupplier) => {
    setLinkingSupplier(true);
    void (async () => {
      try {
        const linkedIds = Array.from(new Set([...suppliers.map(item => item.id), supplier.id]));
        await syncInventoryItemSuppliers(item.id, linkedIds, organizationId);
        setNewSuppliers(current => [...current.filter(item => item.id !== supplier.id), supplier]);
        setForm(current => ({ ...current, supplier_entity_id: supplier.id }));
        clearFieldError("supplier_entity_id");
        await queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
      } catch (error) {
        setToast({ msg: "Fornecedor cadastrado, mas não foi possível vinculá-lo ao item: " + systemErrorMessage(error), type: "error" });
      } finally {
        setLinkingSupplier(false);
      }
    })();
  };
  const typeOptions = [
    { type: "in" as const, label: "Entrada", icon: ArrowDownToLine },
    { type: "out" as const, label: "Saída", icon: ArrowUpFromLine },
    { type: "adjust" as const, label: "Ajuste", icon: Scale },
  ];
  const content = <>
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {creatingSupplier && <SupplierQuickCreateDialog organizationId={organizationId} inline
      onClose={leaveSupplierCreation} onCreated={handleSupplierCreated} />}
    {!creatingSupplier && <>
      <div className="space-y-4 p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3">
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground">Saldo atual</span>
            <strong className="ml-2 text-sm font-bold tabular-nums text-blue-600">{formatNumber(currentBase / displayFactor)} {stockUnit}</strong>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground">Após movimentação</span>
            <strong className={cn("ml-2 text-sm font-bold tabular-nums", !form.quantity.trim() ? "text-muted-foreground" : nextBase < 0 ? "text-destructive" : "text-emerald-600")}>
              {!form.quantity.trim() ? "—" : formatNumber(nextBase / displayFactor) + " " + stockUnit}
            </strong>
          </div>
        </div>
        <div className="space-y-2">
          <AdminFieldLabel label="Tipo de movimentação" />
          <div className="grid grid-cols-3 gap-2 border-b border-border" role="group" aria-label="Tipo de movimentação">
            {typeOptions.map(option => <button key={option.type} type="button" disabled={saving}
              aria-pressed={form.type === option.type} onClick={() => changeType(option.type)}
              className={cn("flex min-h-10 items-center justify-center gap-1.5 border-b-2 border-transparent px-2 text-xs font-bold transition-colors disabled:opacity-50 sm:text-sm",
                form.type === option.type ? "border-primary text-primary" : "text-muted-foreground hover:text-foreground")}>
              <option.icon size={16} aria-hidden="true" /> {option.label}
            </button>)}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <AdminFieldLabel label={form.type === "adjust" ? "Novo saldo (" + stockUnit + ")" : "Quantidade (" + inputUnit + ")"} />
            <div className="flex h-[42px] min-w-0 overflow-hidden rounded-lg border border-border bg-input-background">
              <button type="button" aria-label="Diminuir quantidade"
                disabled={saving || quantity <= (form.type === "adjust" ? 0 : 1)}
                onClick={() => { clearFieldError("quantity"); setForm(current => ({ ...current, quantity: String(Math.max(form.type === "adjust" ? 0 : 1, Number(current.quantity || 0) - 1)) })); }}
                className="flex w-11 shrink-0 items-center justify-center border-r border-border text-primary hover:bg-muted disabled:text-muted-foreground disabled:opacity-40">
                <Minus size={17} />
              </button>
              <input type="number" inputMode="numeric" min={form.type === "adjust" ? 0 : 1} step="1"
                value={form.quantity} aria-label="Quantidade"
                onChange={event => { clearFieldError("quantity"); setForm(current => ({ ...current, quantity: event.target.value })); }}
                className="min-w-0 flex-1 bg-transparent px-2 text-center text-sm font-semibold text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              <button type="button" aria-label="Aumentar quantidade" disabled={saving}
                onClick={() => { clearFieldError("quantity"); setForm(current => ({ ...current, quantity: String(Math.max(form.type === "adjust" ? 0 : 1, Number(current.quantity || 0) + 1)) })); }}
                className="flex w-11 shrink-0 items-center justify-center border-l border-border text-primary hover:bg-muted disabled:opacity-40">
                <Plus size={17} />
              </button>
            </div>
            {fieldErrors.quantity && <p role="alert" className="mt-1 text-[11px] font-semibold text-destructive">{fieldErrors.quantity}</p>}
          </div>
          {form.type !== "adjust" ? <div>
            <AdminFieldLabel label="Unidade" />
            <AdminSelect value={form.input_unit}
              onValueChange={value => setForm(current => ({ ...current, input_unit: value === "cx" ? "cx" : "un" }))}
              options={[{ value: "un", label: "Unidade (un)" }, { value: "cx", label: "Caixa · " + formatNumber(conversionFactor(item)) + " un" }]}
              ariaLabel="Unidade da movimentação" />
          </div> : <p className="flex items-end pb-3 text-xs text-muted-foreground">O ajuste define o saldo final.</p>}
        </div>
        {inputUnit === "cx" && form.quantity.trim() !== "" && Number.isFinite(baseQuantity) &&
          <p className="text-xs font-semibold text-primary">{formatNumber(quantity)} caixa(s) = {formatNumber(baseQuantity)} unidades</p>}
        {form.type === "in" && <Section title="Dados da entrada" contentClassName="space-y-3 !p-3 sm:!p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <AdminFieldLabel label="Fornecedor" required={financeEnabled} />
              <div className="flex min-w-0 items-stretch gap-2">
                <div className="min-w-0 flex-1">
                  <AdminSelect value={form.supplier_entity_id} ariaLabel="Fornecedor"
                    onValueChange={value => { clearFieldError("supplier_entity_id"); setForm(current => ({ ...current, supplier_entity_id: value })); }}
                    options={[{ value: "", label: "Selecione um fornecedor" }, ...suppliers.map(supplier => ({ value: supplier.id, label: supplier.name }))]} />
                </div>
                {canAddSupplier && <button type="button" title="Cadastrar fornecedor" aria-label="Cadastrar fornecedor"
                  disabled={saving || linkingSupplier} onClick={openSupplierCreation}
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-card text-primary hover:bg-primary/5 disabled:opacity-50">
                  <Plus size={19} />
                </button>}
              </div>
              {linkingSupplier && <p role="status" className="mt-1 text-xs text-muted-foreground">Vinculando fornecedor...</p>}
              {fieldErrors.supplier_entity_id && <p role="alert" className="mt-1 text-xs font-semibold text-destructive">{fieldErrors.supplier_entity_id}</p>}
            </div>
            <FCurrencyInput label={"Custo por " + form.input_unit + " *"} value={form.input_unit_cost} error={fieldErrors.input_unit_cost}
              onChange={(event: any) => { clearFieldError("input_unit_cost"); setForm(current => ({ ...current, input_unit_cost: event.target.value })); }} />
            <FInput label="Nota fiscal / referência" value={form.purchase_reference} placeholder="Número da NF-e ou pedido"
              onChange={(event: any) => setForm(current => ({ ...current, purchase_reference: event.target.value }))} />
            <FInput label="NCM (Mercosul)" value={form.ncm} placeholder="8 dígitos, opcional"
              disabled={!canEditNcm} error={fieldErrors.ncm}
              onChange={(event: any) => { clearFieldError("ncm"); setForm(current => ({ ...current, ncm: String(event.target.value).replace(/\D/g, "").slice(0,8) })); }} />
          </div>
          <div className="grid gap-3 border-t border-border/70 pt-3 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <AdminFieldLabel label="Prazo para vender" className="!mb-0" />
                <Popover>
                  <PopoverTrigger asChild><button type="button" aria-label="Informações sobre prazo para vender"
                    className="text-muted-foreground hover:text-primary"><CircleHelp size={15} /></button></PopoverTrigger>
                  <PopoverContent align="start" className="z-[310] max-w-[min(90vw,280px)] space-y-1.5 text-xs">
                    <p className="font-bold">Prazo comercial desta entrada</p>
                    <p>{saleWindowMode === "default" ? (productInfo?.sale_window_days ? "Padrão cadastrado: " + productInfo.sale_window_days + " dias." : "O produto não tem prazo padrão cadastrado.") : (validDayCount ? "Prazo definido: " + dayCount + " dias." : "Defina quantos dias esta entrada terá.")}</p>
                    <p>{saleDeadline ? "Data-limite estimada: " + saleDeadline + "." : "Sem data-limite estimada."}</p>
                    <p>O prazo é comercial, começa na entrada e não bloqueia a venda. Os outros lotes não são alterados.</p>
                  </PopoverContent>
                </Popover>
              </div>
              <AdminSelect value={saleWindowMode} ariaLabel="Prazo para vender"
                onValueChange={value => { setSaleWindowMode(value === "custom" ? "custom" : "default"); clearFieldError("sale_window_days"); }}
                options={[{ value: "default", label: productInfo?.sale_window_days ? "Padrão (" + productInfo.sale_window_days + " dias)" : "Padrão (sem prazo)" },
                  { value: "custom", label: "Definir outro prazo" }]} />
            </div>
            {saleWindowMode === "custom" && <FIntegerInput label="Outro prazo (dias)" value={form.sale_window_days}
              error={fieldErrors.sale_window_days} placeholder="Ex.: 30"
              onChange={(event: any) => { clearFieldError("sale_window_days"); setForm(current => ({ ...current, sale_window_days: event.target.value })); }} />}
          </div>
        </Section>}
        {form.type === "in" && financeEnabled && <Section title="Contas a Pagar" description="Pré-lançamento para aprovação no Financeiro." contentClassName="space-y-3 !p-3 sm:!p-4">
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
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-border pt-3">
            <span className="text-sm font-semibold text-muted-foreground">Subtotal: <strong className="text-sm font-bold text-foreground">{formatCurrency(purchaseSubtotal)}</strong></span>
            <span className="text-sm font-semibold text-foreground">Total a pagar: <strong className="text-lg font-black text-emerald-600">{formatCurrency(purchaseTotal)}</strong></span>
          </div>
          {!canViewSuppliers && <p role="alert" className="text-xs font-semibold text-amber-700">É necessário visualizar os fornecedores vinculados para registrar compras integradas.</p>}
        </Section>}
        {form.type === "in" && !financeEnabled && form.input_unit_cost.trim() && <div className="border-t border-border pt-3 text-sm font-semibold">Total da entrada: <span className="text-emerald-600">{formatCurrency(purchaseSubtotal)}</span></div>}
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
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-3 py-3 sm:px-4">
        <BtnSecondary onClick={onClose} disabled={saving || linkingSupplier}>{backToDetails ? "Voltar" : "Cancelar"}</BtnSecondary>
        <BtnPrimary onClick={() => void save()} loading={saving} loadingText="Registrando..." disabled={saving || linkingSupplier || !form.quantity.trim()}>
          {form.type === "in" ? "Registrar entrada" : form.type === "out" ? "Registrar saída" : "Salvar ajuste"}
        </BtnPrimary>
      </div>
    </>}
  </>;

  if (embedded) return <div className="space-y-1">{content}</div>;
  return <AdminPage open onClose={onClose} breadcrumb="Estoque"
    title={`Movimentação — ${item.name}`}
    subtitle={financeEnabled ? "Compras geram pré-lançamentos pendentes no Financeiro; saídas e ajustes permanecem operacionais." : "Registre compras, saídas e ajustes com histórico completo."}
    maxW="max-w-3xl">{content}</AdminPage>;
}
