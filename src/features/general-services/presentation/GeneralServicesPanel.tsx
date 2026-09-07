import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle, Edit2, Plus, Wrench } from "lucide-react";
import type { GeneralService } from "@/lib/database.types";
import { useAuth } from "@/lib/auth";
import { AdminBackContext } from "@/features/admin-shell/application/AdminNavigationContext";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { createGeneralService, listGeneralServices, setGeneralServiceActive, updateGeneralService } from "../infrastructure/general-services.repository";
import { AdminButton, AdminCard, AdminIconButton, AdminPage, BtnPrimary, BtnSecondary, InternalBackButton, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FDecimalInput, FInput, FToggle, FCurrencyInput } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { formatCurrency, formatNumber } from "@/shared/domain/formatters";

type GeneralServicesPanelProps = {
  onBack: () => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

export function GeneralServicesPanel(props: GeneralServicesPanelProps) {
  return <AdminBackContext.Provider value={props.onBack}><GeneralServicesPanelContent {...props} /></AdminBackContext.Provider>;
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
  const itemsQuery = useQuery({ queryKey: queryKeys.generalServices.lists(), queryFn: listGeneralServices, enabled: canView && (canViewTable || canViewDetails || canCreate || canEdit) });
  const items = itemsQuery.data ?? []; const loading = itemsQuery.isPending;
  const [formOpen, setFormOpen] = useState(false); const [editItem, setEditItem] = useState<GeneralService | null>(null); const [name, setName] = useState(""); const [price, setPrice] = useState(""); const [maxDiscountPercentage, setMaxDiscountPercentage] = useState(""); const [active, setActive] = useState(true); const [saving, setSaving] = useState(false); const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null); const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(5);
  useEffect(() => { if (itemsQuery.error) setToast({ msg: `Erro ao carregar serviços gerais: ${itemsQuery.error instanceof Error ? itemsQuery.error.message : String(itemsQuery.error)}`, type: "error" }); }, [itemsQuery.error]);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize)); const safePage = Math.min(page, totalPages); const pagedItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.generalServices.all });
  const openNew = () => { if (!canCreate) return; setEditItem(null); setName(""); setPrice(""); setMaxDiscountPercentage(""); setActive(true); setFormOpen(true); };
  const openEdit = (item: GeneralService) => { if (!(canViewDetails && canEdit)) return; setEditItem(item); setName(item.name || ""); setPrice(item.price == null ? "" : String(item.price)); setMaxDiscountPercentage(item.max_discount_percentage == null ? "" : String(item.max_discount_percentage)); setActive(item.is_active !== false); setFormOpen(true); };
  const closeForm = () => { if (saving) return; setFormOpen(false); onRouteChange?.(null, null); };
  const openNewPage = () => canCreate && (onRouteChange ? onRouteChange("new", null) : openNew());
  const openEditPage = (item: GeneralService) => canViewDetails && canEdit && (onRouteChange ? onRouteChange(item.id, "edit") : openEdit(item));

  useEffect(() => {
    if (!routeResourceId) { if (formOpen) setFormOpen(false); return; }
    if (routeResourceId === "new") { if (canCreate && (!formOpen || editItem)) openNew(); return; }
    if (routeSubpage !== "edit" || !(canViewDetails && canEdit) || editItem?.id === routeResourceId) return;
    const item = items.find(entry => entry.id === routeResourceId);
    if (item) openEdit(item);
  }, [routeResourceId, routeSubpage, items, formOpen, editItem?.id, canCreate, canViewDetails, canEdit]);

  const save = async () => { if (!(editItem ? canEdit : canCreate)) return; if (!name.trim()) { setToast({ msg: "Informe o nome do serviço.", type: "error" }); return; } const parsedPrice = price === "" ? null : Number(price); const parsedDiscount = maxDiscountPercentage === "" ? null : Number(maxDiscountPercentage); if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) { setToast({ msg: "Informe um valor válido e não negativo.", type: "error" }); return; } if (parsedDiscount !== null && (!Number.isFinite(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100)) { setToast({ msg: "O desconto máximo deve estar entre 0% e 100%.", type: "error" }); return; } setSaving(true); try { const payload = { name: name.trim(), price: parsedPrice, max_discount_percentage: parsedDiscount, is_active: active }; if (editItem) await updateGeneralService(editItem.id, payload); else await createGeneralService({ ...payload, sort_order: items.length }); setFormOpen(false); onRouteChange?.(null, null); setToast({ msg: editItem ? "Serviço geral atualizado." : "Serviço geral criado.", type: "success" }); await refresh(); } catch (error) { setToast({ msg: `Erro ao salvar serviço geral: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); } finally { setSaving(false); } };
  const toggle = async (item: GeneralService) => { if (!canToggleActive) return; try { await setGeneralServiceActive(item.id, !item.is_active); await refresh(); } catch (error) { setToast({ msg: `Erro ao atualizar serviço: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); } };

  if (!canView) return null;
  return <div className="min-w-0 space-y-5">{toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}{!routeResourceId && <><InternalBackButton onBack={onBack} /><PageHeader title="Serviços Gerais" subtitle="Serviços técnicos internos utilizados na operação" actions={canCreate ? <AdminButton onClick={openNewPage} className="text-xs"><Plus size={16} /> Novo serviço</AdminButton> : null} />
    {canViewTable && <AdminCard>{loading ? <LoadingState /> : items.length === 0 ? <EmptyState icon={Wrench} title="Nenhum serviço geral cadastrado" message="Cadastre um serviço técnico interno." onAdd={canCreate ? openNewPage : undefined} addLabel="Novo serviço" /> : <><div className="overflow-x-auto"><table className="min-w-[700px]"><thead><tr>{showService && <th className="text-left">Serviço</th>}{showPrice && <th className="text-left">Valor</th>}{showMaxDiscount && <th className="text-left">Desconto máximo</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedItems.map(item => <tr key={item.id}>{showService && <td className="font-bold text-[#0d1b2e]">{item.name}</td>}{showPrice && <td className="text-[#0d1b2e]">{formatCurrency(item.price, "Não informado")}</td>}{showMaxDiscount && <td className="text-[#5a6a82]">{item.max_discount_percentage == null ? "Não informado" : `${formatNumber(item.max_discount_percentage, { maximumFractionDigits: 2 })}%`}</td>}{showStatus && <td><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></td>}{showActions && <td><div className="flex justify-end gap-1">{canViewDetails && canEdit && <AdminIconButton ariaLabel="Editar serviço geral" title="Editar" onClick={() => openEditPage(item)}><Edit2 size={15} /></AdminIconButton>}{canToggleActive && <AdminIconButton ariaLabel={item.is_active ? "Desativar serviço geral" : "Ativar serviço geral"} title={item.is_active ? "Desativar" : "Ativar"} onClick={() => toggle(item)}>{item.is_active ? <CheckCircle size={15} /> : <AlertCircle size={15} />}</AdminIconButton>}</div></td>}</tr>)}</tbody></table></div><PaginationBar page={safePage} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} /></>}</AdminCard>}</>}
    {routeResourceId && !formOpen && <AdminCard className="p-8"><LoadingState /></AdminCard>}
    <AdminPage open={formOpen} onClose={closeForm} breadcrumb="Operação > Serviços Gerais" title={editItem ? editItem.name : "Novo serviço"} subtitle="Cadastro de serviço técnico interno"><div className="p-4 sm:p-5"><Section title="Serviço geral"><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><FInput label="Nome do serviço" required disabled={saving} value={name} onChange={(e: any) => setName(e.target.value)} /></div><FCurrencyInput label="Valor" disabled={saving} value={price} onChange={(e: any) => setPrice(e.target.value)} /><FDecimalInput label="Desconto máximo (%)" disabled={saving} value={maxDiscountPercentage} decimalPlaces={2} onChange={(e: any) => setMaxDiscountPercentage(e.target.value)} /></div><div className="mt-4"><FToggle label="Serviço ativo" disabled={saving} checked={active} onChange={setActive} /></div></Section></div><div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={closeForm} disabled={saving}>Cancelar</BtnSecondary>{(editItem ? canEdit : canCreate) && <BtnPrimary onClick={save} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}</div></AdminPage>
  </div>;
}
