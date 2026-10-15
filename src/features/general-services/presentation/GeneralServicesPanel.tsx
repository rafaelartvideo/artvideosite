import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Wrench } from "lucide-react";
import type { GeneralService } from "@/lib/database.types";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { REFERENCE_DATA_CACHE_TIME } from "@/infrastructure/query/query-client";
import { createGeneralService, listGeneralServices, loadGeneralServiceEquipments, saveGeneralServiceEquipments, setGeneralServiceActive, updateGeneralService } from "../infrastructure/general-services.repository";
import { AdminCard, AdminIconButton, AdminPage, AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FDecimalInput, FInput, FToggle, FCurrencyInput } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { Checkbox } from "@/shared/ui/primitives/checkbox";
import type { GeneralServiceEquipmentOption } from "../infrastructure/general-services.repository";
import { formatCurrency, formatNumber } from "@/shared/domain/formatters";

type GeneralServicesPanelProps = {
  onBack: () => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

export function GeneralServicesPanel(props: GeneralServicesPanelProps) {
  return <GeneralServicesPanelContent {...props} />;
}

function GeneralServicesPanelContent({ onBack, routeResourceId, routeSubpage, onRouteChange }: GeneralServicesPanelProps) {
  const { hasPermission } = useAuth();
  const canView = hasPermission("general_services.view");
  const canViewTable = hasPermission("general_services.table.view");
  const canViewDetails = hasPermission("general_services.details.view");
  const canCreate = hasPermission("general_services.create");
  const canEdit = hasPermission("general_services.edit");
  const canToggleActive = hasPermission("general_services.toggle_active");
  const showService = hasPermission("general_services.table.service");
  const showPrice = hasPermission("general_services.table.price");
  const showMaxDiscount = hasPermission("general_services.table.max_discount");
  const showStatus = hasPermission("general_services.table.status");
  const showActions = hasPermission("general_services.table.actions");
  const queryClient = useQueryClient();
  const itemsQuery = useQuery({ queryKey: queryKeys.generalServices.lists(), queryFn: listGeneralServices, enabled: canView && (canViewTable || canViewDetails || canCreate || canEdit), staleTime: REFERENCE_DATA_CACHE_TIME, gcTime: REFERENCE_DATA_CACHE_TIME });
  const items = itemsQuery.data ?? []; const loading = itemsQuery.isPending;
  const [formOpen, setFormOpen] = useState(false); const [editItem, setEditItem] = useState<GeneralService | null>(null); const [name, setName] = useState(""); const [price, setPrice] = useState(""); const [maxDiscountPercentage, setMaxDiscountPercentage] = useState(""); const [maxDiscountAmount, setMaxDiscountAmount] = useState(""); const [priceAtCompletion, setPriceAtCompletion] = useState(false); const [noPrice, setNoPrice] = useState(false); const [active, setActive] = useState(true); const [fieldErrors, setFieldErrors] = useState<{ name?: string; price?: string; maxDiscountPercentage?: string; maxDiscountAmount?: string }>({}); const [saving, setSaving] = useState(false); const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(5);
  const [equipmentOptions, setEquipmentOptions] = useState<GeneralServiceEquipmentOption[]>([]);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [originalEquipmentIds, setOriginalEquipmentIds] = useState<string[]>([]);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [equipmentError, setEquipmentError] = useState<string | null>(null);
  const [equipmentReady, setEquipmentReady] = useState(false);
  const [pendingCreatedId, setPendingCreatedId] = useState<string | null>(null);
  const equipmentRequestId = useRef(0);
  const loadEquipmentLinks = (serviceId: string | null) => {
    const requestId = ++equipmentRequestId.current;
    setEquipmentOptions([]);
    setSelectedEquipmentIds([]);
    setOriginalEquipmentIds([]);
    setEquipmentError(null);
    setEquipmentReady(false);
    setEquipmentLoading(true);
    void loadGeneralServiceEquipments(serviceId).then(result => {
      if (equipmentRequestId.current !== requestId) return;
      setEquipmentOptions(result.equipment);
      setSelectedEquipmentIds(result.selectedIds);
      setOriginalEquipmentIds(result.selectedIds);
      setEquipmentReady(true);
    }).catch(error => {
      if (equipmentRequestId.current === requestId) setEquipmentError(systemErrorMessage(error));
    }).finally(() => {
      if (equipmentRequestId.current === requestId) setEquipmentLoading(false);
    });
  };
  const sortedEquipment = equipmentOptions
    .filter(type => type.is_active || selectedEquipmentIds.includes(type.id))
    .sort((a, b) => Number(selectedEquipmentIds.includes(b.id)) - Number(selectedEquipmentIds.includes(a.id))
      || a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  useEffect(() => { if (itemsQuery.error) setToast({ msg: `Erro ao carregar serviços gerais: ${systemErrorMessage(itemsQuery.error)}`, type: "error" }); }, [itemsQuery.error]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize)); const safePage = Math.min(page, totalPages); const pagedItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.generalServices.all });
  const openNew = () => { if (!canCreate) return; setEditItem(null); setFieldErrors({}); setName(""); setPrice(""); setMaxDiscountPercentage(""); setMaxDiscountAmount(""); setPriceAtCompletion(false); setNoPrice(false); setActive(true); setPendingCreatedId(null); setFormOpen(true); loadEquipmentLinks(null); };
  const openEdit = (item: GeneralService) => { if (!(canViewDetails && canEdit)) return; setEditItem(item); setFieldErrors({}); setName(item.name || ""); setPrice(item.price == null || Number(item.price) === 0 ? "" : String(item.price)); setMaxDiscountPercentage(item.max_discount_percentage == null ? "" : String(item.max_discount_percentage)); setMaxDiscountAmount(item.max_discount_amount == null ? "" : String(item.max_discount_amount)); setPriceAtCompletion(Boolean(item.price_at_completion)); setNoPrice(!item.price_at_completion && (item.price == null || Number(item.price) === 0)); setActive(item.is_active !== false); setPendingCreatedId(null); setFormOpen(true); loadEquipmentLinks(item.id); };
  const closeForm = () => { if (saving) return; equipmentRequestId.current += 1; setFormOpen(false); onRouteChange?.(null, null); };
  const openNewPage = () => canCreate && (onRouteChange ? onRouteChange("new", null) : openNew());
  const openEditPage = (item: GeneralService) => canViewDetails && canEdit && (onRouteChange ? onRouteChange(item.id, "edit") : openEdit(item));

  useEffect(() => {
    if (!routeResourceId) { if (formOpen) setFormOpen(false); return; }
    if (routeResourceId === "new") { if (canCreate && (!formOpen || editItem)) openNew(); return; }
    if (routeSubpage !== "edit" || !(canViewDetails && canEdit) || editItem?.id === routeResourceId) return;
    const item = items.find(entry => entry.id === routeResourceId);
    if (item) openEdit(item);
  }, [routeResourceId, routeSubpage, items, formOpen, editItem?.id, canCreate, canViewDetails, canEdit]);

  const save = async () => {
    if (!(editItem ? canEdit : canCreate) || equipmentLoading) return;

    const parsedPrice = priceAtCompletion ? null : noPrice ? 0 : price === "" ? null : Number(price);
    const parsedDiscount = maxDiscountPercentage === "" ? null : Number(maxDiscountPercentage);
    const parsedDiscountAmount = maxDiscountAmount === "" ? null : Number(maxDiscountAmount);
    const nextErrors: typeof fieldErrors = {};

    if (!name.trim()) nextErrors.name = "Informe o nome do serviço.";
    if (!priceAtCompletion && !noPrice && parsedPrice === null) nextErrors.price = "Informe um valor ou selecione Sem preço.";
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) nextErrors.price = "Informe um valor válido e não negativo.";
    if (parsedDiscount !== null && (!Number.isFinite(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100)) nextErrors.maxDiscountPercentage = "O desconto máximo deve estar entre 0% e 100%.";
    if (parsedDiscountAmount !== null && (!Number.isFinite(parsedDiscountAmount) || parsedDiscountAmount < 0)) nextErrors.maxDiscountAmount = "O desconto máximo em valor deve ser igual ou maior que zero.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        price: parsedPrice,
        price_at_completion: priceAtCompletion,
        max_discount_percentage: parsedDiscount,
        max_discount_amount: parsedDiscountAmount,
        is_active: active,
      };
      let savedServiceId = editItem?.id || pendingCreatedId;
      if (savedServiceId) await updateGeneralService(savedServiceId, payload);
      else {
        savedServiceId = await createGeneralService({ ...payload, sort_order: items.length });
        setPendingCreatedId(savedServiceId);
      }
      const previous = new Set(originalEquipmentIds);
      const linksChanged = equipmentReady && (selectedEquipmentIds.length !== previous.size
        || selectedEquipmentIds.some(id => !previous.has(id)));
      if (linksChanged) {
        await saveGeneralServiceEquipments(savedServiceId, selectedEquipmentIds);
        void queryClient.invalidateQueries({ queryKey: queryKeys.equipment.all });
      }
      equipmentRequestId.current += 1;
      setFormOpen(false);
      onRouteChange?.(null, null);
      setToast({ msg: equipmentError
        ? "Serviço salvo. Os vínculos de equipamentos não foram alterados."
        : editItem ? "Serviço geral atualizado." : "Serviço geral criado.", type: "success" });
      void refresh();
    } catch (error) {
      setToast({ msg: `Erro ao salvar serviço geral ou seus equipamentos: ${systemErrorMessage(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };
  const toggle = async (item: GeneralService) => { if (!canToggleActive) return; try { await setGeneralServiceActive(item.id, !item.is_active); void refresh(); } catch (error) { setToast({ msg: `Erro ao atualizar serviço: ${systemErrorMessage(error)}`, type: "error" }); } };

  if (!canView) return null;
  return <div className="min-w-0 space-y-5">{toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}{!routeResourceId && <><PageHeader title="Serviços Gerais" subtitle="Serviços técnicos internos utilizados na operação" />
    {canViewTable && <AdminCard>{loading ? <LoadingState /> : items.length === 0 ? <EmptyState icon={Wrench} title="Nenhum serviço geral cadastrado" message="Cadastre um serviço técnico interno." /> : <><div className="overflow-x-auto"><table className="min-w-[700px]"><thead><tr>{showService && <th className="text-left">Serviço</th>}{showPrice && <th className="text-left">Valor</th>}{showMaxDiscount && <th className="text-left">Desconto máximo</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedItems.map(item => <tr key={item.id}>{showService && <td className="font-bold text-[#0d1b2e]">{item.name}</td>}{showPrice && <td className="text-[#0d1b2e]">{item.price_at_completion ? <span className="font-semibold text-[#0057e7]">Na conclusão da OS</span> : (item.price == null || Number(item.price) === 0) ? <span className="font-semibold text-muted-foreground">Sem preço</span> : formatCurrency(item.price, "Não informado")}</td>}{showMaxDiscount && <td className="text-[#5a6a82]"><div>{item.max_discount_percentage == null ? "Não informado" : `${formatNumber(item.max_discount_percentage, { maximumFractionDigits: 2 })}%`}</div><div className="mt-0.5 text-xs">{item.max_discount_amount == null ? "Não informado" : formatCurrency(item.max_discount_amount)}</div></td>}{showStatus && <td><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></td>}{showActions && <td><div className="flex justify-end gap-1">{canViewDetails && canEdit && <AdminIconButton ariaLabel="Editar serviço geral" title="Editar" onClick={() => openEditPage(item)}><Edit2 size={15} /></AdminIconButton>}{canToggleActive && <AdminActiveStateButton active={item.is_active} entityLabel="serviço geral" onClick={() => void toggle(item)} />}</div></td>}</tr>)}</tbody></table></div><PaginationBar page={safePage} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} /></>}</AdminCard>}<AdminStickyToolbar><BtnSecondary onClick={onBack}>Voltar</BtnSecondary>{canCreate && <BtnPrimary onClick={openNewPage}>Novo</BtnPrimary>}</AdminStickyToolbar></>}
    {routeResourceId && !formOpen && <AdminCard className="p-8"><LoadingState /></AdminCard>}
    <AdminPage open={formOpen} onClose={closeForm} breadcrumb="Operação > Serviços Gerais" title={editItem ? editItem.name : "Novo serviço"} subtitle="Cadastro de serviço técnico interno"><div className="p-4 sm:p-5"><Section title="Serviço geral"><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><FInput label="Nome do serviço" required disabled={saving} error={fieldErrors.name} value={name} onChange={(e: any) => { setFieldErrors(current => ({ ...current, name: undefined })); setName(e.target.value); }} /></div><div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
  <FToggle label="Sem preço" disabled={saving} checked={noPrice} onChange={value => { setNoPrice(value); if (value) { setPriceAtCompletion(false); setPrice(""); setFieldErrors(current => ({ ...current, price: undefined })); } }} />
  <FToggle label="Definir valor na conclusão da OS" disabled={saving} checked={priceAtCompletion} onChange={value => { setPriceAtCompletion(value); if (value) { setNoPrice(false); setPrice(""); setFieldErrors(current => ({ ...current, price: undefined })); } }} />
</div><FCurrencyInput label="Valor" disabled={saving || priceAtCompletion || noPrice} error={fieldErrors.price} value={priceAtCompletion || noPrice ? "" : price} onChange={(e: any) => { setFieldErrors(current => ({ ...current, price: undefined })); setPrice(e.target.value); }} hint={priceAtCompletion ? "O valor será informado ao concluir a OS." : noPrice ? "Serviço sem cobrança; valor não necessário." : undefined} /><FDecimalInput label="Desconto máximo (%)" disabled={saving} error={fieldErrors.maxDiscountPercentage} value={maxDiscountPercentage} decimalPlaces={2} onChange={(e: any) => { setFieldErrors(current => ({ ...current, maxDiscountPercentage: undefined })); setMaxDiscountPercentage(e.target.value); }} /><FCurrencyInput label="Desconto máximo (R$)" error={fieldErrors.maxDiscountAmount} disabled={saving} value={maxDiscountAmount} onChange={(e: any) => { setFieldErrors(current => ({ ...current, maxDiscountAmount: undefined })); setMaxDiscountAmount(e.target.value); }} /></div><div className="mt-4"><FToggle label="Serviço ativo" disabled={saving} checked={active} onChange={setActive} /></div></Section></div>
    <div className="px-4 pb-5 sm:px-5">
      <Section title="Equipamentos vinculados">
        <p className="mb-3 text-xs text-muted-foreground">Marque os equipamentos que podem receber este serviço.</p>
        {equipmentLoading && <p role="status" className="py-4 text-xs text-muted-foreground">Carregando equipamentos...</p>}
        {!equipmentLoading && equipmentError && <div role="alert" className="space-y-2 py-3 text-xs text-red-600">
          <p>Não foi possível carregar os vínculos: {equipmentError}</p>
          <button type="button" disabled={saving} onClick={() => loadEquipmentLinks(editItem?.id ?? null)} className="font-semibold underline underline-offset-2">Tentar novamente</button>
        </div>}
        {!equipmentLoading && equipmentReady && <div className="max-h-64 overflow-y-auto border-y border-border">
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {sortedEquipment.map(type => <label key={type.id} className="flex cursor-pointer items-center gap-3 border-b border-border/60 py-3 text-xs text-foreground">
              <Checkbox checked={selectedEquipmentIds.includes(type.id)} disabled={saving || (!type.is_active && !selectedEquipmentIds.includes(type.id))}
                onCheckedChange={checked => setSelectedEquipmentIds(current =>
                  checked === true ? [...new Set([...current, type.id])] : current.filter(id => id !== type.id))} />
              <span className="min-w-0 flex-1 font-semibold">{type.name}</span>
              {!type.is_active && <span className="text-[10px] text-muted-foreground">Inativo</span>}
            </label>)}
          </div>
          {sortedEquipment.length === 0 && <p className="py-4 text-xs text-muted-foreground">Nenhum equipamento cadastrado.</p>}
        </div>}
        {equipmentReady && <p className="mt-2 text-xs text-muted-foreground">{selectedEquipmentIds.length} equipamento(s) selecionado(s)</p>}
      </Section>
    </div>
    <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={closeForm} disabled={saving}>Cancelar</BtnSecondary>{(editItem ? canEdit : canCreate) && <BtnPrimary onClick={save} disabled={equipmentLoading} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}</div></AdminPage>
  </div>;
}
