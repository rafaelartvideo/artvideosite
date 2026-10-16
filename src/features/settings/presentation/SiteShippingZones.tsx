import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, MouseEvent } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Eraser, MapPin, Pencil, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  AdminButton, AdminCard, AdminDialog, AdminIconButton, AdminSegmentedControl,
  AdminStickyToolbar, BtnPrimary, BtnSecondary,
} from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { AdminSelect, FInput, FToggle, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { ConfirmDialog, EmptyState, LoadingState, StatusBadge, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";

type ShippingZone = {
  id: string;
  title: string;
  cep_start: string;
  cep_end: string;
  price: number;
  delivery_days: number | null;
  active: boolean;
};
type Draft = {
  id?: string;
  title: string;
  start: string;
  end: string;
  mode: "single" | "range";
  price: string;
  days: string;
  active: boolean;
};
type StatusFilter = "all" | "active" | "inactive";
type SortOrder = "asc" | "desc";

const MODES: Array<{ value: Draft["mode"]; label: string }> = [
  { value: "single", label: "CEP individual" },
  { value: "range", label: "Faixa de CEPs" },
];
const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Todas as situações" },
  { value: "active", label: "Ativas" },
  { value: "inactive", label: "Inativas" },
];
const emptyDraft = (): Draft => ({
  title: "Entrega regional",
  start: "",
  end: "",
  mode: "single",
  price: "0.00",
  days: "",
  active: true,
});
const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, 8);
const displayCep = (value: string) => /^\d{8}$/.test(value)
  ? value.replace(/^(\d{5})(\d{3})$/, "$1-$2")
  : value;
const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
const zoneCepLabel = (zone: ShippingZone) => displayCep(zone.cep_start) +
  (zone.cep_start !== zone.cep_end ? " a " + displayCep(zone.cep_end) : "");

