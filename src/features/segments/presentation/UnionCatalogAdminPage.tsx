import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { UnionEquipmentTemplates } from "./UnionEquipmentTemplates";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader } from "@/shared/ui/admin/AdminLayout";
import {
  loadUnionCatalogAdmin, saveUnionCatalogItem, setUnionCatalogLink,
  type UnionCatalogData, type UnionCatalogKind,
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
  const [kind, setKind] = useState<UnionCatalogKind>("segment");
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
    const next = await loadUnionCatalogAdmin();
    setCatalog(next);
  }, []);

  useEffect(() => {
    if (!canView) return;
    let live = true;
    setLoading(true);
    void loadUnionCatalogAdmin().then(data => {
      if (live) { setCatalog(data); setLoading(false); }
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
    setKind(next); setSelectedId(null); setCreating(false);
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
      const savedId = await saveUnionCatalogItem(kind, creating ? null : selectedId, {
        name,
        ...(kind === "brand" ? {} : { code, sort_order: Number(form.sort_order) || 0 }),
        ...(kind === "segment" ? { description: form.description.trim(), icon_name: form.icon_name.trim() } : {}),
        is_active: form.is_active,
        ...(kind !== "segment" ? { is_published: form.is_published } : {}),
      });
      await reload();
      setSelectedId(savedId);
      setCreating(false);
      setNotice(kind !== "segment" && form.is_published ? "Item publicado. O catálogo das empresas compatíveis será atualizado automaticamente." : "Cadastro salvo. Itens não publicados ficam somente na administração da Union.");
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
      setNotice(enabled ? "Vínculo adicionado ao catálogo central." : "Vínculo removido do catálogo central.");
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
  const cardClass = "rounded-xl border border-[#dfe5ef] bg-white p-4 sm:p-5";
  const inputClass = "w-full min-w-0 rounded-lg border border-[#ccd6e5] bg-white px-3 py-2.5 text-sm text-[#182943] outline-none focus:border-[#1032dc] focus:ring-2 focus:ring-[#1032dc]/10";

  if (!canView) return <div className={cardClass}>Sem permissão para acessar o Catálogo Inteligente da Union.</div>;

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Catálogo Inteligente" subtitle="Administração central dos segmentos, equipamentos e marcas oficiais da Union World." />

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[
        ["Segmentos", catalog.segments.length],
        ["Equipamentos", catalog.equipmentTypes.length],
        ["Marcas", catalog.brands.length],
      ].map(([label, number]) => <div key={label} className={cardClass}>
        <p className="text-xs font-bold uppercase tracking-wide text-[#6d7d92]">{label}</p>
        <p className="mt-1 text-2xl font-black text-[#17263b]">{number}</p>
      </div>)}
    </div>

    <div className="rounded-xl border border-[#ccd9f5] bg-[#f3f6ff] px-4 py-3 text-sm leading-6 text-[#3d547d]">
      Versão interna do catálogo: <strong>{catalog.revision}</strong>. Equipamentos e marcas em rascunho ficam apenas na Union.
      Ao publicar, os itens passam a aparecer automaticamente nos segmentos compatíveis. Nomes vinculados continuam sincronizados.
      Nenhum modelo é importado automaticamente.
    </div>

    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipos de cadastro">
      {TABS.map(tab => <button
        key={tab.kind}
        type="button"
        role="tab"
        aria-selected={tab.kind === kind}
        onClick={() => selectKind(tab.kind)}
        className={`rounded-lg border px-4 py-2 text-sm font-bold ${tab.kind === kind
          ? "border-[#1032dc] bg-[#1032dc] text-white"
          : "border-[#d8e0ea] bg-white text-[#42536a] hover:border-[#1032dc]"}`}
      >{tab.label}</button>)}
    </div>

    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</p>}

    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.5fr)]">
      <section className={cardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#17263b]">{TABS.find(tab => tab.kind === kind)?.label}</h2>
            <p className="text-xs text-[#738096]">{currentTotal} cadastrados no catálogo central</p>
          </div>
          {canManage && <BtnPrimary size="sm" onClick={createNew}>Novo</BtnPrimary>}
        </div>
        <label className="mt-4 block space-y-1">
          <span className="text-xs font-bold text-[#53647c]">Buscar cadastro</span>
          <input className={inputClass} placeholder="Nome ou código" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
        <div className="mt-3 max-h-[560px] space-y-2 overflow-y-auto">
          {loading && <p className="py-6 text-center text-sm text-[#708198]">Carregando...</p>}
          {!loading && visible.length === 0 && <p className="py-7 text-center text-sm text-[#708198]">Nenhum registro encontrado.</p>}
          {visible.map(row => <button
            type="button"
            key={row.id}
            onClick={() => selectRow(row)}
            className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left ${selectedId === row.id && !creating
              ? "border-[#1032dc] bg-[#eef2ff]"
              : "border-[#e2e8f0] bg-[#fbfcff] hover:border-[#a2b3dd]"}`}
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-[#17263b]">{row.name}</span>
              {"code" in row && <span className="block truncate text-xs text-[#7d8ba0]">{row.code}</span>}
            </span>
            <span className={`shrink-0 text-xs font-semibold ${!row.is_active ? "text-red-700" : "is_published" in row && !row.is_published ? "text-amber-700" : "text-green-700"}`}>
              {!row.is_active ? "Inativo" : "is_published" in row ? row.is_published ? "Publicado" : "Rascunho" : "Ativo"}
            </span>
          </button>)}
        </div>
      </section>

      <section className={cardClass}>
        {(!active && !creating)
          ? <div className="py-12 text-center text-sm text-[#738096]">
              Selecione um cadastro à esquerda ou clique em Novo para começar.
            </div>
          : <>
            <h2 className="text-base font-bold text-[#17263b]">{creating ? "Novo cadastro" : "Editar cadastro"}</h2>
            <p className="mt-1 text-xs leading-5 text-[#708198]">
              Edite as informações e, quando necessário, configure as associações abaixo.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block space-y-1 md:col-span-2">
                <span className="text-xs font-bold text-[#53647c]">Nome *</span>
                <input className={inputClass} maxLength={120} disabled={!canManage || saving}
                  value={form.name} onChange={event => setForm(old => ({ ...old, name: event.target.value }))} />
              </label>
              {kind !== "brand" && <label className="block space-y-1">
                <span className="text-xs font-bold text-[#53647c]">Código estável</span>
                <input className={inputClass} disabled={!canManage || saving || !creating}
                  placeholder={toCode(form.name) || "codigo-do-cadastro"}
                  value={creating ? form.code : (active && "code" in active ? active.code : form.code)}
                  onChange={event => setForm(old => ({ ...old, code: event.target.value.toLowerCase() }))} />
              </label>}
              {kind !== "brand" && <label className="block space-y-1">
                <span className="text-xs font-bold text-[#53647c]">Ordenação</span>
                <input className={inputClass} type="number" min={0} max={1000000} step={1}
                  disabled={!canManage || saving} value={form.sort_order}
                  onChange={event => setForm(old => ({ ...old, sort_order: Number(event.target.value) }))} />
              </label>}
              {kind === "segment" && <>
                <label className="block space-y-1 md:col-span-2">
                  <span className="text-xs font-bold text-[#53647c]">Descrição</span>
                  <textarea className={inputClass} rows={2} maxLength={350} disabled={!canManage || saving}
                    value={form.description}
                    onChange={event => setForm(old => ({ ...old, description: event.target.value }))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-bold text-[#53647c]">Ícone (Lucide)</span>
                  <select className={inputClass} disabled={!canManage || saving} value={form.icon_name}
                    onChange={event => setForm(old => ({ ...old, icon_name: event.target.value }))}>
                    {[["smartphone","Celular"],["wrench","Ferramenta"],["snowflake","Climatização"],
                      ["monitor","Computador"],["car-front","Automóvel"],["sun","Solar"],
                      ["sliders-horizontal","Personalizado"],["briefcase-business","Negócios"]]
                      .map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
              </>}
              <label className="flex items-center gap-2 self-end rounded-lg border border-[#e1e7f0] p-3 text-sm font-medium text-[#263a55]">
                <input type="checkbox" className="h-4 w-4 accent-[#1032dc]"
                  checked={form.is_active} disabled={!canManage || saving}
                  onChange={event => setForm(old => ({ ...old, is_active: event.target.checked }))} />
                Cadastro ativo
              </label>
              {kind !== "segment" && <label className="flex items-start gap-2 self-end rounded-lg border border-[#d6dff5] bg-[#f4f6ff] p-3 text-sm font-medium text-[#263a55]">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#1032dc]"
                  checked={form.is_published} disabled={!canManage || saving}
                  onChange={event => setForm(old => ({ ...old, is_published: event.target.checked }))} />
                <span>
                  Publicado para empresas
                  <span className="mt-1 block text-xs font-normal leading-4 text-[#60718a]">
                    Sem aprovação nas empresas. Aparece automaticamente nos segmentos compatíveis.
                  </span>
                </span>
              </label>}
            </div>
            {canManage && <div className="mt-4 flex justify-end">
              <BtnPrimary onClick={() => void save()} loading={saving} disabled={saving || Boolean(linkBusy)} loadingText="Salvando...">Salvar cadastro</BtnPrimary>
            </div>}

            {!creating && selectedId && kind !== "brand" && <div className="mt-7 border-t border-[#e3e8f0] pt-5">
              <h3 className="text-sm font-bold text-[#17263b]">
                {kind === "segment" ? "Equipamentos deste segmento" : "Marcas deste equipamento"}
              </h3>
              <p className="mt-1 text-xs leading-5 text-[#738096]">
                {kind === "segment"
                  ? "Associe somente os tipos de equipamento que fazem sentido para o segmento."
                  : "Associe somente as marcas compatíveis com este tipo de equipamento."}
              </p>
              <label className="mt-3 block space-y-1">
                <span className="text-xs font-bold text-[#53647c]">Buscar para vincular</span>
                <input className={inputClass} placeholder="Filtrar opções" value={linkQuery}
                  onChange={event => setLinkQuery(event.target.value)} />
              </label>
              <div className="mt-3 max-h-80 divide-y divide-[#e6eaf0] overflow-y-auto rounded-lg border border-[#e1e7f0]">
                {filteredRelated.length === 0 && <p className="p-4 text-sm text-[#708198]">
                  {kind === "segment" ? "Nenhum equipamento cadastrado ainda." : "Nenhuma marca cadastrada ainda."}
                </p>}
                {filteredRelated.map(item => <label key={item.id}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-[#30445f] hover:bg-[#f8faff]">
                  <input type="checkbox" className="h-4 w-4 accent-[#1032dc]" checked={item.selected}
                    disabled={!canManage || Boolean(linkBusy) || saving}
                    onChange={event => void toggleLink(
                      kind === "segment" ? "segment_equipment" : "equipment_brand",
                      selectedId, item.id, event.target.checked,
                    )} />
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {!item.active && <span className="text-xs text-[#9a5b27]">Inativo</span>}
                </label>)}
              </div>
              <p className="mt-2 text-xs text-[#718198]">
                {related.filter(item => item.selected).length} vínculo(s) ativo(s) neste cadastro.
              </p>
            </div>}
            {!creating && selectedId && kind === "equipment" && <UnionEquipmentTemplates equipmentId={selectedId} canManage={canManage} />}
            {!creating && selectedId && kind === "brand" && <div className="mt-5 border-t border-[#e3e8f0] pt-4 text-sm text-[#66758a]">
              Marcas são cadastradas uma única vez. Para vinculá-las, abra a aba Equipamentos e selecione o equipamento.
            </div>}
          </>}
      </section>
    </div>

    <AdminStickyToolbar>
      <BtnSecondary onClick={onBack}>Voltar para Ferramentas</BtnSecondary>
    </AdminStickyToolbar>
  </div>;
}
