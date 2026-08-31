import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useMediaUrl } from "@/lib/hooks";
import { AddressFields } from "@/app/components/AddressFields";
import { emptyAddress, fetchAddressByZipCode, formatZipCode, type Address } from "@/lib/address";
import {
  LayoutDashboard, ClipboardList, Edit2, Trash2, RefreshCw, Search, MessageCircle,
  Users, List, X, Plus, Clock, CheckCircle, Upload, AlertTriangle, ArrowLeft,
  ChevronLeft, ChevronRight, Phone, Star, DollarSign, HelpCircle, ChevronDown,
  AlertCircle, FileText, Camera, Eraser, ArrowUpDown, ArrowUpNarrowWide, ArrowDownWideNarrow, Check, PackagePlus,
} from "lucide-react";
import {
  cn, slugify, initialOrderStatus, getWhatsAppUrl, formatPhone,
  CustomerType, CustomerForm, emptyCustomerForm, customerFormFromCustomer, customerPayload, customerUpdatePayload,
  validateCustomerForm, fetchCnpjData, applyCnpjData, formatCpf, formatCnpj,
  formatFoundationDate, foundationDateToIso, foundationDateFromCustomer, todayDateOnly,
  INPUT, FInput, FTextarea, FSelect, FToggle, CustomerTypeToggle,
  StatusBadge, LoadingState, EmptyState, BtnPrimary, BtnSecondary, Toast, ConfirmDialog,
  PageHeader, Section, AdminPage, PaginationBar, ImageUpload, ProductAdminThumb,
  AdminBackContext, InternalBackButton, supabaseErrorMessage, createMediaRecord, isHexColor,
  type AdminTab,
} from "./shared";
import { getGeneralServices } from "@/lib/queries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/app/components/ui/dropdown-menu";

type OrderType = "internal" | "external";
type ServiceAddressSource = "customer" | "custom";
type IbgeState = { sigla: string; nome: string };
type IbgeCity = { nome: string };
type CityFilterOption = { name: string; state: string };
type MultiSelectOption = { value: string; label: string };

type ServiceOrderProfile = { id: string; full_name: string | null };
type ServiceOrderWithRelations = { assigned_profile?: ServiceOrderProfile | ServiceOrderProfile[] | null };
type PartRequestInventoryItem = { id: string; name: string; sku: string | null; unit: string | null; quantity: number; is_active: boolean };
type SelectedPartRequestItem = { inventory_item_id: string; name: string; sku: string | null; unit: string; available_quantity: number; quantity: string };
type ReviewPartRequestItem = { id: string; inventory_item_id: string; quantity: number; approved_quantity: number | null; source_test_item_id?: string | null; delivered_quantity?: number; delivered_at?: string | null; delivered_by?: string | null; technician_received_quantity?: number; technician_received_at?: string | null; technician_received_by?: string | null; return_pending_quantity?: number; return_registered_at?: string | null; return_registered_by?: string | null; returned_quantity?: number; return_received_at?: string | null; return_received_by?: string | null; damaged_quantity?: number; request_status?: string; inventory_item?: { id: string; name: string; sku: string | null; unit: string | null; quantity: number } | null };
type PartRequestItemForReview = ReviewPartRequestItem;
type PartRequestForReview = { id: string; service_order_id: string; purpose?: "TEST" | "RESOLUTION" | null; status: string; notes: string | null; reviewed_by?: string | null; reviewed_at?: string | null; review_notes?: string | null; created_at: string; requester?: { full_name: string | null } | null; requested_by_profile?: { full_name: string | null } | null; reviewed_by_profile?: { full_name: string | null } | null; items: PartRequestItemForReview[] };
type TestResultRow = { id: string; requestItemId: string; action: "USE_IN_RESOLUTION" | "DAMAGED"; quantity: string; notes: string };
type CustodyAction = "DISPATCH" | "CONFIRM_DELIVERY" | "REGISTER_RETURN" | "RECEIVE_RETURN";

function getResponsibleName(order: ServiceOrderWithRelations) {
  const profile = Array.isArray(order.assigned_profile) ? order.assigned_profile[0] : order.assigned_profile;
  return profile?.full_name?.trim() || "Responsável não informado";
}

function CenteredModal({ children, onClose, className }: { children: React.ReactNode; onClose: () => void; className?: string }) {
  return <div className="fixed inset-0 z-[180] flex items-center justify-center bg-[#0d1b2e]/55 p-4" onClick={onClose}><div className={cn("relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white shadow-2xl", className || "max-w-2xl")} onClick={event => event.stopPropagation()}>{children}</div></div>;
}

