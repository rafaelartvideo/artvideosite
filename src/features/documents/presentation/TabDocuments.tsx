import React, { useEffect, useState } from "react";
import { FileText, Plus, Search, Settings2, Tag, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/shared/domain/formatters";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminCard, AdminCardToolbar, AdminPage, BtnPrimary, BtnSecondary, InternalBackButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { EmptyState, LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { PRINT_TEMPLATE_TYPE_LABELS } from "../domain/print-template";
import { useDocuments } from "../application/useDocuments";
import type { AttachmentTypeRecord } from "../infrastructure/documents.repository";
import { PrintTemplateEditor } from "./PrintTemplateEditor";

type DocumentsSection = "printing" | "attachments";

function DocumentsAreaHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h2 className="break-words text-lg font-black text-[#0d1b2e]">{title}</h2>
      <p className="mt-1 max-w-3xl break-words text-xs leading-relaxed text-[#5a6a82]">{description}</p>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>;
}

export function TabDocuments({ onBack, routeResourceId, routeSubpage, onRouteChange }: { onBack?: () => void; routeResourceId?: string | null; routeSubpage?: string | null; onRouteChange?: (resourceId: string | null, subpage?: string | null) => void }) {
  const { hasPermission } = useAuth();
  const canViewTable = hasPermission("documents.table.view");
  const canViewDetails = hasPermission("documents.details.view");
  const canCreate = hasPermission("documents.create");
  const canEdit = hasPermission("documents.edit");
  const canToggleActive = hasPermission("documents.toggle_active");
  const canCreateAttachment = hasPermission("documents.attachment_types.create");
  const canEditAttachment = hasPermission("documents.attachment_types.edit");
  const canDeleteAttachment = hasPermission("documents.attachment_types.delete");
  const showModel = hasPermission("documents.table.model");
  const showDocumentType = hasPermission("documents.table.document_type");
  const showPaper = hasPermission("documents.table.paper");
  const showStatus = hasPermission("documents.table.status");
  const showAttachmentType = hasPermission("documents.table.attachment_type");
  const showActions = hasPermission("documents.table.actions");
  const documents = useDocuments();
  const { templates, attachmentTypes, filteredTemplates, search, setSearch, loading, attachmentTypesLoading, error, attachmentError, editorOpen, editorValue, editingTemplateId, openingEditor, saving, savingAttachmentType, openNew, openEditor, closeEditor, save, toggleActive, saveAttachmentType, toggleAttachmentType, removeAttachmentType } = documents;
  const [section, setSection] = useState<DocumentsSection>(routeResourceId === "attachments" ? "attachments" : "printing");
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<AttachmentTypeRecord | null>(null);
  const [typeName, setTypeName] = useState("");
  const [typeMessage, setTypeMessage] = useState("");
  const [templatePage, setTemplatePage] = useState(1);
  const [templatePageSize, setTemplatePageSize] = useState(5);
  const [attachmentPage, setAttachmentPage] = useState(1);
  const [attachmentPageSize, setAttachmentPageSize] = useState(5);
  const errorMessage = error instanceof Error ? error.message : error ? String(error) : "";
  const attachmentErrorMessage = attachmentError instanceof Error ? attachmentError.message : attachmentError ? String(attachmentError) : "";
  const templateTotalPages = Math.max(1, Math.ceil(filteredTemplates.length / templatePageSize));
  const safeTemplatePage = Math.min(templatePage, templateTotalPages);
  const pagedTemplates = filteredTemplates.slice((safeTemplatePage - 1) * templatePageSize, safeTemplatePage * templatePageSize);
  const attachmentTotalPages = Math.max(1, Math.ceil(attachmentTypes.length / attachmentPageSize));
  const safeAttachmentPage = Math.min(attachmentPage, attachmentTotalPages);
  const pagedAttachmentTypes = attachmentTypes.slice((safeAttachmentPage - 1) * attachmentPageSize, safeAttachmentPage * attachmentPageSize);
  const editorRouteActive = Boolean(routeResourceId && routeResourceId !== "attachments");

  useEffect(() => { setTemplatePage(1); }, [search]);
  useEffect(() => { if (templatePage > templateTotalPages) setTemplatePage(templateTotalPages); }, [templatePage, templateTotalPages]);
  useEffect(() => { if (attachmentPage > attachmentTotalPages) setAttachmentPage(attachmentTotalPages); }, [attachmentPage, attachmentTotalPages]);
  useEffect(() => {
    if (routeResourceId === "attachments") { setSection("attachments"); if (editorOpen) closeEditor(); return; }
    setSection("printing");
    if (!routeResourceId) { if (editorOpen) closeEditor(); return; }
    if (routeResourceId === "new") { if (canCreate && !editorOpen) openNew(); return; }
    if (!canViewDetails || !canEdit || routeSubpage !== "edit" || editorOpen || openingEditor || editingTemplateId === routeResourceId) return;
    const template = templates.find(item => item.id === routeResourceId);
    if (template) openEditor(template);
    else if (!loading) onRouteChange?.(null, null);
  }, [routeResourceId, routeSubpage, templates, editorOpen, openingEditor, editingTemplateId, canViewDetails, canEdit, canCreate]);

  const selectSection = (next: DocumentsSection) => {
    setSection(next);
    closeEditor();
    onRouteChange?.(next === "attachments" ? "attachments" : null, null);
  };
  const openNewDocument = () => canCreate && (onRouteChange ? onRouteChange("new", null) : openNew());
  const openTemplateEditor = (template: (typeof templates)[number]) => {
    if (!(canViewDetails && canEdit)) return;
    if (onRouteChange) onRouteChange(template.id, "edit");
    else openEditor(template);
  };
  const closeDocumentEditor = () => {
    if (saving) return;
    closeEditor();
    onRouteChange?.(null, null);
  };
  const saveDocument = async (value: Parameters<typeof save>[0]) => {
    if (!canEdit && editorValue.id) return;
    if (!canCreate && !editorValue.id) return;
    await save(value);
    onRouteChange?.(null, null);
  };
  const openTypeModal = (type?: AttachmentTypeRecord) => {
    if (type ? !canEditAttachment : !canCreateAttachment) return;
    setEditingType(type || null);
    setTypeName(type?.name || "");
    setTypeMessage("");
    setTypeModalOpen(true);
  };
  const closeTypeModal = () => {
    if (savingAttachmentType) return;
    setTypeModalOpen(false);
    setEditingType(null);
    setTypeName("");
    setTypeMessage("");
  };
  const submitType = async () => {
    if (editingType ? !canEditAttachment : !canCreateAttachment) return;
    const name = typeName.trim();
    if (!name) { setTypeMessage("Informe o nome do tipo de anexo."); return; }
    try {
      await saveAttachmentType(name, editingType?.id);
      setTypeModalOpen(false);
      setEditingType(null);
      setTypeName("");
      setTypeMessage("");
    } catch (saveError) {
      setTypeMessage(saveError instanceof Error ? saveError.message : "Não foi possível salvar.");
    }
  };
  const deleteType = async (type: AttachmentTypeRecord) => {
    if (!canDeleteAttachment) return;
    if (!window.confirm(`Excluir o tipo de anexo “${type.name}”? Tipos já utilizados não podem ser excluídos.`)) return;
    try { await removeAttachmentType(type.id); }
    catch (deleteError) { setTypeMessage(deleteError instanceof Error ? deleteError.message : "Não foi possível excluir."); }
  };

  return <div className="min-w-0 space-y-5">
    {!editorRouteActive && <>
      <PageHeader
        title="Documentos"
        subtitle="Configure modelos de impressão e tipos de anexos das ordens de serviço."
        actions={onBack ? <InternalBackButton onBack={onBack} /> : undefined}
      />

      <div className="flex gap-1 border-b border-[#0d1b2e]/10">
        <button type="button" onClick={() => selectSection("printing")} className={cn("border-b-2 px-4 py-2.5 text-xs font-bold", section === "printing" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82]")}>Impressão</button>
        <button type="button" onClick={() => selectSection("attachments")} className={cn("border-b-2 px-4 py-2.5 text-xs font-bold", section === "attachments" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82]")}>Anexos</button>
      </div>

      {canViewTable && (section === "printing" ? <>
        <DocumentsAreaHeader
          title="Impressão"
          description="Crie e configure os modelos disponíveis no menu Imprimir dos detalhes da OS."
          action={canCreate ? <BtnPrimary onClick={openNewDocument}><Plus size={16} /> Novo modelo</BtnPrimary> : undefined}
        />
        <AdminCard>
          <AdminCardToolbar className="sm:justify-end">
            <div className="relative w-full sm:w-72">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b98aa]" />
              <input className={cn(INPUT, "pl-9")} value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar modelo..." />
            </div>
          </AdminCardToolbar>
          {errorMessage && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}
          {loading ? <div className="p-8"><LoadingState /></div> : filteredTemplates.length === 0 ? <div className="p-8"><EmptyState icon={FileText} title="Nenhum modelo configurado" /></div> : <>
            <div className="overflow-x-auto"><table className="min-w-[760px]"><thead><tr>{showModel && <th className="text-left">Modelo</th>}{showDocumentType && <th className="text-left">Tipo</th>}{showPaper && <th className="text-left">Papel</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedTemplates.map(template => <tr key={template.id}>{showModel && <td><p className="font-bold text-[#0d1b2e]">{template.name}</p><p className="text-xs text-[#5a6a82]">{template.description || "Sem descrição"}</p></td>}{showDocumentType && <td className="text-xs text-[#5a6a82]">{PRINT_TEMPLATE_TYPE_LABELS[template.document_type] || template.document_type}</td>}{showPaper && <td className="text-xs text-[#5a6a82]">{template.paper_size} · {template.orientation === "landscape" ? "Paisagem" : "Retrato"}</td>}{showStatus && <td><StatusBadge status={template.is_active ? "Ativo" : "Inativo"} /></td>}{showActions && <td><div className="flex items-center justify-end gap-1">{canViewDetails && canEdit && <AdminButton variant="secondary" size="sm" disabled={openingEditor} onClick={() => openTemplateEditor(template)}><Settings2 size={14} /> Configurar</AdminButton>}{canToggleActive && <AdminActiveStateButton active={template.is_active} entityLabel="modelo" onClick={() => void toggleActive(template)} />}</div></td>}</tr>)}</tbody></table></div>
            <PaginationBar page={safeTemplatePage} pageSize={templatePageSize} totalItems={filteredTemplates.length} onPageChange={setTemplatePage} onPageSizeChange={size => { setTemplatePageSize(size); setTemplatePage(1); }} />
          </>}
        </AdminCard>
      </> : <>
        <DocumentsAreaHeader
          title="Anexos"
          description="Cadastre os tipos exibidos ao adicionar arquivos aos documentos de uma OS."
          action={canCreateAttachment ? <BtnPrimary onClick={() => openTypeModal()}><Plus size={16} /> Novo tipo</BtnPrimary> : undefined}
        />
        <AdminCard>
          {attachmentErrorMessage && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{attachmentErrorMessage}</div>}
          {attachmentTypesLoading ? <div className="p-8"><LoadingState /></div> : attachmentTypes.length === 0 ? <div className="p-8"><EmptyState icon={Tag} title="Nenhum tipo de anexo" /></div> : <>
            <div className="overflow-x-auto"><table className="min-w-[620px]"><thead><tr>{showAttachmentType && <th className="text-left">Tipo de anexo</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedAttachmentTypes.map(type => <tr key={type.id}>{showAttachmentType && <td className="font-bold text-[#0d1b2e]">{type.name}</td>}{showStatus && <td><StatusBadge status={type.is_active ? "Ativo" : "Inativo"} /></td>}{showActions && <td><div className="flex items-center justify-end gap-1">{canEditAttachment && <AdminButton variant="secondary" size="sm" onClick={() => openTypeModal(type)}>Editar</AdminButton>}{canDeleteAttachment && <AdminButton variant="danger" size="sm" onClick={() => deleteType(type)}>Excluir</AdminButton>}{canEditAttachment && <AdminActiveStateButton active={type.is_active} entityLabel="tipo de anexo" onClick={() => void toggleAttachmentType(type.id, !type.is_active)} />}</div></td>}</tr>)}</tbody></table></div>
            <PaginationBar page={safeAttachmentPage} pageSize={attachmentPageSize} totalItems={attachmentTypes.length} onPageChange={setAttachmentPage} onPageSizeChange={size => { setAttachmentPageSize(size); setAttachmentPage(1); }} />
          </>}
        </AdminCard>
      </>)}
    </>}

    {editorRouteActive && !editorOpen && <AdminCard className="p-8"><LoadingState /></AdminCard>}
    {editorOpen && canViewDetails && <AdminPage open onClose={closeDocumentEditor} breadcrumb="Documentos > Impressão" title={editorValue.id ? "Configurar modelo" : "Novo modelo"} subtitle="Configure os dados e a apresentação do modelo de impressão" maxW="max-w-[1600px]" fullPage><PrintTemplateEditor key={editorValue.id || "new-document"} initialValue={editorValue} onCancel={closeDocumentEditor} onSave={saveDocument} saving={saving} saveError={errorMessage} /></AdminPage>}

    {typeModalOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4"><h2 className="text-lg font-black">{editingType ? "Editar tipo" : "Novo tipo"}</h2><button type="button" disabled={savingAttachmentType} onClick={closeTypeModal} className="cursor-default disabled:opacity-40"><X size={18} /></button></div>
        <div className="p-5"><input autoFocus disabled={savingAttachmentType} className={INPUT} value={typeName} onChange={event => setTypeName(event.target.value)} placeholder="Nome do tipo" />{typeMessage && <p className="mt-3 text-xs text-red-700">{typeMessage}</p>}</div>
        <div className="flex justify-end gap-2 border-t bg-[#f8fafc] px-5 py-4"><BtnSecondary onClick={closeTypeModal} disabled={savingAttachmentType}>Cancelar</BtnSecondary><BtnPrimary onClick={submitType} loading={savingAttachmentType} loadingText="Salvando...">Salvar</BtnPrimary></div>
      </div>
    </div>}
  </div>;
}