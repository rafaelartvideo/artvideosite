import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Printer, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { InlineLoading, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { AdminFieldLabel, FCurrencyInput, FInput, FSelect, FTextarea, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { Popover, PopoverAnchor, PopoverContent } from "@/shared/ui/primitives/popover";
import { cn, formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { printGeneralFinancialReceipt, type GeneralReceiptA4 } from "@/features/pdv/domain/pdv-a4-receipt";

type ReceiptDirection = "received" | "paid";
type RegistrationKind = "customer" | "employee";
type Registration = { id: string; name: string; document: string | null; legacyCustomerId: string | null };
type ReceiptItem = { id: number; description: string; quantity: string; unit_price: string };
type ItemErrors = { description?: string; quantity?: string; unit_price?: string };
type FieldErrors = { registration?: string; order?: string; direction?: string; reason?: string; details?: string; paymentMethod?: string; notes?: string; items?: string; general?: string };
type OrderRecord = { id: string; os_number: string };

let itemSequence = 0;
const newItem = (): ReceiptItem => ({ id: ++itemSequence, description: "", quantity: "1", unit_price: "" });

function useDebouncedSearch(value: string, delay = 300) {
  const [delayed, setDelayed] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDelayed(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);
  return delayed;
}

export function FinanceReceiptDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const organizationId = activeOrganizationId || "";
  const [registrationKind, setRegistrationKind] = useState<RegistrationKind>("customer");
  const [registrationSearch, setRegistrationSearch] = useState("");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState<Registration | null>(null);
  const [osSearch, setOsSearch] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [direction, setDirection] = useState<ReceiptDirection>("received");
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [items, setItems] = useState<ReceiptItem[]>(() => [newItem()]);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [itemErrors, setItemErrors] = useState<Record<number, ItemErrors>>({});
  const debouncedRegistrationSearch = useDebouncedSearch(registrationSearch);
  const debouncedOrderSearch = useDebouncedSearch(osSearch);

  const canIssue = hasPermission(direction === "received" ? "finance.receivables.create" : "finance.payables.create");
  const registrationsQuery = useQuery({
    queryKey: ["finance", "receipt", "person", organizationId, registrationKind, debouncedRegistrationSearch],
    enabled: open && Boolean(organizationId) && !selectedRegistration && debouncedRegistrationSearch.trim().length >= 2,
    staleTime: 30_000,
    queryFn: async (): Promise<Registration[]> => {
      const term = debouncedRegistrationSearch.trim().replace(/[%(),]/g, " ").replace(/\s+/g, " ");
      const digits = term.replace(/\D/g, "");
      const byName = /[A-Za-zÀ-ÿ]/.test(term);
      if (registrationKind === "employee") {
        let query = supabase.from("employees")
          .select("id,full_name,cpf")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .order("full_name")
          .limit(8);
        if (byName) query = query.ilike("full_name", "%" + term.replace(/\s/g, "%") + "%");
        else if (digits) query = query.ilike("cpf", "%" + digits.split("").join("%") + "%");
        const { data, error } = await query;
        if (error) throw error;
        return (data || []).map(person => ({
          id: person.id, name: person.full_name || "Funcionário",
          document: person.cpf || null, legacyCustomerId: null,
        }));
      }

      let query = supabase.from("entities")
        .select("id,name,trade_name,document,legacy_customer_id,roles:entity_roles!inner(role,is_active)")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .eq("roles.role", "customer")
        .eq("roles.is_active", true)
        .order("name")
        .limit(8);
      if (byName) {
        const pattern = "%" + term.replace(/\s/g, "%") + "%";
        query = query.or("name.ilike." + pattern + ",trade_name.ilike." + pattern);
      } else if (digits) {
        query = query.ilike("document", "%" + digits.split("").join("%") + "%");
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(person => ({
        id: person.id, name: person.trade_name || person.name || "Cliente",
        document: person.document || null, legacyCustomerId: person.legacy_customer_id || null,
      }));
    },
  });

  const ordersQuery = useQuery({
    queryKey: ["finance", "receipt", "customer-orders", organizationId, selectedRegistration?.legacyCustomerId, debouncedOrderSearch],
    enabled: open && registrationKind === "customer" && Boolean(organizationId && selectedRegistration?.legacyCustomerId),
    staleTime: 30_000,
    queryFn: async (): Promise<OrderRecord[]> => {
      let query = supabase.from("service_orders")
        .select("id,os_number")
        .eq("organization_id", organizationId)
        .eq("customer_id", selectedRegistration!.legacyCustomerId!)
        .order("created_at", { ascending: false })
        .limit(30);
      const number = debouncedOrderSearch.trim().replace(/\D/g, "");
      if (number) query = query.ilike("os_number", "%" + number + "%");
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(order => ({ id: order.id, os_number: String(order.os_number || "") }));
    },
  });

  const total = useMemo(
    () => items.reduce((sum, item) => sum + Math.round(Number(item.quantity || 0) * Math.round(Number(item.unit_price || 0) * 100)), 0) / 100,
    [items],
  );
  const clearError = (key: keyof FieldErrors) => setErrors(current => ({ ...current, [key]: undefined, general: undefined }));
  const updateItem = (id: number, changes: Partial<ReceiptItem>) => {
    setItems(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
    setItemErrors(current => ({ ...current, [id]: { ...current[id], ...Object.fromEntries(Object.keys(changes).map(key => [key, undefined])) } }));
    clearError("items");
  };
  const clearOrder = () => { setSelectedOrder(null); setOsSearch(""); setOrderOpen(false); clearError("order"); };
  const chooseKind = (next: RegistrationKind) => {
    if (saving || registrationKind === next) return;
    setRegistrationKind(next);
    setSelectedRegistration(null);
    setRegistrationSearch("");
    setRegistrationOpen(false);
    clearOrder();
    clearError("registration");
  };
  const selectRegistration = (person: Registration) => {
    setSelectedRegistration(person);
    setRegistrationSearch("");
    setRegistrationOpen(false);
    clearOrder();
    clearError("registration");
  };
  const reset = () => {
    setRegistrationKind("customer"); setRegistrationSearch(""); setRegistrationOpen(false);
    setSelectedRegistration(null); setOsSearch(""); setOrderOpen(false); setSelectedOrder(null);
    setDirection("received"); setReason(""); setDetails(""); setItems([newItem()]);
    setPaymentMethod(""); setNotes(""); setErrors({}); setItemErrors({});
  };
  const close = () => { if (!saving) { reset(); onClose(); } };

  const issue = async () => {
    if (saving) return;
    const nextErrors: FieldErrors = {};
    const nextItemErrors: Record<number, ItemErrors> = {};
    if (!selectedRegistration) nextErrors.registration = "Selecione um " + (registrationKind === "customer" ? "cliente" : "funcionário") + ".";
    if (registrationKind === "customer" && selectedOrder && !selectedRegistration?.legacyCustomerId) nextErrors.order = "Não foi possível validar a OS deste cliente.";
    if (!canIssue) nextErrors.direction = "Você não possui permissão para emitir este tipo de recibo.";
    if (!reason.trim() || reason.trim().length < 3 || reason.trim().length > 500) nextErrors.reason = "Informe o motivo (de 3 a 500 caracteres).";
    if (details.trim().length > 2000) nextErrors.details = "A descrição deve ter até 2.000 caracteres.";
    if (paymentMethod.trim().length > 120) nextErrors.paymentMethod = "Informe até 120 caracteres.";
    if (notes.trim().length > 2000) nextErrors.notes = "As observações devem ter até 2.000 caracteres.";
    items.forEach(item => {
      const itemError: ItemErrors = {};
      const qty = Number(item.quantity);
      const price = Number(item.unit_price);
      if (item.description.trim().length < 2 || item.description.trim().length > 400) itemError.description = "Informe a descrição (2 a 400 caracteres).";
      if (!item.quantity || !Number.isFinite(qty) || qty <= 0 || qty > 99_999) itemError.quantity = "Quantidade inválida.";
      if (!item.unit_price || !Number.isFinite(price) || price <= 0 || price > 999_999_999) itemError.unit_price = "Valor inválido.";
      if (Object.keys(itemError).length) nextItemErrors[item.id] = itemError;
    });
    if (!Number.isFinite(total) || total <= 0 || total > 999_999_999_999) nextErrors.items = "Confira o valor total dos itens.";
    setErrors(nextErrors);
    setItemErrors(nextItemErrors);
    if (Object.keys(nextErrors).length || Object.keys(nextItemErrors).length) return;

    // Abre a janela no clique; após aguardar a emissão, navegadores bloqueiam pop-ups.
    const printWindow = window.open("", "_blank", "width=960,height=830");
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("issue_financial_receipt_v1", {
        p_organization_id: organizationId,
        p_payload: {
          direction,
          entity_id: registrationKind === "customer" ? selectedRegistration!.id : null,
          employee_id: registrationKind === "employee" ? selectedRegistration!.id : null,
          service_order_id: registrationKind === "customer" ? selectedOrder?.id || null : null,
          description: reason.trim(),
          detail_description: details.trim() || null,
          payment_method_name: paymentMethod.trim() || null,
          notes: notes.trim() || null,
          items: items.map(item => ({ description: item.description.trim(), quantity: Number(item.quantity), unit_price: Number(item.unit_price) })),
        },
      });
      if (error) throw error;
      const receipt = data as GeneralReceiptA4;
      notifyAdmin("Recibo emitido com sucesso.", "success");
      try { printGeneralFinancialReceipt(receipt, printWindow); }
      catch (printError) { notifyAdmin(systemErrorMessage(printError, "Recibo emitido, mas não foi possível abrir a impressão."), "error"); }
      reset();
    } catch (error) {
      try { printWindow?.close(); } catch { /* Navegador pode bloquear o fechamento */ }
      const message = systemErrorMessage(error, "Não foi possível emitir o recibo.");
      if (/\bOS\b|ordem de serviço/i.test(message)) setErrors(current => ({ ...current, order: message }));
      else if (/cliente|cadastro|funcionário|pessoa/i.test(message)) setErrors(current => ({ ...current, registration: message }));
      else if (/motivo|descrição válida/i.test(message)) setErrors(current => ({ ...current, reason: message }));
      else if (/item|quantidade|valor/i.test(message)) setErrors(current => ({ ...current, items: message }));
      else setErrors(current => ({ ...current, general: message }));
    } finally { setSaving(false); }
  };

  if (!open) return null;
  return <AdminDialog
    open onClose={close} title="Gerar recibo"
    description="Emissão avulsa, independente do PDV e do caixa."
    className="max-w-3xl"
    footer={<div className="flex justify-end gap-2">
      <AdminButton variant="secondary" disabled={saving} onClick={close}>Cancelar</AdminButton>
      <AdminButton loading={saving} loadingText="Emitindo..." disabled={!canIssue} onClick={() => void issue()}>
        <Printer size={15} /> Gerar recibo
      </AdminButton>
    </div>}
  >
    <div className="space-y-5">
      <div className="space-y-2">
        <AdminFieldLabel label="Cadastro" required />
        <div className="grid grid-cols-2 gap-2">
          {([{ value: "customer", label: "Cliente" }, { value: "employee", label: "Funcionário" }] as const).map(option => (
            <button key={option.value} type="button" disabled={saving} onClick={() => chooseKind(option.value)}
              aria-pressed={registrationKind === option.value}
              className={cn("h-10 rounded-lg border px-3 text-xs font-bold transition-colors",
                registrationKind === option.value
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
              {option.label}
            </button>
          ))}
        </div>
        {selectedRegistration ? (
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-3">
            <div className="min-w-0 text-sm">
              <span className="font-semibold text-foreground">{selectedRegistration.name}</span>
              {selectedRegistration.document && <span className="ml-2 text-xs text-muted-foreground">{selectedRegistration.document}</span>}
            </div>
            <AdminButton variant="secondary" size="sm" disabled={saving} onClick={() => { setSelectedRegistration(null); setRegistrationSearch(""); clearOrder(); }}>
              Trocar
            </AdminButton>
          </div>
        ) : (
          <div className="space-y-1">
            <AdminFieldLabel label={registrationKind === "customer" ? "Buscar cliente" : "Buscar funcionário"} required />
            <Popover open={registrationOpen && Boolean(registrationsQuery.data?.length) && registrationSearch.trim().length >= 2}
              onOpenChange={setRegistrationOpen}>
              <PopoverAnchor asChild>
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input className={cn(INPUT, "pl-9", errors.registration && "border-red-500 focus:border-red-500")}
                    value={registrationSearch} disabled={saving} aria-invalid={Boolean(errors.registration) || undefined}
                    placeholder={registrationKind === "customer" ? "Nome, CPF ou CNPJ" : "Nome ou CPF"}
                    onChange={event => { setRegistrationSearch(event.target.value); setRegistrationOpen(true); clearError("registration"); }}
                    onFocus={() => setRegistrationOpen(true)} />
                </div>
              </PopoverAnchor>
              <PopoverContent align="start" side="bottom" sideOffset={4} collisionPadding={12}
                onOpenAutoFocus={event => event.preventDefault()}
                className="z-[220] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-32px)] border-border bg-popover p-1 text-popover-foreground shadow-xl">
                <div className="max-h-48 overflow-y-auto">
                  {(registrationsQuery.data || []).map(person => (
                    <button key={person.id} type="button" onClick={() => selectRegistration(person)}
                      className="block w-full rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted">
                      <span className="font-semibold text-foreground">{person.name}</span>
                      {person.document && <span className="ml-2 text-xs text-muted-foreground">{person.document}</span>}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
            {errors.registration && <p role="alert" className="text-[10px] font-semibold text-red-600">{errors.registration}</p>}
            {registrationsQuery.isFetching && registrationSearch.trim().length >= 2 && <InlineLoading text="Buscando cadastros..." />}
            {registrationsQuery.isError && <p className="text-[10px] font-semibold text-red-600">{systemErrorMessage(registrationsQuery.error, "Falha ao pesquisar cadastros.")}</p>}
            {debouncedRegistrationSearch.trim().length >= 2 && !registrationsQuery.isFetching && !registrationsQuery.isError &&
              !registrationsQuery.data?.length && <p className="text-xs text-muted-foreground">Nenhum cadastro encontrado.</p>}
          </div>
        )}
        {selectedRegistration && registrationKind === "customer" && (
          <div className="space-y-1 pt-1">
            <AdminFieldLabel label="OS vinculada (opcional)" />
            {selectedOrder ? (
              <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
                <span className="text-sm font-semibold text-primary">OS {selectedOrder.os_number}</span>
                <AdminButton size="sm" variant="secondary" disabled={saving} onClick={clearOrder}>Trocar</AdminButton>
              </div>
            ) : (
              <Popover open={orderOpen && Boolean(ordersQuery.data?.length)} onOpenChange={setOrderOpen}>
                <PopoverAnchor asChild>
                  <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input className={cn(INPUT, "pl-9", errors.order && "border-red-500")}
                      value={osSearch} disabled={saving || !selectedRegistration.legacyCustomerId}
                      placeholder="Buscar entre as OS deste cliente"
                      onChange={event => { setOsSearch(event.target.value); setOrderOpen(true); clearError("order"); }}
                      onFocus={() => setOrderOpen(true)} />
                  </div>
                </PopoverAnchor>
                <PopoverContent align="start" side="bottom" sideOffset={4} collisionPadding={12}
                  onOpenAutoFocus={event => event.preventDefault()}
                  className="z-[220] w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-32px)] border-border bg-popover p-1 text-popover-foreground shadow-xl">
                  <div className="max-h-48 overflow-y-auto">
                    {(ordersQuery.data || []).map(order => (
                      <button key={order.id} type="button"
                        className="block w-full rounded-md px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted"
                        onClick={() => { setSelectedOrder(order); setOsSearch(""); setOrderOpen(false); clearError("order"); }}>
                        OS {order.os_number}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {errors.order && <p role="alert" className="text-[10px] font-semibold text-red-600">{errors.order}</p>}
            {ordersQuery.isFetching && <InlineLoading text="Buscando OS do cliente..." />}
            {ordersQuery.isError && <p className="text-[10px] font-semibold text-red-600">{systemErrorMessage(ordersQuery.error, "Falha ao pesquisar as OS do cliente.")}</p>}
            {!selectedRegistration.legacyCustomerId && <p className="text-xs text-muted-foreground">Este cadastro não possui OS vinculadas.</p>}
            {selectedRegistration.legacyCustomerId && !selectedOrder && !ordersQuery.isFetching && !ordersQuery.isError &&
              !ordersQuery.data?.length && <p className="text-xs text-muted-foreground">Nenhuma OS encontrada para este cliente.</p>}
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <FSelect label="Tipo de recibo" required value={direction} error={errors.direction}
          options={[{ value: "received", label: "Valor recebido pela empresa" }, { value: "paid", label: "Valor pago pela empresa" }]}
          onChange={(event: any) => { setDirection(event.target.value); clearError("direction"); }} />
        <FInput label="Motivo" required value={reason} maxLength={500} error={errors.reason}
          placeholder="Ex.: Pagamento de entrega ao motoboy"
          onChange={(event: any) => { setReason(event.target.value); clearError("reason"); }} />
        <FTextarea label="Descrição (opcional)" rows={2} value={details} maxLength={2000} error={errors.details}
          placeholder="Detalhes adicionais sobre o motivo do recibo"
          onChange={(event: any) => { setDetails(event.target.value); clearError("details"); }} />
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Itens do recibo</h3>
          <AdminButton variant="secondary" size="sm" disabled={saving || items.length >= 30}
            onClick={() => { setItems(current => [...current, newItem()]); clearError("items"); }}>
            <Plus size={15} /> Adicionar
          </AdminButton>
        </div>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_42px] items-start gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-[minmax(0,1fr)_90px_150px_42px] sm:border-0 sm:p-0">
              <div className="col-span-3 min-w-0 sm:col-span-1">
                <FInput label={"Item " + (index + 1)} required value={item.description}
                  error={itemErrors[item.id]?.description} placeholder="Produto, serviço ou despesa"
                  onChange={(event: any) => updateItem(item.id, { description: event.target.value })} />
              </div>
              <FInput label="Qtd." type="number" min="0.01" max="99999" step="0.01" value={item.quantity}
                error={itemErrors[item.id]?.quantity}
                onChange={(event: any) => updateItem(item.id, { quantity: event.target.value })} />
              <FCurrencyInput label="Valor unitário" value={item.unit_price}
                error={itemErrors[item.id]?.unit_price}
                onChange={(event: any) => updateItem(item.id, { unit_price: event.target.value })} />
              <div className="flex h-full items-start justify-center pt-[22px]">
                <button type="button" title="Excluir item" aria-label={"Excluir item " + (index + 1)}
                  disabled={saving || items.length === 1}
                  onClick={() => { setItems(current => current.filter(currentItem => currentItem.id !== item.id)); setItemErrors(current => { const next = { ...current }; delete next[item.id]; return next; }); }}
                  className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20">
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          ))}
        </div>
        {errors.items && <p role="alert" className="text-[10px] font-semibold text-red-600">{errors.items}</p>}
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm font-bold">
          <span>Total do recibo</span><span className="tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <FInput label="Forma de pagamento (opcional)" value={paymentMethod} maxLength={120}
          error={errors.paymentMethod} placeholder="Ex.: PIX, dinheiro ou transferência"
          onChange={(event: any) => { setPaymentMethod(event.target.value); clearError("paymentMethod"); }} />
        <FTextarea label="Observações (opcional)" rows={2} value={notes} maxLength={2000}
          error={errors.notes} onChange={(event: any) => { setNotes(event.target.value); clearError("notes"); }} />
        <p className="text-xs text-muted-foreground">Documento não fiscal. A emissão não cria uma venda nem movimenta o caixa ou o financeiro.</p>
        {errors.general && <p role="alert" className="text-xs font-semibold text-red-600">{errors.general}</p>}
      </div>
    </div>
  </AdminDialog>;
}
