import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { UnionEquipmentTemplates } from "./UnionEquipmentTemplates";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminCardToolbar, AdminDialog, AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import {
  loadUnionCatalogAdmin, loadUnionCatalogDistribution, saveUnionCatalogItem, setUnionCatalogLink,
  type UnionCatalogData, type UnionCatalogDistribution, type UnionCatalogKind,
  type UnionEquipmentType, type UnionBrand, type UnionSegment,
} from "../infrastructure/union-catalog-admin.repository";

type RecordRow = UnionSegment | UnionEquipmentType | UnionBrand;
type CatalogForm = {
  name: string;
  code: string;
  description: string;
  icon_name: string;
  sort_order: number;
  is_active: boolean;
  is_published: boolean;
};
const EMPTY_FORM: CatalogForm = {
  name: "", code: "", description: "", icon_name: "wrench", sort_order: 0, is_active: true, is_published: false,
};
const TABS: Array<{ kind: UnionCatalogKind; label: string }> = [
  { kind: "segment", label: "Segmentos" },
  { kind: "equipment", label: "Equipamentos" },
  { kind: "brand", label: "Marcas" },
];
const emptyCatalog: UnionCatalogData = {
  revision: 0, segments: [], equipmentTypes: [], brands: [], segmentEquipment: [], equipmentBrands: [],
};

