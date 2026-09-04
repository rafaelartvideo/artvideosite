import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle, Edit2, Plus, Wrench } from "lucide-react";
import type { GeneralService } from "@/lib/database.types";
import { useAuth } from "@/lib/auth";
import { AdminBackContext } from "@/features/admin-shell/application/AdminNavigationContext";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  createGeneralService,
  listGeneralServices,
  setGeneralServiceActive,
  updateGeneralService,
} from "../infrastructure/general-services.repository";
import {
  AdminButton,
  AdminCard,
  AdminIconButton,
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  InternalBackButton,
  PageHeader,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import {
  EmptyState,
  LoadingState,
  StatusBadge,
  Toast,
} from "@/shared/ui/admin/AdminFeedback";
import { FInput, FToggle, FCurrencyInput } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";

const formatMoney = (value: number | null) => value == null
  ? "Não informado"
  : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export function GeneralServicesPanel({ onBack }: { onBack: () => void }) {
  return <AdminBackContext.Provider value={onBack}><GeneralServicesPanelContent onBack={onBack} /></AdminBackContext.Provider>;
}

function GeneralServicesPanelContent({ onBack }: { onBack: () => void }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const itemsQuery = useQuery({ queryKey: queryKeys.generalServices.lists(), queryFn: listGeneralServices });
  const items = itemsQuery.data ?? [];
  const loading = itemsQuery.isPending;
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<GeneralService | null>(null);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [maxDiscountPercentage, setMaxDiscountPercentage] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    if (!itemsQuery.error) return;
    const message = itemsQuery.error instanceof Error ? itemsQuery.error.message : String(itemsQuery.error);
    setToast({ msg: `Erro ao carregar serviços gerais: ${message}`, type: "error" });
  }, [itemsQuery.error]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedItems = items.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.generalServices.all });
  const openNew = () => {
    setEditItem(null);
    setName("");
    setPrice("");
    setMaxDiscountPercentage("");
    setActive(true);
    setFormOpen(true);
  };
  const openEdit = (item: GeneralService) => {
    setEditItem(item);
    setName(item.name || "");
    setPrice(item.price == null ? "" : String(item.price));
    setMaxDiscountPercentage(item.max_discount_percentage == null ? "" : String(item.max_discount_percentage));
    setActive(item.is_active !== false);
    setFormOpen(true);
  };
  const canCreate = hasPermission("general_services.create");
  const canEdit = hasPermission("general_services.edit");

  const save = async () => {
    if (!(editItem ? canEdit : canCreate)) return;
    if (!name.trim()) {
      setToast({ msg: "Informe o nome do serviço.", type: "error" });
      return;
    }
    const parsedPrice = price === "" ? null : Number(price);
    const parsedDiscount = maxDiscountPercentage === "" ? null : Number(maxDiscountPercentage);
    if (parsedPrice !== null && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setToast({ msg: "Informe um valor válido.", type: "error" });
      return;
    }
    if (parsedDiscount !== null && (!Number.isFinite(parsedDiscount) || parsedDiscount < 0 || parsedDiscount > 100)) {
      setToast({ msg: "O desconto máximo deve estar entre 0% e 100%.", type: "error" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        price: parsedPrice,
        max_discount_percentage: parsedDiscount,
        is_active: active,
      };
      if (editItem) await updateGeneralService(editItem.id, payload);
      else await createGeneralService({ ...payload, sort_order: items.length });
      setFormOpen(false);
      setToast({ msg: editItem ? "Serviço geral atualizado." : "Serviço geral criado.", type: "success" });
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao salvar serviço geral: ${message}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (item: GeneralService) => {
    if (!canEdit) return;
    try {
      await setGeneralServiceActive(item.id, !item.is_active);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao atualizar serviço: ${message}`, type: "error" });
    }
  };

  return <div className="min-w-0 space-y-5">
    <InternalBackButton onBack={onBack} />
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader title="Serviços Gerais" subtitle="Serviços técnicos internos utilizados na operação" actions={canCreate ? <AdminButton onClick={openNew} className="text-xs"><Plus size={16} /> Novo serviço</AdminButton> : null} />
    <AdminCard>
      {loading ? <LoadingState /> : items.length === 0 ? <EmptyState icon={Wrench} title="Nenhum serviço geral cadastrado" message="Cadastre um serviço técnico interno." onAdd={canCreate ? openNew : undefined} addLabel="Novo serviço" /> : <>
        <div className="overflow-x-auto"><table className="min-w-[700px]">
          <thead><tr>
            <th className="text-left">Serviço</th><th className="text-left">Valor</th><th className="text-left">Desconto máximo</th><th className="text-left">Status</th><th className="text-right">Ações</th>
          </tr></thead>
          <tbody>{pagedItems.map(item => <tr key={item.id}>
            <td className="font-bold text-[#0d1b2e]">{item.name}</td>
            <td className="text-[#0d1b2e]">{formatMoney(item.price)}</td>
            <td className="text-[#5a6a82]">{item.max_discount_percentage == null ? "Não informado" : `${Number(item.max_discount_percentage).toLocaleString("pt-BR")}%`}</td>
            <td><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></td>
            <td><div className="flex justify-end gap-1">{canEdit && <>
              <AdminIconButton ariaLabel="Editar serviço geral" title="Editar" onClick={() => openEdit(item)}><Edit2 size={15} /></AdminIconButton>
              <AdminIconButton ariaLabel={item.is_active ? "Desativar serviço geral" : "Ativar serviço geral"} title={item.is_active ? "Desativar" : "Ativar"} onClick={() => toggle(item)}>{item.is_active ? <CheckCircle size={15} /> : <AlertCircle size={15} />}</AdminIconButton>
            </>}</div></td>
          </tr>)}</tbody>
        </table></div>
        <PaginationBar page={safePage} pageSize={pageSize} totalItems={items.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </>}
    </AdminCard>
    <AdminPage open={formOpen} onClose={() => setFormOpen(false)} breadcrumb="Operação > Serviços Gerais" title={editItem ? editItem.name : "Novo serviço"} subtitle="Cadastro de serviço técnico interno">
      <div className="p-4 sm:p-5"><Section title="Serviço geral"><div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><FInput label="Nome do serviço" required value={name} onChange={(e: any) => setName(e.target.value)} /></div>
        <FCurrencyInput label="Valor (R$)" value={price} onChange={(e: any) => setPrice(e.target.value)} placeholder="Ex: 150,00" />
        <FInput label="Desconto máximo (%)" type="number" min="0" max="100" step="0.01" value={maxDiscountPercentage} onChange={(e: any) => setMaxDiscountPercentage(e.target.value)} placeholder="Ex: 10" />
      </div><div className="mt-4"><FToggle label="Serviço ativo" checked={active} onChange={setActive} /></div></Section></div>
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={() => setFormOpen(false)}>Cancelar</BtnSecondary>{(editItem ? canEdit : canCreate) && <BtnPrimary onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</BtnPrimary>}</div>
    </AdminPage>
  </div>;
}
