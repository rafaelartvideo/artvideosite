import React, { useEffect } from "react";
import { Check, FileText, Plus, Search, Settings2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/shared/domain/formatters";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminPage, BtnPrimary, InternalBackButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { PRINT_TEMPLATE_TYPE_LABELS } from "../domain/print-template";
import { useDocuments } from "../application/useDocuments";
import {
  PrintTemplateEditor,
} from "./PrintTemplateEditor";

export function TabDocuments({ onBack, routeResourceId, routeSubpage, onRouteChange }: { onBack?: () => void; routeResourceId?: string | null; routeSubpage?: string | null; onRouteChange?: (resourceId: string | null, subpage?: string | null) => void }) {
  const { hasPermission } = useAuth();
  const documents = useDocuments();
  const {
    templates, filteredTemplates, search, setSearch, loading, error,
    editorOpen, editorValue, editingTemplateId, openingEditor,
    saving, openNew, openEditor, closeEditor, save, toggleActive,
  } = documents;
  const errorMessage = error instanceof Error ? error.message : error ? String(error) : "";
  useEffect(() => {
    if (!routeResourceId) {
      if (editorOpen) closeEditor();
      return;
    }
    if (routeResourceId === "new") {
      if (!editorOpen) openNew();
      return;
    }
    if (routeSubpage !== "edit" || editorOpen || openingEditor || editingTemplateId === routeResourceId) return;
    const template = templates.find(item => item.id === routeResourceId);
    if (template) openEditor(template);
    else if (!loading) onRouteChange?.(null, null);
  }, [routeResourceId, routeSubpage, templates, editorOpen, openingEditor, editingTemplateId]);

  const openNewDocument = () => onRouteChange ? onRouteChange("new", null) : openNew();
  const openTemplateEditor = (template: (typeof templates)[number]) => onRouteChange ? onRouteChange(template.id, "edit") : openEditor(template);
  const closeDocumentEditor = () => {
    closeEditor();
    onRouteChange?.(null, null);
  };
  const saveDocument = async (value: Parameters<typeof save>[0]) => {
    await save(value);
    onRouteChange?.(null, null);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operação"
        title="Documentos"
        subtitle="Crie modelos reutilizáveis e escolha quais informações da OS serão impressas e como serão organizadas."
        actions={<div className="flex flex-wrap items-center gap-2">
          {onBack && <InternalBackButton onBack={onBack} />}
          {hasPermission("documents.create") && <BtnPrimary onClick={openNewDocument}><Plus size={16} /> Novo documento</BtnPrimary>}
        </div>}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Metric label="Modelos" value={templates.length} icon={FileText} />
        <Metric label="Ativos" value={templates.filter(item => item.is_active).length} icon={Check} />
      </div>

      <section className="rounded-xl border border-[#0d1b2e]/10 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#0d1b2e]/8 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-black text-[#0d1b2e]">Modelos de impressão</h2><p className="text-xs text-[#5a6a82]">Modelos ativos aparecem no menu Imprimir dos detalhes da OS.</p></div>
          <div className="relative w-full sm:w-72"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b98aa]" /><input className={cn(INPUT, "pl-9")} value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar modelo..." /></div>
        </div>
        {errorMessage && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}
        {loading ? <div className="p-8"><LoadingState /></div> : filteredTemplates.length === 0 ? <div className="p-8"><EmptyState icon={FileText} title={templates.length ? "Nenhum modelo encontrado" : "Nenhum documento configurado"} message={templates.length ? "Tente alterar a busca." : "Crie o primeiro modelo para começar a configurar suas impressões."} /></div> : <div className="divide-y divide-[#0d1b2e]/7">
          {filteredTemplates.map(template => <div key={template.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-black text-[#0d1b2e]">{template.name}</span><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", template.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{template.is_active ? "Ativo" : "Inativo"}</span><span className="rounded-full bg-[#edf3ff] px-2 py-0.5 text-[10px] font-bold text-[#0057e7]">{PRINT_TEMPLATE_TYPE_LABELS[template.document_type] || template.document_type}</span></div><p className="mt-1 truncate text-xs text-[#5a6a82]">{template.description || "Sem descrição"}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#8b98aa]">{template.paper_size} · {template.orientation === "landscape" ? "Paisagem" : "Retrato"}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              {hasPermission("documents.toggle_active") && <AdminButton variant="secondary" size="sm" onClick={() => toggleActive(template)}>{template.is_active ? "Desativar" : "Ativar"}</AdminButton>}
              {hasPermission("documents.edit") && <AdminButton variant="secondary" size="sm" disabled={openingEditor} onClick={() => openTemplateEditor(template)}><Settings2 size={14} /> {openingEditor && editingTemplateId === template.id ? "Carregando..." : "Configurar"}</AdminButton>}
            </div>
          </div>)}
        </div>}
      </section>

      {editorOpen && (
        <AdminPage
          open
          onClose={closeDocumentEditor}
          breadcrumb="Documentos"
          title={editorValue.id ? "Configurar documento" : "Novo documento"}
          subtitle="Editor de modelos de impressão"
          maxW="max-w-[1600px]"
          fullPage
        >
          <PrintTemplateEditor
            key={editorValue.id || "new-document"}
            initialValue={editorValue}
            onCancel={closeDocumentEditor}
            onSave={saveDocument}
            saving={saving}
            saveError={errorMessage}
          />
        </AdminPage>
      )}    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: React.ComponentType<{ size?: number }> }) {
  return <div className="rounded-xl border border-[#0d1b2e]/8 bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-[#6b7a90]">{label}</span><div className="rounded-lg bg-[#edf3ff] p-2 text-[#0057e7]"><Icon size={16} /></div></div><div className="mt-2 text-2xl font-black text-[#0d1b2e]">{value}</div></div>;
}