function toCode(name: string) {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function toForm(row: RecordRow): CatalogForm {
  return {
    name: row.name,
    code: "code" in row ? row.code : "",
    description: "description" in row ? row.description : "",
    icon_name: "icon_name" in row ? row.icon_name : "wrench",
    sort_order: "sort_order" in row ? row.sort_order : 0,
    is_active: row.is_active,
    is_published: "is_published" in row ? row.is_published : false,
  };
}

export function UnionCatalogAdminPage({ onBack }: { onBack: () => void }) {
  const { activeOrganization, hasPermission } = useAuth();
  const canView = activeOrganization?.is_platform_operator === true && hasPermission("platform.catalog.view");
  const canManage = canView && hasPermission("platform.catalog.manage");
  const [catalog, setCatalog] = useState<UnionCatalogData>(emptyCatalog);
  const [distribution, setDistribution] = useState<UnionCatalogDistribution | null>(null);
  const [kind, setKind] = useState<UnionCatalogKind>("segment");
  const [section, setSection] = useState<UnionCatalogKind | "distribution">("segment");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CatalogForm>(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [linkQuery, setLinkQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linkBusy, setLinkBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    const [next, result] = await Promise.all([
      loadUnionCatalogAdmin(),
      loadUnionCatalogDistribution(),
    ]);
    setCatalog(next);
    setDistribution(result);
  }, []);

  useEffect(() => {
    if (!canView) return;
    let live = true;
    setLoading(true);
    void Promise.all([loadUnionCatalogAdmin(), loadUnionCatalogDistribution()]).then(([data, result]) => {
      if (live) { setCatalog(data); setDistribution(result); setLoading(false); }
    }).catch(cause => {
      if (live) {
        setError(systemErrorMessage(cause, "Não foi possível carregar o catálogo."));
        setLoading(false);
      }
    });
    return () => { live = false; };
  }, [canView]);

  const rows = useMemo<RecordRow[]>(() => {
    if (kind === "segment") return catalog.segments;
    if (kind === "equipment") return catalog.equipmentTypes;
    return catalog.brands;
  }, [catalog, kind]);

  const visible = useMemo(() => rows.filter(row =>
    [row.name, "code" in row ? row.code : ""]
      .some(value => value.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR").trim()))
  ), [rows, query]);

  const active = rows.find(row => row.id === selectedId) ?? null;

  const selectKind = (next: UnionCatalogKind) => {
    setSection(next);
    setKind(next); setPage(1); setSelectedId(null); setCreating(false);
    setForm(EMPTY_FORM); setQuery(""); setLinkQuery(""); setError(""); setNotice("");
  };
  const selectRow = (row: RecordRow) => {
    setSelectedId(row.id); setCreating(false); setForm(toForm(row));
    setError(""); setNotice(""); setLinkQuery("");
  };
  const createNew = () => {
    setSelectedId(null); setCreating(true); setForm(EMPTY_FORM);
    setError(""); setNotice(""); setLinkQuery("");
  };

  const save = async () => {
    if (!canManage || saving) return;
    const name = form.name.trim();
    const code = form.code.trim() || toCode(name);
    if (name.length < 2 || name.length > 120) {
      setError("Informe um nome entre 2 e 120 caracteres."); return;
    }
    if ((kind === "segment" || kind === "equipment") && creating && !/^[a-z0-9-]{2,60}$/.test(code)) {
      setError("Código inválido. Use somente letras minúsculas, números e hífens."); return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      await saveUnionCatalogItem(kind, creating ? null : selectedId, {
        name,
        ...(kind === "brand" ? {} : { code, sort_order: Number(form.sort_order) || 0 }),
        ...(kind === "segment" ? { description: form.description.trim(), icon_name: form.icon_name.trim() } : {}),
        is_active: form.is_active,
        ...(kind !== "segment" ? { is_published: form.is_published } : {}),
      });
      await reload();
      setSelectedId(null);
      setCreating(false);
      notifyAdmin("Cadastro salvo com sucesso.");
    } catch (cause) {
      setError(systemErrorMessage(cause, "Não foi possível salvar o cadastro."));
    } finally {
      setSaving(false);
    }
  };

  const toggleLink = async (linkKind: "segment_equipment" | "equipment_brand", left: string, right: string, enabled: boolean) => {
    if (!canManage || linkBusy || saving) return;
    setLinkBusy(right); setError(""); setNotice("");
    try {
      await setUnionCatalogLink(linkKind, left, right, enabled);
      await reload();
      notifyAdmin(enabled ? "Vínculo adicionado." : "Vínculo removido.");
    } catch (cause) {
      setError(systemErrorMessage(cause, "Não foi possível alterar o vínculo."));
    } finally {
      setLinkBusy(null);
    }
  };

  const related = kind === "segment" && selectedId
    ? catalog.equipmentTypes.map(item => ({
        id: item.id, name: item.name, active: item.is_active,
        selected: catalog.segmentEquipment.some(link => link.segment_id === selectedId && link.equipment_type_id === item.id),
      }))
    : kind === "equipment" && selectedId
      ? catalog.brands.map(item => ({
          id: item.id, name: item.name, active: item.is_active,
          selected: catalog.equipmentBrands.some(link => link.equipment_type_id === selectedId && link.brand_id === item.id),
        }))
      : [];

  const filteredRelated = related.filter(item =>
    item.name.toLocaleLowerCase("pt-BR").includes(linkQuery.toLocaleLowerCase("pt-BR").trim())
  );
  const currentTotal = kind === "segment" ? catalog.segments.length
    : kind === "equipment" ? catalog.equipmentTypes.length : catalog.brands.length;
  const editorOpen = creating || Boolean(active);
  const closeEditor = () => {
    if (saving || linkBusy) return;
    setCreating(false); setSelectedId(null); setError(""); setNotice(""); setLinkQuery("");
  };
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const inputClass = "w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60";
  const labelClass = "block space-y-1 text-xs font-bold text-muted-foreground";
  const sectionLabel = TABS.find(tab => tab.kind === kind)?.label || "Cadastros";
  const tabs: Array<{ id: UnionCatalogKind | "distribution"; label: string; count: number }> = [
    { id: "segment", label: "Segmentos", count: catalog.segments.length },
    { id: "equipment", label: "Equipamentos", count: catalog.equipmentTypes.length },
    { id: "brand", label: "Marcas", count: catalog.brands.length },
    { id: "distribution", label: "Distribuição", count: distribution?.companies.length ?? 0 },
  ];
  if (!canView) return <div className="border border-border bg-card p-5 text-sm text-foreground">Sem permissão para acessar o Catálogo Inteligente da Union.</div>;

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Catálogo Inteligente" />

    <nav aria-label="Subseções do catálogo" className="flex min-w-0 gap-1 overflow-x-auto border-b border-border">
      {tabs.map(tab => <button
        key={tab.id}
        type="button"
        aria-current={section === tab.id ? "page" : undefined}
        onClick={() => {
          if (saving || linkBusy) return;
          if (tab.id === "distribution") {
            setSection("distribution"); setCreating(false); setSelectedId(null); setError(""); setNotice("");
          } else selectKind(tab.id);
        }}
        className={"shrink-0 border-b-2 px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 " +
          (section === tab.id
            ? "border-primary text-primary"
            : "border-transparent text-muted-foreground hover:border-border hover:text-foreground")}
      >{tab.label} <span className="ml-1 text-xs opacity-70">({tab.count})</span></button>)}
    </nav>

    {error && !editorOpen && <p role="alert" className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {notice && !editorOpen && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}

    {section !== "distribution" ? <Section title={sectionLabel} flush>
      <AdminCardToolbar className="sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="union-catalog-search" className="sr-only">Buscar {sectionLabel.toLowerCase()}</label>
          <input id="union-catalog-search" className={inputClass + " pl-9"} value={query}
            onChange={event => { setQuery(event.target.value); setPage(1); }}
            placeholder="Buscar por nome ou código" />
        </div>
        <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">
          {visible.length} de {currentTotal} registros
        </span>
      </AdminCardToolbar>
      {loading ? <LoadingState text="Carregando catálogo..." /> : visible.length === 0
        ? <p className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhum cadastro encontrado.</p>
        : <div className="overflow-x-auto"><table className="min-w-[660px]">
          <thead><tr>
            <th className="text-left">Nome</th>
            {kind !== "brand" && <th className="text-left">Código</th>}
            {kind !== "brand" && <th className="text-right">Ordem</th>}
            <th className="text-left">Situação</th>
            {kind !== "segment" && <th className="text-left">Publicação</th>}
            <th className="text-right">Ações</th>
          </tr></thead>
          <tbody>{pageRows.map(row => <tr key={row.id}>
            <td className="font-semibold text-foreground">{row.name}</td>
            {kind !== "brand" && <td className="text-muted-foreground">{"code" in row ? row.code : "—"}</td>}
            {kind !== "brand" && <td className="text-right tabular-nums text-muted-foreground">{"sort_order" in row ? row.sort_order : "—"}</td>}
            <td><span className={row.is_active ? "font-semibold text-emerald-700 dark:text-emerald-400" : "font-semibold text-red-600 dark:text-red-400"}>
              {row.is_active ? "Ativo" : "Inativo"}
            </span></td>
            {kind !== "segment" && <td className="text-muted-foreground">
              {"is_published" in row && row.is_published ? "Publicado" : "Rascunho"}
            </td>}
            <td className="text-right"><BtnSecondary onClick={() => selectRow(row)} className="px-3 py-1.5 text-xs">
              {canManage ? "Editar" : "Visualizar"}
            </BtnSecondary></td>
          </tr>)}</tbody>
        </table></div>}
      {!loading && <PaginationBar
        page={currentPage} pageSize={pageSize} totalItems={visible.length}
        onPageChange={setPage}
        onPageSizeChange={size => { setPageSize(size); setPage(1); }}
      />}
    </Section> : <Section title="Distribuição por empresa" flush>
      <AdminCardToolbar className="sm:justify-end">
        <span className="text-xs font-semibold text-muted-foreground">{distribution?.companies.length ?? 0} empresas</span>
      </AdminCardToolbar>
      {loading ? <LoadingState text="Carregando distribuição..." /> : !distribution || distribution.companies.length === 0
        ? <p className="px-5 py-12 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada.</p>
        : <div className="overflow-x-auto"><table className="min-w-[580px]">
          <thead><tr>
            <th className="text-left">Empresa</th>
            <th className="text-right">Equipamentos</th>
            <th className="text-right">Marcas</th>
            <th className="text-right">Conflitos</th>
          </tr></thead>
          <tbody>{distribution.companies.map(company => <tr key={company.id}>
            <td className="font-semibold text-foreground">{company.name}</td>
            <td className="text-right tabular-nums">{company.equipment_count}</td>
            <td className="text-right tabular-nums">{company.brand_count}</td>
            <td className={"text-right tabular-nums " + (company.issues ? "font-bold text-amber-700 dark:text-amber-400" : "")}>{company.issues}</td>
          </tr>)}</tbody>
        </table></div>}
      {distribution && distribution.pending_issues.length > 0 && <div className="space-y-2 border-t border-border p-4">
        <p className="text-sm font-bold text-foreground">Conflitos de integração ({distribution.pending_issues.length})</p>
        {distribution.pending_issues.map((issue, i) => <p key={issue.issue_key + ":" + i} className="border-l-2 border-amber-500 pl-3 text-xs text-muted-foreground">
          {distribution.companies.find(company => company.id === issue.organization_id)?.name || "Empresa"}: {issue.details}
        </p>)}
      </div>}
    </Section>}

    <AdminStickyToolbar className="justify-between">
      <BtnSecondary onClick={onBack}>Voltar</BtnSecondary>
      {canManage && section !== "distribution" && <BtnPrimary onClick={createNew}>Novo</BtnPrimary>}
    </AdminStickyToolbar>

    {editorOpen && <AdminDialog open onClose={closeEditor}
      title={(creating ? "Novo " : "Editar ") + (kind === "segment" ? "segmento" : kind === "equipment" ? "equipamento" : "marca")}
      className="max-w-3xl"
      footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BtnSecondary onClick={closeEditor} disabled={saving || Boolean(linkBusy)}>Cancelar</BtnSecondary>
        {canManage && <BtnPrimary onClick={() => void save()} loading={saving} loadingText="Salvando..." disabled={Boolean(linkBusy)}>Salvar</BtnPrimary>}
      </div>}
    >
      <div className="space-y-5">
        {error && <p role="alert" className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass + " sm:col-span-2"}>
            <span>Nome *</span>
            <input className={inputClass} maxLength={120} value={form.name} disabled={!canManage || saving}
              onChange={event => setForm(old => ({ ...old, name: event.target.value }))} />
          </label>
          {kind !== "brand" && <label className={labelClass}>
            <span>Código estável</span>
            <input className={inputClass} disabled={!canManage || saving || !creating}
              placeholder={toCode(form.name) || "codigo-do-cadastro"}
              value={creating ? form.code : (active && "code" in active ? active.code : form.code)}
              onChange={event => setForm(old => ({ ...old, code: event.target.value.toLowerCase() }))} />
          </label>}
          {kind !== "brand" && <label className={labelClass}>
            <span>Ordenação</span>
            <input className={inputClass} type="number" min={0} max={1000000} step={1}
              disabled={!canManage || saving} value={form.sort_order}
              onChange={event => setForm(old => ({ ...old, sort_order: Number(event.target.value) }))} />
          </label>}
          {kind === "segment" && <>
            <label className={labelClass + " sm:col-span-2"}>
              <span>Descrição</span>
              <textarea className={inputClass} rows={2} maxLength={350} disabled={!canManage || saving}
                value={form.description} onChange={event => setForm(old => ({ ...old, description: event.target.value }))} />
            </label>
            <label className={labelClass}>
              <span>Ícone</span>
              <select className={inputClass} disabled={!canManage || saving} value={form.icon_name}
                onChange={event => setForm(old => ({ ...old, icon_name: event.target.value }))}>
                {[["smartphone","Celular"],["wrench","Ferramenta"],["snowflake","Climatização"],
                  ["monitor","Computador"],["car-front","Automóvel"],["sun","Solar"],
                  ["sliders-horizontal","Personalizado"],["briefcase-business","Negócios"]]
                  .map(([value,label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </>}
          <label className="flex items-center gap-2 self-end border border-border p-3 text-sm text-foreground">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.is_active}
              disabled={!canManage || saving} onChange={event => setForm(old => ({ ...old, is_active: event.target.checked }))} />
            Cadastro ativo
          </label>
          {kind !== "segment" && <label className="flex items-center gap-2 self-end border border-border p-3 text-sm text-foreground">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.is_published}
              disabled={!canManage || saving} onChange={event => setForm(old => ({ ...old, is_published: event.target.checked }))} />
            Publicado para empresas
          </label>}
        </div>

        {!creating && selectedId && kind !== "brand" && <div className="space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-bold text-foreground">
            {kind === "segment" ? "Equipamentos deste segmento" : "Marcas deste equipamento"}
          </h3>
          <input className={inputClass} placeholder="Buscar vínculo" value={linkQuery}
            onChange={event => setLinkQuery(event.target.value)} />
          <div className="max-h-56 divide-y divide-border overflow-y-auto border border-border">
            {filteredRelated.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum item encontrado.</p>}
            {filteredRelated.map(item => <label key={item.id} className="flex items-center gap-3 px-4 py-3 text-sm text-foreground hover:bg-muted/60">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={item.selected}
                disabled={!canManage || Boolean(linkBusy) || saving}
                onChange={event => void toggleLink(
                  kind === "segment" ? "segment_equipment" : "equipment_brand",
                  selectedId, item.id, event.target.checked,
                )} />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {!item.active && <span className="text-xs text-amber-600">Inativo</span>}
            </label>)}
          </div>
          <p className="text-xs text-muted-foreground">{related.filter(item => item.selected).length} vínculos</p>
        </div>}
        {!creating && selectedId && kind === "equipment" && <UnionEquipmentTemplates equipmentId={selectedId} canManage={canManage} />}
      </div>
    </AdminDialog>}
  </div>;
}
