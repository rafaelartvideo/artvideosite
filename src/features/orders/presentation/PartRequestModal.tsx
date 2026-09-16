import React from "react";
import { CheckCircle, PackagePlus, X } from "lucide-react";
import { AdminCard, AdminIconButton, BtnPrimary, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { AdminListSection, AdminListSectionRow } from "@/shared/ui/admin/AdminListSection";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { FIntegerInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { cn } from "@/shared/domain/formatters";
import { normalizeSearchText } from "../application/order-search";
import type { PartRequestInventoryItem, SelectedPartRequestItem } from "../domain/part-request.types";
import { CenteredModal } from "./PartRequestModals";

const INVENTORY_PAGE_SIZE = 4;

const packageHint = (item: { package_unit?: string | null; conversion_factor?: number | null }) =>
  item.package_unit === "cx" && Number(item.conversion_factor || 1) > 1
    ? `Caixa · ${Number(item.conversion_factor)} un/cx`
    : "";

export function PartRequestModal({
  orderNumber,
  inventoryItems,
  inventoryLoading,
  inventoryError,
  selectedItems,
  search,
  notes,
  purpose,
  submitting,
  onPurposeChange,
  onSearchChange,
  onNotesChange,
  onSelect,
  onQuantityChange,
  onRemove,
  onClose,
  onSubmit,
}: {
  orderNumber?: string | null;
  inventoryItems: PartRequestInventoryItem[];
  inventoryLoading: boolean;
  inventoryError: string;
  selectedItems: SelectedPartRequestItem[];
  search: string;
  notes: string;
  purpose: "RESOLUTION" | "TEST";
  submitting: boolean;
  onPurposeChange: (purpose: "RESOLUTION" | "TEST") => void;
  onSearchChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onSelect: (item: PartRequestInventoryItem) => void;
  onQuantityChange: (id: string, value: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [inventoryPage, setInventoryPage] = React.useState(1);
  const query = normalizeSearchText(search);
  const visibleItems = inventoryItems.filter(item =>
    !query
    || normalizeSearchText(item.name).includes(query)
    || normalizeSearchText(item.sku).includes(query),
  );
  const selectedIds = new Set(selectedItems.map(item => item.inventory_item_id));
  const totalInventoryPages = Math.max(1, Math.ceil(visibleItems.length / INVENTORY_PAGE_SIZE));
  const pagedInventoryItems = visibleItems.slice(
    (inventoryPage - 1) * INVENTORY_PAGE_SIZE,
    inventoryPage * INVENTORY_PAGE_SIZE,
  );

  React.useEffect(() => {
    setInventoryPage(1);
  }, [search]);

  React.useEffect(() => {
    if (inventoryPage > totalInventoryPages) setInventoryPage(totalInventoryPages);
  }, [inventoryPage, totalInventoryPages]);

  return <CenteredModal onClose={() => { if (!submitting) onClose(); }} className="max-w-4xl sm:max-w-4xl" title="Pedir peças">
    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-black text-[#0d1b2e]">Pedir peças</h3>
          <span className="rounded-full bg-[#f0f6ff] px-2.5 py-1 text-[10px] font-black text-[#0057e7]">OS {orderNumber || "—"}</span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[#5a6a82]">Escolha a finalidade e adicione as peças necessárias.</p>
      </div>
      <AdminIconButton ariaLabel="Fechar" onClick={onClose} disabled={submitting} variant="ghost" className="h-10 w-10 shrink-0"><X size={18} /></AdminIconButton>
    </div>

    <div className="min-h-0 flex-1 overflow-y-auto bg-white px-4 py-5 sm:px-6">
      <div className="space-y-6">
        <section>
          <div className="mb-3">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#5a6a82]">Finalidade do pedido</p>
            <p className="mt-1 text-xs text-[#7c899c]">Defina como as peças serão utilizadas nesta OS.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <AdminCard className={cn("shadow-none transition-colors", purpose === "RESOLUTION" ? "border-[#0057e7] bg-[#f4f8ff]" : "hover:border-[#0057e7]/35")}>
              <button type="button" disabled={submitting} onClick={() => onPurposeChange("RESOLUTION")} aria-pressed={purpose === "RESOLUTION"} className="w-full p-4 text-left disabled:opacity-60">
                <span className="flex items-center gap-2 text-sm font-black text-[#0d1b2e]">
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", purpose === "RESOLUTION" ? "bg-[#0057e7] text-white" : "bg-[#f5f7fa] text-[#5a6a82]")}><CheckCircle size={16} /></span>
                  Para resolução
                </span>
                <span className="mt-2 block text-xs leading-relaxed text-[#5a6a82]">Peças destinadas à solução definitiva da ordem de serviço.</span>
              </button>
            </AdminCard>
            <AdminCard className={cn("shadow-none transition-colors", purpose === "TEST" ? "border-[#0057e7] bg-[#f4f8ff]" : "hover:border-[#0057e7]/35")}>
              <button type="button" disabled={submitting} onClick={() => onPurposeChange("TEST")} aria-pressed={purpose === "TEST"} className="w-full p-4 text-left disabled:opacity-60">
                <span className="flex items-center gap-2 text-sm font-black text-[#0d1b2e]">
                  <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", purpose === "TEST" ? "bg-[#0057e7] text-white" : "bg-[#f5f7fa] text-[#5a6a82]")}><PackagePlus size={16} /></span>
                  Para teste
                </span>
                <span className="mt-2 block text-xs leading-relaxed text-[#5a6a82]">Peças retiradas temporariamente para diagnóstico e teste.</span>
              </button>
            </AdminCard>
          </div>
        </section>

        <AdminListSection
          title="Estoque"
          description="Saldo disponível em unidades individuais."
          count={visibleItems.length}
          searchValue={search}
          onSearchChange={onSearchChange}
          searchPlaceholder="Buscar por nome ou SKU"
          searchDisabled={submitting}
          searchAutoFocus
          loading={inventoryLoading}
          loadingText="Carregando peças do estoque..."
          error={inventoryError || undefined}
          empty={!inventoryLoading && !inventoryError && visibleItems.length === 0}
          emptyText="Nenhuma peça encontrada"
          footer={!inventoryLoading && !inventoryError && visibleItems.length > 0 ? <PaginationBar
            page={inventoryPage}
            pageSize={INVENTORY_PAGE_SIZE}
            totalItems={visibleItems.length}
            onPageChange={setInventoryPage}
            onPageSizeChange={() => undefined}
            defaultPageSize={INVENTORY_PAGE_SIZE}
            pageSizeOptions={[INVENTORY_PAGE_SIZE]}
            showPageSizeSelector={false}
          /> : undefined}
        >
          {pagedInventoryItems.map(item => {
            const selected = selectedIds.has(item.id);
            const hint = packageHint(item);
            return <AdminListSectionRow key={item.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[#0d1b2e]">{item.name}</p>
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#7c899c]">
                  {item.sku && <span className="truncate">SKU {item.sku}</span>}
                  <span className="font-semibold text-[#425168]">Disponível: {Number(item.quantity)} un</span>
                  {hint && <span>{hint}</span>}
                </div>
              </div>
              <button
                type="button"
                disabled={submitting || selected || Number(item.quantity) <= 0}
                onClick={() => onSelect(item)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center justify-center rounded-lg border px-3 text-xs font-bold transition-colors",
                  selected
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-[#0d1b2e]/15 bg-white text-[#0057e7] hover:bg-[#f5f7fa]",
                  Number(item.quantity) <= 0 && "cursor-not-allowed opacity-50",
                )}
              >{selected ? "Adicionada" : "Adicionar"}</button>
            </AdminListSectionRow>;
          })}
        </AdminListSection>

        <section className="overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-[#0d1b2e]/8 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-black text-[#0d1b2e]">Peças selecionadas</p>
              <p className="mt-0.5 text-[11px] text-[#5a6a82]">Informe a quantidade necessária de cada item.</p>
            </div>
            <span className="shrink-0 rounded-full bg-[#0057e7] px-2 py-0.5 text-[10px] font-black text-white">{selectedItems.length}</span>
          </div>

          {selectedItems.length === 0 ? <div className="flex min-h-28 flex-col items-center justify-center px-4 py-6 text-center"><PackagePlus size={20} className="mb-2 text-[#a0acba]" /><p className="text-xs font-bold text-[#5a6a82]">Nenhuma peça selecionada</p></div>
            : <div className="px-4">{selectedItems.map((item, index) => <div key={item.inventory_item_id} className={cn("flex min-w-0 flex-col gap-3 py-3.5 sm:flex-row sm:items-center", index > 0 && "border-t border-[#0d1b2e]/8")}>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-bold text-[#0d1b2e]">{item.name}</p>
                <p className="mt-1 break-words text-[11px] text-[#7c899c]">{item.sku ? `SKU ${item.sku} · ` : ""}Disponível: {item.available_quantity} un</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="w-28">
                  <FIntegerInput
                    label=""
                    aria-label={`Quantidade de ${item.name}`}
                    value={item.quantity}
                    disabled={submitting}
                    onChange={(event: any) => {
                      const raw = event.target.value;
                      if (!raw) { onQuantityChange(item.inventory_item_id, ""); return; }
                      const quantity = Math.min(item.available_quantity, Math.max(1, Number(raw)));
                      onQuantityChange(item.inventory_item_id, String(quantity));
                    }}
                    className="h-9 w-full text-center text-sm font-bold"
                  />
                </div>
                <AdminIconButton ariaLabel={`Remover ${item.name}`} onClick={() => onRemove(item.inventory_item_id)} disabled={submitting} variant="danger" className="h-9 w-9 shrink-0"><X size={15} /></AdminIconButton>
              </div>
            </div>)}</div>}
        </section>

        <div className="border-t border-[#0d1b2e]/8 pt-5">
          <FTextarea label="Observações" value={notes} disabled={submitting} onChange={(event: any) => onNotesChange(event.target.value)} rows={3} placeholder="Informações importantes para a análise do pedido." />
        </div>
      </div>
    </div>

    <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-[#0d1b2e]/8 bg-white px-4 py-3 sm:flex sm:justify-end sm:px-6 sm:py-4">
      <BtnSecondary onClick={onClose} disabled={submitting} className="w-full sm:w-auto">Cancelar</BtnSecondary>
      <BtnPrimary onClick={onSubmit} disabled={selectedItems.length === 0} loading={submitting} loadingText="Enviando..." className="w-full sm:w-auto">Enviar solicitação{selectedItems.length ? ` (${selectedItems.length})` : ""}</BtnPrimary>
    </div>
  </CenteredModal>;
}
