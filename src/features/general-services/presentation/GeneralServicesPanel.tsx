import { InlineLoading } from "@/shared/ui/admin/AdminFeedback";
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
import { FDecimalInput, FInput, FToggle, FCurrencyInput, FTextarea, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { ImageUpload } from "@/shared/ui/admin/AdminMedia";
import { PUBLIC_ICON_OPTIONS } from "@/features/public-shell/domain/site-appearance";
import { loadGeneralServicePublication, saveGeneralServicePublication } from "../infrastructure/public-service-publication.repository";
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
  const { hasPermission, activeOrganization, activeOrganizationId, user } = useAuth();
  const canPublish = activeOrganization?.is_artvideo_tenant === true && hasPermission("services.view") && hasPermission("services.create") && hasPermission("services.update");
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
  const publicationRequestId = useRef(0);
  const [publishSite, setPublishSite] = useState(false);
  const [siteShortDescription, setSiteShortDescription] = useState("");
  const [siteDescription, setSiteDescription] = useState("");
  const [siteCoverMediaId, setSiteCoverMediaId] = useState("");
  const [siteFeatured, setSiteFeatured] = useState(false);
  const [siteIcon, setSiteIcon] = useState("wrench");
  const [publicationLoading, setPublicationLoading] = useState(false);
  const [publicationError, setPublicationError] = useState<string | null>(null);

  const loadPublication = (serviceId: string | null) => {
    const requestId = ++publicationRequestId.current;
    setPublishSite(false);
    setSiteShortDescription("");
    setSiteDescription("");
    setSiteCoverMediaId("");
    setSiteFeatured(false);
    setSiteIcon("wrench");
    setPublicationError(null);
    setPublicationLoading(Boolean(canPublish && serviceId));
    if (!canPublish || !serviceId) return;
    void loadGeneralServicePublication(serviceId).then(item => {
      if (publicationRequestId.current !== requestId || !item) return;
      setPublishSite(item.show_in_catalog);
      setSiteShortDescription(item.short_description || "");
      setSiteDescription(item.description || "");
      setSiteCoverMediaId(item.cover_media_id || "");
      setSiteFeatured(item.is_featured);
      setSiteIcon(item.public_icon || "wrench");
    }).catch(error => {
      if (publicationRequestId.current === requestId) setPublicationError(systemErrorMessage(error));
    }).finally(() => {
      if (publicationRequestId.current === requestId) setPublicationLoading(false);
    });
  };
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
  const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize)); const safePage = Math.min(page, totalPages); const pagedItems = sortedItems.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.generalServices.all });
  const openNew = () => { if (!canCreate) return; loadPublication(null); setEditItem(null); setFieldErrors({}); setName(""); setPrice(""); setMaxDiscountPercentage(""); setMaxDiscountAmount(""); setPriceAtCompletion(false); setNoPrice(false); setActive(true); setPendingCreatedId(null); setFormOpen(true); loadEquipmentLinks(null); };
  const openEdit = (item: GeneralService) => { if (!(canViewDetails && canEdit)) return; loadPublication(item.id); setEditItem(item); setFieldErrors({}); setName(item.name || ""); setPrice(item.price == null || Number(item.price) === 0 ? "" : String(item.price)); setMaxDiscountPercentage(item.max_discount_percentage == null ? "" : String(item.max_discount_percentage)); setMaxDiscountAmount(item.max_discount_amount == null ? "" : String(item.max_discount_amount)); setPriceAtCompletion(Boolean(item.price_at_completion)); setNoPrice(!item.price_at_completion && (item.price == null || Number(item.price) === 0)); setActive(item.is_active !== false); setPendingCreatedId(null); setFormOpen(true); loadEquipmentLinks(item.id); };
  const closeForm = () => { if (saving) return; publicationRequestId.current += 1; equipmentRequestId.current += 1; setFormOpen(false); onRouteChange?.(null, null); };
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
    if (!(editItem ? canEdit : canCreate) || equipmentLoading || publicationLoading || (canPublish && publicationError && publishSite)) return;

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
      if (canPublish && !publicationError) {
        await saveGeneralServicePublication(savedServiceId, {
          title: name,
          operationalPrice: parsedPrice,
          priceAtCompletion,
          operationalActive: active,
          publish: publishSite,
          shortDescription: siteShortDescription,
          description: siteDescription,
          coverMediaId: siteCoverMediaId || null,
          featured: siteFeatured,
          icon: siteIcon,
        }, user?.id || null);
        void queryClient.invalidateQueries({ queryKey: queryKeys.publicSite.services() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.catalog.services() });
      }
      equipmentRequestId.current += 1;
      publicationRequestId.current += 1;
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
    <AdminPage open={formOpen} onClose={closeForm} breadcrumb="Operação > Serviços Gerais"
      title={editItem ? editItem.name : "Novo serviço"}
      subtitle={canPublish ? "Um só cadastro para a OS e o site da Artvideo." : "Serviço técnico para ordens de serviço."}>
      <div className="space-y-4 p-4 sm:p-5">
        <Section title="Dados principais">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FInput label="Nome do serviço" required disabled={saving} error={fieldErrors.name} value={name}
                onChange={(e: any) => { setFieldErrors(current => ({ ...current, name: undefined })); setName(e.target.value); }} />
            </div>
            <div className="flex flex-wrap items-start gap-5 sm:col-span-2">
              <FToggle label="Sem preço" disabled={saving} checked={noPrice} onChange={value => { setNoPrice(value); if (value) { setPriceAtCompletion(false); setPrice(""); setFieldErrors(current => ({ ...current, price: undefined })); } }} />
              <FToggle label="Definir valor na conclusão da OS" disabled={saving} checked={priceAtCompletion} onChange={value => { setPriceAtCompletion(value); if (value) { setNoPrice(false); setPrice(""); setFieldErrors(current => ({ ...current, price: undefined })); } }} />
            </div>
            {!noPrice && !priceAtCompletion && <FCurrencyInput label="Valor do serviço" disabled={saving} error={fieldErrors.price} value={price}
              onChange={(e: any) => { setFieldErrors(current => ({ ...current, price: undefined })); setPrice(e.target.value); }} />}
            <div className="flex items-center"><FToggle label="Serviço ativo" description="Disponível para inclusão nas OS." disabled={saving} checked={active} onChange={setActive} /></div>
          </div>
          <details className="mt-4 rounded-lg border border-border p-3">
            <summary className="cursor-pointer text-sm font-semibold text-foreground">Limites de desconto (opcional)</summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <FDecimalInput label="Desconto máximo (%)" disabled={saving} error={fieldErrors.maxDiscountPercentage} value={maxDiscountPercentage} decimalPlaces={2}
                onChange={(e: any) => { setFieldErrors(current => ({ ...current, maxDiscountPercentage: undefined })); setMaxDiscountPercentage(e.target.value); }} />
              <FCurrencyInput label="Desconto máximo (R$)" disabled={saving} error={fieldErrors.maxDiscountAmount} value={maxDiscountAmount}
                onChange={(e: any) => { setFieldErrors(current => ({ ...current, maxDiscountAmount: undefined })); setMaxDiscountAmount(e.target.value); }} />
            </div>
          </details>
        </Section>
        {canPublish && <Section title="Loja da Artvideo">
          <div className="space-y-4">
            {publicationLoading && <InlineLoading text="Carregando publicação do serviço..." />}
            {publicationError && <div role="alert" className="text-xs text-red-600">
              Não foi possível carregar os dados da loja: {publicationError}
              <button type="button" className="ml-2 font-semibold underline" onClick={() => loadPublication(editItem?.id || null)}>Tentar novamente</button>
            </div>}
            <FToggle label="Exibir este serviço na loja" description="Ao ativar, o serviço também terá uma página no site. A OS continua usando o mesmo cadastro."
              disabled={saving || publicationLoading || Boolean(publicationError)} checked={publishSite} onChange={setPublishSite} />
            {publishSite && !publicationLoading && !publicationError && <div className="space-y-4 border-t border-border pt-4">
              <FTextarea label="Descrição curta para o site" rows={2} value={siteShortDescription} disabled={saving}
                onChange={(e: any) => setSiteShortDescription(e.target.value)} placeholder="Explique o serviço em uma frase curta" />
              <details className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-semibold">Descrição completa (opcional)</summary>
                <div className="mt-3"><FTextarea label="Detalhes do serviço" rows={3} value={siteDescription} disabled={saving}
                  onChange={(e: any) => setSiteDescription(e.target.value)} placeholder="Informações adicionais para a página pública" /></div>
              </details>
              <div className="grid gap-4 sm:grid-cols-2">
                <FSelect label="Ícone do serviço" value={siteIcon} disabled={saving}
                  onChange={(e: any) => setSiteIcon(e.target.value)}
                  options={PUBLIC_ICON_OPTIONS.map(item => ({ value: item.value, label: item.label }))} />
                <div className="flex items-end pb-2">
                  <FToggle label="Destacar na página inicial" checked={siteFeatured} disabled={saving} onChange={setSiteFeatured} />
                </div>
              </div>
              <ImageUpload bucket="service-images" organizationId={activeOrganizationId || undefined}
                currentMediaId={siteCoverMediaId} onUpload={setSiteCoverMediaId}
                canUpload={!saving} label="Imagem do serviço" />
              {siteCoverMediaId && <button type="button" className="text-xs font-semibold text-red-600 hover:underline" onClick={() => setSiteCoverMediaId("")}>Remover imagem</button>}
            </div>}
          </div>
        </Section>}
      </div>
    <div className="px-4 pb-5 sm:px-5">
      <Section title="Equipamentos vinculados">
        <p className="mb-3 text-xs text-muted-foreground">Marque os equipamentos que podem receber este serviço.</p>
        {equipmentLoading && <InlineLoading className="py-4" text="Carregando equipamentos..." />}
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
