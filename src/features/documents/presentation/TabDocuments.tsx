import { systemErrorMessage } from "@/shared/domain/error-message";
import React, { useEffect, useState } from "react";
import { Edit2, FileText, Tag, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/shared/domain/formatters";
import { AdminSelect, FInput } from "@/shared/ui/admin/AdminFormControls";
import { DEFAULT_LABEL_LAYOUT, isValidOrderLabelLayout, readOrderLabelLayout, saveOrderLabelLayout, type OrderLabelLayout } from "@/features/orders/domain/order-label-print";
import { AdminCard, AdminDialog, AdminIconButton, AdminPage, AdminStickyToolbar, BtnPrimary, BtnSecondary, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminActiveStateButton } from "@/shared/ui/admin/AdminActiveStateButton";
import { EmptyState, LoadingState, StatusBadge, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { PRINT_TEMPLATE_TYPE_LABELS } from "../domain/print-template";
import { useDocuments } from "../application/useDocuments";
import type { AttachmentTypeRecord } from "../infrastructure/documents.repository";
import { PrintTemplateEditor } from "./PrintTemplateEditor";

type DocumentsSection = "printing" | "attachments" | "labels";

function DocumentsAreaHeader({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0">
      <h2 className="break-words text-lg font-black text-[#0d1b2e]">{title}</h2>
      <p className="mt-1 max-w-3xl break-words text-xs leading-relaxed text-[#5a6a82]">{description}</p>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>;
}


function OrderLabelPrintSettings({ canEdit }: { canEdit: boolean }) {
  const [layout, setLayout] = useState<OrderLabelLayout>(() => readOrderLabelLayout());
  const [error, setError] = useState("");
  const totalWidth = 3 * layout.width + 2 * layout.gap + 2 * layout.margin;
  const valid = isValidOrderLabelLayout(layout);

  const change = (key: keyof OrderLabelLayout, value: string) => {
    setError("");
    setLayout(current => ({ ...current, [key]: Number(value) }));
  };

  const saveSettings = () => {
    if (!valid) { setError("Confira as medidas. A largura total não pode ultrapassar 104 mm."); return; }
    try {
      saveOrderLabelLayout(layout);
      notifyAdmin("Configuração das etiquetas salva neste navegador.", "success");
    } catch (saveError) {
      setError(systemErrorMessage(saveError, "Não foi possível salvar as configurações das etiquetas."));
    }
  };

  return <AdminCard className="p-4 sm:p-5">
    <DocumentsAreaHeader title="Etiquetas de OS" description="Configure a Elgin BTP-L42(U). Os ajustes são usados automaticamente na impressão das OS neste navegador." />
    <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
      <FInput label="Largura da etiqueta (mm)" type="number" min="15" max="34" step=".5" disabled={!canEdit} value={layout.width} onChange={(event: React.ChangeEvent<HTMLInputElement>) => change("width", event.target.value)} />
      <FInput label="Altura da etiqueta (mm)" type="number" min="15" max="80" step=".5" disabled={!canEdit} value={layout.height} onChange={(event: React.ChangeEvent<HTMLInputElement>) => change("height", event.target.value)} />
      <FInput label="Espaço entre etiquetas (mm)" type="number" min="0" max="10" step=".5" disabled={!canEdit} value={layout.gap} onChange={(event: React.ChangeEvent<HTMLInputElement>) => change("gap", event.target.value)} />
      <FInput label="Margem lateral (mm)" type="number" min="0" max="5" step=".5" disabled={!canEdit} value={layout.margin} onChange={(event: React.ChangeEvent<HTMLInputElement>) => change("margin", event.target.value)} />
      <FInput label="Posição vertical (mm)" hint="Negativo sobe; positivo desce." type="number" min="-5" max="5" step=".5" disabled={!canEdit} value={layout.verticalOffset} onChange={(event: React.ChangeEvent<HTMLInputElement>) => change("verticalOffset", event.target.value)} />
      <div className="min-w-0">
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Etiquetas por fileira</label>
        <AdminSelect value={String(layout.quantity)} disabled={!canEdit} onValueChange={value => change("quantity", value)} options={[{ value: "3", label: "3 etiquetas" }, { value: "2", label: "2 etiquetas" }, { value: "1", label: "1 etiqueta" }]} />
      </div>
    </div>
    <p className="mt-4 text-xs text-muted-foreground">
      Papel: {Number.isFinite(totalWidth) ? totalWidth.toLocaleString("pt-BR") : "—"} × {layout.height} mm. No Brave, selecione a BTP-L42(U), escala 100%, sem margens e papel personalizado correspondente.
    </p>
    <div className="mt-3 overflow-x-auto rounded-lg border border-border bg-muted/30 p-3">
      <div className="mx-auto flex shrink-0 items-start bg-white text-black" style={{ width: `${totalWidth}mm`, height: `${layout.height}mm`, gap: `${layout.gap}mm`, paddingInline: `${layout.margin}mm`, boxSizing: "border-box" }}>
        {Array.from({ length: 3 }, (_, index) => <div key={index} className="flex shrink-0 flex-col items-center justify-center overflow-hidden border border-dashed border-slate-300" style={{ width: `${layout.width}mm`, height: `${layout.height}mm`, padding: "1mm", boxSizing: "border-box" }}>
          {index < layout.quantity && <div className="flex w-full flex-col items-center justify-center overflow-hidden text-center" style={{ gap: "1mm", transform: `translateY(${layout.verticalOffset}mm)` }}>
            <strong className="block max-w-full whitespace-nowrap" style={{ fontSize: "17pt", fontWeight: 900, lineHeight: 1.08 }}>OS 116</strong>
            <span className="block max-w-full whitespace-nowrap" style={{ fontSize: "9pt", fontWeight: 700, lineHeight: 1.15 }}>OS externa 000</span>
          </div>}
        </div>)}
      </div>
    </div>
    {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
    {canEdit && <div className="mt-4 flex justify-end gap-2">
      <BtnSecondary onClick={() => { setLayout({ ...DEFAULT_LABEL_LAYOUT }); setError(""); }}>Restaurar padrão</BtnSecondary>
      <BtnPrimary onClick={saveSettings} disabled={!valid}>Salvar</BtnPrimary>
    </div>}
    <p className="mt-2 text-[11px] text-muted-foreground">As alterações são salvas apenas ao clicar em Salvar e se aplicam neste navegador.</p>
  </AdminCard>;
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
  const { templates, attachmentTypes, filteredTemplates, loading, attachmentTypesLoading, error, attachmentError, editorOpen, editorValue, editingTemplateId, openingEditor, saving, savingAttachmentType, openNew, openEditor, closeEditor, save, toggleActive, saveAttachmentType, toggleAttachmentType, removeAttachmentType } = documents;
  const [section, setSection] = useState<DocumentsSection>(routeResourceId === "attachments" ? "attachments" : routeResourceId === "labels" ? "labels" : "printing");
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingType, setEditingType] = useState<AttachmentTypeRecord | null>(null);
  const [typeName, setTypeName] = useState("");
  const [typeNameError, setTypeNameError] = useState("");
  const [templatePage, setTemplatePage] = useState(1);
  const [templatePageSize, setTemplatePageSize] = useState(5);
  const [attachmentPage, setAttachmentPage] = useState(1);
  const [attachmentPageSize, setAttachmentPageSize] = useState(5);
  const errorMessage = error ? systemErrorMessage(error) : "";
  const attachmentErrorMessage = attachmentError ? systemErrorMessage(attachmentError) : "";
  const sortedTemplates = [...filteredTemplates].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  const sortedAttachmentTypes = [...attachmentTypes].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
  const templateTotalPages = Math.max(1, Math.ceil(sortedTemplates.length / templatePageSize));
  const safeTemplatePage = Math.min(templatePage, templateTotalPages);
  const pagedTemplates = sortedTemplates.slice((safeTemplatePage - 1) * templatePageSize, safeTemplatePage * templatePageSize);
  const attachmentTotalPages = Math.max(1, Math.ceil(sortedAttachmentTypes.length / attachmentPageSize));
  const safeAttachmentPage = Math.min(attachmentPage, attachmentTotalPages);
  const pagedAttachmentTypes = sortedAttachmentTypes.slice((safeAttachmentPage - 1) * attachmentPageSize, safeAttachmentPage * attachmentPageSize);
  const editorRouteActive = Boolean(routeResourceId && !["attachments", "labels"].includes(routeResourceId));

  useEffect(() => { if (templatePage > templateTotalPages) setTemplatePage(templateTotalPages); }, [templatePage, templateTotalPages]);
  useEffect(() => { if (attachmentPage > attachmentTotalPages) setAttachmentPage(attachmentTotalPages); }, [attachmentPage, attachmentTotalPages]);
  useEffect(() => {
    if (routeResourceId === "attachments" || routeResourceId === "labels") { setSection(routeResourceId); if (editorOpen) closeEditor(); return; }
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
    onRouteChange?.(next === "printing" ? null : next, null);
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
    setTypeNameError("");
    setTypeModalOpen(true);
  };
  const closeTypeModal = () => {
    if (savingAttachmentType) return;
    setTypeModalOpen(false);
    setEditingType(null);
    setTypeName("");
    setTypeNameError("");
  };
  const submitType = async () => {
    if (editingType ? !canEditAttachment : !canCreateAttachment) return;
    const name = typeName.trim();
    if (!name) { setTypeNameError("Informe o nome do tipo de anexo."); return; }
    try {
      await saveAttachmentType(name, editingType?.id);
      setTypeModalOpen(false);
      setEditingType(null);
      setTypeName("");
      setTypeNameError("");
    } catch (saveError) {
      notifyAdmin(systemErrorMessage(saveError, "Não foi possível salvar."), "error");
    }
  };
  const deleteType = async (type: AttachmentTypeRecord) => {
    if (!canDeleteAttachment) return;
    if (!window.confirm(`Excluir o tipo de anexo “${type.name}”? Tipos já utilizados não podem ser excluídos.`)) return;
    try { await removeAttachmentType(type.id); }
    catch (deleteError) { notifyAdmin(systemErrorMessage(deleteError, "Não foi possível excluir."), "error"); }
  };

  return <div className="min-w-0 space-y-5">
    {!editorRouteActive && <>
      <PageHeader
        title="Documentos"
        subtitle="Configure anexos, etiquetas e modelos de impressão das ordens de serviço."
      />

      <div className="flex gap-1 border-b border-[#0d1b2e]/10">
        {([
          ["attachments", "Anexos"],
          ["labels", "Etiquetas"],
          ["printing", "Impressão"],
        ] as const).map(([value, title]) => <button key={value} type="button"
          onClick={() => selectSection(value)}
          className={cn("border-b-2 px-4 py-2.5 text-xs font-bold", section === value
            ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82]")}>{title}</button>)}
      </div>

      {canViewTable && (section === "printing" ? <>
        <DocumentsAreaHeader
          title="Impressão"
          description="Crie e configure os modelos disponíveis no menu Imprimir dos detalhes da OS."
        />
        <AdminCard>
          {errorMessage && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</div>}
          {loading ? <div className="p-8"><LoadingState /></div> : filteredTemplates.length === 0 ? <div className="p-8"><EmptyState icon={FileText} title="Nenhum modelo configurado" /></div> : <>
            <div className="overflow-x-auto"><table className="min-w-[760px]"><thead><tr>{showModel && <th className="text-left">Modelo</th>}{showDocumentType && <th className="text-left">Tipo</th>}{showPaper && <th className="text-left">Papel</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedTemplates.map(template => <tr key={template.id}>{showModel && <td><p className="font-bold text-[#0d1b2e]">{template.name}</p><p className="text-xs text-[#5a6a82]">{template.description || "Sem descrição"}</p></td>}{showDocumentType && <td className="text-xs text-[#5a6a82]">{PRINT_TEMPLATE_TYPE_LABELS[template.document_type] || template.document_type}</td>}{showPaper && <td className="text-xs text-[#5a6a82]">{template.paper_size} · {template.orientation === "landscape" ? "Paisagem" : "Retrato"}</td>}{showStatus && <td><StatusBadge status={template.is_active ? "Ativo" : "Inativo"} /></td>}{showActions && <td><div className="flex items-center justify-end gap-1">{canViewDetails && canEdit && <AdminIconButton ariaLabel="Editar modelo" title="Editar" disabled={openingEditor} onClick={() => openTemplateEditor(template)}><Edit2 size={14} /></AdminIconButton>}{canToggleActive && <AdminActiveStateButton active={template.is_active} entityLabel="modelo" onClick={() => void toggleActive(template)} />}</div></td>}</tr>)}</tbody></table></div>
            <PaginationBar page={safeTemplatePage} pageSize={templatePageSize} totalItems={filteredTemplates.length} onPageChange={setTemplatePage} onPageSizeChange={size => { setTemplatePageSize(size); setTemplatePage(1); }} />
          </>}
        </AdminCard>
      </> : section === "labels" ? <OrderLabelPrintSettings canEdit={canEdit} /> : <>
        <DocumentsAreaHeader
          title="Anexos"
          description="Cadastre os tipos exibidos ao adicionar arquivos aos documentos de uma OS."
        />
        <AdminCard>
          {attachmentErrorMessage && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{attachmentErrorMessage}</div>}
          {attachmentTypesLoading ? <div className="p-8"><LoadingState /></div> : attachmentTypes.length === 0 ? <div className="p-8"><EmptyState icon={Tag} title="Nenhum tipo de anexo" /></div> : <>
            <div className="overflow-x-auto"><table className="min-w-[620px]"><thead><tr>{showAttachmentType && <th className="text-left">Tipo de anexo</th>}{showStatus && <th className="text-left">Status</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{pagedAttachmentTypes.map(type => <tr key={type.id}>{showAttachmentType && <td className="font-bold text-[#0d1b2e]">{type.name}</td>}{showStatus && <td><StatusBadge status={type.is_active ? "Ativo" : "Inativo"} /></td>}{showActions && <td><div className="flex items-center justify-end gap-1">{canEditAttachment && <AdminIconButton ariaLabel="Editar tipo de anexo" title="Editar" onClick={() => openTypeModal(type)}><Edit2 size={14} /></AdminIconButton>}{canDeleteAttachment && <AdminIconButton ariaLabel="Excluir tipo de anexo" title="Excluir" variant="danger" onClick={() => deleteType(type)}><Trash2 size={14} /></AdminIconButton>}{canEditAttachment && <AdminActiveStateButton active={type.is_active} entityLabel="tipo de anexo" onClick={() => void toggleAttachmentType(type.id, !type.is_active)} />}</div></td>}</tr>)}</tbody></table></div>
            <PaginationBar page={safeAttachmentPage} pageSize={attachmentPageSize} totalItems={attachmentTypes.length} onPageChange={setAttachmentPage} onPageSizeChange={size => { setAttachmentPageSize(size); setAttachmentPage(1); }} />
          </>}
        </AdminCard>
      </>)}
      <AdminStickyToolbar>
        {onBack && <BtnSecondary onClick={onBack}>Voltar</BtnSecondary>}
        {section === "printing" ? canCreate && <BtnPrimary onClick={openNewDocument}>Novo</BtnPrimary>
          : section === "attachments" ? canCreateAttachment && <BtnPrimary onClick={() => openTypeModal()}>Novo</BtnPrimary> : null}
      </AdminStickyToolbar>
    </>}

    {editorRouteActive && !editorOpen && <AdminCard className="p-8"><LoadingState /></AdminCard>}
    {editorOpen && canViewDetails && <AdminPage open onClose={closeDocumentEditor} breadcrumb="Documentos > Impressão" title={editorValue.id ? "Configurar modelo" : "Novo modelo"} subtitle="Configure os dados e a apresentação do modelo de impressão" maxW="max-w-[1600px]" fullPage><PrintTemplateEditor key={editorValue.id || "new-document"} initialValue={editorValue} onCancel={closeDocumentEditor} onSave={saveDocument} saving={saving} saveError={errorMessage} /></AdminPage>}

    {typeModalOpen && <AdminDialog
      open
      onClose={closeTypeModal}
      title={editingType ? "Editar tipo" : "Novo tipo"}
      className="max-w-md"
      footer={<div className="flex justify-end gap-2"><BtnSecondary onClick={closeTypeModal} disabled={savingAttachmentType}>Cancelar</BtnSecondary><BtnPrimary onClick={submitType} loading={savingAttachmentType} loadingText="Salvando...">Salvar</BtnPrimary></div>}
    >
      <FInput label="Nome do tipo" required disabled={savingAttachmentType} error={typeNameError} value={typeName} onChange={(event: any) => { setTypeNameError(""); setTypeName(event.target.value); }} placeholder="Nome do tipo" />
    </AdminDialog>}
  </div>;
}