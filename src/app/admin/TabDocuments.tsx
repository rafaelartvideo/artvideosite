import React, { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, FileText, LayoutTemplate, Plus, Printer, Search, Settings2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { PRINT_FIELD_REGISTRY } from "./printFieldRegistry";
import { cn, INPUT, LoadingState, EmptyState, BtnPrimary } from "./shared";

type PrintTemplate = {
  id: string;
  name: string;
  description: string | null;
  document_type: string;
  is_active: boolean;
  paper_size: string;
  orientation: "portrait" | "landscape";
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  show_logo: boolean;
  show_company_info: boolean;
  show_page_number: boolean;
  show_printed_at: boolean;
  header_text: string | null;
  footer_text: string | null;
  created_at: string;
  updated_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  OS: "Ordem de Serviço",
  ENTRADA: "Entrada",
  SAIDA_DEVOLUCAO: "Saída / Devolução",
  LAUDO: "Laudo técnico",
  COMPROVANTE: "Comprovante",
  CUSTOM: "Personalizado",
};

export function TabDocuments({ onBack }: { onBack?: () => void }) {
  const { hasPermission } = useAuth();
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorValue, setEditorValue] = useState(() => emptyPrintTemplateEditorValue());
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateLoading, setTemplateLoading] = useState(false);

  const loadTemplates = async () => {
    setLoading(true);
    setError("");
    const { data, error: queryError } = await (supabase as any)
      .from("print_templates")
      .select("*")
      .order("name", { ascending: true });
    if (queryError) setError(queryError.message || "Não foi possível carregar os modelos de documentos.");
    setTemplates((data || []) as PrintTemplate[]);
    setLoading(false);
  };

  useEffect(() => { void loadTemplates(); }, []);

  const openNewDocument = () => {
    setEditingTemplateId(null);
    setEditorValue(emptyPrintTemplateEditorValue());
    setEditorOpen(true);
  };

  const openTemplateEditor = async (template: PrintTemplate) => {
    setTemplateLoading(true);
    setError("");
    try {
      const { data: sections, error: sectionsError } = await (supabase as any)
        .from("print_template_sections")
        .select("*")
        .eq("template_id", template.id)
        .order("sort_order", { ascending: true });
      if (sectionsError) throw sectionsError;

      const sectionIds = (sections || []).map((section: any) => section.id).filter(Boolean);
      const { data: fields, error: fieldsError } = sectionIds.length
        ? await (supabase as any).from("print_template_fields").select("*").in("template_section_id", sectionIds).order("sort_order", { ascending: true })
        : { data: [], error: null };
      if (fieldsError) throw fieldsError;

      const selectedFields = new Set<string>();
      const orderedSections = (sections || []) as any[];
      for (const section of orderedSections) {
        const sectionFields = (fields || []).filter((field: any) => field.template_section_id === section.id);
        for (const field of sectionFields) {
          if (field.field_key) selectedFields.add(field.field_key);
        }
      }

      const nextValue = {
        ...emptyPrintTemplateEditorValue(),
        id: template.id,
        name: template.name,
        description: template.description || "",
        document_type: template.document_type,
        is_active: template.is_active,
        paper_size: template.paper_size,
        orientation: template.orientation,
        margin_top: Number(template.margin_top || 0),
        margin_right: Number(template.margin_right || 0),
        margin_bottom: Number(template.margin_bottom || 0),
        margin_left: Number(template.margin_left || 0),
        show_logo: template.show_logo,
        show_company_info: template.show_company_info,
        show_page_number: template.show_page_number,
        show_printed_at: template.show_printed_at,
        header_text: template.header_text || "",
        footer_text: template.footer_text || "",
        selectedFields,
      };

      setEditorValue(nextValue);
      setEditingTemplateId(template.id);
      setEditorOpen(true);
    } catch (loadError: any) {
      setError(loadError?.message || "Não foi possível carregar o template para edição.");
    } finally {
      setTemplateLoading(false);
    }
  };

  const handleEditorSaved = async () => {
    setEditorOpen(false);
    await loadTemplates();
  };

  const filteredTemplates = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return templates;
    return templates.filter(template =>
      template.name.toLocaleLowerCase("pt-BR").includes(term)
      || (template.description || "").toLocaleLowerCase("pt-BR").includes(term)
      || (TYPE_LABELS[template.document_type] || template.document_type).toLocaleLowerCase("pt-BR").includes(term)
    );
  }, [templates, search]);

  const toggleSection = (key: string) => {
    setExpandedSections(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#0057e7]">
            <Printer size={15} /> Configuração de impressão
          </div>
          <h1 className="mt-1 text-2xl font-black text-[#0d1b2e]">Documentos</h1>
          <p className="mt-1 max-w-2xl text-sm text-[#5a6a82]">Crie modelos reutilizáveis e escolha exatamente quais informações da OS serão impressas e como serão organizadas na folha.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onBack && <button type="button" onClick={onBack} className="rounded-lg border border-[#d8e0eb] bg-white px-3.5 py-2 text-sm font-bold text-[#42526a] hover:bg-[#f5f7fa]">Voltar</button>}
          <button type="button" onClick={() => setCatalogOpen(current => !current)} className="inline-flex items-center gap-2 rounded-lg border border-[#d8e0eb] bg-white px-3.5 py-2 text-sm font-bold text-[#0d1b2e] hover:border-[#0057e7]/30 hover:text-[#0057e7]">
            <LayoutTemplate size={16} /> Catálogo de campos
          </button>
          {hasPermission("documents.create") && <BtnPrimary onClick={openNewDocument}><Plus size={16} /> Novo documento</BtnPrimary>}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Modelos" value={templates.length} icon={FileText} />
        <Metric label="Ativos" value={templates.filter(item => item.is_active).length} icon={Check} />
        <Metric label="Categorias de dados" value={PRINT_FIELD_REGISTRY.length} icon={LayoutTemplate} />
        <Metric label="Campos disponíveis" value={PRINT_FIELD_REGISTRY.reduce((total, section) => total + section.fields.length, 0)} icon={Settings2} />
      </div>

      {catalogOpen && (
        <section className="overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white shadow-sm">
          <div className="border-b border-[#0d1b2e]/8 px-5 py-4">
            <h2 className="font-black text-[#0d1b2e]">Catálogo de informações imprimíveis</h2>
            <p className="mt-1 text-xs text-[#5a6a82]">Este catálogo será usado pelo editor. As chaves são controladas pelo sistema e não executam SQL configurável.</p>
          </div>
          <div className="divide-y divide-[#0d1b2e]/7">
            {PRINT_FIELD_REGISTRY.map(section => {
              const expanded = expandedSections.has(section.key);
              return <div key={section.key}>
                <button type="button" onClick={() => toggleSection(section.key)} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-[#f8fafc]">
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="font-bold text-[#0d1b2e]">{section.label}</span><span className="rounded-full bg-[#edf3ff] px-2 py-0.5 text-[10px] font-bold text-[#0057e7]">{section.fields.length} campos</span></div>
                    <p className="mt-0.5 text-xs text-[#5a6a82]">{section.description}</p>
                  </div>
                </button>
                {expanded && <div className="grid gap-2 bg-[#f8fafc] px-5 py-4 sm:grid-cols-2 xl:grid-cols-3">
                  {section.fields.map(field => <div key={field.key} className="rounded-lg border border-[#0d1b2e]/8 bg-white p-3">
                    <div className="text-sm font-bold text-[#0d1b2e]">{field.label}</div>
                    <code className="mt-1 block break-all text-[10px] text-[#6b7a90]">{field.key}</code>
                  </div>)}
                </div>}
              </div>;
            })}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-[#0d1b2e]/10 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#0d1b2e]/8 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-black text-[#0d1b2e]">Modelos de impressão</h2><p className="text-xs text-[#5a6a82]">Modelos ativos aparecerão posteriormente no menu Imprimir da OS.</p></div>
          <div className="relative w-full sm:w-72"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b98aa]" /><input className={cn(INPUT, "pl-9")} value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar modelo..." /></div>
        </div>
        {error && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        {loading ? <div className="p-8"><LoadingState /></div> : filteredTemplates.length === 0 ? <div className="p-8"><EmptyState icon={FileText} title={templates.length ? "Nenhum modelo encontrado" : "Nenhum documento configurado"} description={templates.length ? "Tente alterar a busca." : "Crie o primeiro modelo para começar a configurar suas impressões."} /></div> : <div className="divide-y divide-[#0d1b2e]/7">
          {filteredTemplates.map(template => <div key={template.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-black text-[#0d1b2e]">{template.name}</span><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", template.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{template.is_active ? "Ativo" : "Inativo"}</span><span className="rounded-full bg-[#edf3ff] px-2 py-0.5 text-[10px] font-bold text-[#0057e7]">{TYPE_LABELS[template.document_type] || template.document_type}</span></div><p className="mt-1 truncate text-xs text-[#5a6a82]">{template.description || "Sem descrição"}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#8b98aa]">{template.paper_size} · {template.orientation === "landscape" ? "Paisagem" : "Retrato"}</p></div>
            {hasPermission("documents.edit") && <button type="button" disabled={templateLoading} onClick={() => { void openTemplateEditor(template); }} className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#d8e0eb] bg-white px-3 py-2 text-xs font-bold text-[#42526a] hover:border-[#0057e7]/30 hover:text-[#0057e7] disabled:opacity-50"><Settings2 size={14} /> {templateLoading && editingTemplateId === template.id ? "Carregando..." : "Configurar"}</button>}
          </div>)}
        </div>}
      </section>

      {editorOpen && (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0d1b2e]/45 p-4">
          <div className="mx-auto max-w-6xl">
            <PrintTemplateEditor
              initialValue={editorValue}
              onCancel={() => {
                setEditorOpen(false);
                setEditingTemplateId(null);
                setEditorValue(emptyPrintTemplateEditorValue());
              }}
              onSaved={handleEditorSaved}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ size?: number }> }) {
  return <div className="rounded-xl border border-[#0d1b2e]/8 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-[#6b7a90]">{label}</span><div className="rounded-lg bg-[#edf3ff] p-2 text-[#0057e7]"><Icon size={16} /></div></div><div className="mt-2 text-2xl font-black text-[#0d1b2e]">{value}</div></div>;
}