export function SiteShippingZones({ canUpdate, onBack }: { canUpdate: boolean; onBack: () => void }) {
  const [items, setItems] = useState<ShippingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteItem, setDeleteItem] = useState<ShippingZone | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [error, setError] = useState("");

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const result = await supabase.from("artvideo_shipping_zones")
        .select("id,title,cep_start,cep_end,price,delivery_days,active")
        .order("cep_start", { ascending: true })
        .order("cep_end", { ascending: true });
      if (result.error) throw result.error;
      setItems((result.data || []) as ShippingZone[]);
    } catch (caught) {
      setError(systemErrorMessage(caught, "Não foi possível carregar as áreas de entrega."));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(true); }, [refresh]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const digits = search.replace(/\D/g, "");
    return items.filter(item => {
      if (statusFilter === "active" && !item.active) return false;
      if (statusFilter === "inactive" && item.active) return false;
      if (!term) return true;
      return item.title.toLocaleLowerCase("pt-BR").includes(term)
        || Boolean(digits && (item.cep_start.includes(digits) || item.cep_end.includes(digits)));
    }).sort((a, b) => {
      const compare = a.cep_start.localeCompare(b.cep_start) || a.cep_end.localeCompare(b.cep_end);
      return sortOrder === "asc" ? compare : -compare;
    });
  }, [items, search, statusFilter, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const resetFilters = () => { setSearch(""); setStatusFilter("all"); setSortOrder("asc"); setPage(1); };
  const edit = (item: ShippingZone) => setDraft({
    id: item.id,
    title: item.title,
    start: item.cep_start,
    end: item.cep_end,
    mode: item.cep_start === item.cep_end ? "single" : "range",
    price: String(item.price),
    days: item.delivery_days == null ? "" : String(item.delivery_days),
    active: item.active,
  });
  const close = () => { if (!saving) setDraft(null); };

  const save = async () => {
    if (!draft || saving || !canUpdate) return;
    const start = onlyDigits(draft.start);
    const end = draft.mode === "single" ? start : onlyDigits(draft.end);
    const amount = Number(draft.price.replace(",", "."));
    const days = draft.days.trim() ? Number(draft.days) : null;
    if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end) || start > end) {
      notifyAdmin("Confira os CEPs. O CEP final deve ser igual ou maior que o inicial.", "error");
      return;
    }
    if (draft.title.trim().length < 2 || draft.title.trim().length > 100 ||
      !Number.isFinite(amount) || amount < 0 || amount > 99999 ||
      (days !== null && (!Number.isInteger(days) || days < 1 || days > 120))) {
      notifyAdmin("Informe nome, valor e prazo válidos. O prazo é opcional.", "error");
      return;
    }
    if (items.some(item => item.id !== draft.id && item.cep_start === start && item.cep_end === end)) {
      notifyAdmin("Essa faixa de CEP já está cadastrada.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = { title: draft.title.trim(), cep_start: start, cep_end: end,
        price: amount, delivery_days: days, active: draft.active };
      const result = draft.id
        ? await supabase.from("artvideo_shipping_zones").update(payload).eq("id", draft.id)
        : await supabase.from("artvideo_shipping_zones").insert(payload);
      if (result.error) throw result.error;
      setDraft(null);
      notifyAdmin("Regra de entrega salva.", "success");
      await refresh();
    } catch (caught) {
      notifyAdmin(systemErrorMessage(caught, "Não foi possível salvar a área de entrega."), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteItem || !canUpdate || saving) return;
    const target = deleteItem;
    setSaving(true);
    try {
      const { error: deleteError } = await supabase.from("artvideo_shipping_zones")
        .delete().eq("id", target.id);
      if (deleteError) throw deleteError;
      setItems(previous => previous.filter(item => item.id !== target.id));
      setDeleteItem(null);
      notifyAdmin("Regra de entrega excluída.", "success");
    } catch (caught) {
      notifyAdmin(systemErrorMessage(caught, "Não foi possível excluir a regra."), "error");
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (item: ShippingZone) => {
    if (!canUpdate || saving) return;
    setSaving(true);
    try {
      const { error: toggleError } = await supabase.from("artvideo_shipping_zones")
        .update({ active: !item.active }).eq("id", item.id);
      if (toggleError) throw toggleError;
      setItems(previous => previous.map(row =>
        row.id === item.id ? { ...row, active: !item.active } : row,
      ));
      notifyAdmin(item.active ? "Área de entrega desativada." : "Área de entrega ativada.", "success");
    } catch (caught) {
      notifyAdmin(systemErrorMessage(caught, "Não foi possível alterar a situação da área."), "error");
    } finally {
      setSaving(false);
    }
  };

  const openRow = (item: ShippingZone) => edit(item);
  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, item: ShippingZone) => {
    if (!(event.target as HTMLElement).closest("button, a, input, select")) openRow(item);
  };
  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, item: ShippingZone) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openRow(item);
    }
  };

  return <div className="min-w-0 space-y-4">
    <AdminSearchPanel title="Buscar áreas de entrega" headerActions={
      <span className="text-xs font-semibold text-white/90">
        {filtered.length} {filtered.length === 1 ? "regra" : "regras"}
      </span>
    }>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,220px)_auto] sm:items-end">
        <div className="relative min-w-0">
          <label htmlFor="delivery-cep-search" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Buscar
          </label>
          <Search size={17} className="pointer-events-none absolute bottom-3 left-3 text-muted-foreground" />
          <input id="delivery-cep-search" className={INPUT + " pl-10"} value={search}
            onChange={event => { setSearch(event.target.value); setPage(1); }}
            placeholder="Nome da região ou CEP" aria-label="Buscar áreas de entrega" />
        </div>
        <div className="min-w-0">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Situação
          </label>
          <AdminSelect ariaLabel="Filtrar situação" value={statusFilter}
            onValueChange={value => { setStatusFilter(value as StatusFilter); setPage(1); }}
            options={STATUS_OPTIONS} />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <AdminIconButton ariaLabel={sortOrder === "asc" ? "Ordenar CEP do maior para o menor" : "Ordenar CEP do menor para o maior"}
            title={sortOrder === "asc" ? "CEP crescente" : "CEP decrescente"}
            onClick={() => { setSortOrder(previous => previous === "asc" ? "desc" : "asc"); setPage(1); }}
            className="h-[42px] w-[42px] shrink-0">
            {sortOrder === "asc" ? <ArrowDownWideNarrow size={17} /> : <ArrowUpNarrowWide size={17} />}
          </AdminIconButton>
          {(search || statusFilter !== "all" || sortOrder !== "asc") && <AdminIconButton
            ariaLabel="Limpar filtros" title="Limpar filtros" onClick={resetFilters}
            className="h-[42px] w-[42px] shrink-0"><Eraser size={17} /></AdminIconButton>}
        </div>
      </div>
    </AdminSearchPanel>

    <AdminCard square className="[&_th]:md:py-2 [&_td]:md:py-2.5">
      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-red-500/20 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-300">
        <span>{error}</span>
        <AdminButton size="sm" variant="secondary" onClick={() => void refresh(true)}>Tentar novamente</AdminButton>
      </div>}
      {loading ? <LoadingState text="Carregando áreas de entrega..." /> :
        rows.length === 0 ? <EmptyState icon={MapPin}
          title={items.length === 0 ? "Nenhuma área de entrega cadastrada" : "Nenhuma regra encontrada"}
          message={items.length === 0 ? "Cadastre os CEPs e faixas atendidos para disponibilizar a entrega na loja." : "Altere os filtros para encontrar outras regras."} /> :
        <div className="min-w-0 overflow-x-auto">
          <table className="min-w-[760px] text-left">
            <thead><tr>
              <th className="text-left">Região / modalidade</th>
              <th className="text-left">CEP atendido</th>
              <th className="text-left">Valor</th>
              <th className="text-left">Prazo</th>
              <th className="text-left">Situação</th>
              {canUpdate && <th className="text-right">Ações</th>}
            </tr></thead>
            <tbody>{rows.map(item => <tr key={item.id} role="button" tabIndex={0}
              aria-label={"Abrir área de entrega " + item.title}
              className="!cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
              onClick={event => onRowClick(event, item)}
              onKeyDown={event => onRowKeyDown(event, item)}>
              <td className="font-bold text-foreground">{item.title}</td>
              <td className="whitespace-nowrap tabular-nums text-muted-foreground">{zoneCepLabel(item)}</td>
              <td className="whitespace-nowrap font-semibold text-foreground">{Number(item.price) === 0 ? "Grátis" : brl(Number(item.price))}</td>
              <td className="whitespace-nowrap text-muted-foreground">{item.delivery_days == null ? "Não informado" : item.delivery_days + " dias úteis"}</td>
              <td><StatusBadge status={item.active ? "Ativo" : "Inativo"} /></td>
              {canUpdate && <td>
                <div className="flex items-center justify-end gap-1" onClick={event => event.stopPropagation()}>
                  <AdminIconButton ariaLabel={"Editar " + item.title} title="Editar" disabled={saving}
                    onClick={() => edit(item)}><Pencil size={15} /></AdminIconButton>
                  <AdminIconButton ariaLabel={"Excluir " + item.title} title="Excluir" variant="danger"
                    disabled={saving} onClick={() => setDeleteItem(item)}><Trash2 size={15} /></AdminIconButton>
                  <AdminActiveStateButton active={item.active} entityLabel={"área de entrega " + item.title}
                    disabled={saving} onClick={() => void toggle(item)} />
                </div>
              </td>}
            </tr>)}</tbody>
          </table>
        </div>}
      {!loading && <PaginationBar page={safePage} pageSize={pageSize} totalItems={filtered.length}
        onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />}
    </AdminCard>

    <AdminStickyToolbar className="mt-4 justify-between">
      <BtnSecondary onClick={onBack} disabled={saving}>Voltar</BtnSecondary>
      {canUpdate && <BtnPrimary onClick={() => setDraft(emptyDraft())} disabled={saving}>Novo</BtnPrimary>}
    </AdminStickyToolbar>

    {deleteItem && <ConfirmDialog
      message={"Excluir a área de entrega " + deleteItem.title + " (" + zoneCepLabel(deleteItem) + ")? Esta ação não pode ser desfeita."}
      onConfirm={remove} onCancel={() => { if (!saving) setDeleteItem(null); }}
    />}

    <AdminDialog open={Boolean(draft)} onClose={close}
      title={draft?.id ? "Área de entrega" : "Nova área de entrega"}
      description={draft?.id ? "Detalhes e configuração da região atendida." : "Cadastre o CEP ou a faixa atendida e o valor do frete."}
      className="max-w-lg"
      footer={<div className="flex w-full items-center justify-end gap-2">
        <BtnSecondary onClick={close} disabled={saving}>{canUpdate ? "Cancelar" : "Fechar"}</BtnSecondary>
        {canUpdate && <BtnPrimary onClick={() => void save()} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
      </div>}>
      {draft && <fieldset className="space-y-4" disabled={!canUpdate || saving}>
        <AdminSegmentedControl value={draft.mode} options={MODES}
          onChange={mode => setDraft(current => current ? { ...current, mode } : current)} />
        <FInput label="Nome da região ou modalidade" value={draft.title} maxLength={100} required
          onChange={(event: any) => setDraft(current => current ? { ...current, title: event.target.value } : current)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <FInput label={draft.mode === "single" ? "CEP" : "CEP inicial"} required
            value={draft.start} inputMode="numeric" placeholder="00000000" maxLength={8}
            onChange={(event: any) => setDraft(current => current ? { ...current, start: onlyDigits(event.target.value) } : current)} />
          {draft.mode === "range" && <FInput label="CEP final" required inputMode="numeric"
            value={draft.end} placeholder="00000000" maxLength={8}
            onChange={(event: any) => setDraft(current => current ? { ...current, end: onlyDigits(event.target.value) } : current)} />}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FInput label="Valor do frete (R$)" type="number" min={0} max={99999} step="0.01"
            required value={draft.price} onChange={(event: any) => setDraft(current => current ? { ...current, price: event.target.value } : current)} />
          <FInput label="Prazo (dias úteis)" type="number" min={1} max={120} step={1}
            value={draft.days} onChange={(event: any) => setDraft(current => current ? { ...current, days: event.target.value } : current)} />
        </div>
        <FToggle label="Regra ativa" checked={draft.active}
          description="Regras desativadas não serão consideradas no cálculo de entrega."
          onChange={active => setDraft(current => current ? { ...current, active } : current)} />
        <p className="text-xs text-muted-foreground">Valor zero oferece frete grátis. Quando faixas se sobrepõem, a mais específica prevalece.</p>
      </fieldset>}
    </AdminDialog>
  </div>;
}
