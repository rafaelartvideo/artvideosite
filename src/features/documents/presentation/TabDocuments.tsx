import React, { useEffect, useState } from "react";
import {
  FileText,
  Paperclip,
  Plus,
  Search,
  Settings2,
  Tag,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/shared/domain/formatters";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import {
  AdminButton,
  AdminCard,
  AdminCardHeader,
  AdminCardToolbar,
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  InternalBackButton,
  PageHeader,
} from "@/shared/ui/admin/AdminLayout";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { PRINT_TEMPLATE_TYPE_LABELS } from "../domain/print-template";
import { useDocuments } from "../application/useDocuments";
import type { AttachmentTypeRecord } from "../infrastructure/documents.repository";
import { PrintTemplateEditor } from "./PrintTemplateEditor";

type DocumentsSection = "printing" | "attachments";

export function TabDocuments({
  onBack,
  routeResourceId,
  routeSubpage,
  onRouteChange,
}: {
  onBack?: () => void;
  routeResourceId?: string | null;
  routeSubpage?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
}) {
  const { hasPermission } = useAuth();
  const documents = useDocuments();
  const {
    templates, attachmentTypes, filteredTemplates, search, setSearch, loading,
    attachmentTypesLoading, error, attachmentError, editorOpen, editorValue,
    editingTemplateId, openingEditor, saving, savingAttachmentType, openNew,
    openEditor, closeEditor, save, toggleActive, saveAttachmentType,
    toggleAttachmentType, removeAttachmentType,
  } = documents;
  const [section, setSection] = useState<DocumentsSection>(
    routeResourceId === "attachments" ? "attachments" : "printing",
  );
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<AttachmentTypeRecord | null>(null);
  const [typeName, setTypeName] = useState("");
  const [typeMessage, setTypeMessage] = useState("");
  const errorMessage = error instanceof Error ? error.message : error ? String(error) : "";
  const attachmentErrorMessage = attachmentError instanceof Error
    ? attachmentError.message
    : attachmentError ? String(attachmentError) : "";

  useEffect(() => {
    if (routeResourceId === "attachments") {
      setSection("attachments");
      if (editorOpen) closeEditor();
      return;
    }
    setSection("printing");
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

  const selectSection = (next: DocumentsSection) => {
    setSection(next);
    closeEditor();
    onRouteChange?.(next === "attachments" ? "attachments" : null, null);
  };
  const openNewDocument = () => onRouteChange ? onRouteChange("new", null) : openNew();
  const openTemplateEditor = (template: (typeof templates)[number]) =>
    onRouteChange ? onRouteChange(template.id, "edit") : openEditor(template);
  const closeDocumentEditor = () => {
    closeEditor();
    onRouteChange?.(null, null);
  };
  const saveDocument = async (value: Parameters<typeof save>[0]) => {
    await save(value);
    onRouteChange?.(null, null);
  };

  const openTypeModal = (type?: AttachmentTypeRecord) => {
    setEditingType(type || null);
    setTypeName(type?.name || "");
    setTypeMessage("");
    setTypeModalOpen(true);
  };
  const closeTypeModal = () => {
    setTypeModalOpen(false);
    setEditingType(null);
    setTypeName("");
    setTypeMessage("");
  };
  const submitType = async () => {
    const name = typeName.trim();
    if (!name) {
      setTypeMessage("Informe o nome do tipo de anexo.");
      return;
    }
    try {
      await saveAttachmentType(name, editingType?.id);
      closeTypeModal();
    } catch (saveError) {
      setTypeMessage(saveError instanceof Error ? saveError.message : "Não foi possível salvar.");
    }
  };
  const deleteType = async (type: AttachmentTypeRecord) => {
    if (!window.confirm(`Excluir o tipo de anexo “${type.name}”? Tipos já utilizados não podem ser excluídos.`)) return;
    try {
      await removeAttachmentType(type.id);
    } catch (deleteError) {
      setTypeMessage(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir.");
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operação"
        title="Documentos"
        subtitle="Configure impressões e os tipos de arquivos anexados às ordens de serviço."
        actions={onBack ? <InternalBackButton onBack={onBack} /> : undefined}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <AdminCard className={cn("transition-all", section === "printing" ? "border-[#0057e7] bg-[#f4f8ff] ring-2 ring-[#0057e7]/10" : "hover:border-[#0057e7]/35")}>
          <button type="button" onClick={() => selectSection("printing")} className="w-full p-4 text-left">
            <span className="flex items-center justify-between"><span className="flex items-center gap-3"><span className="rounded-lg bg-[#edf3ff] p-2 text-[#0057e7]"><FileText size={18} /></span><span><strong className="block text-sm text-[#0d1b2e]">Impressão</strong><small className="text-xs text-[#5a6a82]">Modelos e campos para impressão</small></span></span><span className="text-xl font-black text-[#0d1b2e]">{templates.length}</span></span>
          </button>
        </AdminCard>
        <AdminCard className={cn("transition-all", section === "attachments" ? "border-[#0057e7] bg-[#f4f8ff] ring-2 ring-[#0057e7]/10" : "hover:border-[#0057e7]/35")}>
          <button type="button" onClick={() => selectSection("attachments")} className="w-full p-4 text-left">
            <span className="flex items-center justify-between"><span className="flex items-center gap-3"><span className="rounded-lg bg-[#edf3ff] p-2 text-[#0057e7]"><Paperclip size={18} /></span><span><strong className="block text-sm text-[#0d1b2e]">Anexos</strong><small className="text-xs text-[#5a6a82]">Tipos disponíveis nas OS</small></span></span><span className="text-xl font-black text-[#0d1b2e]">{attachmentTypes.length}</span></span>
          </button>
        </AdminCard>
      </div>

      {section === "printing" ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[10px] font-black uppercase tracking-widest text-[#0057e7]">Documentos</p><h2 className="text-lg font-black text-[#0d1b2e]">Impressão</h2></div>
            {hasPermission("documents.create") && <BtnPrimary onClick={openNewDocument}><Plus size={16} /> Novo modelo</BtnPrimary>}
          </div>
          <AdminCard>
            <AdminCardToolbar className="sm:justify-between">
              <div><h3 className="font-black text-[#0d1b2e]">Modelos de impressão</h3><p className="text-xs text-[#5a6a82]">Modelos ativos aparecem no menu Imprimir dos detalhes da OS.</p></div>
              <div className="relative w-full sm:w-72"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b98aa]" /><input className={cn(INPUT, "pl-9")} value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar modelo..." /></div>
            </AdminCardToolbar>
            {errorMessage && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}
            {loading ? <div className="p-8"><LoadingState /></div> : filteredTemplates.length === 0 ? <div className="p-8"><EmptyState icon={FileText} title={templates.length ? "Nenhum modelo encontrado" : "Nenhum documento configurado"} message={templates.length ? "Tente alterar a busca." : "Crie o primeiro modelo para configurar suas impressões."} /></div> : <div className="divide-y divide-[#0d1b2e]/7">
              {filteredTemplates.map(template => <div key={template.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-black text-[#0d1b2e]">{template.name}</span><span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", template.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>{template.is_active ? "Ativo" : "Inativo"}</span><span className="rounded-full bg-[#edf3ff] px-2 py-0.5 text-[10px] font-bold text-[#0057e7]">{PRINT_TEMPLATE_TYPE_LABELS[template.document_type] || template.document_type}</span></div><p className="mt-1 truncate text-xs text-[#5a6a82]">{template.description || "Sem descrição"}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#8b98aa]">{template.paper_size} · {template.orientation === "landscape" ? "Paisagem" : "Retrato"}</p></div>
                <div className="flex flex-wrap items-center gap-2">
                  {hasPermission("documents.toggle_active") && <AdminButton variant="secondary" size="sm" onClick={() => toggleActive(template)}>{template.is_active ? "Desativar" : "Ativar"}</AdminButton>}
                  {hasPermission("documents.edit") && <AdminButton variant="secondary" size="sm" disabled={openingEditor} onClick={() => openTemplateEditor(template)}><Settings2 size={14} /> {openingEditor && editingTemplateId === template.id ? "Carregando..." : "Configurar"}</AdminButton>}
                </div>
              </div>)}
            </div>}
          </AdminCard>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="text-[10px] font-black uppercase tracking-widest text-[#0057e7]">Documentos</p><h2 className="text-lg font-black text-[#0d1b2e]">Anexos</h2><p className="text-xs text-[#5a6a82]">Cadastre os tipos exibidos no dropdown ao anexar arquivos em uma OS.</p></div>
            {hasPermission("documents.attachment_types.create") && <BtnPrimary onClick={() => openTypeModal()}><Plus size={16} /> Novo tipo</BtnPrimary>}
          </div>
          <AdminCard>
            <AdminCardHeader><div><h3 className="font-black text-[#0d1b2e]">Tipos de anexo</h3><p className="text-xs text-[#5a6a82]">O cadastro solicita somente o nome.</p></div></AdminCardHeader>
            {attachmentErrorMessage && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{attachmentErrorMessage}</div>}
            {attachmentTypesLoading ? <div className="p-8"><LoadingState /></div> : attachmentTypes.length === 0 ? <div className="p-8"><EmptyState icon={Tag} title="Nenhum tipo de anexo" message="Cadastre o primeiro tipo para liberar anexos classificados nas ordens de serviço." onAdd={hasPermission("documents.attachment_types.create") ? () => openTypeModal() : undefined} addLabel="Novo tipo" /></div> : <div className="divide-y divide-[#0d1b2e]/7">
              {attachmentTypes.map(type => <div key={type.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3"><span className="rounded-lg bg-[#edf3ff] p-2 text-[#0057e7]"><Paperclip size={16} /></span><div><p className="text-sm font-black text-[#0d1b2e]">{type.name}</p><span className={cn("text-[10px] font-bold uppercase", type.is_active ? "text-emerald-700" : "text-slate-500")}>{type.is_active ? "Ativo" : "Inativo"}</span></div></div>
                <div className="flex items-center gap-2">
                  {hasPermission("documents.attachment_types.edit") && <AdminButton variant="secondary" size="sm" onClick={() => void toggleAttachmentType(type.id, !type.is_active)}>{type.is_active ? "Desativar" : "Ativar"}</AdminButton>}
                  {hasPermission("documents.attachment_types.edit") && <AdminButton variant="secondary" size="sm" onClick={() => openTypeModal(type)}>Editar</AdminButton>}
                  {hasPermission("documents.attachment_types.delete") && <AdminButton variant="danger" size="sm" onClick={() => void deleteType(type)}>Excluir</AdminButton>}
                </div>
              </div>)}
            </div>}
          </AdminCard>
        </>
      )}

      {editorOpen && (
        <AdminPage open onClose={closeDocumentEditor} breadcrumb="Documentos > Impressão" title={editorValue.id ? "Configurar documento" : "Novo documento"} subtitle="Editor de modelos de impressão" maxW="max-w-[1600px]" fullPage>
          <PrintTemplateEditor key={editorValue.id || "new-document"} initialValue={editorValue} onCancel={closeDocumentEditor} onSave={saveDocument} saving={saving} saveError={errorMessage} />
        </AdminPage>
      )}

      {typeModalOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true" aria-label={editingType ? "Editar tipo de anexo" : "Novo tipo de anexo"}>
        <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#0d1b2e]/10 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-[#0057e7]">Documentos · Anexos</p><h2 className="text-lg font-black text-[#0d1b2e]">{editingType ? "Editar tipo" : "Novo tipo"}</h2></div><button type="button" onClick={closeTypeModal} className="rounded-lg p-2 text-[#5a6a82] hover:bg-[#f5f7fa]"><X size={18} /></button></div>
          <div className="p-5"><label className="block"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-[#5a6a82]">Nome</span><input autoFocus className={INPUT} value={typeName} onChange={event => setTypeName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void submitType(); }} placeholder="Ex.: Nota fiscal, Laudo técnico..." /></label>{typeMessage && <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{typeMessage}</p>}</div>
          <div className="flex justify-end gap-2 border-t border-[#0d1b2e]/10 bg-[#f8fafc] px-5 py-4"><BtnSecondary onClick={closeTypeModal}>Cancelar</BtnSecondary><BtnPrimary onClick={() => void submitType()} disabled={savingAttachmentType}>{savingAttachmentType ? "Salvando..." : "Salvar"}</BtnPrimary></div>
        </div>
      </div>}
    </div>
  );
}