function PartRequestModal({ orderNumber, inventoryItems, inventoryLoading, inventoryError, selectedItems, search, notes, purpose, submitting, onPurposeChange, onSearchChange, onNotesChange, onSelect, onQuantityChange, onRemove, onClose, onSubmit }: {
  orderNumber?: string | null; inventoryItems: PartRequestInventoryItem[]; inventoryLoading: boolean; inventoryError: string; selectedItems: SelectedPartRequestItem[]; search: string; notes: string; purpose: "RESOLUTION" | "TEST"; submitting: boolean;
  onPurposeChange: (purpose: "RESOLUTION" | "TEST") => void; onSearchChange: (value: string) => void; onNotesChange: (value: string) => void; onSelect: (item: PartRequestInventoryItem) => void; onQuantityChange: (id: string, value: string) => void; onRemove: (id: string) => void; onClose: () => void; onSubmit: () => void;
}) {
  const visibleItems = inventoryItems.filter(item => { const query = normalizeSearchText(search); return !query || normalizeSearchText(item.name).includes(query) || normalizeSearchText(item.sku).includes(query); });
  return <CenteredModal onClose={onClose}><div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4"><div><h3 className="text-base font-bold text-[#0d1b2e]">Pedir peças</h3><p className="mt-0.5 text-xs text-[#5a6a82]">OS {orderNumber || "—"}</p></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={17} /></button></div><div className="min-h-0 space-y-5 overflow-y-auto p-5"><div><p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Finalidade do pedido</p><div className="grid gap-2 sm:grid-cols-2"><button type="button" onClick={() => onPurposeChange("RESOLUTION")} className={cn("rounded-xl border p-3 text-left transition-colors", purpose === "RESOLUTION" ? "border-[#0057e7] bg-blue-50 text-[#0057e7]" : "border-[#0d1b2e]/10 bg-white text-[#0d1b2e] hover:border-[#0057e7]/35")}><span className="flex items-center gap-2 text-sm font-bold"><CheckCircle size={16} /> Para resolução</span><span className="mt-1 block text-[11px] font-normal text-[#5a6a82]">Peças que serão utilizadas diretamente para solucionar a OS.</span></button><button type="button" onClick={() => onPurposeChange("TEST")} className={cn("rounded-xl border p-3 text-left transition-colors", purpose === "TEST" ? "border-[#0057e7] bg-blue-50 text-[#0057e7]" : "border-[#0d1b2e]/10 bg-white text-[#0d1b2e] hover:border-[#0057e7]/35")}><span className="flex items-center gap-2 text-sm font-bold"><PackagePlus size={16} /> Para teste</span><span className="mt-1 block text-[11px] font-normal text-[#5a6a82]">Peças retiradas temporariamente para diagnóstico e teste.</span></button></div></div><div><label className="mb-1.5 block text-[11px] font-bold text-[#5a6a82]">Pesquisar peça</label><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input autoFocus value={search} onChange={event => onSearchChange(event.target.value)} placeholder="Pesquise por nome ou SKU" className={cn(INPUT, "h-[42px] pl-9 text-xs")} /></div></div><div className="space-y-2"><p className="text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Resultados</p>{inventoryLoading ? <p className="text-xs text-[#5a6a82]">Carregando peças do estoque...</p> : inventoryError ? <p className="text-xs text-red-600">{inventoryError}</p> : visibleItems.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhum item encontrado.</p> : <div className="max-h-56 space-y-1 overflow-y-auto">{visibleItems.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#0d1b2e]/10 px-3 py-2 text-xs"><span className="min-w-0"><span className="block truncate font-semibold text-[#0d1b2e]">{item.name}</span><span className="text-[11px] text-[#5a6a82]">{item.sku ? `SKU: ${item.sku} · ` : ""}{Number(item.quantity)} {item.unit || "un"}</span></span><button type="button" onClick={() => onSelect(item)} className="shrink-0 rounded-lg border border-[#0057e7]/30 px-2.5 py-1.5 text-xs font-bold text-[#0057e7]">Adicionar</button></div>)}</div>}</div><div className="space-y-2"><p className="text-sm font-bold text-[#0d1b2e]">Peças selecionadas</p>{selectedItems.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhuma peça selecionada.</p> : selectedItems.map(item => <div key={item.inventory_item_id} className="rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3"><div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="text-[11px] text-[#5a6a82]">Disponível: {item.available_quantity} {item.unit}</p></div><input type="number" min="0.01" step="0.01" value={item.quantity} onChange={event => onQuantityChange(item.inventory_item_id, event.target.value)} className={cn(INPUT, "w-24 text-center text-sm")} /><button type="button" onClick={() => onRemove(item.inventory_item_id)} aria-label={`Remover ${item.name}`} className="p-2 text-red-600"><X size={14} /></button></div></div>)}</div><FTextarea label="Observações" value={notes} onChange={(event: any) => onNotesChange(event.target.value)} rows={3} placeholder="Informe detalhes importantes sobre as peças solicitadas." /></div><div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white px-5 py-4"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary><BtnPrimary onClick={onSubmit} disabled={submitting}>{submitting ? "Enviando..." : "Enviar solicitação"}</BtnPrimary></div></CenteredModal>;
}

function TestDeliveryModal({ request, orderNumber, submitting, onClose, onSubmit }: { request: PartRequestForReview; orderNumber?: string | null; submitting: boolean; onClose: () => void; onSubmit: () => void }) {
  return <CenteredModal onClose={onClose}><div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4"><div><h3 className="text-base font-bold text-[#0d1b2e]">Confirmar entrega</h3><p className="mt-0.5 text-xs text-[#5a6a82]">OS {orderNumber || "—"} · {request.requester?.full_name || "Solicitante não informado"}</p></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={17} /></button></div><div className="min-h-0 space-y-4 overflow-y-auto p-5"><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Ao confirmar, as quantidades aprovadas serão retiradas do estoque e ficarão sob responsabilidade do técnico da OS.</div><div className="space-y-2">{request.items.map(item => <div key={item.id} className="rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3 text-xs"><p className="font-semibold text-[#0d1b2e]">{item.inventory_item?.name || "Peça"}</p><p className="text-[#5a6a82]">Solicitado: {Number(item.quantity)} {item.inventory_item?.unit || "un"} · Aprovado: {Number(item.approved_quantity ?? 0)} {item.inventory_item?.unit || "un"} · Disponível: {Number(item.inventory_item?.quantity ?? 0)} {item.inventory_item?.unit || "un"}</p></div>)}</div></div><div className="flex justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white px-5 py-4"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary><BtnPrimary onClick={onSubmit} disabled={submitting}>{submitting ? "Entregando..." : "Confirmar entrega"}</BtnPrimary></div></CenteredModal>;
}

function PartCustodyModal({ request, action, quantities, submitting, onQuantitiesChange, onClose, onSubmit }: { request: PartRequestForReview; action: CustodyAction; quantities: Record<string, string>; submitting: boolean; onQuantitiesChange: (value: Record<string, string>) => void; onClose: () => void; onSubmit: () => void }) {
  const config = action === "DISPATCH" ? { title: "Confirmar saída do estoque", message: "As peças serão retiradas do saldo e a movimentação de saída será registrada.", button: "Confirmar saída" } : action === "CONFIRM_DELIVERY" ? { title: "Confirmar entrega ao técnico", message: "Confirme que o técnico recebeu fisicamente as peças. Esta etapa não altera o estoque.", button: "Confirmar recebimento" } : action === "REGISTER_RETURN" ? { title: "Registrar devolução", message: "A devolução ficará aguardando o estoquista confirmar o recebimento. O saldo ainda não será alterado.", button: "Registrar devolução" } : { title: "Confirmar retorno ao estoque", message: "As quantidades pendentes serão adicionadas novamente ao saldo e a movimentação de entrada será registrada.", button: "Confirmar recebimento" };
  const returnable = (item: PartRequestItemForReview) => Math.max(0, Number(item.technician_received_quantity ?? 0) - Number(item.returned_quantity ?? 0) - Number(item.return_pending_quantity ?? 0) - Number(item.damaged_quantity ?? 0));
  return <CenteredModal onClose={onClose}><div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4"><h3 className="text-base font-bold text-[#0d1b2e]">{config.title}</h3><button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={17} /></button></div><div className="min-h-0 space-y-4 overflow-y-auto p-5"><div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">{config.message}</div><div className="space-y-2">{request.items.map(item => { const unit = item.inventory_item?.unit || "un"; const amount = action === "DISPATCH" ? Math.max(0, Number(item.approved_quantity ?? 0) - Number(item.delivered_quantity ?? 0)) : action === "CONFIRM_DELIVERY" ? Math.max(0, Number(item.delivered_quantity ?? 0) - Number(item.technician_received_quantity ?? 0)) : action === "RECEIVE_RETURN" ? Number(item.return_pending_quantity ?? 0) : returnable(item); if (amount <= 0 || action === "DISPATCH" && item.source_test_item_id) return null; return <div key={item.id} className="rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">{item.inventory_item?.name || "Peça"}</span>{action === "REGISTER_RETURN" ? <input type="number" min="0.01" max={amount} step="0.01" value={quantities[item.id] ?? String(amount)} onChange={event => onQuantitiesChange({ ...quantities, [item.id]: event.target.value })} className={cn(INPUT, "w-28 text-center text-sm")} /> : <span className="text-xs font-bold">{amount} {unit}</span>}</div>{action === "REGISTER_RETURN" && <p className="mt-1 text-[11px] text-[#5a6a82]">Disponível para devolução: {amount} {unit}</p>}</div>; })}</div></div><div className="flex justify-end gap-2 border-t border-[#0d1b2e]/8 px-5 py-4"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary><BtnPrimary onClick={onSubmit} disabled={submitting}>{submitting ? "Processando..." : config.button}</BtnPrimary></div></CenteredModal>;
}

function TestResultModal({ request, rows, submitting, getPendingQuantity, onRowsChange, onClose, onSubmit }: {
  request: PartRequestForReview;
  rows: TestResultRow[];
  submitting: boolean;
  getPendingQuantity: (request: PartRequestForReview, item: PartRequestItemForReview) => number;
  onRowsChange: (rows: TestResultRow[]) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const pendingItems = request.items.filter(item => getPendingQuantity(request, item) > 0);
  return <CenteredModal onClose={onClose}>
    <div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4">
      <div><h3 className="text-base font-bold text-[#0d1b2e]">Registrar resultado do teste</h3><p className="mt-0.5 text-xs text-[#5a6a82]">Defina o destino das peças entregues</p></div>
      <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={17} /></button>
    </div>
    <div className="min-h-0 space-y-4 overflow-y-auto p-5">
      {pendingItems.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhuma peça aguardando resultado.</p> : pendingItems.map(item => {
        const pending = getPendingQuantity(request, item);
        const used = rows.filter(row => row.requestItemId === item.id).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
        return <div key={item.id} className="space-y-2 rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3">
          <p className="text-sm font-semibold text-[#0d1b2e]">{item.inventory_item?.name || "Peça"} <span className="text-xs font-normal text-[#5a6a82]">· Aguardando: {Math.max(0, pending - used)} {item.inventory_item?.unit || "un"}</span></p>
          {rows.filter(row => row.requestItemId === item.id).map(row => <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_6rem_1fr_auto]">
            <select value={row.action} onChange={event => onRowsChange(rows.map(current => current.id === row.id ? { ...current, action: event.target.value as TestResultRow["action"] } : current))} className={cn(INPUT, "text-xs")}><option value="USE_IN_RESOLUTION">Usar na resolução</option><option value="DAMAGED">Danificada</option></select>
            <input type="number" min="0.01" max={pending} step="0.01" value={row.quantity} onChange={event => onRowsChange(rows.map(current => current.id === row.id ? { ...current, quantity: event.target.value } : current))} className={cn(INPUT, "text-xs")} />
            <input value={row.notes} onChange={event => onRowsChange(rows.map(current => current.id === row.id ? { ...current, notes: event.target.value } : current))} placeholder={row.action === "DAMAGED" ? "Justificativa do dano" : "Observação (opcional)"} className={cn(INPUT, "text-xs")} />
            <button type="button" onClick={() => onRowsChange(rows.filter(current => current.id !== row.id))} className="p-2 text-red-600"><X size={14} /></button>
          </div>)}
          <button type="button" disabled={used >= pending} onClick={() => onRowsChange([...rows, { id: crypto.randomUUID(), requestItemId: item.id, action: "USE_IN_RESOLUTION", quantity: "", notes: "" }])} className="text-xs font-bold text-[#0057e7] disabled:cursor-not-allowed disabled:opacity-50">Adicionar destino</button>
        </div>;
      })}
    </div>
    <div className="flex justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white px-5 py-4"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary><BtnPrimary onClick={onSubmit} disabled={submitting}>{submitting ? "Registrando..." : "Registrar resultado"}</BtnPrimary></div>
  </CenteredModal>;
}

type WizardStepState = "done" | "current" | "pending" | "error";

function PartCustodyWizard({ request, orderSolved, getCommittedQuantity }: { request: PartRequestForReview; orderSolved: boolean; getCommittedQuantity: (item: PartRequestItemForReview) => number }) {
  const status = String(request.status || "").toUpperCase();
  const purpose = request.purpose || "RESOLUTION";
  const approved = status === "APPROVED";
  const rejected = status === "REJECTED" || status === "CANCELLED";
  const physicalItems = request.items.filter(item => !item.source_test_item_id && Number(item.approved_quantity ?? 0) > 0);
  const dispatchDone = approved && (physicalItems.length === 0 || physicalItems.every(item => Number(item.delivered_quantity ?? 0) >= Number(item.approved_quantity ?? 0)));
  const deliveryDone = dispatchDone && (physicalItems.length === 0 || physicalItems.every(item => Number(item.technician_received_quantity ?? 0) >= Number(item.delivered_quantity ?? 0)));
  const hasReturnPending = request.items.some(item => Number(item.return_pending_quantity ?? 0) > 0);
  const hasReturned = request.items.some(item => Number(item.returned_quantity ?? 0) > 0);
  const hasDamaged = request.items.some(item => Number(item.damaged_quantity ?? 0) > 0);
  const destinationDone = purpose === "TEST" && deliveryDone && request.items.every(item => Number(item.technician_received_quantity ?? 0) <= Number(item.returned_quantity ?? 0) + Number(item.return_pending_quantity ?? 0) + Number(item.damaged_quantity ?? 0) + getCommittedQuantity(item));
  const step = (label: string, description: string, state: WizardStepState) => ({ label, description, state });
  const stages = [
    step("Solicitação", "Pedido criado pelo técnico", "done"),
    step(rejected ? "Não aprovada" : "Aprovação do gestor", rejected ? (status === "CANCELLED" ? "Solicitação cancelada" : "Pedido rejeitado pelo gestor") : approved ? "Quantidades aprovadas" : "Aguardando análise do gestor", rejected ? "error" : approved ? "done" : "current"),
    step("Saída do estoque", physicalItems.length === 0 && approved ? "Peça já estava com o técnico" : dispatchDone ? "Saída confirmada pelo estoquista" : approved ? "Aguardando confirmação do estoquista" : "Disponível após aprovação", dispatchDone ? "done" : approved ? "current" : "pending"),
    step("Entrega ao técnico", deliveryDone ? "Recebimento confirmado pelo gestor" : dispatchDone ? "Aguardando confirmação do gestor" : "Disponível após a saída", deliveryDone ? "done" : dispatchDone ? "current" : "pending"),
    ...(purpose === "TEST" ? [
      step("Destino da peça", destinationDone ? (hasDamaged ? "Resultado e danos registrados" : "Resultado do teste registrado") : deliveryDone ? "Aguardando uso, devolução ou dano" : "Disponível após a entrega", destinationDone ? "done" as WizardStepState : deliveryDone ? "current" as WizardStepState : "pending" as WizardStepState),
      step("Retorno ao estoque", hasReturnPending ? "Aguardando estoquista confirmar recebimento" : hasReturned ? "Recebimento confirmado e saldo reposto" : destinationDone ? "Sem devolução pendente" : "Disponível quando houver devolução", hasReturnPending ? "current" as WizardStepState : hasReturned || destinationDone ? "done" as WizardStepState : "pending" as WizardStepState),
    ] : [
      step("Uso na resolução", orderSolved ? "Peça registrada na solução da OS" : deliveryDone ? "Disponível para resolver a OS" : "Disponível após a entrega", orderSolved ? "done" as WizardStepState : deliveryDone ? "current" as WizardStepState : "pending" as WizardStepState),
    ]),
  ];
  return <div className="mt-3 rounded-xl border border-[#0d1b2e]/10 bg-white p-3"><div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-[11px] font-black uppercase tracking-wider text-[#0d1b2e]">Fluxo das peças</p><p className="text-[10px] text-[#5a6a82]">{purpose === "TEST" ? "Pedido para teste" : "Pedido para resolução"}</p></div>{stages.some(stage => stage.state === "current") && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">Aguardando ação</span>}</div><div className={cn("grid gap-2", stages.length === 6 ? "sm:grid-cols-3 xl:grid-cols-6" : "sm:grid-cols-3 xl:grid-cols-5")}>{stages.map((stage, index) => <div key={stage.label} className={cn("relative rounded-lg border p-2.5", stage.state === "done" ? "border-emerald-200 bg-emerald-50" : stage.state === "current" ? "border-amber-300 bg-amber-50 ring-1 ring-amber-200" : stage.state === "error" ? "border-red-200 bg-red-50" : "border-[#0d1b2e]/8 bg-[#f8fafc] opacity-70")}><div className="flex items-start gap-2"><span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black", stage.state === "done" ? "bg-emerald-600 text-white" : stage.state === "current" ? "bg-amber-500 text-white" : stage.state === "error" ? "bg-red-600 text-white" : "bg-[#dfe5ee] text-[#5a6a82]")}>{stage.state === "done" ? <Check size={12} /> : stage.state === "error" ? <X size={12} /> : index + 1}</span><div><p className={cn("text-[11px] font-bold", stage.state === "error" ? "text-red-700" : "text-[#0d1b2e]")}>{stage.label}</p><p className="mt-0.5 text-[10px] leading-snug text-[#5a6a82]">{stage.description}</p></div></div></div>)}</div></div>;
}

type EmployeeOption = { id: string; full_name: string; function_name?: string | null; is_active?: boolean };

function EmployeeMultiSelect({ label, employees, selectedIds, onChange, disabled, placeholder, clearLabel }: {
  label: string; employees: EmployeeOption[]; selectedIds: string[]; onChange: (ids: string[]) => void; disabled?: boolean; placeholder: string; clearLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!containerRef.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, []);
  const filtered = employees.filter(employee => employee.full_name.toLowerCase().includes(search.toLowerCase()));
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter(selectedId => selectedId !== id) : [...selectedIds, id]);
  return <div ref={containerRef} className="relative">
    <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">{label}</label>
    <button type="button" disabled={disabled} onClick={() => setOpen(value => !value)} className={cn(INPUT, "min-h-[42px] text-left", disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer")}>{selectedIds.length ? `${selectedIds.length} selecionado(s)` : placeholder}</button>
    {selectedIds.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{selectedIds.map(id => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-[#e8eef8] px-2 py-1 text-[11px] font-bold text-[#0057e7]">{employees.find(employee => employee.id === id)?.full_name || "Funcionário"}<button type="button" disabled={disabled} onClick={() => toggle(id)} aria-label={`Remover ${employees.find(employee => employee.id === id)?.full_name || "funcionário"}`}><X size={12} /></button></span>)}<button type="button" disabled={disabled} onClick={() => onChange([])} className="text-[11px] font-bold text-red-600 hover:text-red-700">{clearLabel}</button></div>}
    {open && !disabled && <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[#0d1b2e]/10 bg-white p-2 shadow-xl"><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por nome" className={cn(INPUT, "mb-2 py-2 text-xs")} />{filtered.length === 0 ? <p className="px-2 py-3 text-xs text-[#5a6a82]">Nenhum funcionário encontrado.</p> : filtered.map(employee => <label key={employee.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-[#f5f7fa]"><input type="checkbox" checked={selectedIds.includes(employee.id)} onChange={() => toggle(employee.id)} />{employee.full_name}</label>)}</div>}
  </div>;
}

const normalizeSearchText = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
const normalizeSearchDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const normalizeSearchIdentifier = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizeAddressLookup = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

const FALLBACK_STATES: IbgeState[] = [
  { sigla: "AC", nome: "Acre" }, { sigla: "AL", nome: "Alagoas" }, { sigla: "AP", nome: "Amapá" }, { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" }, { sigla: "CE", nome: "Ceará" }, { sigla: "DF", nome: "Distrito Federal" }, { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" }, { sigla: "MA", nome: "Maranhão" }, { sigla: "MT", nome: "Mato Grosso" }, { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" }, { sigla: "PA", nome: "Pará" }, { sigla: "PB", nome: "Paraíba" }, { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" }, { sigla: "PI", nome: "Piauí" }, { sigla: "RJ", nome: "Rio de Janeiro" }, { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" }, { sigla: "RO", nome: "Rondônia" }, { sigla: "RR", nome: "Roraima" }, { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" }, { sigla: "SE", nome: "Sergipe" }, { sigla: "TO", nome: "Tocantins" },
];

const PRIORITY_COLORS: Record<string, string> = {
  baixa:   "bg-[#e8eef8] text-[#5a6a82]",
  normal:  "bg-[#e8f5e9] text-[#2e7d32]",
  alta:    "bg-[#fff3e0] text-[#e65100]",
  urgente: "bg-[#ffebee] text-[#c62828]",
};
const PRIORITY_LABELS: Record<string, string> = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" };

function PriorityBadge({ priority }: { priority?: string }) {
  const p = priority || "normal";
  return <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap", PRIORITY_COLORS[p] || PRIORITY_COLORS.normal)}>{PRIORITY_LABELS[p] || p}</span>;
}

function OrderFilterMultiSelect({ label, options, selectedValues, onSelect, onRemove, placeholder, disabled = false, loading = false }: { label: string; options: MultiSelectOption[]; selectedValues: string[]; onSelect: (value: string) => void; onRemove: (value: string) => void; placeholder: string; disabled?: boolean; loading?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = normalizeSearchText(query);
  const visibleOptions = options.filter(option => !normalizedQuery || normalizeSearchText(option.label).includes(normalizedQuery));

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => { if (!containerRef.current?.contains(event.target as Node)) setOpen(false); };
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("pointerdown", handlePointerDown); document.removeEventListener("keydown", handleKeyDown); };
  }, []);

  return <div ref={containerRef} className="relative w-full">
    <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">{label}</label>
    <button type="button" disabled={disabled} onClick={() => setOpen(value => !value)} className={cn(INPUT, "h-[42px] w-full cursor-pointer text-left", disabled && "cursor-not-allowed opacity-60")}>
      {selectedValues.length === 0 ? <span className="text-sm font-normal text-[#5a6a82]/70">{loading ? "Carregando..." : placeholder}</span> : <span className="text-sm font-normal text-[#0d1b2e]">{selectedValues.length} selecionado{selectedValues.length !== 1 ? "s" : ""}</span>}
      <ChevronDown size={14} className="float-right mt-0.5" />
    </button>
    {selectedValues.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{selectedValues.map(value => <span key={value} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#0057e7] px-2.5 py-1 text-xs font-medium text-white"><span className="truncate">{options.find(option => option.value === value)?.label || value}</span><button type="button" onClick={event => { event.stopPropagation(); onRemove(value); }} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white hover:bg-[#0046c0]" aria-label={`Remover ${value}`}><X size={13} /></button></span>)}</div>}
    {open && !disabled && <div className="absolute left-0 right-0 top-full z-[60] mt-1 overflow-hidden rounded-lg border border-[#0d1b2e]/15 bg-white shadow-lg">
      <div className="border-b border-[#0d1b2e]/10 p-2"><input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar..." className={cn(INPUT, "py-2 text-xs")} /></div>
      <div className="max-h-56 overflow-y-auto p-1">{loading ? <p className="p-3 text-xs text-[#5a6a82]">Carregando...</p> : visibleOptions.length === 0 ? <p className="p-3 text-xs text-[#5a6a82]">Nenhuma opção encontrada.</p> : visibleOptions.map(option => { const selected = selectedValues.includes(option.value); return <button type="button" key={option.value} onClick={() => onSelect(option.value)} className={cn("flex w-full items-center justify-between rounded px-2 py-2 text-left text-xs hover:bg-[#e8eef8]", selected && "bg-[#e8eef8] font-bold")}><span>{option.label}</span>{selected && <CheckCircle size={14} className="text-[#0057e7]" />}</button>; })}</div>
    </div>}
  </div>;
}

function OrderAddressSelect({ label, value, onChange, disabled, placeholder, options }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; placeholder: string; options: { value: string; label: string }[] }) {
  return <div>
    <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">{label}<span className="text-red-400">*</span></label>
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={cn(INPUT, "h-[42px] w-full rounded-lg px-3 py-2.5 text-sm")}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent position="popper" side="bottom" align="start" sideOffset={4} avoidCollisions={false} className="max-h-[min(18rem,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)]">
        {options.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}

export function OSSituationsView({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  if (!hasPermission("orders.view")) return null;
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState({ name: "", slug: "", color: "", hours: "", is_active: true, sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const load = async () => { setLoading(true); const { data } = await supabase.from("os_situations").select("id,name,slug,color,hours,sort_order,is_active,created_at,updated_at").order("sort_order"); setItems(data || []); setLoading(false); };
  useEffect(() => { load(); }, []);
  const openNew = () => { setEditItem(null); setForm({ name: "", slug: "", color: "", hours: "", is_active: true, sort_order: items.length }); setDrawerOpen(true); };
  const openEdit = (item: any) => { setEditItem(item); setForm({ name: item.name || "", slug: item.slug || "", color: item.color || "", hours: item.hours == null ? "" : String(item.hours), is_active: item.is_active, sort_order: item.sort_order }); setDrawerOpen(true); };
  const save = async () => {
    if (!hasPermission("orders.update")) return;
    if (!form.name.trim()) { setToast({ msg: "Informe o nome da situação.", type: "error" }); return; }
    if (form.color && !isHexColor(form.color)) { setToast({ msg: "Informe uma cor HEX válida no formato #RRGGBB.", type: "error" }); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), slug: form.slug.trim() || editItem?.slug?.trim() || slugify(form.name), color: form.color.trim().toUpperCase() || null, hours: form.hours === "" ? null : Number(form.hours), is_active: form.is_active, sort_order: Number(form.sort_order) };
    const { error } = editItem ? await supabase.from("os_situations").update(payload).eq("id", editItem.id) : await supabase.from("os_situations").insert(payload);
    setSaving(false);
    if (error) { setToast({ msg: `Erro: ${error.message}`, type: "error" }); return; }
    setDrawerOpen(false); load();
  };
  const remove = async (id: string) => { if (!hasPermission("orders.delete")) return; await supabase.from("os_situations").delete().eq("id", id); load(); };
  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {delId && <ConfirmDialog message="Remover esta situação?" onConfirm={() => { setDelId(null); void remove(delId); }} onCancel={() => setDelId(null)} />}
    <PageHeader title="Situações da OS" subtitle="Etapas de progresso das ordens de serviço" actions={<div className="flex items-center gap-2"><InternalBackButton onBack={onBack} />{hasPermission("orders.update") && <button onClick={openNew} className="flex items-center gap-1.5 text-xs text-white font-bold bg-[#0057e7] px-3 py-2 rounded-lg hover:bg-[#0046c0] transition-colors"><Plus size={13} /> Nova Situação</button>}</div>} />
    <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">{loading ? <LoadingState /> : items.length === 0 ? <EmptyState icon={List} title="Nenhuma situação" message="Crie situações para acompanhar as etapas das OS." /> : <table className="w-full text-sm"><tbody className="divide-y divide-[#0d1b2e]/5">{items.map(item => <tr key={item.id} className="hover:bg-[#f8fafc]/80"><td className="px-4 py-3 text-[#5a6a82] text-xs font-mono">{item.sort_order}</td><td className="px-4 py-3"><div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color || "#0057e7" }} /><div><p className="font-semibold text-[#0d1b2e]">{item.name}</p><p className="text-xs text-[#5a6a82]">{item.hours == null ? "Horas não informadas" : `${item.hours} hora(s)`}{item.slug ? ` · ${item.slug}` : ""}</p></div></div></td><td className="px-4 py-3"><span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", item.is_active ? "bg-green-100 text-green-700" : "bg-[#f5f7fa] text-[#5a6a82]")}>{item.is_active ? "Ativa" : "Inativa"}</span></td><td className="px-4 py-3"><div className="flex gap-2 justify-end">{hasPermission("orders.update") && <button onClick={() => openEdit(item)} className="p-1.5 text-[#5a6a82] hover:text-[#0057e7] hover:bg-[#e8eef8] rounded-lg"><Edit2 size={14} /></button>}{hasPermission("orders.delete") && <button onClick={() => setDelId(item.id)} className="p-1.5 text-[#5a6a82] hover:text-red-500 hover:bg-red-50 rounded-lg"><Trash2 size={14} /></button>}</div></td></tr>)}</tbody></table>}</div>
    {drawerOpen && <AdminPage open={true} onClose={() => setDrawerOpen(false)} breadcrumb="Situações da OS" title={editItem ? "Editar situação" : "Nova situação"} maxW="max-w-md"><div className="p-5 space-y-4"><FInput label="Nome" value={form.name} required onChange={(e: any) => setForm({ ...form, name: e.target.value })} /><FInput label="Slug" value={form.slug} onChange={(e: any) => setForm({ ...form, slug: e.target.value })} /><FInput label="Cor" type="color" value={form.color || "#0057e7"} onChange={(e: any) => setForm({ ...form, color: e.target.value })} /><FInput label="Horas" type="number" min="0" value={form.hours} onChange={(e: any) => setForm({ ...form, hours: e.target.value })} /><FInput label="Ordem de exibição" type="number" min="0" value={form.sort_order} onChange={(e: any) => setForm({ ...form, sort_order: Number(e.target.value) })} /><FToggle label="Situação ativa" checked={form.is_active} onChange={is_active => setForm({ ...form, is_active })} /></div><div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3"><BtnSecondary onClick={() => setDrawerOpen(false)}>Cancelar</BtnSecondary>{hasPermission("orders.update") && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}</div></AdminPage>}
  </div>;
}

function QuickEquipmentModal({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: (items: { type: any; brand: any; model: any }) => void;
}) {
  const { hasPermission } = useAuth();
  const [typeName, setTypeName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [modelName, setModelName] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: position.x, y: position.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPosition({ x: dragRef.current.x + event.clientX - dragRef.current.startX, y: dragRef.current.y + event.clientY - dragRef.current.startY });
  };
  const endDrag = () => { dragRef.current = null; };
  const save = async () => {
    if (!typeName.trim() || !brandName.trim() || !modelName.trim()) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const { data: existingType, error: typeLookupError } = await supabase.from("equipment_types").select("*").ilike("name", typeName.trim()).maybeSingle();
      if (typeLookupError) throw typeLookupError;
      const typeResult = existingType ? { data: existingType, error: null } : await supabase.from("equipment_types").insert({ name: typeName.trim(), slug: slugify(typeName), is_active: true, sort_order: 0 }).select("*").single();
      const { data: type, error: typeError } = typeResult;
      if (typeError || !type) throw typeError || new Error("Equipamento não foi cadastrado.");
      const { data: existingBrand, error: brandLookupError } = await supabase.from("equipment_brands").select("*").eq("equipment_type_id", type.id).ilike("name", brandName.trim()).maybeSingle();
      if (brandLookupError) throw brandLookupError;
      const brandResult = existingBrand ? { data: existingBrand, error: null } : await supabase.from("equipment_brands").insert({ name: brandName.trim(), slug: slugify(brandName), equipment_type_id: type.id, is_active: true, sort_order: 0 }).select("*").single();
      const { data: brand, error: brandError } = brandResult;
      if (brandError || !brand) throw brandError || new Error("Marca não foi cadastrada.");
      const { data: existingModel, error: modelLookupError } = await supabase.from("equipment_models").select("*").eq("equipment_brand_id", brand.id).ilike("name", modelName.trim()).maybeSingle();
      if (modelLookupError) throw modelLookupError;
      const modelResult = existingModel ? { data: existingModel, error: null } : await supabase.from("equipment_models").insert({ name: modelName.trim(), slug: slugify(modelName), equipment_brand_id: brand.id, is_active: true, sort_order: 0 }).select("*").single();
      const { data: model, error: modelError } = modelResult;
      if (modelError || !model) throw modelError || new Error("Modelo não foi cadastrado.");
      onSaved({ type, brand, model });
      onClose();
    } catch (error) {
      console.error("[ADMIN] quick equipment save error:", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-[#0d1b2e]/35 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div style={{ transform: `translate(${position.x}px, ${position.y}px)` }} className="relative w-full max-w-sm rounded-xl bg-white shadow-2xl border border-[#0d1b2e]/10 overflow-hidden">
        <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className="flex cursor-move items-center justify-between border-b border-[#0d1b2e]/10 px-4 py-3 select-none">
          <div><h3 className="text-sm font-bold text-[#0d1b2e]">Adicionar novo equipamento</h3><p className="text-[11px] text-[#5a6a82] mt-0.5">Cadastre a hierarquia completa</p></div>
          <button type="button" onClick={onClose} className="p-1.5 text-[#5a6a82] hover:bg-[#f5f7fa] rounded-lg" aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3"><FInput label="Tipo de equipamento" required autoFocus value={typeName} onChange={(event: any) => setTypeName(event.target.value)} placeholder="Ex: Televisão" /><FInput label="Marca" required value={brandName} onChange={(event: any) => setBrandName(event.target.value)} placeholder="Ex: Samsung" /><FInput label="Modelo" required value={modelName} onChange={(event: any) => setModelName(event.target.value)} placeholder="Ex: UN55CU7700" />{errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}</div>
        <div className="flex justify-end gap-2 border-t border-[#0d1b2e]/10 px-4 py-3"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>{hasPermission("equipment.create") && <BtnPrimary onClick={save} disabled={saving || !typeName.trim() || !brandName.trim() || !modelName.trim()}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}</div>
      </div>
    </div>
  );
}

function ServiceTypeModal({ onClose, onSaved }: { onClose: () => void; onSaved: (serviceType: any) => void }) {
  const { hasPermission } = useAuth();
  const [form, setForm] = useState({ title: "", description: "", forecast_days: "", is_active: true });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: position.x, y: position.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPosition({ x: dragRef.current.x + event.clientX - dragRef.current.startX, y: dragRef.current.y + event.clientY - dragRef.current.startY });
  };
  const save = async () => {
    if (!form.title.trim()) { setErrorMessage("Informe o título do tipo de atendimento."); return; }
    setSaving(true);
    setErrorMessage("");
    const { data, error } = await supabase.from("service_types").insert({ title: form.title.trim(), description: form.description.trim() || null, forecast_days: form.forecast_days ? Number(form.forecast_days) : null, is_active: form.is_active, sort_order: 0 }).select("id,title,description,forecast_days,is_active,sort_order").single();
    if (error || !data) setErrorMessage(error?.message || "Tipo de atendimento não foi cadastrado.");
    else { onSaved(data); onClose(); }
    setSaving(false);
  };
  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-[#0d1b2e]/35 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div style={{ transform: `translate(${position.x}px, ${position.y}px)` }} className="relative w-full max-w-sm rounded-xl bg-white shadow-2xl border border-[#0d1b2e]/10 overflow-hidden">
        <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }} className="flex cursor-move items-center justify-between border-b border-[#0d1b2e]/10 px-4 py-3 select-none">
          <div><h3 className="text-sm font-bold text-[#0d1b2e]">Novo tipo de atendimento</h3><p className="text-[11px] text-[#5a6a82] mt-0.5">Cadastre sem sair da OS</p></div>
          <button type="button" onClick={onClose} className="p-1.5 text-[#5a6a82] hover:bg-[#f5f7fa] rounded-lg" aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-3">
          <FInput label="Título" required autoFocus value={form.title} onChange={(event: any) => setForm({ ...form, title: event.target.value })} />
          <FTextarea label="Descrição" value={form.description} onChange={(event: any) => setForm({ ...form, description: event.target.value })} rows={3} />
          <FInput label="Previsão em dias" type="number" min="0" value={form.forecast_days} onChange={(event: any) => setForm({ ...form, forecast_days: event.target.value })} />
          <FToggle label="Tipo ativo" checked={form.is_active} onChange={is_active => setForm({ ...form, is_active })} />
          {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#0d1b2e]/10 px-4 py-3"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>{hasPermission("service_types.create") && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}</div>
      </div>
    </div>
  );
}
export function TabOrders({ onNavigate, initialOrderId, onFocused }: { onNavigate?: (tab: AdminTab) => void; initialOrderId?: string | null; onFocused?: () => void }) {
  const { user, profile, hasPermission } = useAuth();
  const [subView, setSubView] = useState<"list" | "situations">("list");
  const [displayMode, setDisplayMode] = useState<"list" | "kanban">(() => {
    if (typeof window === "undefined") return "list";
    return window.localStorage.getItem("os_view_mode") === "kanban" ? "kanban" : "list";
  });
  const [orders, setOrders] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [situations, setSituations] = useState<any[]>([]);
  const [serviceTypeSituations, setServiceTypeSituations] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [brands, setBrands] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [equipmentTypes, setEquipmentTypes] = useState<any[]>([]);
  const [equipmentBrands, setEquipmentBrands] = useState<any[]>([]);
  const [equipmentModels, setEquipmentModels] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [serviceTypes, setServiceTypes] = useState<any[]>([]);
  const [generalServices, setGeneralServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSituation, setFilterSituation] = useState("");
  const [filterOrderType, setFilterOrderType] = useState<OrderType | "">("");
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState("");
  const [orderSort, setOrderSort] = useState<"" | "asc" | "desc">("");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<CityFilterOption[]>([]);
  const [cityFilterOptions, setCityFilterOptions] = useState<CityFilterOption[]>([]);
  const [cityFiltersLoading, setCityFiltersLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [detail, setDetail] = useState<any>(null);
  const [detailHistory, setDetailHistory] = useState<any[]>([]);
  const [detailUsedItems, setDetailUsedItems] = useState<any[]>([]);
  const [detailPartRequests, setDetailPartRequests] = useState<any[]>([]);
  const [selectedPartRequest, setSelectedPartRequest] = useState<PartRequestForReview | null>(null);
  const [partApprovalOpen, setPartApprovalOpen] = useState(false);
  const [partRejectionOpen, setPartRejectionOpen] = useState(false);
  const [approvalQuantities, setApprovalQuantities] = useState<Record<string, string>>({});
  const [partReviewNotes, setPartReviewNotes] = useState("");
  const [partReviewSubmitting, setPartReviewSubmitting] = useState(false);
  const [detailSolutionImages, setDetailSolutionImages] = useState<OrderImage[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [solveOpen, setSolveOpen] = useState(false);
  const [completionOpen, setCompletionOpen] = useState(false);
  const [completionDiscount, setCompletionDiscount] = useState("");
  const [partRequestOpen, setPartRequestOpen] = useState(false);
  const [partRequestInventory, setPartRequestInventory] = useState<PartRequestInventoryItem[]>([]);
  const [partRequestInventoryLoading, setPartRequestInventoryLoading] = useState(false);
  const [partRequestSearch, setPartRequestSearch] = useState("");
  const [selectedPartRequestItems, setSelectedPartRequestItems] = useState<SelectedPartRequestItem[]>([]);
  const [partRequestNotes, setPartRequestNotes] = useState("");
  const [partRequestSubmitting, setPartRequestSubmitting] = useState(false);
  const [partRequestInventoryError, setPartRequestInventoryError] = useState("");
  const [partRequestPurpose, setPartRequestPurpose] = useState<"RESOLUTION" | "TEST">("RESOLUTION");
  const [selectedDeliveryRequest, setSelectedDeliveryRequest] = useState<PartRequestForReview | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);
  const [custodyAction, setCustodyAction] = useState<CustodyAction>("DISPATCH");
  const [custodyQuantities, setCustodyQuantities] = useState<Record<string, string>>({});
  const [selectedTestRequest, setSelectedTestRequest] = useState<PartRequestForReview | null>(null);
  const [testResultOpen, setTestResultOpen] = useState(false);
  const [testResultRows, setTestResultRows] = useState<TestResultRow[]>([]);
  const [testResultSubmitting, setTestResultSubmitting] = useState(false);
  const [solveDraft, setSolveDraft] = useState({ diagnosis: "", solution: "", usedItems: [], cannotSolve: false, cannotSolveReason: "" } as { diagnosis: string; solution: string; usedItems: any[]; cannotSolve: boolean; cannotSolveReason: string });
  const [solutionImages, setSolutionImages] = useState<OrderImage[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingOS, setEditingOS] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [selectedTechnicianIds, setSelectedTechnicianIds] = useState<string[]>([]);
  const [selectedSellerIds, setSelectedSellerIds] = useState<string[]>([]);
  const [customerDraft, setCustomerDraft] = useState<CustomerForm>({ ...emptyCustomerForm });
  const [customerAddressDraft, setCustomerAddressDraft] = useState<Address>({ ...emptyAddress });
  const [serviceUseCustomerAddress, setServiceUseCustomerAddress] = useState(false);
  const [serviceCustomerAddressOverride, setServiceCustomerAddressOverride] = useState(false);
  const [serviceAddressMessage, setServiceAddressMessage] = useState("");
  const [ibgeStates, setIbgeStates] = useState<IbgeState[]>([]);
  const [ibgeStatesLoading, setIbgeStatesLoading] = useState(false);
  const [ibgeCities, setIbgeCities] = useState<IbgeCity[]>([]);
  const [ibgeCitiesLoading, setIbgeCitiesLoading] = useState(false);
  const citiesCacheRef = useRef<Record<string, IbgeCity[]>>({});
  const citiesRequestRef = useRef(0);
  const filterCitiesRequestRef = useRef(0);
  const zipRequestRef = useRef(0);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjMessage, setCnpjMessage] = useState("");
  const [addressExpanded, setAddressExpanded] = useState(false);
  const [quickEquipment, setQuickEquipment] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatusId, setDragOverStatusId] = useState<string | null>(null);
  const dragOriginRef = useRef<any[] | null>(null);
  const suppressCardClickRef = useRef(false);

  const emptyForm = { service_id: "", general_service_id: "", service_type_id: "", seller_id: "", status_id: "", situation_id: "", customer_id: "", technician_id: "", brand_id: "", product_id: "", model: "", equipment_type_id: "", equipment_brand_id: "", equipment_model_id: "", serial_number: "", accessories: "", equipment_condition: "", priority: "normal", scheduled_at: "", started_at: "", internal_notes: "", customer_notes: "", order_type: "internal" as OrderType, service_state: "", service_city: "", service_street: "", service_zip_code: "", service_neighborhood: "", service_number: "", service_complement: "", service_customer_address_id: "", external_os_number: "" };
  const [form, setForm] = useState(emptyForm);
  const [needsScheduling, setNeedsScheduling] = useState(true);
  const [orderImages, setOrderImages] = useState<OrderImage[]>([]);
  const [initialOrderImageIds, setInitialOrderImageIds] = useState<string[]>([]);
  const [viewImage, setViewImage] = useState<OrderImage | null>(null);
  const upF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const selectedServiceAddress = ((selectedCustomer?.addresses || []) as Address[]).find(address => address.is_default) || ((selectedCustomer?.addresses || []) as Address[])[0] || null;
  const serviceAddressPreview: Address | null = serviceUseCustomerAddress
    ? (serviceCustomerAddressOverride ? selectedServiceAddress : { id: form.service_customer_address_id || undefined, zip_code: form.service_zip_code, state: form.service_state, city: form.service_city, neighborhood: form.service_neighborhood, street: form.service_street, number: form.service_number, complement: form.service_complement })
    : null;
  const clearServiceAddress = () => {
    upF("service_zip_code", ""); upF("service_state", ""); upF("service_city", ""); upF("service_neighborhood", "");
    upF("service_street", ""); upF("service_number", ""); upF("service_complement", "");
  };
  const copyCustomerAddressToForm = (address: Address | null) => {
    upF("service_zip_code", address?.zip_code || ""); upF("service_state", address?.state || ""); upF("service_city", address?.city || "");
    upF("service_neighborhood", address?.neighborhood || ""); upF("service_street", address?.street || ""); upF("service_number", address?.number || ""); upF("service_complement", address?.complement || "");
    if (address?.state) void loadIbgeCities(address.state, address.city);
  };
  const loadIbgeCities = async (state: string, preferredCity?: string) => {
    const uf = state.trim().toUpperCase();
    if (!uf) { setIbgeCities([]); return []; }
    const requestId = ++citiesRequestRef.current;
    const cached = citiesCacheRef.current[uf];
    if (cached) {
      setIbgeCities(cached);
      if (preferredCity) {
        const officialCity = cached.find(city => normalizeAddressLookup(city.nome) === normalizeAddressLookup(preferredCity));
        if (officialCity) upF("service_city", officialCity.nome);
      }
      return cached;
    }
    setIbgeCitiesLoading(true);
    try {
      const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
      if (!response.ok) throw new Error("Falha ao carregar cidades.");
      const cities = await response.json() as IbgeCity[];
      if (requestId !== citiesRequestRef.current) return [];
      citiesCacheRef.current[uf] = cities;
      setIbgeCities(cities);
      if (preferredCity) {
        const officialCity = cities.find(city => normalizeAddressLookup(city.nome) === normalizeAddressLookup(preferredCity));
        if (officialCity) upF("service_city", officialCity.nome);
      }
      return cities;
    } catch {
      if (requestId === citiesRequestRef.current) setIbgeCities([]);
      return [];
    } finally {
      if (requestId === citiesRequestRef.current) setIbgeCitiesLoading(false);
    }
  };

  const loadFilterCities = async (states: string[]) => {
    const requestId = ++filterCitiesRequestRef.current;
    if (states.length === 0) { setCityFilterOptions([]); setCityFiltersLoading(false); return; }
    setCityFiltersLoading(true);
    const citiesByState = await Promise.all(states.map(async state => {
      const uf = state.trim().toUpperCase();
      const cached = citiesCacheRef.current[uf];
      if (cached) return cached.map(city => ({ name: city.nome, state: uf }));
      try {
        const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
        if (!response.ok) return [];
        const cities = await response.json() as IbgeCity[];
        citiesCacheRef.current[uf] = cities;
        return cities.map(city => ({ name: city.nome, state: uf }));
      } catch { return []; }
    }));
    if (requestId !== filterCitiesRequestRef.current) return;
    const uniqueCities = new Map<string, CityFilterOption>();
    citiesByState.flat().forEach(city => uniqueCities.set(`${city.state}:${normalizeSearchText(city.name)}`, city));
    setCityFilterOptions(Array.from(uniqueCities.values()).sort((left, right) => left.state.localeCompare(right.state) || left.name.localeCompare(right.name)));
    setCityFiltersLoading(false);
  };

  useEffect(() => { void loadFilterCities(selectedStates); }, [selectedStates]);
  useEffect(() => { setSelectedCities(current => current.filter(city => selectedStates.includes(city.state))); }, [selectedStates]);

  useEffect(() => {
    let active = true;
    setIbgeStatesLoading(true);
    fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome")
      .then(response => response.ok ? response.json() as Promise<IbgeState[]> : Promise.reject(new Error("Falha ao carregar estados.")))
      .then(states => { if (active) setIbgeStates(states); })
      .catch(() => { if (active) setIbgeStates(FALLBACK_STATES); })
      .finally(() => { if (active) setIbgeStatesLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (form.order_type !== "external" || serviceUseCustomerAddress || normalizeSearchDigits(form.service_zip_code).length !== 8) return;
    const requestId = ++zipRequestRef.current;
    setServiceAddressMessage("");
    const zipCode = formatZipCode(form.service_zip_code);
    setIbgeCitiesLoading(true);
    fetchAddressByZipCode(zipCode)
      .then(async address => {
        if (requestId !== zipRequestRef.current) return;
        if (!address) { setServiceAddressMessage("CEP não encontrado. Verifique ou preencha o endereço manualmente."); return; }
        upF("service_state", address.state || "");
        upF("service_neighborhood", address.neighborhood || "");
        upF("service_street", address.street || "");
        const cities = await loadIbgeCities(address.state || "", address.city || "");
        if (requestId !== zipRequestRef.current) return;
        if (!cities.some(city => normalizeAddressLookup(city.nome) === normalizeAddressLookup(address.city))) upF("service_city", address.city || "");
        setServiceAddressMessage("");
      })
      .catch(() => { if (requestId === zipRequestRef.current) setServiceAddressMessage("Não foi possível consultar o CEP agora. Preencha o endereço manualmente."); })
      .finally(() => { if (requestId === zipRequestRef.current) setIbgeCitiesLoading(false); });
    return () => { zipRequestRef.current += 1; };
  }, [form.order_type, form.service_zip_code, serviceUseCustomerAddress]);

  const loadOrderImages = async (orderId: string) => {
    const { data, error } = await supabase.from("service_order_media").select("id,media_id,sort_order,media:media(id,file_name,bucket_id,storage_path)").eq("service_order_id", orderId).order("sort_order");
    if (error) { console.error("[ADMIN] service order media load error:", error); setOrderImages([]); setInitialOrderImageIds([]); return; }
    const images = (data || []).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da OS" }));
    setOrderImages(images); setInitialOrderImageIds(images.map(image => image.mediaId).filter(Boolean));
  };

  const addOrderImages = (files: FileList | null) => {
    const available = Math.max(0, 5 - orderImages.length);
    const selected = Array.from(files || []).filter(file => ["image/jpeg", "image/png", "image/webp"].includes(file.type)).slice(0, available);
    setOrderImages(current => [...current, ...selected.map(file => ({ key: `new-${Date.now()}-${Math.random()}`, file, url: URL.createObjectURL(file), name: file.name }))]);
  };

  const removeOrderImage = (key: string) => setOrderImages(current => {
    const removed = current.find(image => image.key === key);
    if (removed?.url) URL.revokeObjectURL(removed.url);
    return current.filter(image => image.key !== key);
  });

  const loadPartRequestInventory = async () => {
    setPartRequestInventoryLoading(true);
    try {
      const { data, error } = await supabase.from("inventory_items").select("id,name,sku,unit,quantity,is_active").eq("is_active", true).order("name");
      if (error) {
        console.error("[PART REQUEST] inventory load error", error);
        setPartRequestInventory([]);
        setPartRequestInventoryError(supabaseErrorMessage(error));
        setToast({ msg: supabaseErrorMessage(error), type: "error" });
      } else {
        setPartRequestInventory((data || []) as PartRequestInventoryItem[]);
        setPartRequestInventoryError("");
      }
    } catch (error) {
      console.error("[PART REQUEST] inventory load error", error);
      setPartRequestInventory([]);
      setPartRequestInventoryError(supabaseErrorMessage(error));
      setToast({ msg: supabaseErrorMessage(error), type: "error" });
    } finally {
      setPartRequestInventoryLoading(false);
    }
  };

  const loadInventoryItems = async () => {
    const { data, error } = await supabase.from("inventory_items").select("id,name,sku,unit,quantity,is_active").eq("is_active", true).order("name");
    if (!error) setInventoryItems(data || []);
  };

  const loadPartRequests = async (orderId: string) => {
    const { data, error } = await supabase.from("service_order_part_requests").select("id,service_order_id,requested_by,purpose,status,notes,reviewed_by,reviewed_at,review_notes,created_at,requested_by_profile:profiles!requested_by(full_name),reviewed_by_profile:profiles!reviewed_by(full_name),items:service_order_part_request_items(id,inventory_item_id,quantity,approved_quantity,source_test_item_id,delivered_quantity,delivered_at,delivered_by,technician_received_quantity,technician_received_at,technician_received_by,return_pending_quantity,return_registered_at,return_registered_by,returned_quantity,return_received_at,return_received_by,damaged_quantity,inventory_item:inventory_items(id,name,sku,unit,quantity))").eq("service_order_id", orderId).order("created_at", { ascending: false });
    if (error) { console.error("[ADMIN] part requests load error:", error); setDetailPartRequests([]); return; }
    setDetailPartRequests((data || []).map((request: any) => ({ ...request, requester: request.requested_by_profile || null, items: (request.items || []).map((item: any) => ({ ...item, request_status: request.status })) })));
  };

  const load = async () => {
    setLoading(true);
    const [ordRes, statRes, sitRes, profRes, serviceRes, brandRes, productRes, equipmentTypeRes, equipmentBrandRes, equipmentModelRes, employeeRes, generalServiceRes, serviceTypeRes, serviceTypeSituationRes] = await Promise.all([
      supabase.from("service_orders").select("*, order_status:order_statuses(id,name,color), situation:os_situations(id,name,color,hours), customer:customers(id,customer_type,full_name,phone,whatsapp,document,email,trade_name,legal_name,cnpj,state_registration,birth_date,addresses:customer_addresses(*)), service:services(id,title), assigned_profile:profiles!assigned_to(id,full_name), seller:employees!seller_id(id,full_name), technician:employees!technician_id(id,full_name), technician_links:service_order_technicians(employee_id,employee:employees(id,full_name,function_name,is_active)), seller_links:service_order_sellers(employee_id,employee:employees(id,full_name,function_name,is_active)), service_type:service_types(id,title), general_service:general_services(id,name,price,max_discount_percentage), equipment_type:equipment_types(id,name), equipment_brand:equipment_brands(id,name), equipment_model:equipment_models(id,name)").order("created_at", { ascending: false }),
      supabase.from("order_statuses").select("id,name,color,sort_order").order("sort_order"),
      supabase.from("os_situations").select("id,name,color,sort_order").eq("is_active", true).order("sort_order"),
      supabase.from("profiles").select("id,full_name").order("full_name"),
      supabase.from("services").select("id,title").eq("is_active", true).order("title"),
      supabase.from("brands").select("id,name").eq("is_active", true).order("name"),
      supabase.from("products").select("id,name").eq("is_active", true).order("name"),
      supabase.from("equipment_types").select("id,name").eq("is_active", true).order("sort_order").order("name"),
      supabase.from("equipment_brands").select("id,name,equipment_type_id").eq("is_active", true).order("sort_order").order("name"),
      supabase.from("equipment_models").select("id,name,equipment_brand_id").eq("is_active", true).order("sort_order").order("name"),
      supabase.from("employees").select("id,full_name,is_active").eq("is_active", true).order("full_name"),
      supabase.from("general_services").select("id,name,is_active,sort_order").eq("is_active", true).order("sort_order").order("name"),
      supabase.from("service_types").select("id,title,description,forecast_days,is_active,sort_order").eq("is_active", true).order("sort_order").order("title"),
      supabase.from("service_type_situations").select("service_type_id,situation_id,use_default_hours,sla_hours,sort_order,situation:os_situations(id,name,color,hours,is_active)").order("sort_order"),
    ]);
    if (ordRes.error) {
      console.error("[ADMIN] service_orders load error:", { code: ordRes.error.code, message: ordRes.error.message, details: ordRes.error.details, hint: ordRes.error.hint });
      setToast({ msg: `Erro ao carregar OS: ${ordRes.error.message}`, type: "error" });
    } else setOrders(ordRes.data || []);
    [statRes, sitRes, profRes, serviceRes, brandRes, productRes, equipmentTypeRes, equipmentBrandRes, equipmentModelRes, employeeRes, generalServiceRes, serviceTypeRes, serviceTypeSituationRes].forEach((result, index) => {
      if (result.error) console.error("[ADMIN] OS related query error:", index, result.error);
    });
    setStatuses(statRes.data || []);
    setSituations(sitRes.data || []);
    setProfiles(profRes.data || []);
    setServices(serviceRes.data || []);
    setBrands(brandRes.data || []);
    setProducts(productRes.data || []);
    setEquipmentTypes(equipmentTypeRes.data || []);
    setEquipmentBrands(equipmentBrandRes.data || []);
    setEquipmentModels(equipmentModelRes.data || []);
    setEmployees(employeeRes.data || []);
    setGeneralServices(generalServiceRes.data || []);
    setServiceTypes(serviceTypeRes.data || []);
    setServiceTypeSituations(serviceTypeSituationRes.data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!initialOrderId || loading) return;
    const order = orders.find(item => item.id === initialOrderId);
    if (order) openDetail(order);
    onFocused?.();
  }, [initialOrderId, loading, orders]);


  const openDetail = async (o: any) => {
    const [{ data: currentOrder }, { data: hist }, { data: mediaLinks }, { data: usedItems }] = await Promise.all([
      supabase.from("service_orders").select("is_solved,solved_at,cannot_be_solved,cannot_be_solved_reason,assigned_profile:profiles!assigned_to(id,full_name),technician_links:service_order_technicians(employee_id,employee:employees(id,full_name,function_name,is_active)),seller_links:service_order_sellers(employee_id,employee:employees(id,full_name,function_name,is_active))").eq("id", o.id).maybeSingle(),
      supabase.from("service_order_status_history").select("*, order_status:order_statuses(name)").eq("service_order_id", o.id).order("created_at", { ascending: false }),
      supabase.from("service_order_media").select("id,media_id,sort_order,media:media(id,file_name,bucket_id,storage_path)").eq("service_order_id", o.id).order("sort_order"),
      supabase.from("service_order_used_items").select("*, inventory_item:inventory_items(id,name,sku,unit)").eq("service_order_id", o.id).order("created_at", { ascending: false }),
    ]);
    const orderImagesList = (mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) < 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da OS" }));
    const solutionImagesList = (mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) >= 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da solução" }));
    setDetailHistory(hist || []);
    setDetailUsedItems(usedItems || []);
    await loadPartRequests(o.id);
    setDetailSolutionImages(solutionImagesList);
    setOrderImages(orderImagesList);
    setDetail({ ...o, ...(currentOrder || {}) });
  };

  const openPartRequestModal = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setPartRequestSearch("");
    setPartRequestPurpose("RESOLUTION");
    setSelectedPartRequestItems([]);
    setPartRequestNotes("");
    setPartRequestInventoryError("");
    setPartRequestOpen(true);
    void loadPartRequestInventory();
  };

  const closePartRequestModal = () => {
    if (partRequestSubmitting) return;
    setPartRequestOpen(false); setPartRequestSearch(""); setSelectedPartRequestItems([]); setPartRequestNotes(""); setPartRequestPurpose("RESOLUTION");
  };

  const selectPartRequestItem = (item: PartRequestInventoryItem) => setSelectedPartRequestItems(current => current.some(selected => selected.inventory_item_id === item.id) ? current : [...current, { inventory_item_id: item.id, name: item.name, sku: item.sku, unit: item.unit || "un", available_quantity: Number(item.quantity), quantity: "1" }]);
  const updatePartRequestQuantity = (id: string, quantity: string) => setSelectedPartRequestItems(current => current.map(item => item.inventory_item_id === id ? { ...item, quantity } : item));
  const removePartRequestItem = (id: string) => setSelectedPartRequestItems(current => current.filter(item => item.inventory_item_id !== id));
  const clearPartRequestItems = () => setSelectedPartRequestItems([]);

  const submitPartRequest = async () => {
    if (!detail?.id || partRequestSubmitting) return;
    if (selectedPartRequestItems.length === 0) { setToast({ msg: "Selecione pelo menos uma peça.", type: "error" }); return; }
    for (const item of selectedPartRequestItems) { const quantity = Number(item.quantity); if (!item.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0 || quantity > item.available_quantity) { setToast({ msg: `Informe uma quantidade válida para ${item.name}, sem exceder o estoque disponível.`, type: "error" }); return; } }
    setPartRequestSubmitting(true);
    try {
      const { error } = await supabase.rpc("request_service_order_parts", { p_service_order_id: detail.id, p_items: selectedPartRequestItems.map(item => ({ inventory_item_id: item.inventory_item_id, quantity: Number(item.quantity) })), p_notes: partRequestNotes.trim() || null, p_purpose: partRequestPurpose });
      if (error) throw error;
    } catch (error) {
      console.error("[PART REQUEST] submit error", error);
      setPartRequestSubmitting(false);
      setToast({ msg: supabaseErrorMessage(error), type: "error" });
      return;
    }
    setPartRequestSubmitting(false); setPartRequestOpen(false); setPartRequestSearch(""); setSelectedPartRequestItems([]); setPartRequestNotes(""); setPartRequestPurpose("RESOLUTION"); setToast({ msg: "Solicitação de peças enviada para análise.", type: "success" }); await loadPartRequests(detail.id);
  };

  const openPartApproval = (event: React.MouseEvent<HTMLButtonElement>, request: PartRequestForReview) => {
    event.preventDefault(); event.stopPropagation();
    setSelectedPartRequest(request); setApprovalQuantities(Object.fromEntries(request.items.map(item => { const limit = item.source_test_item_id ? Number(item.quantity) : Math.min(Number(item.quantity), Number(item.inventory_item?.quantity ?? 0)); return [item.id, String(limit)]; }))); setPartReviewNotes(""); setPartRejectionOpen(false); setPartApprovalOpen(true);
  };
  const openPartRejection = (event: React.MouseEvent<HTMLButtonElement>, request: PartRequestForReview) => {
    event.preventDefault(); event.stopPropagation();
    setSelectedPartRequest(request); setPartReviewNotes(""); setPartApprovalOpen(false); setPartRejectionOpen(true);
  };
  const closePartReview = () => {
    if (partReviewSubmitting) return;
    setPartApprovalOpen(false); setPartRejectionOpen(false); setSelectedPartRequest(null); setApprovalQuantities({}); setPartReviewNotes("");
  };
  const updateApprovalQuantity = (itemId: string, value: string) => setApprovalQuantities(current => ({ ...current, [itemId]: value }));
  const approvePartRequest = async () => {
    if (!selectedPartRequest || partReviewSubmitting) return;
    const quantities = selectedPartRequest.items.map(item => ({ item, requestedQuantity: Number(item.quantity), availableQuantity: Number(item.inventory_item?.quantity ?? 0), approved: Number(approvalQuantities[item.id]) }));
    if (!quantities.length || quantities.some(({ requestedQuantity, availableQuantity, approved }) => !Number.isFinite(requestedQuantity) || requestedQuantity <= 0 || !Number.isFinite(availableQuantity) || !Number.isFinite(approved) || approved < 0)) { setToast({ msg: "Informe quantidades aprovadas válidas.", type: "error" }); return; }
    if (quantities.some(({ requestedQuantity, approved }) => approved > requestedQuantity)) { setToast({ msg: "A quantidade aprovada não pode ser maior que a quantidade solicitada.", type: "error" }); return; }
    if (quantities.some(({ item, availableQuantity, approved }) => !item.source_test_item_id && approved > availableQuantity)) { setToast({ msg: "A quantidade aprovada não pode ser maior que o estoque disponível.", type: "error" }); return; }
    if (!quantities.some(({ approved }) => approved > 0)) { setToast({ msg: "Aprove uma quantidade maior que zero em pelo menos uma peça.", type: "error" }); return; }
    setPartReviewSubmitting(true);
    try {
      const { error } = await supabase.rpc("review_service_order_part_request", { p_request_id: selectedPartRequest.id, p_decision: "APPROVED", p_items: selectedPartRequest.items.map(item => ({ request_item_id: item.id, approved_quantity: Number(approvalQuantities[item.id] || 0) })), p_review_notes: partReviewNotes.trim() || null });
      if (error) throw error;
      setPartReviewSubmitting(false); setPartApprovalOpen(false); setPartRejectionOpen(false); setSelectedPartRequest(null); setApprovalQuantities({}); setPartReviewNotes(""); setToast({ msg: "Pedido de peças aprovado.", type: "success" }); if (detail?.id) await loadPartRequests(detail.id); await load();
    } catch (error) { console.error("[PART REQUEST] approval error", error); setToast({ msg: supabaseErrorMessage(error), type: "error" }); }
    finally { setPartReviewSubmitting(false); }
  };
  const rejectPartRequest = async () => {
    if (!selectedPartRequest || partReviewSubmitting) return;
    if (!partReviewNotes.trim()) { setToast({ msg: "Informe o motivo da rejeição.", type: "error" }); return; }
    setPartReviewSubmitting(true);
    try {
      const { error } = await supabase.rpc("review_service_order_part_request", { p_request_id: selectedPartRequest.id, p_decision: "REJECTED", p_items: [], p_review_notes: partReviewNotes.trim() });
      if (error) throw error;
      setPartReviewSubmitting(false); setPartApprovalOpen(false); setPartRejectionOpen(false); setSelectedPartRequest(null); setApprovalQuantities({}); setPartReviewNotes(""); setToast({ msg: "Pedido de peças rejeitado.", type: "success" }); if (detail?.id) await loadPartRequests(detail.id); await load();
    } catch (error) { console.error("[PART REQUEST] rejection error", error); setToast({ msg: supabaseErrorMessage(error), type: "error" }); }
    finally { setPartReviewSubmitting(false); }
  };

  const submitCustodyAction = async () => {
    if (!selectedDeliveryRequest || deliverySubmitting) return;
    setDeliverySubmitting(true);
    try {
      let result;
      if (custodyAction === "DISPATCH") result = await supabase.rpc("dispatch_service_order_part_request", { p_request_id: selectedDeliveryRequest.id });
      else if (custodyAction === "CONFIRM_DELIVERY") result = await supabase.rpc("confirm_service_order_part_delivery", { p_request_id: selectedDeliveryRequest.id });
      else if (custodyAction === "RECEIVE_RETURN") result = await supabase.rpc("receive_service_order_part_return", { p_request_id: selectedDeliveryRequest.id });
      else {
        const items = selectedDeliveryRequest.items.map(item => ({ request_item_id: item.id, quantity: Number(custodyQuantities[item.id] || 0) })).filter(item => item.quantity > 0);
        if (!items.length) throw new Error("Informe pelo menos uma quantidade para devolução.");
        result = await supabase.rpc("register_service_order_part_return", { p_request_id: selectedDeliveryRequest.id, p_items: items, p_notes: null });
      }
      if (result.error) throw result.error;
      const message = custodyAction === "DISPATCH" ? "Saída das peças confirmada." : custodyAction === "CONFIRM_DELIVERY" ? "Entrega ao técnico confirmada." : custodyAction === "REGISTER_RETURN" ? "Devolução registrada e aguardando recebimento no estoque." : "Retorno ao estoque confirmado.";
      setDeliveryOpen(false); setSelectedDeliveryRequest(null); setCustodyQuantities({}); setToast({ msg: message, type: "success" });
      await loadPartRequests(detail.id); await load();
    } catch (error) { console.error("[PART CUSTODY] action error", error); setToast({ msg: supabaseErrorMessage(error), type: "error" }); }
    finally { setDeliverySubmitting(false); }
  };
  const openCustodyAction = (request: PartRequestForReview, action: CustodyAction) => { setSelectedDeliveryRequest(request); setCustodyAction(action); setCustodyQuantities(Object.fromEntries(request.items.map(item => [item.id, String(Math.max(0, Number(item.technician_received_quantity ?? 0) - Number(item.returned_quantity ?? 0) - Number(item.return_pending_quantity ?? 0) - Number(item.damaged_quantity ?? 0)))]))); setDeliveryOpen(true); };

  const submitTestResults = async () => {
    if (!selectedTestRequest || testResultSubmitting) return;
    if (!testResultRows.length) { setToast({ msg: "Informe pelo menos um resultado.", type: "error" }); return; }
    const totals = new Map<string, number>();
    for (const row of testResultRows) {
      const quantity = Number(row.quantity); const item = selectedTestRequest.items.find(current => current.id === row.requestItemId);
      if (!item || !Number.isFinite(quantity) || quantity <= 0 || row.action === "DAMAGED" && !row.notes.trim()) { setToast({ msg: row.action === "DAMAGED" ? "Informe a justificativa do dano." : "Informe quantidades válidas para o resultado.", type: "error" }); return; }
      const pending = getTestPendingQuantity(selectedTestRequest, item); const total = (totals.get(row.requestItemId) || 0) + quantity; if (total > pending) { setToast({ msg: "A soma dos resultados não pode ultrapassar a quantidade aguardando resultado.", type: "error" }); return; } totals.set(row.requestItemId, total);
    }
    setTestResultSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("record_service_order_test_results", { p_request_id: selectedTestRequest.id, p_actions: testResultRows.map(row => ({ request_item_id: row.requestItemId, action: row.action, quantity: Number(row.quantity), notes: row.notes.trim() || null })) });
      if (error) throw error;
      setTestResultOpen(false); setSelectedTestRequest(null); setTestResultRows([]); setToast({ msg: data?.resolution_request_id ? "Resultado do teste registrado. Um novo pedido para resolução foi criado e aguarda aprovação." : "Resultado do teste registrado.", type: "success" }); await loadPartRequests(detail.id); await load();
    } catch (error) { console.error("[PART REQUEST] test results error", error); setToast({ msg: supabaseErrorMessage(error), type: "error" }); }
    finally { setTestResultSubmitting(false); }
  };

  const getTestCommittedQuantity = (item: PartRequestItemForReview) => detailPartRequests
    .filter((candidate: PartRequestForReview) => (candidate.purpose || "RESOLUTION") === "RESOLUTION")
    .flatMap((candidate: PartRequestForReview) => candidate.items || [])
    .filter((candidate: PartRequestItemForReview) => candidate.source_test_item_id === item.id)
    .reduce((sum: number, candidate: PartRequestItemForReview) => {
      const status = String(candidate.request_status || "").toUpperCase();
      const amount = status === "APPROVED"
        ? Number(candidate.approved_quantity ?? 0)
        : status === "PENDING" ? Number(candidate.quantity ?? 0) : 0;
      return Number.isFinite(amount) ? sum + amount : sum;
    }, 0);

  const getTestPendingQuantity = (_request: PartRequestForReview, item: PartRequestItemForReview) => {
    const delivered = Number(item.technician_received_quantity ?? item.delivered_quantity ?? 0);
    const returned = Number(item.returned_quantity ?? 0) + Number(item.return_pending_quantity ?? 0);
    const damaged = Number(item.damaged_quantity ?? 0);
    const committedForResolution = getTestCommittedQuantity(item);
    return Math.max(0, delivered - returned - damaged - committedForResolution);
  };

  const openNew = () => {
    setSelectedTechnicianIds([]); setSelectedSellerIds([]); setEditingOS(null); setForm(emptyForm); setServiceUseCustomerAddress(false); setServiceCustomerAddressOverride(false); setServiceAddressMessage(""); setIbgeCities([]); setNeedsScheduling(true); setOrderImages([]); setInitialOrderImageIds([]); setViewImage(null); setSelectedCustomer(null); setEditingCustomer(false); setAddressExpanded(false); setCustomerDraft({ ...emptyCustomerForm }); setCustomerAddressDraft({ ...emptyAddress }); setCustomerSearch(""); setCustomerResults([]); setFormOpen(true);
  };

  const openEdit = async (o: any) => {
    const { data: currentOrder, error: currentOrderError } = await supabase.from("service_orders").select("is_solved,cannot_be_solved,cannot_be_solved_reason").eq("id", o.id).maybeSingle();
    if (currentOrderError) {
      setToast({ msg: `Não foi possível verificar o estado da OS: ${supabaseErrorMessage(currentOrderError)}`, type: "error" });
      return;
    }
    if (currentOrder?.is_solved || o.is_solved) {
      setToast({ msg: "Esta OS está solucionada e é somente leitura.", type: "error" });
      return;
    }
    setEditingOS(o);
    setSelectedTechnicianIds(Array.from(new Set((o.technician_links || []).map((link: any) => link.employee_id).filter(Boolean).concat(o.technician_id ? [o.technician_id] : []))));
    setSelectedSellerIds(Array.from(new Set((o.seller_links || []).map((link: any) => link.employee_id).filter(Boolean).concat(o.seller_id ? [o.seller_id] : []))));
    setNeedsScheduling(true);
    await loadOrderImages(o.id);
    setForm({ ...emptyForm, service_id: o.service_id || "", general_service_id: o.general_service_id || "", service_type_id: o.service_type_id || "", seller_id: o.seller_id || "", status_id: o.status_id || "", situation_id: o.situation_id || "", customer_id: o.customer_id || "", technician_id: o.technician_id || "", brand_id: o.brand_id || "", product_id: o.product_id || "", model: o.model || "", equipment_type_id: o.equipment_type_id || "", equipment_brand_id: o.equipment_brand_id || "", equipment_model_id: o.equipment_model_id || "", serial_number: o.serial_number || "", accessories: o.accessories || "", equipment_condition: o.equipment_condition || "", priority: o.priority || "normal", scheduled_at: o.scheduled_at ? o.scheduled_at.slice(0, 16) : "", started_at: o.started_at ? o.started_at.slice(0, 16) : "", internal_notes: o.internal_notes || "", customer_notes: o.customer_notes || "", order_type: o.order_type === "external" ? "external" : "internal", service_state: o.order_type === "external" ? o.service_state || "" : "", service_city: o.order_type === "external" ? o.service_city || "" : "", service_street: o.order_type === "external" ? o.service_street || "" : "", service_zip_code: o.order_type === "external" ? o.service_zip_code || "" : "", service_neighborhood: o.order_type === "external" ? o.service_neighborhood || "" : "", service_number: o.order_type === "external" ? o.service_number || "" : "", service_complement: o.order_type === "external" ? o.service_complement || "" : "", service_customer_address_id: o.order_type === "external" ? o.service_customer_address_id || "" : "", external_os_number: o.external_os_number || "" });
    setServiceUseCustomerAddress(o.order_type === "external" && o.service_address_source === "customer"); setServiceCustomerAddressOverride(false); setServiceAddressMessage(""); setIbgeCities([]);
    if (o.order_type === "external" && o.service_state) void loadIbgeCities(o.service_state, o.service_city);
    setSelectedCustomer((o.customer as any) || null);
    const customer = (o.customer as any) || {};
    setCustomerDraft(customerFormFromCustomer(customer));
    const address = (customer.addresses || []).find((item: Address) => item.is_default) || customer.addresses?.[0];
    setCustomerAddressDraft({ ...emptyAddress, ...(address || {}) });
    setEditingCustomer(false); setAddressExpanded(false);
    setCustomerSearch(""); setCustomerResults([]);
    setFormOpen(true);
  };

  const saveCustomer = async () => {
    if (!hasPermission("customers.edit")) return;
    if (!selectedCustomer?.id) return;
    const validationError = validateCustomerForm(customerDraft);
    if (validationError) { setToast({ msg: validationError, type: "error" }); return; }
    setSaving(true);
    const { error: customerError } = await supabase.from("customers").update(customerUpdatePayload(customerDraft)).eq("id", selectedCustomer.id);
    if (customerError) { console.error("[ADMIN] customer update error:", customerError); setToast({ msg: `Erro ao atualizar cliente: ${customerError.message}`, type: "error" }); setSaving(false); return; }
    const address = (selectedCustomer.addresses || []).find((item: Address) => item.is_default) || selectedCustomer.addresses?.[0];
    const addressPayload = { customer_id: selectedCustomer.id, zip_code: customerAddressDraft.zip_code || null, street: customerAddressDraft.street || null, number: customerAddressDraft.number || null, complement: customerAddressDraft.complement || null, neighborhood: customerAddressDraft.neighborhood || null, city: customerAddressDraft.city || null, state: customerAddressDraft.state || null, is_default: true };
    const addressResult = address ? await supabase.from("customer_addresses").update(addressPayload).eq("id", address.id) : await supabase.from("customer_addresses").insert(addressPayload);
    setSaving(false);
    if (addressResult.error) { console.error("[ADMIN] customer address update error:", addressResult.error); setToast({ msg: `Cliente salvo, mas erro no endereço: ${addressResult.error.message}`, type: "error" }); return; }
    setSelectedCustomer({ ...selectedCustomer, ...customerUpdatePayload(customerDraft), addresses: [customerAddressDraft] });
    setEditingCustomer(false);
    setAddressExpanded(true);
    setToast({ msg: "Dados do cliente atualizados.", type: "success" });
  };

  const saveOrderSolution = async (orderId: string) => {
    if (!hasPermission("orders.solve")) {
      setToast({ msg: "Você não possui permissão para resolver ordens de serviço.", type: "error" });
      return;
    }

    if (detail?.cannot_be_solved && !solveDraft.cannotSolve) {
      setSaving(true);
      try {
        const { error } = await supabase.from("service_orders").update({ cannot_be_solved: false, cannot_be_solved_reason: null }).eq("id", orderId);
        if (error) throw error;
        setDetail({ ...detail, cannot_be_solved: false, cannot_be_solved_reason: null });
        setOrders(current => current.map(order => order.id === orderId ? { ...order, cannot_be_solved: false, cannot_be_solved_reason: null } : order));
        setSolveOpen(false);
        setToast({ msg: "Estado não solucionável removido. A OS continua pendente de resolução.", type: "success" });
      } catch (error) {
        setToast({ msg: `Não foi possível remover o estado não solucionável: ${supabaseErrorMessage(error)}`, type: "error" });
      } finally {
        setSaving(false);
      }
      return;
    }

    if (solveDraft.cannotSolve) {
      const reason = solveDraft.cannotSolveReason.trim();
      if (!reason) {
        setToast({ msg: "Informe a justificativa para esta OS não solucionável.", type: "error" });
        return;
      }
      setSaving(true);
      try {
        const { error } = await supabase.from("service_orders").update({ cannot_be_solved: true, cannot_be_solved_reason: reason }).eq("id", orderId);
        if (error) throw error;
        const nextDetail = { ...detail, cannot_be_solved: true, cannot_be_solved_reason: reason };
        setDetail(nextDetail);
        setOrders(current => current.map(order => order.id === orderId ? { ...order, cannot_be_solved: true, cannot_be_solved_reason: reason } : order));
        setSolveOpen(false);
        setToast({ msg: "OS marcada como não solucionável.", type: "success" });
      } catch (error) {
        setToast({ msg: `Não foi possível salvar a justificativa: ${supabaseErrorMessage(error)}`, type: "error" });
      } finally {
        setSaving(false);
      }
      return;
    }

    const diagnosis = solveDraft.diagnosis.trim();
    const solution = solveDraft.solution.trim();
    if (!diagnosis) {
      setToast({ msg: "Informe o diagnóstico antes de concluir a solução.", type: "error" });
      return;
    }
    if (!solution) {
      setToast({ msg: "Informe a solução antes de concluir a OS.", type: "error" });
      return;
    }

    const hasUndestinedTestParts = detailPartRequests.some((request: PartRequestForReview) => (request.purpose || "RESOLUTION") === "TEST" && request.items.some(item => {
      const delivered = Number(item.delivered_quantity ?? 0);
      const returned = Number(item.returned_quantity ?? 0);
      const damaged = Number(item.damaged_quantity ?? 0);
      return delivered - returned - damaged > 0 && getTestPendingQuantity(request, item) > 0;
    }));
    if (hasUndestinedTestParts) {
      setToast({ msg: "Existem peças de teste aguardando devolução, dano ou solicitação para resolução.", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const { error: resolveError } = await supabase.rpc("resolve_service_order", {
        p_service_order_id: orderId,
        p_diagnosis: diagnosis,
        p_solution: solution,
        p_used_items: solveDraft.usedItems.map(item => ({ inventory_item_id: item.inventory_item_id, quantity: Number(item.quantity) })),
      });
      if (resolveError) throw resolveError;

      let solutionImageError: unknown = null;
      try {
        for (const [sortOrder, image] of solutionImages.entries()) {
          if (image.file) {
            const mediaId = await uploadOrderImage(image.file);
            const { error: insertError } = await supabase.from("service_order_media").insert({ service_order_id: orderId, media_id: mediaId, sort_order: sortOrder + 1000 });
            if (insertError) throw insertError;
          }
        }
      } catch (error) {
        solutionImageError = error;
      }

      const freshDetail = await supabase.from("service_orders").select("*, order_status:order_statuses(id,name,color), situation:os_situations(id,name,color,hours), customer:customers(id,customer_type,full_name,phone,whatsapp,document,email,trade_name,legal_name,cnpj,state_registration,birth_date,addresses:customer_addresses(*)), service:services(id,title), assigned_profile:profiles!assigned_to(id,full_name), seller:employees!seller_id(id,full_name), technician:employees!technician_id(id,full_name), service_type:service_types(id,title), general_service:general_services(id,name,price,max_discount_percentage), equipment_type:equipment_types(id,name), equipment_brand:equipment_brands(id,name), equipment_model:equipment_models(id,name)").eq("id", orderId).maybeSingle();
      if (freshDetail.data) setDetail(freshDetail.data);
      const { data: usedData } = await supabase.from("service_order_used_items").select("*, inventory_item:inventory_items(id,name,sku,unit)").eq("service_order_id", orderId).order("created_at", { ascending: false });
      const { data: mediaLinks } = await supabase.from("service_order_media").select("id,media_id,sort_order,media:media(id,file_name,bucket_id,storage_path)").eq("service_order_id", orderId).order("sort_order");
      setDetailUsedItems(usedData || []);
      setOrderImages((mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) < 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da OS" })));
      setDetailSolutionImages((mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) >= 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da solução" })));
      setSolveOpen(false);
      setToast({ msg: solutionImageError ? `OS resolvida, mas não foi possível salvar todas as imagens da solução: ${supabaseErrorMessage(solutionImageError)}` : "OS resolvida com sucesso.", type: solutionImageError ? "error" : "success" });
      await load();
    } catch (error) {
      setToast({ msg: `Não foi possível concluir a solução da OS: ${supabaseErrorMessage(error)}. Nenhuma alteração de estoque foi aplicada.`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const openCompletion = (order: any) => {
    if (!hasPermission("orders.complete")) {
      setToast({ msg: "Você não possui permissão para concluir esta OS.", type: "error" });
      return;
    }
    if (!order.is_solved) {
      setToast({ msg: "Resolva a OS antes de concluir.", type: "error" });
      return;
    }
    if (order.completed_at) {
      setToast({ msg: "Esta OS já foi concluída.", type: "error" });
      return;
    }
    if (order.general_service?.price == null) {
      setToast({ msg: "O serviço geral desta OS não possui valor cadastrado.", type: "error" });
      return;
    }
    setCompletionDiscount("");
    setCompletionOpen(true);
  };

  const completeOrder = async () => {
    if (!detail || !hasPermission("orders.complete")) return;
    const discount = completionDiscount === "" ? 0 : Number(completionDiscount);
    const maxDiscount = Number(detail.general_service?.max_discount_percentage ?? 0);
    if (!Number.isFinite(discount) || discount < 0 || discount > maxDiscount) {
      setToast({ msg: `O desconto deve estar entre 0% e ${maxDiscount.toLocaleString("pt-BR")}%.`, type: "error" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("complete_service_order", {
        p_service_order_id: detail.id,
        p_discount_percentage: discount,
      });
      if (error) throw error;
      const financial = data || {};
      const nextDetail = { ...detail, ...financial, completed_at: financial.completed_at || new Date().toISOString(), completed_by_profile: { id: profile?.id || financial.completed_by, full_name: profile?.full_name || "Nome não informado" } };
      setDetail(nextDetail);
      setOrders(current => current.map(order => order.id === detail.id ? { ...order, ...financial, completed_at: nextDetail.completed_at } : order));
      setCompletionOpen(false);
      setToast({ msg: "OS concluída com sucesso.", type: "success" });
      await load();
    } catch (error) {
      setToast({ msg: `Não foi possível concluir a OS: ${supabaseErrorMessage(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const saveOS = async () => {
    if (editingOS ? !hasPermission("orders.edit") : !hasPermission("orders.create")) { setToast({ msg: "Você não possui permissão para esta ação na OS.", type: "error" }); return; }
    if (!editingOS && !user?.id) { setToast({ msg: "Não foi possível identificar o responsável pela OS.", type: "error" }); return; }
    if (editingOS?.is_solved) { setToast({ msg: "Esta OS está solucionada e é somente leitura.", type: "error" }); return; }
    if (!form.general_service_id && !form.service_id) { setToast({ msg: "Selecione o serviço geral da OS.", type: "error" }); return; }
    if (!editingOS && !form.service_type_id) { setToast({ msg: "Selecione o tipo de atendimento da OS.", type: "error" }); return; }
    const cid = selectedCustomer?.id || form.customer_id;
    if (!cid) { setToast({ msg: "Selecione um cliente.", type: "error" }); return; }
    const historicalCustomerAddress: Address = { id: form.service_customer_address_id || undefined, zip_code: form.service_zip_code, state: form.service_state, city: form.service_city, neighborhood: form.service_neighborhood, street: form.service_street, number: form.service_number, complement: form.service_complement };
    const selectedAddress = serviceUseCustomerAddress ? (serviceCustomerAddressOverride ? selectedServiceAddress : historicalCustomerAddress) : null;
    const serviceAddress = selectedAddress || {
      id: undefined,
      zip_code: form.service_zip_code,
      state: form.service_state,
      city: form.service_city,
      neighborhood: form.service_neighborhood,
      street: form.service_street,
      number: form.service_number,
      complement: form.service_complement,
    };
    const serviceZipCode = String(serviceAddress.zip_code ?? "").trim();
    const serviceState = String(serviceAddress.state ?? "").trim();
    const serviceCity = String(serviceAddress.city ?? "").trim();
    const serviceNeighborhood = String(serviceAddress.neighborhood ?? "").trim();
    const serviceStreet = String(serviceAddress.street ?? "").trim();
    const serviceNumber = String(serviceAddress.number ?? "").trim();
    const serviceComplement = String(serviceAddress.complement ?? "").trim();
    if (form.order_type === "external" && serviceUseCustomerAddress && !selectedAddress) { setToast({ msg: "Selecione um endereço cadastrado ou informe um endereço personalizado.", type: "error" }); return; }
    if (form.order_type === "external" && (!serviceZipCode || !serviceState || !serviceCity || !serviceStreet || !serviceNumber)) { setToast({ msg: "Informe CEP, estado, cidade, rua e número para uma OS externa.", type: "error" }); return; }
    if (needsScheduling && !form.scheduled_at) { setToast({ msg: "Informe a data e hora agendadas ou selecione Não.", type: "error" }); return; }
    if (form.equipment_brand_id && !equipmentBrands.some(brand => brand.id === form.equipment_brand_id && brand.equipment_type_id === form.equipment_type_id)) { setToast({ msg: "A marca selecionada não pertence ao equipamento.", type: "error" }); return; }
    if (form.equipment_model_id && !equipmentModels.some(model => model.id === form.equipment_model_id && model.equipment_brand_id === form.equipment_brand_id)) { setToast({ msg: "O modelo selecionado não pertence à marca.", type: "error" }); return; }
    const { data: availableStatuses, error: statusError } = await supabase.from("order_statuses").select("id,name,sort_order").order("sort_order");
    const status = editingOS ? (availableStatuses || []).find(item => item.id === form.status_id) : initialOrderStatus(availableStatuses || []);
    if (statusError || !status?.id) { setToast({ msg: "Não foi possível identificar um status válido para a OS.", type: "error" }); return; }
    setSaving(true);
    if (editingCustomer && selectedCustomer?.id) {
      const validationError = validateCustomerForm(customerDraft);
      if (validationError) { setToast({ msg: validationError, type: "error" }); setSaving(false); return; }
      const { error: customerError } = await supabase.from("customers").update(customerUpdatePayload(customerDraft)).eq("id", selectedCustomer.id);
      if (customerError) { setToast({ msg: `Erro ao atualizar cliente: ${customerError.message}`, type: "error" }); setSaving(false); return; }
      const address = (selectedCustomer.addresses || []).find((item: Address) => item.is_default) || selectedCustomer.addresses?.[0];
      const addressPayload = { customer_id: selectedCustomer.id, zip_code: customerAddressDraft.zip_code || null, street: customerAddressDraft.street || null, number: customerAddressDraft.number || null, complement: customerAddressDraft.complement || null, neighborhood: customerAddressDraft.neighborhood || null, city: customerAddressDraft.city || null, state: customerAddressDraft.state || null, is_default: true };
      const addressResult = address
        ? await supabase.from("customer_addresses").update(addressPayload).eq("id", address.id)
        : await supabase.from("customer_addresses").insert(addressPayload);
      if (addressResult.error) { setToast({ msg: `Cliente atualizado, mas erro no endereço: ${addressResult.error.message}`, type: "error" }); setSaving(false); return; }
      setSelectedCustomer({ ...selectedCustomer, ...customerUpdatePayload(customerDraft), addresses: [customerAddressDraft] });
      setEditingCustomer(false);
    }
    const payload = { service_id: editingOS ? form.service_id || null : null, general_service_id: form.general_service_id || null, service_type_id: form.service_type_id || null, seller_id: selectedSellerIds[0] || null, status_id: status.id, situation_id: form.situation_id || null, customer_id: cid, ...(editingOS ? {} : { assigned_to: user?.id }), technician_id: selectedTechnicianIds[0] || null, equipment_type_id: form.equipment_type_id || null, equipment_brand_id: form.equipment_brand_id || null, equipment_model_id: form.equipment_model_id || null, brand_id: form.brand_id || null, product_id: form.product_id || null, model: form.model || null, ...(editingOS ? {} : { serial_number: form.serial_number || null, external_os_number: form.external_os_number.trim() || null }), accessories: form.accessories || null, equipment_condition: form.equipment_condition || null, priority: form.priority || "normal", scheduled_at: needsScheduling ? form.scheduled_at || null : null, started_at: form.started_at || null, internal_notes: form.internal_notes || null, customer_notes: form.customer_notes || null, order_type: form.order_type, service_zip_code: form.order_type === "external" ? serviceZipCode : null, service_state: form.order_type === "external" ? serviceState : null, service_city: form.order_type === "external" ? serviceCity : null, service_neighborhood: form.order_type === "external" ? serviceNeighborhood : null, service_street: form.order_type === "external" ? serviceStreet : null, service_number: form.order_type === "external" ? serviceNumber : null, service_complement: form.order_type === "external" ? serviceComplement : null, service_address_source: form.order_type === "external" ? (serviceUseCustomerAddress ? "customer" : "custom") : null, service_customer_address_id: form.order_type === "external" && serviceUseCustomerAddress ? selectedAddress?.id || null : null };
    let error;
    let savedOrderId = editingOS?.id as string | undefined;
    if (editingOS) {
      const r = await supabase.from("service_orders").update(payload).eq("id", editingOS.id);
      error = r.error;
    } else {
      const newOrderId = crypto.randomUUID();
      const r = await supabase.from("service_orders").insert({ ...payload, id: newOrderId });
      error = r.error;
      savedOrderId = error ? undefined : newOrderId;
    }
    if (error) { setSaving(false); setToast({ msg: `Erro ao salvar OS: ${error.message}`, type: "error" }); return; }
    const uniqueTechnicianIds = Array.from(new Set(selectedTechnicianIds));
    const uniqueSellerIds = Array.from(new Set(selectedSellerIds));
    const previousTechnicianIds = Array.from(new Set((editingOS?.technician_links || []).map((link: any) => link.employee_id).filter(Boolean).concat(editingOS?.technician_id ? [editingOS.technician_id] : [])));
    const previousSellerIds = Array.from(new Set((editingOS?.seller_links || []).map((link: any) => link.employee_id).filter(Boolean).concat(editingOS?.seller_id ? [editingOS.seller_id] : [])));
    try {
      if (editingOS) {
        const { error: deleteTechniciansError } = await supabase.from("service_order_technicians").delete().eq("service_order_id", savedOrderId);
        if (deleteTechniciansError) throw deleteTechniciansError;
        const { error: deleteSellersError } = await supabase.from("service_order_sellers").delete().eq("service_order_id", savedOrderId);
        if (deleteSellersError) throw deleteSellersError;
      }
      if (uniqueTechnicianIds.length) {
        const { error: technicianError } = await supabase.from("service_order_technicians").insert(uniqueTechnicianIds.map(employee_id => ({ service_order_id: savedOrderId, employee_id })));
        if (technicianError) throw technicianError;
      }
      if (uniqueSellerIds.length) {
        const { error: sellerError } = await supabase.from("service_order_sellers").insert(uniqueSellerIds.map(employee_id => ({ service_order_id: savedOrderId, employee_id })));
        if (sellerError) throw sellerError;
      }
    } catch (relationError) {
      if (editingOS) {
        await supabase.from("service_order_technicians").delete().eq("service_order_id", savedOrderId);
        await supabase.from("service_order_sellers").delete().eq("service_order_id", savedOrderId);
        if (previousTechnicianIds.length) await supabase.from("service_order_technicians").insert(previousTechnicianIds.map(employee_id => ({ service_order_id: savedOrderId, employee_id })));
        if (previousSellerIds.length) await supabase.from("service_order_sellers").insert(previousSellerIds.map(employee_id => ({ service_order_id: savedOrderId, employee_id })));
      }
      setSaving(false);
      setToast({ msg: `OS salva, mas não foi possível atualizar técnicos/vendedores: ${supabaseErrorMessage(relationError)}`, type: "error" });
      return;
    }
    try {
      if (!savedOrderId) throw new Error("A OS foi salva, mas não foi possível obter seu ID.");
      const { data: existingLinks, error: linksError } = await supabase.from("service_order_media").select("id,media_id").eq("service_order_id", savedOrderId);
      if (linksError) throw linksError;
      const retainedMediaIds = new Set(orderImages.filter(image => image.mediaId).map(image => image.mediaId));
      for (const link of existingLinks || []) {
        if (!retainedMediaIds.has(link.media_id)) {
          const { error: removeError } = await supabase.from("service_order_media").delete().eq("id", link.id);
          if (removeError) throw removeError;
        }
      }
      for (const [sortOrder, image] of orderImages.entries()) {
        if (image.mediaId) {
          const link = (existingLinks || []).find((item: any) => item.media_id === image.mediaId);
          if (link) {
            const { error: updateError } = await supabase.from("service_order_media").update({ sort_order: sortOrder }).eq("id", link.id);
            if (updateError) throw updateError;
          }
        } else if (image.file) {
          const mediaId = await uploadOrderImage(image.file);
          const { error: insertError } = await supabase.from("service_order_media").insert({ service_order_id: savedOrderId, media_id: mediaId, sort_order: sortOrder });
          if (insertError) throw insertError;
        }
      }
    } catch (imageError) {
      setSaving(false);
      setToast({ msg: `OS salva, mas houve erro nas imagens: ${supabaseErrorMessage(imageError)}`, type: "error" });
      return;
    }
    setSaving(false);
    setToast({ msg: `OS ${editingOS ? "atualizada" : "criada"} com sucesso!`, type: "success" });
    setFormOpen(false); setDetail(null); upF("external_os_number", ""); load();
  };

  const closeOrderForm = () => { setFormOpen(false); upF("external_os_number", ""); };

  const openSolveOrder = async (order: any) => {
    if (!hasPermission("orders.solve")) {
      setToast({ msg: "Você não possui permissão para resolver a OS.", type: "error" });
      return;
    }
    const { data: currentOrder, error: currentOrderError } = await supabase.from("service_orders").select("is_solved,diagnosis,solution,cannot_be_solved,cannot_be_solved_reason").eq("id", order.id).maybeSingle();
    if (currentOrderError) {
      setToast({ msg: `Não foi possível verificar o estado da OS: ${supabaseErrorMessage(currentOrderError)}`, type: "error" });
      return;
    }
    if (currentOrder?.is_solved || order.is_solved) {
      setToast({ msg: "Esta OS já foi solucionada e não pode ser solucionada novamente.", type: "error" });
      return;
    }
    if (currentOrder?.cannot_be_solved || order.cannot_be_solved) {
      setToast({ msg: "Esta OS está marcada como não solucionável e não pode ser resolvida novamente.", type: "error" });
      return;
    }
    const hasUndestinedTestParts = detailPartRequests.some((request: PartRequestForReview) =>
      (request.purpose || "RESOLUTION") === "TEST" &&
      request.items.some(item => getTestPendingQuantity(request, item) > 0)
    );
    if (hasUndestinedTestParts) {
      setToast({ msg: "Existem peças de teste aguardando devolução, dano ou solicitação para resolução.", type: "error" });
      return;
    }
    const [{ data: approvedRequests, error: approvedRequestsError }, { data: mediaLinks }] = await Promise.all([
      supabase.from("service_order_part_requests").select("id,purpose,status,items:service_order_part_request_items(id,inventory_item_id,approved_quantity,source_test_item_id,inventory_item:inventory_items(id,name,sku,unit,quantity))").eq("service_order_id", order.id).eq("status", "APPROVED").eq("purpose", "RESOLUTION"),
      supabase.from("service_order_media").select("id,media_id,sort_order,media:media(id,file_name,bucket_id,storage_path)").eq("service_order_id", order.id).order("sort_order"),
    ]);
    if (approvedRequestsError) { setToast({ msg: `Não foi possível carregar as peças aprovadas: ${supabaseErrorMessage(approvedRequestsError)}`, type: "error" }); return; }
    const approvedByInventory = new Map<string, any>();
    (approvedRequests || []).flatMap((request: any) => request.items || []).forEach((item: any) => {
      const quantity = Number(item.approved_quantity);
      if (!item.inventory_item_id || !Number.isFinite(quantity) || quantity <= 0) return;
      const current = approvedByInventory.get(item.inventory_item_id);
      approvedByInventory.set(item.inventory_item_id, {
        ...item,
        approved_quantity: Number(current?.approved_quantity || 0) + quantity,
        prewithdrawn_quantity: Number(current?.prewithdrawn_quantity || 0) + (item.source_test_item_id ? quantity : 0),
      });
    });
    const approvedItems = Array.from(approvedByInventory.values());
    setInventoryItems(approvedItems.map((item: any) => item.inventory_item).filter(Boolean));
    setOrderImages((mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) < 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da OS" })));
    setSolutionImages((mediaLinks || []).filter((item: any) => Number(item.sort_order ?? 0) >= 1000).map((item: any) => ({ key: item.id, mediaId: item.media_id, name: item.media?.file_name || "Imagem da solução" })));
    setSolveDraft({
      diagnosis: currentOrder?.diagnosis || order.diagnosis || "",
      solution: currentOrder?.solution || order.solution || "",
      usedItems: approvedItems.map((item: any) => ({ id: item.id, inventory_item_id: item.inventory_item_id, name: item.inventory_item?.name || "", unit: item.inventory_item?.unit || "un", quantity: Number(item.approved_quantity), approved_quantity: Number(item.approved_quantity), prewithdrawn_quantity: Number(item.prewithdrawn_quantity || 0) })),
      cannotSolve: currentOrder?.cannot_be_solved ?? order.cannot_be_solved ?? false,
      cannotSolveReason: currentOrder?.cannot_be_solved_reason || order.cannot_be_solved_reason || "",
    });
    setSolveOpen(true);
  };

  const updateOrderStatus = async (order: any, statusId: string) => {
    if (!hasPermission("orders.status")) { setToast({ msg: "Você não possui permissão para alterar o status.", type: "error" }); return; }
    const { error } = await supabase.from("service_orders").update({ status_id: statusId }).eq("id", order.id);
    if (error) { setToast({ msg: `Erro: ${error.message}`, type: "error" }); return; }
    await supabase.from("service_order_status_history").insert({ service_order_id: order.id, status_id: statusId, notes: null, is_visible_to_customer: false, created_by: user?.id || null });
    setToast({ msg: "Status atualizado!", type: "success" });
    const updated = orders.map(o => o.id === order.id ? { ...o, status_id: statusId, order_status: statuses.find(status => status.id === statusId) || o.order_status } : o);
    setOrders(updated);
    if (detail?.id === order.id) setDetail({ ...detail, status_id: statusId, order_status: statuses.find(status => status.id === statusId) || detail.order_status });
  };

  const updateOrderSituation = async (order: any, situationId: string) => {
    if (!hasPermission("orders.edit")) { setToast({ msg: "Você não possui permissão para alterar a situação.", type: "error" }); return; }
    const { data, error } = await supabase.from("service_orders").update({ situation_id: situationId || null }).eq("id", order.id).select("situation_id").maybeSingle();
    if (error) { setToast({ msg: `Erro ao alterar situação: ${supabaseErrorMessage(error)}`, type: "error" }); return; }
    const situation = situations.find(item => item.id === (data?.situation_id || situationId));
    setOrders(current => current.map(item => item.id === order.id ? { ...item, situation_id: data?.situation_id || situationId, situation: situation || null } : item));
    if (detail?.id === order.id) setDetail({ ...detail, situation_id: data?.situation_id || situationId, situation: situation || null });
  };

  const setViewMode = (mode: "list" | "kanban") => {
    setDisplayMode(mode);
    window.localStorage.setItem("os_view_mode", mode);
  };

  const handleKanbanDrop = async (statusId: string) => {
    if (!hasPermission("orders.status")) return;
    const order = orders.find(item => item.id === draggingId);
    const previousOrders = dragOriginRef.current;
    setDraggingId(null);
    setDragOverStatusId(null);
    if (!order || order.status_id === statusId || !previousOrders) return;

    const nextStatus = statuses.find(status => status.id === statusId);
    setOrders(current => current.map(item => item.id === order.id ? { ...item, status_id: statusId, order_status: nextStatus || item.order_status } : item));
    try {
      const { error } = await supabase.from("service_orders").update({ status_id: statusId }).eq("id", order.id);
      if (error) throw error;
      const { error: historyError } = await supabase.from("service_order_status_history").insert({ service_order_id: order.id, status_id: statusId, notes: null, is_visible_to_customer: false, created_by: user?.id || null });
      if (historyError) console.warn("[ADMIN] OS status history warning:", historyError.message);
      setToast({ msg: `OS ${order.os_number || order.id.slice(0, 8)} movida para ${nextStatus?.name || "o novo status"}.`, type: "success" });
    } catch (error) {
      setOrders(previousOrders);
      setToast({ msg: `Não foi possível alterar o status: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      dragOriginRef.current = null;
    }
  };

  const searchCustomers = async (q: string) => {
    setCustomerSearch(q);
    if (q.length < 2) { setCustomerResults([]); return; }
    const { data } = await supabase.from("customers").select("id,customer_type,full_name,document,email,whatsapp,phone,trade_name,legal_name,cnpj,state_registration,foundation_date,birth_date,addresses:customer_addresses(*)").or(`full_name.ilike.%${q}%,trade_name.ilike.%${q}%,document.ilike.%${q}%,cnpj.ilike.%${q}%,whatsapp.ilike.%${q}%,phone.ilike.%${q}%`).limit(8);
    setCustomerResults(data || []);
  };

  const selectCustomer = (customer: any) => {
    const address = (customer.addresses || []).find((item: Address) => item.is_default) || customer.addresses?.[0];
    setSelectedCustomer(customer);
    setCustomerDraft(customerFormFromCustomer(customer));
    setCustomerAddressDraft({ ...emptyAddress, ...(address || {}) });
    setAddressExpanded(false);
    upF("customer_id", customer.id);
    if (form.order_type === "external" && serviceUseCustomerAddress) {
      if (address) {
        setServiceAddressMessage("");
        setServiceCustomerAddressOverride(true);
        copyCustomerAddressToForm(address);
      } else {
        setServiceUseCustomerAddress(false);
        setServiceAddressMessage("Este cliente não possui endereço cadastrado. Preencha o local do atendimento.");
        clearServiceAddress();
      }
    }
    setCustomerResults([]);
    setCustomerSearch("");
  };

  const lookupCustomerCnpj = async (value: string, baseForm = customerDraft) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 14 || customerDraft.customerType !== "PJ") return;
    setCnpjLoading(true); setCnpjMessage("");
    try {
      const data = await fetchCnpjData(digits);
      const result = applyCnpjData(baseForm, customerAddressDraft, data);
      setCustomerDraft(result.form); setCustomerAddressDraft(result.address);
    } catch (error) {
      setCnpjMessage(error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.");
    } finally { setCnpjLoading(false); }
  };

  const fmtDate = (d?: string | null, time = false) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) });
  };

  const equipmentSummary = (o: any) => {
    const type = (o.equipment_type as any)?.name;
    const brand = (o.equipment_brand as any)?.name;
    const model = (o.equipment_model as any)?.name || o.model;
    const pieces = [type, [brand, model].filter(Boolean).join(" ")].filter(Boolean);
    return pieces.join(" • ") || "—";
  };

  const stateLabel = (state: unknown) => {
    const sigla = String(state ?? "").trim().toUpperCase();
    if (!sigla) return "";
    const ibgeState = ibgeStates.find(item => item.sigla.trim().toUpperCase() === sigla);
    return ibgeState ? `${sigla} — ${ibgeState.nome}` : sigla;
  };

  const invalidPeriod = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const filtered = orders.filter(o => {
    const q = normalizeSearchText(search);
    const qDigits = normalizeSearchDigits(search);
    const qIdentifier = normalizeSearchIdentifier(search);
    const orderTypeLabel = o.order_type === "external" ? "externa external" : "interna internal";
    const searchableState = stateLabel(o.service_state);
    const customer = (o.customer as any) || {};
    const searchableText = [o.os_number, `OS ${o.os_number || ""}`, o.external_os_number, orderTypeLabel, (o.service as any)?.title, customer.full_name, customer.trade_name, (o.service_type as any)?.title, equipmentSummary(o), o.model, o.serial_number, o.service_zip_code, o.service_state, searchableState, o.service_city, o.service_neighborhood, o.service_street, o.service_number, o.service_complement].map(normalizeSearchText).join(" ");
    const normalizedOrderNumbers = [o.os_number, `OS ${o.os_number || ""}`].map(normalizeSearchIdentifier);
    const customerIdentifiers = [customer.document, customer.cnpj];
    const matchSearch = !q || searchableText.includes(q) || normalizedOrderNumbers.some(value => value.includes(qIdentifier)) || (qDigits.length > 0 && customerIdentifiers.some(value => normalizeSearchDigits(value).includes(qDigits)));
    const matchStatus = !filterStatus || o.status_id === filterStatus;
    const matchSituation = !filterSituation || o.situation_id === filterSituation;
    const matchOrderType = !filterOrderType || o.order_type === filterOrderType;
    const matchServiceType = !selectedServiceTypeId || o.service_type_id === selectedServiceTypeId;
    const orderState = normalizeSearchText(o.service_state);
    const matchState = selectedStates.length === 0 || selectedStates.some(state => {
      const stateOption = ibgeStates.find(item => normalizeSearchText(item.sigla) === normalizeSearchText(state));
      return orderState === normalizeSearchText(state) || (stateOption && orderState === normalizeSearchText(stateOption.nome));
    });
    const matchCity = selectedCities.length === 0 || selectedCities.some(city => normalizeSearchText(o.service_city) === normalizeSearchText(city.name) && orderState === normalizeSearchText(city.state));
    const createdAt = o.created_at ? new Date(o.created_at) : null;
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null;
    const toDateExclusive = dateTo ? new Date(`${dateTo}T00:00:00`) : null;
    if (toDateExclusive) toDateExclusive.setDate(toDateExclusive.getDate() + 1);
    const matchPeriod = invalidPeriod || (!!createdAt && (!fromDate || createdAt >= fromDate) && (!toDateExclusive || createdAt < toDateExclusive));
    return matchSearch && matchStatus && matchSituation && matchOrderType && matchServiceType && matchState && matchCity && matchPeriod;
  });
  const sorted = orderSort ? [...filtered].sort((left, right) => {
    const leftNumber = Number(String(left.os_number ?? "").match(/\d+/)?.[0] ?? Number.POSITIVE_INFINITY);
    const rightNumber = Number(String(right.os_number ?? "").match(/\d+/)?.[0] ?? Number.POSITIVE_INFINITY);
    const numberComparison = leftNumber - rightNumber;
    if (numberComparison !== 0) return orderSort === "asc" ? numberComparison : -numberComparison;
    const dateComparison = String(left.created_at ?? "").localeCompare(String(right.created_at ?? ""));
    if (dateComparison !== 0) return orderSort === "asc" ? dateComparison : -dateComparison;
    return String(left.id ?? "").localeCompare(String(right.id ?? ""));
  }) : filtered;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedOrders = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const orderLabel = orderSort === "asc" ? "OS crescente" : orderSort === "desc" ? "OS decrescente" : "Ordenar";
  const OrderSortIcon = orderSort === "asc" ? ArrowUpNarrowWide : orderSort === "desc" ? ArrowDownWideNarrow : ArrowUpDown;

  const clearFilters = () => {
    setSearch(""); setFilterStatus(""); setFilterSituation(""); setFilterOrderType(""); setSelectedServiceTypeId(""); setSelectedStates([]); setSelectedCities([]); setDateFrom(""); setDateTo("");
  };

  useEffect(() => { setPage(1); }, [search, filterStatus, filterSituation, filterOrderType, selectedServiceTypeId, orderSort, selectedStates, selectedCities, dateFrom, dateTo]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const getSituationsForType = (serviceTypeId: string, currentSituationId?: string, currentSituation?: any) => {
    const links = serviceTypeSituations.filter(link => link.service_type_id === serviceTypeId).sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0));
    if (links.length === 0) return situations;
    const linkedSituationIds = new Set(links.map(link => link.situation_id));
    const allowed = links.map(link => situations.find(situation => situation.id === link.situation_id)).filter(Boolean);
    const historical = currentSituationId && !linkedSituationIds.has(currentSituationId) ? [currentSituation || situations.find(situation => situation.id === currentSituationId)].filter(Boolean) : [];
    return [...historical, ...allowed];
  };

  const getSlaForOrder = (serviceTypeId?: string, situationId?: string, relatedSituation?: any) => {
    const link = serviceTypeSituations.find(item => item.service_type_id === serviceTypeId && item.situation_id === situationId);
    const situation = situations.find(item => item.id === situationId) || relatedSituation;
    if (!link || !situation) return null;
    const hours = Number(link.use_default_hours ? situation.hours : link.sla_hours);
    return Number.isFinite(hours) && hours > 0 ? { hours, isDefault: link.use_default_hours !== false } : null;
  };

  if (subView === "situations") return <OSSituationsView onBack={() => setSubView("list")} />;

  const InfoRow = ({ label, value }: { label: string; value?: string | null }) =>
    value ? <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-0.5">{label}</p><p className="text-sm font-medium text-[#0d1b2e]">{value}</p></div> : null;
  const formatSolvedAt = (value: string) => Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)).replace(", ", " às ");
  const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  const detailUsedItemsTotal = detailUsedItems.reduce((total, item) => {
    if (item.total_sale_price == null) return total;
    const itemTotal = Number(item.total_sale_price);
    return Number.isFinite(itemTotal) ? total + itemTotal : total;
  }, 0);
  const completionServicePrice = Number(detail?.general_service?.price ?? 0);
  const completionMaxDiscount = Number(detail?.general_service?.max_discount_percentage ?? 0);
  const completionDiscountPercentage = completionDiscount === "" ? 0 : Number(completionDiscount);
  const completionSubtotal = completionServicePrice + detailUsedItemsTotal;
  const completionDiscountAmount = Number.isFinite(completionDiscountPercentage) ? completionSubtotal * completionDiscountPercentage / 100 : 0;
  const completionFinalTotal = Math.max(0, completionSubtotal - completionDiscountAmount);

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {!detail && !formOpen && !solveOpen && !completionOpen && <>
      <PageHeader title="Ordens de Serviço" subtitle={`${filtered.length} OS encontrada${filtered.length !== 1 ? "s" : ""}`} actions={
        <div className="flex gap-2 flex-wrap">
          <div className="flex rounded-lg border border-[#0d1b2e]/15 overflow-hidden">
            <button type="button" onClick={() => setViewMode("list")} className={cn("flex items-center gap-1.5 px-3 py-2 text-xs font-bold", displayMode === "list" ? "bg-[#0057e7] text-white" : "bg-white text-[#5a6a82] hover:bg-[#f5f7fa]")}><List size={13} /> Lista</button>
            <button type="button" onClick={() => setViewMode("kanban")} className={cn("flex items-center gap-1.5 px-3 py-2 text-xs font-bold", displayMode === "kanban" ? "bg-[#0057e7] text-white" : "bg-white text-[#5a6a82] hover:bg-[#f5f7fa]")}><LayoutDashboard size={13} /> Kanban</button>
          </div>
          {hasPermission("orders.create") && <button onClick={openNew} className="flex items-center gap-1.5 text-xs text-white font-bold bg-[#0057e7] px-3 py-2 rounded-lg hover:bg-[#0046c0]"><Plus size={13} /> Nova OS</button>}
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-[#0057e7] font-bold border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5"><RefreshCw size={13} /> Atualizar</button>
          
        </div>
      } />

      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm p-4 space-y-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider">BUSCA</label>
          <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Nome, CPF, CNPJ, OS ou OS Externa..." className={cn(INPUT, "h-[42px] pl-9 py-2 text-xs")} />
          </div>
        </div>
        <div className="space-y-1.5"><label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider">STATUS</label><select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }} className={cn(INPUT, "h-[42px] py-2 text-xs")}>
          <option value="">Todos os status</option>{statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></div>
        <div className="space-y-1.5"><label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider">SITUAÇÕES</label><select value={filterSituation} onChange={e => { setFilterSituation(e.target.value); setPage(1); }} className={cn(INPUT, "h-[42px] py-2 text-xs")}>
          <option value="">Todas as situações</option>{situations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></div>
        <div className="space-y-1.5"><label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider">TIPO</label><select value={filterOrderType} onChange={e => { setFilterOrderType(e.target.value as OrderType | ""); setPage(1); }} className={cn(INPUT, "h-[42px] py-2 text-xs")}>
          <option value="">Todos os tipos</option>
          <option value="internal">Interna</option>
          <option value="external">Externa</option>
        </select></div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
          <div>
            <OrderFilterMultiSelect label="Estados" options={ibgeStates.map(state => ({ value: state.sigla, label: `${state.sigla} — ${state.nome}` }))} selectedValues={selectedStates} onSelect={value => setSelectedStates(current => current.includes(value) ? current : [...current, value])} onRemove={value => setSelectedStates(current => current.filter(state => state !== value))} placeholder="Selecionar Estados" loading={ibgeStatesLoading} />
            {selectedStates.length > 0 && <button type="button" onClick={() => setSelectedStates([])} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 hover:text-red-700 hover:underline"><Eraser size={12} />Limpar Estados</button>}
          </div>
          <OrderFilterMultiSelect label="Cidades" options={cityFilterOptions.map(city => ({ value: `${city.state}:${city.name}`, label: `${city.name} — ${city.state}` }))} selectedValues={selectedCities.map(city => `${city.state}:${city.name}`)} onSelect={value => { const option = cityFilterOptions.find(city => `${city.state}:${city.name}` === value); if (option && !selectedCities.some(city => city.name === option.name && city.state === option.state)) setSelectedCities(current => [...current, option]); }} onRemove={value => setSelectedCities(current => current.filter(city => `${city.state}:${city.name}` !== value))} placeholder={selectedStates.length === 0 ? "Selecione ao menos um Estado" : "Selecionar Cidades"} disabled={selectedStates.length === 0} loading={cityFiltersLoading} />
          <div>
            <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">Data inicial</label>
            <input type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} className={cn(INPUT, "h-[42px] py-2 text-xs")} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">Data final</label>
            <input type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} className={cn(INPUT, "h-[42px] py-2 text-xs")} />
            {invalidPeriod && <p className="mt-1 text-xs text-red-600">A data final deve ser igual ou posterior à inicial.</p>}
          </div>
          <div className="lg:col-span-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5"><label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider">Tipo de Atendimento</label><select value={selectedServiceTypeId} onChange={e => { setSelectedServiceTypeId(e.target.value); setPage(1); }} className={cn(INPUT, "h-[42px] py-2 text-xs")}>
              <option value="">Todos os tipos</option>
              {serviceTypes.map(serviceType => <option key={serviceType.id} value={serviceType.id}>{serviceType.title}</option>)}
            </select></div>
            <div className="flex items-end justify-start">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Ordenação atual: ${orderLabel}`} title={`Ordenação atual: ${orderLabel}`} className={cn("inline-flex h-[42px] w-fit items-center gap-2 whitespace-nowrap rounded-lg border bg-white px-3 text-xs font-medium shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40", orderSort ? "border-[#0057e7] bg-[#eef5ff] text-[#0057e7]" : "border-[#0d1b2e]/15 text-[#5a6a82] hover:border-[#0057e7]/40 hover:bg-[#eef5ff]")}>
                  <OrderSortIcon size={15} className="text-[#0057e7]" />
                  <span className="hidden sm:inline">{orderLabel}</span>
                  <span className="sm:hidden">Ordenar</span>
                  <ChevronDown size={14} className="text-[#5a6a82]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[190px]">
                {([["", "Ordenação padrão", ArrowUpDown], ["asc", "OS crescente", ArrowUpNarrowWide], ["desc", "OS decrescente", ArrowDownWideNarrow]] as const).map(([value, label, Icon]) => <DropdownMenuItem key={value || "default"} onSelect={() => { setOrderSort(value); setPage(1); }} className={cn("cursor-pointer", orderSort === value && "bg-[#eef5ff] text-[#0057e7] focus:bg-[#eef5ff] focus:text-[#0057e7]")}>
                  <Icon size={15} className={orderSort === value ? "text-[#0057e7]" : "text-[#5a6a82]"} />
                  <span>{label}</span>
                  {orderSort === value && <Check size={15} className="ml-auto text-[#0057e7]" />}
                </DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          {(search || filterStatus || filterSituation || filterOrderType || selectedServiceTypeId || selectedStates.length > 0 || selectedCities.length > 0 || dateFrom || dateTo) && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-200"><Eraser size={14} />Limpar filtros</button>}
        </div>
      </div>

      {displayMode === "list" ? <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Nenhuma OS encontrada" message={search || filterStatus || filterSituation || filterOrderType || selectedServiceTypeId || orderSort || selectedStates.length || selectedCities.length || dateFrom || dateTo ? "Tente ajustar os filtros." : "Crie a primeira OS com o botão Nova OS."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left w-28">Protocolo</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left w-40">Tipo de atendimento</th>
                  <th className="px-4 py-3 text-left w-40">Equipamento</th>
                  <th className="px-4 py-3 text-left w-24">Prioridade</th>
                  <th className="px-4 py-3 text-left w-32">Data de agendamento</th>
                  <th className="px-4 py-3 text-left w-28">Status</th>
                  <th className="px-4 py-3 text-left w-36">Situação</th>
                  <th className="px-4 py-3 text-right w-28">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {pagedOrders.map(o => (
                  <tr key={o.id} onClick={() => openDetail(o)} className="hover:bg-[#f8fafc]/80 cursor-pointer">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2"><span aria-label={`Cor do status ${(o.order_status as any)?.name || "Sem status"}`} className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: (o.order_status as any)?.color || "transparent" }} /><span className="font-mono text-xs font-black text-[#0057e7]">{o.os_number || "—"}</span></div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-[#0d1b2e] text-sm">{(o.customer as any)?.full_name || "—"}</p>
                      <p className="text-[11px] text-[#5a6a82]">{formatPhone((o.customer as any)?.whatsapp || (o.customer as any)?.phone)}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{(o.service_type as any)?.title || (o.general_service as any)?.name || (o.service as any)?.title || "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{equipmentSummary(o)}</td>
                    <td className="px-4 py-3.5"><PriorityBadge priority={o.priority || "normal"} /></td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{o.scheduled_at ? fmtDate(o.scheduled_at, true) : "—"}</td>
                    <td className="px-4 py-3.5"><div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={(o.order_status as any)?.name || "—"} color={(o.order_status as any)?.color} />{o.completed_at ? <span className="inline-flex items-center rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">✓ Concluída</span> : o.is_solved && <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">✓ Solucionada</span>}{o.cannot_be_solved && <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">⚠ Não solucionável</span>}</div></td>
                    <td className="px-4 py-3.5">{(o.situation as any)?.name ? <StatusBadge status={(o.situation as any).name} color={(o.situation as any)?.color} /> : <span className="text-xs text-[#5a6a82]">—</span>}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 justify-end">
                        {hasPermission("orders.status") && <select value={o.status_id || ""} onClick={event => event.stopPropagation()} onChange={event => updateOrderStatus(o, event.target.value)} className="text-xs border border-[#0d1b2e]/15 rounded-lg px-2 py-1.5 font-bold bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0057e7]/30">
                          {statuses.map(status => <option key={status.id} value={status.id}>{status.name}</option>)}
                        </select>}
                        {hasPermission("orders.edit") && <select value={o.situation_id || ""} onClick={event => event.stopPropagation()} onChange={event => void updateOrderSituation(o, event.target.value)} className="max-w-[130px] text-xs border border-[#0d1b2e]/15 rounded-lg px-2 py-1.5 font-bold bg-white cursor-pointer"><option value="">Situação</option>{getSituationsForType(o.service_type_id, o.situation_id, o.situation).map(situation => <option key={situation.id} value={situation.id}>{situation.name}</option>)}</select>}
                        {hasPermission("orders.edit") && !o.is_solved && <button onClick={(event) => { event.stopPropagation(); void openEdit(o); }} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5 transition-colors"><Edit2 size={14} /> Editar</button>}
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
      </div> : <div className="overflow-x-auto pb-3">
        <div className="flex items-start gap-4 min-w-max">
          {statuses.map(status => {
            const statusOrders = filtered.filter(order => order.status_id === status.id);
            return <div key={status.id} onDragOver={event => { event.preventDefault(); setDragOverStatusId(status.id); }} onDragLeave={() => setDragOverStatusId(current => current === status.id ? null : current)} onDrop={event => { event.preventDefault(); void handleKanbanDrop(status.id); }} className={cn("w-[300px] flex-shrink-0 bg-[#f8fafc] rounded-xl border overflow-hidden transition-colors", dragOverStatusId === status.id ? "border-[#0057e7] bg-[#e8eef8]" : "border-[#0d1b2e]/8")}>
              <div className="px-4 py-3 border-b border-[#0d1b2e]/8 bg-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: status.color || "transparent" }} /><span className="font-bold text-sm text-[#0d1b2e] truncate">{status.name}</span></div>
                <span className="text-xs font-bold text-[#5a6a82]">{statusOrders.length}</span>
              </div>
              <div className="p-3 space-y-3 min-h-[180px]">
                {statusOrders.length === 0 ? <p className="py-10 text-center text-xs text-[#5a6a82]">Solte uma OS aqui.</p> : statusOrders.map(order => <div key={order.id} draggable onDragStart={event => { dragOriginRef.current = orders; suppressCardClickRef.current = true; setDraggingId(order.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", order.id); }} onDragEnd={() => { setDraggingId(null); setDragOverStatusId(null); window.setTimeout(() => { suppressCardClickRef.current = false; }, 0); }} onClick={() => { if (suppressCardClickRef.current) { suppressCardClickRef.current = false; return; } openDetail(order); }} className={cn("bg-white rounded-lg border border-[#0d1b2e]/10 p-3 shadow-sm cursor-grab hover:border-[#0057e7]/30 transition-colors", draggingId === order.id && "opacity-50 cursor-grabbing")}>
                  <div className="flex items-center gap-2 min-w-0"><span className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: status.color || "transparent" }} /><span className="font-mono text-xs font-black text-[#0057e7] truncate">{order.os_number || "—"}</span></div>
                  <p className="mt-3 font-semibold text-sm text-[#0d1b2e] truncate">{(order.customer as any)?.full_name || "Cliente não informado"}</p>
                  <p className="text-xs text-[#5a6a82] truncate">{(order.general_service as any)?.name || (order.service as any)?.title || "Serviço não informado"}</p>
                  {order.scheduled_at && <p className="mt-1 text-[11px] text-[#5a6a82]">Agendado: {fmtDate(order.scheduled_at)}</p>}
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-[#5a6a82]" onClick={event => event.stopPropagation()}>
                    <span className="font-semibold">Situação:</span>
                    {hasPermission("orders.edit") ? <select value={order.situation_id || ""} onChange={event => void updateOrderSituation(order, event.target.value)} className="min-w-0 flex-1 rounded border border-[#0d1b2e]/15 bg-white px-1.5 py-1 text-[11px]"><option value="">Não definida</option>{situations.map(situation => <option key={situation.id} value={situation.id}>{situation.name}</option>)}</select> : <span className="truncate">{(order.situation as any)?.name || "Não definida"}</span>}
                  </div>
                  {order.completed_at ? <span className="mt-2 inline-flex items-center rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-bold uppercase text-white">✓ OS concluída</span> : order.is_solved && <span className="mt-2 inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-[10px] font-bold uppercase text-green-700">✓ OS solucionada</span>}
                  {order.cannot_be_solved && <span className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-700">⚠ OS não solucionável</span>}
                  {hasPermission("orders.edit") && !order.is_solved && <div className="mt-3 flex items-center justify-end" onClick={event => event.stopPropagation()}><button type="button" draggable={false} onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onDragStart={event => { event.preventDefault(); event.stopPropagation(); }} onClick={() => void openEdit(order)} className="flex items-center gap-1 text-xs font-bold text-[#0057e7] border border-[#0057e7]/30 px-2.5 py-1.5 rounded-lg"><Edit2 size={13} /> Editar</button></div>}
                </div>)}
              </div>
            </div>;
          })}
        </div>
      </div>}
      </>}

      {/* OS Detail Drawer */}
      {detail && !solveOpen && (
        <AdminPage open={true} onClose={() => setDetail(null)} breadcrumb="Ordens de Serviço" title={detail.os_number || "Ordem de Serviço"} subtitle={(detail.service as any)?.title || "Ordem de Serviço"} maxW="max-w-2xl">
            <div className="p-5 space-y-5">
              <div className="flex flex-wrap gap-2 items-center">
                <StatusBadge status={(detail.order_status as any)?.name || "—"} color={(detail.order_status as any)?.color} />
                {(detail.situation as any)?.name && <StatusBadge status={(detail.situation as any).name} color={(detail.situation as any)?.color} />}
                {detail.completed_at ? <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold uppercase text-white">✓ OS concluída</span> : detail.is_solved && <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-[10px] font-bold uppercase text-green-700">✓ OS solucionada</span>}
              </div>
              {hasPermission("orders.section.customer") && (<Section title="Cliente">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Nome" value={(detail.customer as any)?.full_name} />
                  {(detail.customer as any)?.customer_type === "PJ" ? <>
                    <InfoRow label="Tipo" value="Pessoa Jurídica" />
                    <InfoRow label="CNPJ" value={formatCnpj((detail.customer as any)?.cnpj || "")} />
                    <InfoRow label="Razão social" value={(detail.customer as any)?.legal_name} />
                  </> : <InfoRow label="CPF" value={(detail.customer as any)?.document ? formatCpf((detail.customer as any).document) : null} />}
                  <InfoRow label="WhatsApp" value={formatPhone((detail.customer as any)?.whatsapp)} />
                  <InfoRow label="Telefone" value={formatPhone((detail.customer as any)?.phone)} />
                  <InfoRow label="E-mail" value={(detail.customer as any)?.email} />
                </div>
              </Section>)}
              {hasPermission("orders.section.address") && (<Section title="Dados de endereço">
                <div className="grid sm:grid-cols-2 gap-3">
                  {(["zip_code", "street", "number", "complement", "neighborhood", "city", "state"] as const).map((key) => {
                    const labels: Record<string, string> = { zip_code: "CEP", street: "Rua", number: "Número", complement: "Complemento", neighborhood: "Bairro", city: "Cidade", state: "Estado" };
                    const address = ((detail.customer as any)?.addresses || []).find((item: Address) => item.is_default) || (detail.customer as any)?.addresses?.[0];
                    return address?.[key] ? <InfoRow key={key} label={labels[key]} value={address[key]} /> : null;
                  })}
                </div>
              </Section>)}
              {hasPermission("orders.section.equipment") && (<Section title="Equipamento">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Equipamento" value={(detail.equipment_type as any)?.name || undefined} />
                  <InfoRow label="Marca" value={(detail.equipment_brand as any)?.name || undefined} />
                  <InfoRow label="Modelo" value={(detail.equipment_model as any)?.name || detail.model || undefined} />
                  <InfoRow label="Versão" value={detail.model || undefined} />
                  <InfoRow label="Número de série" value={detail.serial_number || undefined} />
                  <InfoRow label="Lacre" value={detail.accessories || undefined} />
                  <InfoRow label="Garantia" value={detail.equipment_condition || undefined} />
                </div>
              </Section>)}
              {hasPermission("orders.section.service_location") && (<Section title="Local do atendimento">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Tipo da OS" value={detail.order_type === "external" ? "Externa" : "Interna"} />
                  {detail.order_type === "external" && <InfoRow label="Origem do endereço" value={detail.service_address_source === "customer" ? "Endereço cadastrado do cliente" : "Endereço informado para esta OS"} />}
                  {detail.order_type === "external" && <InfoRow label="CEP" value={detail.service_zip_code} />}
                  {detail.order_type === "external" && <InfoRow label="Estado" value={stateLabel(detail.service_state)} />}
                  {detail.order_type === "external" && <InfoRow label="Cidade" value={detail.service_city} />}
                  {detail.order_type === "external" && <InfoRow label="Bairro" value={detail.service_neighborhood} />}
                  {detail.order_type === "external" && <InfoRow label="Rua" value={detail.service_street} />}
                  {detail.order_type === "external" && <InfoRow label="Número" value={detail.service_number} />}
                  {detail.order_type === "external" && <InfoRow label="Complemento" value={detail.service_complement} />}
                </div>
              </Section>)}
              {hasPermission("orders.section.information") && (<Section title="Informações da OS">
                <div className="grid sm:grid-cols-2 gap-3">
                  <InfoRow label="Nº da OS" value={detail.os_number} />
                  <InfoRow label="OS Externa" value={detail.external_os_number?.trim() || "Não informada"} />
                  <InfoRow label="Tipo de atendimento" value={(detail.service_type as any)?.title} />
                  <InfoRow label="Serviço" value={(detail.general_service as any)?.name || (detail.service as any)?.title} />
                  <InfoRow label="Responsável" value={getResponsibleName(detail as ServiceOrderWithRelations)} />
                  <InfoRow label="Vendedores" value={(detail.seller_links || []).length ? (detail.seller_links || []).map((link: any) => link.employee?.full_name).filter(Boolean).join(", ") : (detail.seller as any)?.full_name || "Nenhum vendedor atribuído"} />
                  <InfoRow label="Técnicos" value={(detail.technician_links || []).length ? (detail.technician_links || []).map((link: any) => link.employee?.full_name).filter(Boolean).join(", ") : (detail.technician as any)?.full_name || "Nenhum técnico atribuído"} />
                  <InfoRow label="Status" value={(detail.order_status as any)?.name} />
                  <InfoRow label="Situação" value={(detail.situation as any)?.name} />
                  <InfoRow label="Prioridade" value={detail.priority ? PRIORITY_LABELS[detail.priority] || detail.priority : undefined} />
                  <InfoRow label="Data de início" value={fmtDate(detail.created_at)} />
                  <InfoRow label="Data agendada" value={fmtDate(detail.scheduled_at)} />
                  <InfoRow label="Concluída em" value={detail.completed_at ? fmtDate(detail.completed_at, true) : null} />
                  {detail.completed_at && <InfoRow label="Concluída por" value={detail.completed_by_profile?.full_name || profiles.find(item => item.id === detail.completed_by)?.full_name || "Nome não informado"} />}
                  {detail.completed_at && <InfoRow label="Valor do serviço" value={formatCurrency(Number(detail.service_price || 0))} />}
                  {detail.completed_at && <InfoRow label="Valor das peças" value={formatCurrency(Number(detail.parts_total || 0))} />}
                  {detail.completed_at && <InfoRow label="Desconto aplicado" value={`${Number(detail.discount_percentage || 0).toLocaleString("pt-BR")}% (- ${formatCurrency(Number(detail.discount_amount || 0))})`} />}
                  {detail.completed_at && <InfoRow label="Valor final" value={formatCurrency(Number(detail.final_total || 0))} />}
                  <InfoRow label="Horas da situação" value={(detail.situation as any)?.hours == null ? null : `${(detail.situation as any).hours} hora(s)`} />
                  {(() => { const sla = getSlaForOrder(detail.service_type_id, detail.situation_id, detail.situation); return sla ? <InfoRow label="SLA da situação" value={`${sla.hours} hora(s) (${sla.isDefault ? "Padrão" : "Personalizado"})`} /> : null; })()}
                </div>
              </Section>)}
              {orderImages.length > 0 && hasPermission("orders.section.images") && (<Section title="Imagens da OS"><div className="flex flex-wrap gap-3">{orderImages.map(image => <OrderImageThumb key={image.key} image={image} onView={() => setViewImage(image)} />)}</div></Section>)}
              {hasPermission("orders.section.history") && (<Section title="Histórico">
                {detailHistory.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhum registro de alteração.</p> : (
                  <div className="space-y-2">
                    {detailHistory.map((h: any) => (
                      <div key={h.id} className="flex gap-3 text-xs">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#0057e7] mt-1.5 flex-shrink-0" />
                        <div>
                          <span className="font-bold text-[#0d1b2e]">{(h.order_status as any)?.name || "Status alterado"}</span>
                          {h.notes && <span className="text-[#5a6a82] ml-1">— {h.notes}</span>}
                          <p className="text-[#5a6a82] text-[10px]">{fmtDate(h.created_at, true)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>)}
              {detail.internal_notes && hasPermission("orders.section.internal_notes") && (<Section title="Observações internas"><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.internal_notes}</p></Section>)}
              {detail.customer_notes && hasPermission("orders.section.problem") && (<Section title="Descrição do problema"><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.customer_notes}</p></Section>)}
              {hasPermission("orders.section.parts") && (<Section title="Solicitações de peças">
                {detailPartRequests.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhuma solicitação de peças para esta OS.</p> : <div className="space-y-3">
                  {detailPartRequests.map((request: PartRequestForReview) => {
                    const status = String(request.status || "").toUpperCase();
                    const normalizedPurpose = request.purpose || "RESOLUTION";
                    const hasDeliveredItems = request.items.some(item => Number(item.delivered_quantity ?? 0) > 0);
                    const hasPendingDispatch = request.items.some(item => !item.source_test_item_id && Number(item.approved_quantity ?? 0) > Number(item.delivered_quantity ?? 0));
                    const hasPendingDeliveryConfirmation = request.items.some(item => Number(item.delivered_quantity ?? 0) > Number(item.technician_received_quantity ?? 0));
                    const hasReturnableItems = request.items.some(item => Number(item.technician_received_quantity ?? 0) - Number(item.returned_quantity ?? 0) - Number(item.return_pending_quantity ?? 0) - Number(item.damaged_quantity ?? 0) > 0);
                    const hasPendingReturnReceipt = request.items.some(item => Number(item.return_pending_quantity ?? 0) > 0);
                    const hasPendingTestResult = normalizedPurpose === "TEST" && request.items.some(item => getTestPendingQuantity(request, item) > 0);
                    const statusLabel = status === "APPROVED" ? "Aprovada" : status === "REJECTED" ? "Rejeitada" : status === "CANCELLED" ? "Cancelada" : "Em análise";
                    const statusClass = status === "APPROVED" ? "bg-green-100 text-green-700" : status === "REJECTED" ? "bg-red-100 text-red-700" : status === "CANCELLED" ? "bg-[#f5f7fa] text-[#5a6a82]" : "bg-amber-100 text-amber-700";
                    return <div key={request.id} className="rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", statusClass)}>{statusLabel}</span>
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700">{purposeLabel(normalizedPurpose)}</span>
                        <span className="text-[11px] text-[#5a6a82]">{request.requester?.full_name || "Solicitante não informado"} · {fmtDate(request.created_at, true)}</span>
                      </div>
                      {request.notes && <p className="mt-2 whitespace-pre-line text-xs text-[#0d1b2e]">{request.notes}</p>}
                      <PartCustodyWizard request={request} orderSolved={Boolean(detail?.is_solved)} getCommittedQuantity={getTestCommittedQuantity} />
                      <div className="mt-2 space-y-2">{request.items.map(item => {
                        const unit = item.inventory_item?.unit || "un";
                        const delivered = Math.max(0, Number(item.delivered_quantity ?? 0));
                        const received = Math.max(0, Number(item.technician_received_quantity ?? 0));
                        const returnPending = Math.max(0, Number(item.return_pending_quantity ?? 0));
                        const returned = Math.max(0, Number(item.returned_quantity ?? 0));
                        const damaged = Math.max(0, Number(item.damaged_quantity ?? 0));
                        const committed = normalizedPurpose === "TEST" ? getTestCommittedQuantity(item) : 0;
                        const pending = normalizedPurpose === "TEST" ? getTestPendingQuantity(request, item) : 0;
                        return <div key={item.id} className="rounded-lg border border-[#0d1b2e]/8 bg-white p-2.5">
                          <p className="text-xs font-semibold text-[#0d1b2e]">{item.inventory_item?.name || "Peça"}</p>
                          <p className="mt-0.5 text-[11px] text-[#5a6a82]">Solicitado: {Number(item.quantity)} {unit}{item.approved_quantity != null && ` · Aprovado: ${Number(item.approved_quantity)} ${unit}`}</p>
                          {item.source_test_item_id && <span className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">Origem: peça testada</span>}
                          {delivered > 0 && <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] sm:grid-cols-6">
                            <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">Saída: {delivered} {unit}</span>
                            <span className="rounded bg-cyan-50 px-2 py-1 text-cyan-700">Recebida pelo técnico: {received} {unit}</span>
                            <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">Devolução pendente: {returnPending} {unit}</span>
                            <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Recebida no estoque: {returned} {unit}</span>
                            <span className="rounded bg-red-50 px-2 py-1 text-red-700">Danificada: {damaged} {unit}</span>
                            <span className="rounded bg-violet-50 px-2 py-1 text-violet-700">Para resolução: {committed} {unit}</span>
                            <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">Aguardando: {pending} {unit}</span>
                          </div>}
                        </div>;
                      })}</div>
                      {status !== "PENDING" && (request.reviewed_by_profile?.full_name || request.reviewed_at || request.review_notes) && <div className="mt-2 border-t border-[#0d1b2e]/8 pt-2 text-[11px] text-[#5a6a82]">Analisado por {request.reviewed_by_profile?.full_name || "Responsável não informado"}{request.reviewed_at ? ` em ${fmtDate(request.reviewed_at, true)}` : ""}{request.review_notes ? ` · ${request.review_notes}` : ""}</div>}
                      {status === "APPROVED" && normalizedPurpose === "TEST" && hasDeliveredItems && <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>Peças já entregues — a análise não pode mais ser revertida.</span></div>}
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        {hasPermission("orders.manage_part_requests") && status === "PENDING" && <><button type="button" onClick={event => openPartApproval(event, request)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Aprovar</button><button type="button" onClick={event => openPartRejection(event, request)} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700">Rejeitar</button></>}
                        {hasPermission("orders.manage_part_requests") && status === "REJECTED" && <button type="button" onClick={event => openPartApproval(event, request)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Aprovar</button>}
                        {hasPermission("orders.manage_part_requests") && status === "APPROVED" && !hasDeliveredItems && <button type="button" onClick={event => openPartRejection(event, request)} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700">Desaprovar</button>}
                        {hasPermission("orders.dispatch_parts") && status === "APPROVED" && hasPendingDispatch && <button type="button" onClick={() => openCustodyAction(request, "DISPATCH")} className="rounded-lg bg-[#0057e7] px-3 py-2 text-xs font-bold text-white hover:bg-[#0046c0]">Confirmar saída</button>}
                        {hasPermission("orders.confirm_part_delivery") && status === "APPROVED" && hasPendingDeliveryConfirmation && <button type="button" onClick={() => openCustodyAction(request, "CONFIRM_DELIVERY")} className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-700">Confirmar entrega ao técnico</button>}
                        {hasPermission("orders.register_part_return") && status === "APPROVED" && hasReturnableItems && <button type="button" onClick={() => openCustodyAction(request, "REGISTER_RETURN")} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700">Registrar devolução</button>}
                        {hasPermission("orders.receive_returned_parts") && status === "APPROVED" && hasPendingReturnReceipt && <button type="button" onClick={() => openCustodyAction(request, "RECEIVE_RETURN")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Confirmar retorno ao estoque</button>}
                        {status === "APPROVED" && normalizedPurpose === "TEST" && hasDeliveredItems && hasPendingTestResult && user?.id === detail?.assigned_to && <button type="button" onClick={() => { setSelectedTestRequest(request); setTestResultRows([]); setTestResultOpen(true); }} className="rounded-lg border border-[#0057e7]/30 px-3 py-2 text-xs font-bold text-[#0057e7]">Registrar resultado do teste</button>}
                      </div>
                    </div>;
                  })}
                </div>}
              </Section>)}
              {(detail.is_solved || detail.cannot_be_solved || detail.diagnosis || detail.solution || detailUsedItems.length > 0 || detailSolutionImages.length > 0) && hasPermission("orders.section.solution") && (
                <Section title="Solução da OS">
                  <div className="space-y-4">
                    {detail.is_solved && <div className="flex items-center gap-2 flex-wrap"><span className="inline-flex items-center rounded-full bg-green-100 text-green-700 px-2.5 py-1 text-[10px] font-bold uppercase">✓ OS solucionada</span>{detail.solved_at && <span className="text-xs text-[#5a6a82]">Solucionada em {formatSolvedAt(detail.solved_at)} por: {profile?.full_name || "Nome não informado"}</span>}</div>}
                    {detail.cannot_be_solved && <div className="space-y-1"><span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase text-amber-700">⚠ OS não solucionável</span><p className="text-sm text-[#0d1b2e] whitespace-pre-line"><strong>Justificativa:</strong> {detail.cannot_be_solved_reason}</p></div>}
                    {detail.customer_notes && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-1">Descrição do problema</p><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.customer_notes}</p></div>}
                    {detail.diagnosis && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-1">Diagnóstico</p><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.diagnosis}</p></div>}
                    {detail.solution && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-1">Solução</p><p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.solution}</p></div>}
                    {detailUsedItems.length > 0 && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-2">Produtos utilizados</p><div className="space-y-2">{detailUsedItems.map((item: any) => {
                      const unitSalePrice = item.unit_sale_price == null ? null : Number(item.unit_sale_price);
                      const totalSalePrice = item.total_sale_price == null ? null : Number(item.total_sale_price);
                      const hasRegisteredPrices = unitSalePrice !== null && totalSalePrice !== null && Number.isFinite(unitSalePrice) && Number.isFinite(totalSalePrice);
                      return <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-2 text-sm"><span>{item.inventory_item?.name || "Produto"}</span><span className="text-right font-bold text-[#0d1b2e]">{hasRegisteredPrices ? `${Number(item.quantity || 0)} ${item.inventory_item?.unit || "un"} × ${formatCurrency(unitSalePrice)} = ${formatCurrency(totalSalePrice)}` : `${Number(item.quantity || 0)} ${item.inventory_item?.unit || "un"} · Preço não registrado`}</span></div>;
                    })}</div><div className="mt-3 flex items-center justify-between rounded-lg border border-[#0057e7]/20 bg-[#f0f6ff] px-3 py-2 text-sm"><span className="font-bold text-[#0d1b2e]">Valor total dos produtos</span><span className="font-black text-[#0057e7]">{formatCurrency(detailUsedItemsTotal)}</span></div></div>}
                    {detailSolutionImages.length > 0 && <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-2">Imagens da solução</p><div className="flex flex-wrap gap-3">{detailSolutionImages.map(image => <OrderImageThumb key={image.key} image={image} onView={() => setViewImage(image)} />)}</div></div>}
                  </div>
                </Section>
              )}
            </div>
            <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-between gap-3">
              <div className="flex gap-2 flex-wrap">
                <BtnSecondary onClick={() => setDetail(null)}>Fechar</BtnSecondary>
                {hasPermission("orders.status") && <select value={detail.status_id || ""} onChange={event => updateOrderStatus(detail, event.target.value)} className="text-xs border border-[#0d1b2e]/15 rounded-lg px-2 py-1.5 font-bold bg-white cursor-pointer"><option value="">Status</option>{statuses.map(status => <option key={status.id} value={status.id}>{status.name}</option>)}</select>}
                {hasPermission("orders.edit") && <select value={detail.situation_id || ""} onChange={event => void updateOrderSituation(detail, event.target.value)} className="text-xs border border-[#0d1b2e]/15 rounded-lg px-2 py-1.5 font-bold bg-white cursor-pointer"><option value="">Situação</option>{getSituationsForType(detail.service_type_id, detail.situation_id, detail.situation).map(situation => <option key={situation.id} value={situation.id}>{situation.name}</option>)}</select>}
                {hasPermission("orders.request_parts") && detail && detail.is_solved !== true && <button type="button" onClick={openPartRequestModal} className="inline-flex items-center gap-2 whitespace-nowrap border border-[#0d1b2e]/15 text-[#0d1b2e] px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-[#f5f7fa] transition-colors cursor-pointer"><PackagePlus size={14} /> Pedir peças</button>}
                {hasPermission("orders.solve") && !detail.is_solved && !detail.cannot_be_solved && <BtnPrimary onClick={() => openSolveOrder(detail)}><CheckCircle size={14} /> Resolver OS</BtnPrimary>}
                {hasPermission("orders.complete") && detail.is_solved && !detail.completed_at && <BtnPrimary onClick={() => openCompletion(detail)}><DollarSign size={14} /> Concluir OS</BtnPrimary>}
                {hasPermission("orders.edit") && !detail.is_solved && <BtnPrimary onClick={() => { setDetail(null); void openEdit(detail); }}><Edit2 size={14} /> Editar</BtnPrimary>}
              </div>
            </div>
        </AdminPage>
      )}

      {/* OS Create/Edit Page */}
      {formOpen && (
        <AdminPage open={true} onClose={closeOrderForm} breadcrumb={editingOS ? `Ordens de Serviço > OS #${editingOS.os_number || editingOS.id.slice(0,8)}` : "Ordens de Serviço"} title={editingOS ? "Editar OS" : "Nova OS"} subtitle={editingOS ? "Atualize os dados do atendimento" : "Cadastre os dados do atendimento"} maxW="max-w-2xl" fullPage={Boolean(editingOS)}>
          <div className="p-5 space-y-5">
            {/* Cliente */}
            {hasPermission("orders.section.customer") && (<Section title="Cliente">
              {selectedCustomer ? (
                <div className="space-y-4">
                  {editingCustomer ? (
                    <div className="space-y-4">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <CustomerTypeToggle value={customerDraft.customerType} disabled onChange={customerType => setCustomerDraft({ ...customerDraft, customerType })} />
                        {customerDraft.customerType === "PF" ? <>
                          <FInput label="Nome completo" required value={customerDraft.full_name} onChange={(e: any) => setCustomerDraft({ ...customerDraft, full_name: e.target.value })} />
                          <FInput label="CPF" value={customerDraft.document} disabled />
                          <div><FInput label="Data de nascimento" type="date" required value={customerDraft.birth_date} max={todayDateOnly()} onChange={(e: any) => setCustomerDraft({ ...customerDraft, birth_date: e.target.value })} />{!customerDraft.birth_date && <p className="mt-1 text-xs text-red-600">Informe a data de nascimento.</p>}</div>
                        </> : <>
                          <FInput label="Nome fantasia" required value={customerDraft.trade_name} onChange={(e: any) => setCustomerDraft({ ...customerDraft, trade_name: e.target.value })} />
                          <FInput label="CNPJ" required value={customerDraft.cnpj} disabled />
                          <FInput label="Razão social" value={customerDraft.legal_name} onChange={(e: any) => setCustomerDraft({ ...customerDraft, legal_name: e.target.value })} />
                          <FInput label="Inscrição estadual" value={customerDraft.state_registration} hint="Deixe em branco se não for contribuinte · ISENTO se isento" onChange={(e: any) => setCustomerDraft({ ...customerDraft, state_registration: e.target.value })} />
                          <FInput label="Fundação" value={customerDraft.foundation_date} placeholder="dd/mm/aaaa" maxLength={10} onChange={(e: any) => setCustomerDraft({ ...customerDraft, foundation_date: formatFoundationDate(e.target.value) })} />
                        </>}
                          <FInput label="WhatsApp" value={customerDraft.whatsapp} onChange={(e: any) => setCustomerDraft({ ...customerDraft, whatsapp: formatPhone(e.target.value) })} />
                          <FInput label="Telefone" value={customerDraft.phone} onChange={(e: any) => setCustomerDraft({ ...customerDraft, phone: formatPhone(e.target.value) })} />
                        <div className="sm:col-span-2"><FInput label="E-mail" type="email" value={customerDraft.email} onChange={(e: any) => setCustomerDraft({ ...customerDraft, email: e.target.value })} /></div>
                      </div>
                      {hasPermission("orders.section.address") && (<Section title="Endereço do cliente">
                        <AddressFields value={customerAddressDraft} onChange={setCustomerAddressDraft} inputClassName={INPUT} />
                      </Section>)}
                      {hasPermission("customers.edit") && <BtnPrimary onClick={saveCustomer} disabled={saving}>{saving ? "Salvando..." : "Salvar dados"}</BtnPrimary>}
                    </div>
                  ) : (
                    <>
                      <div className="grid sm:grid-cols-3 gap-3">
                        <InfoRow label="Nome" value={selectedCustomer.full_name} />
                        <InfoRow label="Telefone" value={formatPhone(selectedCustomer.phone)} />
                        <div><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-0.5">WhatsApp</p><div className="flex items-center gap-2 text-sm font-medium text-[#0d1b2e]">{formatPhone(selectedCustomer.whatsapp) || "—"}{getWhatsAppUrl(selectedCustomer.whatsapp) && <a href={getWhatsAppUrl(selectedCustomer.whatsapp) || "#"} target="_blank" rel="noreferrer" aria-label="Abrir WhatsApp do cliente" className="text-[#25d366] hover:text-[#1da851]"><MessageCircle size={16} /></a>}</div></div>
                        <InfoRow label="E-mail" value={selectedCustomer.email} />
                        <InfoRow label="Documento" value={selectedCustomer.document} />
                      </div>
                      <button type="button" onClick={() => setAddressExpanded(value => !value)} className="text-xs font-bold text-[#0057e7] hover:underline">{addressExpanded ? "Ocultar endereço ▲" : "Mostrar endereço ▼"}</button>
                      {addressExpanded && <div className="border-t border-[#0d1b2e]/8 pt-4"><p className="text-[10px] font-bold text-[#5a6a82] uppercase mb-2">Endereço</p><div className="grid sm:grid-cols-3 gap-3">{(() => { const address = (selectedCustomer.addresses || []).find((item: Address) => item.is_default) || selectedCustomer.addresses?.[0]; const labels: Record<string, string> = { zip_code: "CEP", street: "Rua", number: "Número", complement: "Complemento", neighborhood: "Bairro", city: "Cidade", state: "Estado" }; return (["zip_code", "street", "number", "complement", "neighborhood", "city", "state"] as const).map(key => address?.[key] ? <InfoRow key={key} label={labels[key]} value={address[key]} /> : null); })()}</div></div>}
                      <div className="flex flex-wrap gap-2">{!editingOS && <BtnSecondary onClick={() => { setSelectedCustomer(null); upF("customer_id", ""); }}><Users size={13} /> Trocar cliente</BtnSecondary>}{hasPermission("customers.edit") && <BtnSecondary onClick={() => setEditingCustomer(true)}><Edit2 size={13} /> Editar dados</BtnSecondary>}</div>
                    </>
                  )}
                  {editingCustomer && <button onClick={() => setEditingCustomer(false)} className="text-xs text-[#5a6a82] hover:underline">Cancelar edição</button>}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-end gap-2">
                    <div className="relative flex-1">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
                      <input value={customerSearch} onChange={e => searchCustomers(e.target.value)} placeholder="Buscar cliente por nome, CPF ou WhatsApp..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
                    </div>
                    {hasPermission("customers.create") && <BtnPrimary onClick={() => setQuickCustomer(true)}><Plus size={13} /> Criar cliente</BtnPrimary>}
                  </div>
                  {customerResults.length > 0 && (
                    <div className="border border-[#0d1b2e]/10 rounded-lg overflow-hidden">
                      {customerResults.map(c => (
                        <button key={c.id} onClick={() => selectCustomer(c)} className="w-full text-left px-3 py-2 hover:bg-[#e8eef8] border-b last:border-b-0 border-[#0d1b2e]/5">
                          <p className="font-semibold text-sm text-[#0d1b2e]">{c.full_name}</p>
                          <p className="text-xs text-[#5a6a82]">{c.customer_type === "PJ" ? formatCnpj(c.cnpj || "") : formatCpf(c.document || "")} {c.whatsapp && `· ${formatPhone(c.whatsapp)}`}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Section>)}

            {hasPermission("orders.section.equipment") && (<Section title="Equipamento">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2 flex items-end gap-2"><div className="flex-1"><FSelect label="Tipo de equipamento" value={form.equipment_type_id} onChange={(e: any) => { upF("equipment_type_id", e.target.value); upF("equipment_brand_id", ""); upF("equipment_model_id", ""); }} options={[{ value: "", label: "Selecionar equipamento..." }, ...equipmentTypes.map(type => ({ value: type.id, label: type.name }))]} /></div>{!editingOS && hasPermission("equipment.create") && <BtnPrimary className="h-[42px]" onClick={() => setQuickEquipment(true)}><Plus size={15} /> Criar equipamento</BtnPrimary>}</div>
                <FSelect label="Marca técnica" value={form.equipment_brand_id} disabled={!form.equipment_type_id} onChange={(e: any) => { upF("equipment_brand_id", e.target.value); upF("equipment_model_id", ""); }} options={[{ value: "", label: form.equipment_type_id ? "Selecionar marca..." : "Selecione o tipo primeiro" }, ...equipmentBrands.filter(brand => brand.equipment_type_id === form.equipment_type_id).map(brand => ({ value: brand.id, label: brand.name }))]} />
                <FSelect label="Modelo" value={form.equipment_model_id} disabled={!form.equipment_brand_id} onChange={(e: any) => upF("equipment_model_id", e.target.value)} options={[{ value: "", label: form.equipment_brand_id ? "Selecionar modelo..." : "Selecione a marca primeiro" }, ...equipmentModels.filter(model => model.equipment_brand_id === form.equipment_brand_id).map(model => ({ value: model.id, label: model.name }))]} />
                <FInput label="Versão" value={form.model} onChange={(e: any) => upF("model", e.target.value)} />
                <FInput label="Nº de série" value={form.serial_number} disabled={Boolean(editingOS)} onChange={(e: any) => upF("serial_number", e.target.value)} />
                <FInput label="Lacre / garantia" value={form.accessories} onChange={(e: any) => upF("accessories", e.target.value)} />
                <div className="sm:col-span-2"><FTextarea label="Observações do equipamento" value={form.equipment_condition} onChange={(e: any) => upF("equipment_condition", e.target.value)} rows={3} /></div>
              </div>
            </Section>)}

            {hasPermission("orders.section.service_location") && (<Section title="Local do atendimento">
              <div className="space-y-4">
                <FSelect label="Tipo da OS" required value={form.order_type} onChange={(e: any) => {
                  const orderType = e.target.value as OrderType;
                  upF("order_type", orderType);
                  setServiceAddressMessage("");
                  if (orderType === "internal") { setServiceUseCustomerAddress(false); setServiceCustomerAddressOverride(false); clearServiceAddress(); }
                  else if (selectedServiceAddress) { setServiceUseCustomerAddress(true); setServiceCustomerAddressOverride(true); copyCustomerAddressToForm(selectedServiceAddress); }
                  else { setServiceUseCustomerAddress(false); setServiceAddressMessage("Este cliente não possui endereço cadastrado. Preencha o local do atendimento."); clearServiceAddress(); }
                }} options={[{ value: "internal", label: "Interna" }, { value: "external", label: "Externa" }]} />
                {form.order_type === "external" && <>
                  <label className="flex items-center gap-2 text-sm font-semibold text-[#0d1b2e]">
                    <input type="checkbox" checked={serviceUseCustomerAddress} onChange={event => {
                      if (event.target.checked && selectedServiceAddress) { setServiceUseCustomerAddress(true); setServiceCustomerAddressOverride(true); setServiceAddressMessage(""); copyCustomerAddressToForm(selectedServiceAddress); }
                      else if (event.target.checked) { setServiceUseCustomerAddress(false); setServiceAddressMessage("Este cliente não possui endereço cadastrado. Preencha o local do atendimento."); }
                      else { setServiceUseCustomerAddress(false); setServiceCustomerAddressOverride(false); setServiceAddressMessage(""); clearServiceAddress(); }
                    }} />
                    Usar endereço cadastrado do cliente
                  </label>
                  {serviceAddressMessage && <p className="text-xs text-[#5a6a82]">{serviceAddressMessage}</p>}
                  {serviceUseCustomerAddress && serviceAddressPreview ? <div className="rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3 text-xs text-[#5a6a82]">
                    <p className="mb-1 font-bold text-[#0d1b2e]">Endereço que será usado</p>
                    <p>{[serviceAddressPreview.zip_code, [serviceAddressPreview.street, serviceAddressPreview.number].filter(Boolean).join(", "), serviceAddressPreview.complement, serviceAddressPreview.neighborhood, [serviceAddressPreview.city, serviceAddressPreview.state].filter(Boolean).join(" - ")].filter(Boolean).join(" · ")}</p>
                  </div> : <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <FInput label="CEP" required value={form.service_zip_code} onChange={(e: any) => setForm(current => ({ ...current, service_zip_code: formatZipCode(e.target.value) }))} />
                      {ibgeCitiesLoading && <p className="mt-1 text-[10px] text-[#5a6a82]">Consultando endereço...</p>}
                      {serviceAddressMessage && <p className="mt-1 text-xs text-red-600">{serviceAddressMessage}</p>}
                      {!form.service_zip_code.trim() && <p className="mt-1 text-xs text-red-600">Informe o CEP.</p>}
                    </div>
                    <div>
                      <OrderAddressSelect label="Estado" value={form.service_state} disabled={ibgeStatesLoading} onChange={value => { upF("service_state", value); upF("service_city", ""); void loadIbgeCities(value); }} placeholder={ibgeStatesLoading ? "Carregando estados..." : "Selecionar estado..."} options={ibgeStates.map(state => ({ value: state.sigla, label: `${state.sigla} — ${state.nome}` }))} />
                      {!form.service_state.trim() && <p className="mt-1 text-xs text-red-600">Informe o estado.</p>}
                    </div>
                    <div>
                      <OrderAddressSelect label="Cidade" value={form.service_city} disabled={!form.service_state || ibgeCitiesLoading} onChange={value => upF("service_city", value)} placeholder={!form.service_state ? "Selecione o estado primeiro" : ibgeCitiesLoading ? "Carregando cidades..." : "Selecionar cidade..."} options={ibgeCities.map(city => ({ value: city.nome, label: city.nome }))} />
                      {!form.service_city.trim() && <p className="mt-1 text-xs text-red-600">Informe a cidade.</p>}
                    </div>
                    <FInput label="Bairro" value={form.service_neighborhood} onChange={(e: any) => upF("service_neighborhood", e.target.value)} />
                    <div className="sm:col-span-2 grid sm:grid-cols-[1fr_10rem] gap-4">
                      <div><FInput label="Rua" required value={form.service_street} onChange={(e: any) => upF("service_street", e.target.value)} />{!form.service_street.trim() && <p className="mt-1 text-xs text-red-600">Informe a rua.</p>}</div>
                      <div><FInput label="Número" required value={form.service_number} onChange={(e: any) => upF("service_number", e.target.value)} />{!form.service_number.trim() && <p className="mt-1 text-xs text-red-600">Informe o número.</p>}</div>
                    </div>
                    <div className="sm:col-span-2"><FInput label="Complemento" value={form.service_complement} onChange={(e: any) => upF("service_complement", e.target.value)} /></div>
                  </div>}
                </>}
              </div>
            </Section>)}

            <OrderImagesField images={orderImages} onAdd={addOrderImages} onRemove={removeOrderImage} onView={setViewImage} canEdit={editingOS ? hasPermission("orders.edit") : hasPermission("orders.create")} />

            {hasPermission("orders.section.information") && (<Section title="Informações da OS">
              <div className="grid sm:grid-cols-2 gap-4">
                <FSelect label="Tipo de atendimento" required={!editingOS} value={form.service_type_id} onChange={(e: any) => { const serviceTypeId = e.target.value; upF("service_type_id", serviceTypeId); const links = serviceTypeSituations.filter(link => link.service_type_id === serviceTypeId); if (form.situation_id && links.length > 0 && !links.some(link => link.situation_id === form.situation_id)) upF("situation_id", ""); }} options={[{ value: "", label: "Selecionar tipo..." }, ...serviceTypes.map(type => ({ value: type.id, label: type.title }))]} />
                <FSelect label="Serviço" value={form.general_service_id} required onChange={(e: any) => upF("general_service_id", e.target.value)} options={[{ value: "", label: "Selecionar serviço..." }, ...generalServices.map(service => ({ value: service.id, label: service.name }))]} />
                <div><FSelect label="Situação" value={form.situation_id} onChange={(e: any) => upF("situation_id", e.target.value)} options={[{ value: "", label: "Selecionar situação..." }, ...getSituationsForType(form.service_type_id, editingOS?.situation_id, editingOS?.situation).map(s => ({ value: s.id, label: s.name }))]} />{(() => { const sla = getSlaForOrder(form.service_type_id, form.situation_id); return sla ? <p className="mt-1 text-xs font-semibold text-[#5a6a82]">SLA desta situação: {sla.hours} horas ({sla.isDefault ? "padrão" : "personalizado"})</p> : null; })()}</div>
                <EmployeeMultiSelect label="Técnicos" employees={employees} selectedIds={selectedTechnicianIds} onChange={setSelectedTechnicianIds} disabled={!hasPermission("orders.assign")} placeholder="Selecionar técnicos" clearLabel="Limpar Técnicos" />
                <EmployeeMultiSelect label="Vendedores" employees={employees} selectedIds={selectedSellerIds} onChange={setSelectedSellerIds} disabled={!hasPermission("orders.assign")} placeholder="Selecionar vendedores" clearLabel="Limpar Vendedores" />
                <FSelect label="Prioridade" value={form.priority} onChange={(e: any) => upF("priority", e.target.value)} options={[{ value: "baixa", label: "Baixa" }, { value: "normal", label: "Normal" }, { value: "alta", label: "Alta" }, { value: "urgente", label: "Urgente" }]} />
                {editingOS ? <div><FInput label="OS Externa" value={editingOS.external_os_number?.trim() || "Não informada"} disabled readOnly /><p className="mt-1 text-[10px] text-[#5a6a82]">A OS Externa não pode ser alterada após o cadastro.</p></div> : <FInput label="OS Externa" type="text" value={form.external_os_number} onChange={(e: any) => upF("external_os_number", e.target.value)} placeholder="Digite o número da OS externa" />}
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">Necessita agendamento</label>
                  <div className="flex gap-4 text-sm text-[#0d1b2e]">
                    <label className="flex items-center gap-2"><input type="radio" checked={needsScheduling} onChange={() => setNeedsScheduling(true)} /> Sim</label>
                    <label className="flex items-center gap-2"><input type="radio" checked={!needsScheduling} onChange={() => { setNeedsScheduling(false); upF("scheduled_at", ""); }} /> Não</label>
                  </div>
                </div>
                {needsScheduling && <>
                  <FInput label="Data agendada" type="date" required value={form.scheduled_at.slice(0, 10)} onChange={(e: any) => upF("scheduled_at", `${e.target.value}${form.scheduled_at.slice(10) || "T"}`)} />
                  <FInput label="Hora agendada" type="time" required value={form.scheduled_at.slice(11, 16)} onChange={(e: any) => upF("scheduled_at", `${form.scheduled_at.slice(0, 10)}T${e.target.value}`)} />
                </>}
              </div>
              <div className="space-y-4">
                <FTextarea label="Descrição do problema" value={form.customer_notes} onChange={(e: any) => upF("customer_notes", e.target.value)} rows={4} />
                <FTextarea label="Observações internas" value={form.internal_notes} onChange={(e: any) => upF("internal_notes", e.target.value)} rows={3} />
              </div>
            </Section>)}
          </div>
          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
            <BtnSecondary onClick={closeOrderForm}>Cancelar</BtnSecondary>
            {(editingOS ? hasPermission("orders.edit") : hasPermission("orders.create")) && <BtnPrimary onClick={saveOS} disabled={saving}>{saving ? <Clock size={14} className="animate-spin" /> : <CheckCircle size={14} />}{saving ? "Salvando..." : "Salvar OS"}</BtnPrimary>}
          </div>
        </AdminPage>
      )}
      {quickEquipment && <QuickEquipmentModal
        onClose={() => setQuickEquipment(false)}
        onSaved={({ type, brand, model }) => {
          setEquipmentTypes(current => [...current, type]);
          setEquipmentBrands(current => [...current, brand]);
          setEquipmentModels(current => [...current, model]);
          setForm(current => ({ ...current, equipment_type_id: type.id, equipment_brand_id: brand.id, equipment_model_id: model.id }));
        }}
      />}
      {quickCustomer && <QuickCustomerModal
        onClose={() => setQuickCustomer(false)}
        onSaved={customer => {
          setSelectedCustomer(customer);
          setCustomerDraft(customerFormFromCustomer(customer));
          setCustomerAddressDraft({ ...emptyAddress, ...(customer.addresses?.[0] || {}) });
          setCustomerResults([]);
          setCustomerSearch("");
          upF("customer_id", customer.id);
          if (form.order_type === "external" && serviceUseCustomerAddress) {
            const address = (customer.addresses || []).find((item: Address) => item.is_default) || customer.addresses?.[0];
            if (address) { setServiceCustomerAddressOverride(true); copyCustomerAddressToForm(address); }
            else { setServiceUseCustomerAddress(false); setServiceAddressMessage("Este cliente não possui endereço cadastrado. Preencha o local do atendimento."); clearServiceAddress(); }
          }
        }}
      />}
      {solveOpen && detail && <AdminPage open={true} onClose={() => setSolveOpen(false)} breadcrumb="Ordens de Serviço" title="Resolver OS" subtitle="Diagnóstico, solução e produtos utilizados" maxW="max-w-2xl">
        <div className="p-5 space-y-5">
          {hasPermission("orders.section.information") && (<Section title="Informações da OS">
            <div className="grid sm:grid-cols-2 gap-3">
              <InfoRow label="Nº da OS" value={detail.os_number} />
              <InfoRow label="Serviço" value={(detail.service as any)?.title || (detail.general_service as any)?.name || "—"} />
              <InfoRow label="Equipamento" value={(detail.equipment_type as any)?.name || "—"} />
              <InfoRow label="Marca" value={(detail.equipment_brand as any)?.name || (detail.brand as any)?.name || "—"} />
              <InfoRow label="Modelo" value={(detail.equipment_model as any)?.name || detail.model || "—"} />
              <InfoRow label="Versão" value={detail.model || "—"} />
              <InfoRow label="Nº de série" value={detail.serial_number || "—"} />
              <InfoRow label="Lacre" value={detail.accessories || "—"} />
              <InfoRow label="Garantia" value={detail.equipment_condition || "—"} />
            </div>
          </Section>)}

          {hasPermission("orders.section.problem") && (<Section title="Descrição do problema">
            <p className="text-sm text-[#0d1b2e] whitespace-pre-line">{detail.customer_notes || "Nenhuma descrição do problema registrada."}</p>
          </Section>)}

          {hasPermission("orders.section.solution") && (<Section title="Diagnóstico">
            <FTextarea label="Diagnóstico" value={solveDraft.diagnosis} onChange={(e: any) => setSolveDraft(current => ({ ...current, diagnosis: e.target.value }))} rows={5} />
          </Section>)}

          {hasPermission("orders.section.solution") && (<Section title="Solução">
            <FTextarea label="Solução" value={solveDraft.solution} onChange={(e: any) => setSolveDraft(current => ({ ...current, solution: e.target.value }))} rows={5} />
          </Section>)}

          {hasPermission("orders.section.solution") && (<Section title="Resultado do atendimento">
            <label className="flex items-start gap-2 text-sm font-bold text-[#0d1b2e]">
              <input type="checkbox" checked={solveDraft.cannotSolve} onChange={event => setSolveDraft(current => ({ ...current, cannotSolve: event.target.checked }))} />
              OS não pode ser solucionada
            </label>
            {solveDraft.cannotSolve && <div className="mt-3"><FTextarea label="Justificativa" value={solveDraft.cannotSolveReason} onChange={(e: any) => setSolveDraft(current => ({ ...current, cannotSolveReason: e.target.value }))} rows={4} hint="Informe por que esta OS não pode ser solucionada." /></div>}
          </Section>)}

          {hasPermission("orders.section.parts") && (<Section title="Produtos utilizados">
            <div className="space-y-3">
              {solveDraft.usedItems.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhuma peça aprovada para esta OS.</p> : solveDraft.usedItems.map((item: any) => {
                const stockItem = inventoryItems.find(entry => entry.id === item.inventory_item_id);
                const available = Number(stockItem?.quantity ?? 0);
                const requested = Number(item.quantity || 0);
                const approved = Number(item.approved_quantity ?? requested);
                const prewithdrawn = Number(item.prewithdrawn_quantity ?? 0);
                const stockRequired = Math.max(0, requested - prewithdrawn);
                const invalid = requested <= 0 || requested > approved || stockRequired > available;
                return (
                  <div key={item.inventory_item_id} className="rounded-xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-[#0d1b2e]">{item.name}</p>
                        <p className="text-[11px] text-[#5a6a82]">{requested} {item.unit || stockItem?.unit || "un"} aprovadas · Disponível: {available} {item.unit || stockItem?.unit || "un"}</p>
                        {prewithdrawn > 0 && <p className="mt-1 text-[10px] font-bold text-violet-700">{prewithdrawn} {item.unit || stockItem?.unit || "un"} {prewithdrawn === 1 ? "já retirada" : "já retiradas"} para teste</p>}
                        {invalid && <p className="mt-1 text-[10px] font-bold text-red-600">Estoque insuficiente</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>)}

          {hasPermission("orders.section.images") && (<Section title="Imagens da OS">
            {orderImages.length > 0 ? <div className="flex flex-wrap gap-3">{orderImages.map(image => <OrderImageThumb key={image.key} image={image} onView={() => setViewImage(image)} />)}</div> : <p className="text-xs text-[#5a6a82]">Nenhuma imagem da OS cadastrada.</p>}
          </Section>)}

          {hasPermission("orders.section.images") && (<Section title="Imagens da solução">
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="text-xs text-[#5a6a82]">{solutionImages.length}/5 imagens</p>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" disabled={solutionImages.length >= 5} onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
                  input.multiple = true;
                  input.onchange = (event: any) => {
                    const files = event.target.files as FileList | null;
                    const selected = Array.from(files || []).filter(file => ["image/jpeg", "image/png", "image/webp"].includes(file.type)).slice(0, 5 - solutionImages.length);
                    setSolutionImages(current => [...current, ...selected.map(file => ({ key: `solution-${Date.now()}-${Math.random()}`, file, url: URL.createObjectURL(file), name: file.name }))]);
                  };
                  input.click();
                }} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] border border-[#0057e7]/35 px-3 py-2 rounded-lg disabled:opacity-50"><Upload size={13} /> Adicionar imagens</button>
                <button type="button" disabled={solutionImages.length >= 5} onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.capture = "environment";
                  input.onchange = (event: any) => {
                    const files = event.target.files as FileList | null;
                    const selected = Array.from(files || []).filter(file => ["image/jpeg", "image/png", "image/webp"].includes(file.type)).slice(0, 5 - solutionImages.length);
                    setSolutionImages(current => [...current, ...selected.map(file => ({ key: `solution-cam-${Date.now()}-${Math.random()}`, file, url: URL.createObjectURL(file), name: file.name }))]);
                  };
                  input.click();
                }} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] border border-[#0057e7]/35 px-3 py-2 rounded-lg disabled:opacity-50"><Camera size={13} /> Abrir câmera</button>
              </div>
            </div>
            {solutionImages.length > 0 ? <div className="flex flex-wrap gap-3">{solutionImages.map(image => <OrderImageThumb key={image.key} image={image} onRemove={() => setSolutionImages(current => current.filter(item => item.key !== image.key))} onView={() => setViewImage(image)} />)}</div> : <p className="text-xs text-[#5a6a82]">Nenhuma imagem adicionada para a solução.</p>}
          </Section>)}
        </div>
        <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
          <BtnSecondary onClick={() => setSolveOpen(false)}>Cancelar</BtnSecondary>
          <BtnPrimary onClick={() => {
            if (solveDraft.cannotSolve) {
              if (!solveDraft.cannotSolveReason.trim()) {
                setToast({ msg: "Informe a justificativa para esta OS não solucionável.", type: "error" });
                return;
              }
            }
            const hasInvalidProducts = solveDraft.usedItems.some(item => {
              const stockItem = inventoryItems.find(entry => entry.id === item.inventory_item_id);
              const requested = Number(item.quantity || 0);
              const approved = Number(item.approved_quantity ?? requested);
              const prewithdrawn = Number(item.prewithdrawn_quantity ?? 0);
              return requested <= 0 || requested > approved || Math.max(0, requested - prewithdrawn) > Number(stockItem?.quantity ?? 0);
            });
            if (hasInvalidProducts) {
              setToast({ msg: "Estoque insuficiente em pelo menos um produto. Ajuste a quantidade antes de concluir.", type: "error" });
              return;
            }
            void saveOrderSolution(detail.id);
          }} disabled={saving}><CheckCircle size={14} /> Concluir solução</BtnPrimary>
        </div>
      </AdminPage>}
      {completionOpen && detail && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="completion-modal-title" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setCompletionOpen(false); }}>
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#0d1b2e]/8 px-5 py-4">
              <div>
                <h2 id="completion-modal-title" className="text-lg font-black text-[#0d1b2e]">Concluir OS</h2>
                <p className="mt-0.5 text-sm text-[#5a6a82]">Confirme os valores finais do atendimento</p>
              </div>
              <button type="button" onClick={() => setCompletionOpen(false)} disabled={saving} aria-label="Fechar" className="rounded-lg p-2 text-[#5a6a82] transition-colors hover:bg-[#f5f7fa] hover:text-[#0d1b2e] disabled:opacity-50"><X size={18} /></button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <Section title="Resumo financeiro">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3 text-sm"><span className="text-[#5a6a82]">Serviço: {detail.general_service?.name || "—"}</span><strong className="text-[#0d1b2e]">{formatCurrency(completionServicePrice)}</strong></div>
                  <div className="flex items-center justify-between gap-3 text-sm"><span className="text-[#5a6a82]">Peças utilizadas</span><strong className="text-[#0d1b2e]">{formatCurrency(detailUsedItemsTotal)}</strong></div>
                  <div className="flex items-center justify-between gap-3 border-t border-[#0d1b2e]/10 pt-3"><span className="font-bold text-[#0d1b2e]">Subtotal</span><strong className="text-[#0057e7]">{formatCurrency(completionSubtotal)}</strong></div>
                </div>
              </Section>
              <Section title="Desconto">
                <FInput label="Desconto (%)" type="number" min="0" max={completionMaxDiscount} step="0.01" value={completionDiscount} onChange={(e: any) => setCompletionDiscount(e.target.value)} placeholder="0" hint={`Desconto máximo permitido: ${completionMaxDiscount.toLocaleString("pt-BR")}%`} />
                {completionDiscountPercentage > completionMaxDiscount && <p className="mt-2 text-xs font-semibold text-red-600">O desconto informado ultrapassa o máximo permitido.</p>}
              </Section>
              <div className="space-y-2 rounded-xl border border-[#0057e7]/20 bg-[#f0f6ff] p-4">
                <div className="flex justify-between text-sm text-[#5a6a82]"><span>Desconto</span><span>- {formatCurrency(completionDiscountAmount)}</span></div>
                <div className="flex items-center justify-between gap-3 border-t border-[#0057e7]/15 pt-3"><span className="font-black text-[#0d1b2e]">Valor final</span><span className="text-xl font-black text-[#0057e7]">{formatCurrency(completionFinalTotal)}</span></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-5 py-4">
              <BtnSecondary onClick={() => setCompletionOpen(false)}>Cancelar</BtnSecondary>
              <BtnPrimary onClick={() => void completeOrder()} disabled={saving || completionDiscountPercentage < 0 || completionDiscountPercentage > completionMaxDiscount}>{saving ? "Concluindo..." : "Confirmar conclusão"}</BtnPrimary>
            </div>
          </div>
        </div>
      )}
      {viewImage && <OrderImageLightbox image={viewImage} onClose={() => setViewImage(null)} />}
      {partRequestOpen && detail && (
        <PartRequestModal orderNumber={detail.os_number} inventoryItems={partRequestInventory} inventoryLoading={partRequestInventoryLoading} inventoryError={partRequestInventoryError} selectedItems={selectedPartRequestItems} search={partRequestSearch} notes={partRequestNotes} purpose={partRequestPurpose} submitting={partRequestSubmitting} onPurposeChange={setPartRequestPurpose} onSearchChange={setPartRequestSearch} onNotesChange={setPartRequestNotes} onSelect={selectPartRequestItem} onQuantityChange={updatePartRequestQuantity} onRemove={removePartRequestItem} onClose={closePartRequestModal} onSubmit={() => void submitPartRequest()} />
      )}
      {partApprovalOpen && selectedPartRequest && detail && <ReviewPartRequestModal request={selectedPartRequest} orderNumber={detail.os_number} rejection={false} approvalQuantities={approvalQuantities} notes={partReviewNotes} submitting={partReviewSubmitting} onNotesChange={setPartReviewNotes} onQuantityChange={updateApprovalQuantity} onClose={closePartReview} onSubmit={approvePartRequest} />}
      {partRejectionOpen && selectedPartRequest && detail && <ReviewPartRequestModal request={selectedPartRequest} orderNumber={detail.os_number} rejection={true} approvalQuantities={approvalQuantities} notes={partReviewNotes} submitting={partReviewSubmitting} onNotesChange={setPartReviewNotes} onQuantityChange={updateApprovalQuantity} onClose={closePartReview} onSubmit={rejectPartRequest} />}
      {deliveryOpen && selectedDeliveryRequest && <PartCustodyModal request={selectedDeliveryRequest} action={custodyAction} quantities={custodyQuantities} submitting={deliverySubmitting} onQuantitiesChange={setCustodyQuantities} onClose={() => { if (!deliverySubmitting) { setDeliveryOpen(false); setSelectedDeliveryRequest(null); setCustodyQuantities({}); } }} onSubmit={() => void submitCustodyAction()} />}
      {testResultOpen && selectedTestRequest && <TestResultModal request={selectedTestRequest} rows={testResultRows} submitting={testResultSubmitting} getPendingQuantity={getTestPendingQuantity} onRowsChange={setTestResultRows} onClose={() => { if (!testResultSubmitting) { setTestResultOpen(false); setSelectedTestRequest(null); setTestResultRows([]); } }} onSubmit={() => void submitTestResults()} />}
    </div>
  );
}

function QuickCustomerModal({ onClose, onSaved }: {
  onClose: () => void;
  onSaved: (customer: any) => void;
}) {
  const { hasPermission } = useAuth();
  const [form, setForm] = useState<CustomerForm>({ ...emptyCustomerForm });
  const [address, setAddress] = useState<Address>({ ...emptyAddress });
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjMessage, setCnpjMessage] = useState("");
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { x: position.x, y: position.y, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setPosition({ x: dragRef.current.x + event.clientX - dragRef.current.startX, y: dragRef.current.y + event.clientY - dragRef.current.startY });
  };
  const endDrag = () => { dragRef.current = null; };
  const save = async () => {
    const validationError = validateCustomerForm(form);
    if (validationError) { setErrorMessage(validationError); return; }
    setSaving(true);
    setErrorMessage("");
    try {
      const { data: customer, error } = await supabase.from("customers").insert(customerPayload(form)).select().single();
      if (error || !customer) throw error || new Error("Cliente não foi cadastrado.");
      if (Object.values(address).some(Boolean)) {
        const addressResult = await supabase.from("customer_addresses").insert({
          customer_id: customer.id,
          zip_code: address.zip_code || null,
          street: address.street || null,
          number: address.number || null,
          complement: address.complement || null,
          neighborhood: address.neighborhood || null,
          city: address.city || null,
          state: address.state || null,
          reference: address.reference || null,
          is_default: true,
        });
        if (addressResult.error) throw addressResult.error;
        customer.addresses = [address];
      }
      onSaved(customer);
      onClose();
    } catch (error) {
      console.error("[ADMIN] quick customer save error:", error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally { setSaving(false); }
  };
  const lookupCnpj = async (value: string, baseForm = form) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 14 || form.customerType !== "PJ") return;
    setCnpjLoading(true); setCnpjMessage("");
    try {
      const data = await fetchCnpjData(digits);
      const result = applyCnpjData(baseForm, address, data);
      setForm(result.form); setAddress(result.address);
    } catch (error) {
      setCnpjMessage(error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.");
    } finally { setCnpjLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[180] flex items-center justify-center bg-[#0d1b2e]/35 p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <div style={{ transform: `translate(${position.x}px, ${position.y}px)` }} className="relative w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl bg-white shadow-2xl border border-[#0d1b2e]/10">
        <div onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} className="sticky top-0 z-10 flex cursor-move items-center justify-between border-b border-[#0d1b2e]/10 bg-white px-4 py-3 select-none">
          <div><h3 className="text-sm font-bold text-[#0d1b2e]">Criar cliente</h3><p className="text-[11px] text-[#5a6a82] mt-0.5">Cadastre o cliente sem sair da Nova OS</p></div>
          <button type="button" onClick={onClose} className="p-1.5 text-[#5a6a82] hover:bg-[#f5f7fa] rounded-lg" aria-label="Fechar"><X size={16} /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <CustomerTypeToggle value={form.customerType} onChange={customerType => setForm({ ...form, customerType })} />
            {form.customerType === "PF" ? <>
              <FInput label="Nome completo" required value={form.full_name} onChange={(e: any) => setForm({ ...form, full_name: e.target.value })} />
              <FInput label="CPF" required value={form.document} placeholder="000.000.000-00" onChange={(e: any) => setForm({ ...form, document: formatCpf(e.target.value) })} />
              <div><FInput label="Data de nascimento" type="date" required value={form.birth_date} max={todayDateOnly()} onChange={(e: any) => setForm({ ...form, birth_date: e.target.value })} />{!form.birth_date && <p className="mt-1 text-xs text-red-600">Informe a data de nascimento.</p>}</div>
            </> : <>
              <FInput label="Nome fantasia" required value={form.trade_name} onChange={(e: any) => setForm({ ...form, trade_name: e.target.value })} />
              <FInput label="CNPJ" required value={form.cnpj} placeholder="00.000.000/0000-00" onBlur={(e: any) => lookupCnpj(e.target.value)} onChange={(e: any) => { const nextCnpj = formatCnpj(e.target.value); setCnpjMessage(""); setForm({ ...form, cnpj: nextCnpj }); if (nextCnpj.replace(/\D/g, "").length === 14) void lookupCnpj(nextCnpj, { ...form, cnpj: nextCnpj }); }} hint={cnpjLoading ? "Consultando CNPJ..." : cnpjMessage || undefined} />
              <FInput label="Razão social" value={form.legal_name} onChange={(e: any) => setForm({ ...form, legal_name: e.target.value })} />
              <FInput label="Inscrição estadual" value={form.state_registration} hint="Deixe em branco se não for contribuinte · ISENTO se isento" onChange={(e: any) => setForm({ ...form, state_registration: e.target.value })} />
              <FInput label="Fundação" value={form.foundation_date} placeholder="dd/mm/aaaa" maxLength={10} onChange={(e: any) => setForm({ ...form, foundation_date: formatFoundationDate(e.target.value) })} />
            </>}
            <FInput label="E-mail" type="email" value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} />
            <FInput label="Telefone" value={form.phone} onChange={(e: any) => setForm({ ...form, phone: e.target.value })} />
            <FInput label="WhatsApp" required value={form.whatsapp} onChange={(e: any) => setForm({ ...form, whatsapp: e.target.value })} />
          </div>
          <Section title="Endereço do cliente"><AddressFields value={address} onChange={setAddress} inputClassName={INPUT} /></Section>
          {errorMessage && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorMessage}</p>}
        </div>
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[#0d1b2e]/10 bg-white px-4 py-3"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary>{hasPermission("customers.create") && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Criar cliente"}</BtnPrimary>}</div>
      </div>
    </div>
  );
}

type OrderImage = { key: string; mediaId?: string; url?: string; file?: File; name: string };

async function uploadOrderImage(file: File) {
  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase() || "jpg";

  const path =
    `orders/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${extension}`;

  /* =====================================================
     1. Upload físico para Storage
     ===================================================== */

  const {
    error: uploadError,
  } =
    await supabase.storage
      .from("service-images")
      .upload(
        path,
        file,
        {
          upsert: true,
        }
      );

  if (uploadError) {
    console.error(
      "[MEDIA] Storage upload error:",
      uploadError
    );

    throw uploadError;
  }

  /* =====================================================
     2. Registrar mídia através da Edge Function
     ===================================================== */

  try {
    const mediaId =
      await createMediaRecord({
        bucket:
          "service-images",

        path,

        file,
      });

    return mediaId;
  } catch (error) {
    /*
     * O arquivo foi enviado para Storage, mas o registro
     * em public.media falhou.
     *
     * Tenta limpar o arquivo órfão para não deixar lixo
     * no bucket.
     */

    console.error(
      "[MEDIA] Media record error:",
      error
    );

    const {
      error: removeError,
    } =
      await supabase.storage
        .from("service-images")
        .remove([
          path,
        ]);

    if (removeError) {
      console.warn(
        "[MEDIA] Could not remove orphan storage file:",
        removeError
      );
    }

    throw error;
  }
}

function OrderImageThumb({ image, onRemove, onView }: { image: OrderImage; onRemove?: () => void; onView?: () => void }) {
  const { url: mediaUrl, loading, error } = useMediaUrl(image.mediaId);
  const url = image.url || mediaUrl;

  return (
    <div className="relative group w-24 h-20 rounded-lg overflow-hidden border border-[#0d1b2e]/12 bg-[#f5f7fa]">
      {loading ? (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-[#5a6a82]">Carregando...</div>
      ) : url ? (
        <button type="button" className="w-full h-full" onClick={onView}><img src={url} alt={image.name} className="w-full h-full object-cover" /></button>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[10px] text-[#5a6a82] bg-[#f5f7fa]">{error ? "Imagem indisponível" : "Sem imagem"}</div>
      )}
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Remover ${image.name}`} className="absolute top-1 right-1 p-1 rounded-full bg-[#0d1b2e]/75 text-white opacity-0 group-hover:opacity-100 transition-opacity"><X size={12} /></button>}
    </div>
  );
}

function OrderImagesField({ images, onAdd, onRemove, onView, canEdit = true }: { images: OrderImage[]; onAdd: (files: FileList | null) => void; onRemove: (key: string) => void; onView?: (image: OrderImage) => void; canEdit?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  return (
    <Section title="Imagens da OS">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-xs text-[#5a6a82]">{images.length}/5 imagens</p>
        {canEdit && (
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" disabled={images.length >= 5} onClick={() => inputRef.current?.click()} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] border border-[#0057e7]/35 px-3 py-2 rounded-lg disabled:opacity-50"><Upload size={13} /> Adicionar imagens</button>
            <button type="button" disabled={images.length >= 5} onClick={() => cameraInputRef.current?.click()} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] border border-[#0057e7]/35 px-3 py-2 rounded-lg disabled:opacity-50"><Camera size={13} /> Abrir câmera</button>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={event => { onAdd(event.target.files); event.currentTarget.value = ""; }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { onAdd(event.target.files); event.currentTarget.value = ""; }} />
      {images.length > 0 && <div className="flex flex-wrap gap-3">{images.map(image => <OrderImageThumb key={image.key} image={image} onRemove={canEdit ? () => onRemove(image.key) : undefined} onView={() => onView?.(image)} />)}</div>}
    </Section>
  );
}

function OrderImageLightbox({ image, onClose }: { image: OrderImage; onClose: () => void }) {
  const { url: mediaUrl } = useMediaUrl(image.mediaId);
  const url = image.url || mediaUrl;
  return url ? <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[#0d1b2e]/80 p-5" onClick={onClose}><button type="button" aria-label="Fechar imagem" onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/15 text-white"><X size={20} /></button><img src={url} alt={image.name} className="max-w-full max-h-full object-contain" onClick={event => event.stopPropagation()} /></div> : null;

}

function ReviewPartRequestModal({ request, orderNumber, rejection, approvalQuantities, notes, submitting, onNotesChange, onQuantityChange, onClose, onSubmit }: { request: PartRequestForReview; orderNumber?: string | null; rejection: boolean; approvalQuantities: Record<string, string>; notes: string; submitting: boolean; onNotesChange: (value: string) => void; onQuantityChange: (id: string, value: string) => void; onClose: () => void; onSubmit: () => void }) {
  const subtitle = rejection ? "Revise as peças solicitadas e informe o motivo da rejeição" : `OS ${orderNumber || "—"} · ${request.requester?.full_name || "Solicitante não informado"}`;
  return <CenteredModal onClose={onClose} className="max-w-2xl"><div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4"><div><h3 className="text-base font-bold text-[#0d1b2e]">{rejection ? "Rejeitar pedido de peças" : "Aprovar pedido de peças"}</h3><p className="mt-0.5 text-xs text-[#5a6a82]">{subtitle}</p></div><button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={17} /></button></div><div className="min-h-0 space-y-4 overflow-y-auto p-5"><div className="rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3 text-xs text-[#5a6a82]"><p><strong>OS:</strong> {orderNumber || "—"}</p><p><strong>Solicitante:</strong> {request.requester?.full_name || "Solicitante não informado"}</p><p><strong>Solicitado em:</strong> {fmtReviewDate(request.created_at)}</p>{request.notes && <p className="mt-1 whitespace-pre-line"><strong>Observações:</strong> {request.notes}</p>}</div><p className="text-sm font-bold text-[#0d1b2e]">Peças solicitadas</p>{request.items.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhuma peça encontrada nesta solicitação.</p> : <div className="space-y-2">{request.items.map(item => { const requested = Number(item.quantity); const available = Number(item.inventory_item?.quantity ?? 0); const isFromTest = Boolean(item.source_test_item_id); const effectiveLimit = isFromTest ? requested : Math.min(requested, available); return <div key={item.id} className="rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#0d1b2e]">{item.inventory_item?.name || "Peça"}</p><p className="text-xs text-[#5a6a82]">{item.inventory_item?.sku ? `SKU: ${item.inventory_item.sku} · ` : ""}Solicitado: {requested} {item.inventory_item?.unit || "un"}{isFromTest ? "" : ` · Disponível: ${available} ${item.inventory_item?.unit || "un"}`}</p>{isFromTest && <span className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">Origem: peça testada</span>}</div>{!rejection && <div><label className="mb-1 block text-[10px] font-bold uppercase text-[#5a6a82]">Quantidade aprovada</label><input type="number" min="0" max={effectiveLimit} step="0.01" value={approvalQuantities[item.id] ?? String(item.quantity)} onChange={event => onQuantityChange(item.id, event.target.value)} className={cn(INPUT, "w-28 text-center text-sm")} /></div>}</div></div>; })}</div>}<FTextarea label={rejection ? "Motivo da rejeição" : "Observação da análise"} required={rejection} value={notes} onChange={(event: any) => onNotesChange(event.target.value)} rows={3} placeholder={rejection ? "Informe por que este pedido está sendo rejeitado." : undefined} /></div><div className="flex justify-end gap-2 border-t border-[#0d1b2e]/8 bg-white px-5 py-4"><BtnSecondary onClick={onClose}>Cancelar</BtnSecondary><BtnPrimary onClick={onSubmit} disabled={submitting}>{submitting ? rejection ? "Rejeitando..." : "Aprovando..." : rejection ? "Confirmar rejeição" : "Confirmar aprovação"}</BtnPrimary></div></CenteredModal>;
}

const fmtReviewDate = (value?: string | null) => value ? new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const purposeLabel = (purpose?: string | null) => purpose === "TEST" ? "Para teste" : "Para resolução";
