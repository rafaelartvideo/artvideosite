import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  createAttachmentType,
  deleteAttachmentType,
  listAttachmentTypes,
  listPrintTemplates,
  loadPrintTemplateEditorValue,
  savePrintTemplate,
  setAttachmentTypeActive,
  setPrintTemplateActive,
  updateAttachmentType,
} from "../infrastructure/documents.repository";
import {
  emptyPrintTemplateEditorValue,
  PRINT_TEMPLATE_TYPE_LABELS,
  type PrintTemplate,
  type PrintTemplateEditorValue,
} from "../domain/print-template";

export function useDocuments() {
  const { activeOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editorValue, setEditorValue] = useState<PrintTemplateEditorValue>(emptyPrintTemplateEditorValue);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const organizationKey = activeOrganizationId || "none";

  const templatesQuery = useQuery({
    queryKey: ["documents", organizationKey, "print-templates"],
    enabled: Boolean(activeOrganizationId),
    queryFn: async () => {
      const { data, error } = await listPrintTemplates();
      if (error) throw error;
      return data || [];
    },
  });

  const attachmentTypesQuery = useQuery({
    queryKey: ["documents", organizationKey, "attachment-types"],
    enabled: Boolean(activeOrganizationId),
    queryFn: async () => {
      const { data, error } = await listAttachmentTypes();
      if (error) throw error;
      return data || [];
    },
  });

  const openEditorMutation = useMutation({
    mutationFn: loadPrintTemplateEditorValue,
    onMutate: template => setEditingTemplateId(template.id),
    onSuccess: value => { setEditorValue(value); setEditorOpen(true); },
    onSettled: () => setEditingTemplateId(null),
  });

  const invalidateDocumentQueries = () => queryClient.invalidateQueries({ queryKey: ["documents", organizationKey] });

  const saveMutation = useMutation({
    mutationFn: savePrintTemplate,
    onSuccess: async () => { await invalidateDocumentQueries(); closeEditor(); },
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setPrintTemplateActive(id, active),
    onSuccess: invalidateDocumentQueries,
  });

  const attachmentMutation = useMutation({
    mutationFn: ({ id, name }: { id?: string; name: string }) => id ? updateAttachmentType(id, name) : createAttachmentType(name),
    onSuccess: invalidateDocumentQueries,
  });

  const attachmentActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setAttachmentTypeActive(id, active),
    onSuccess: invalidateDocumentQueries,
  });

  const attachmentDeleteMutation = useMutation({
    mutationFn: deleteAttachmentType,
    onSuccess: invalidateDocumentQueries,
  });

  const templates = templatesQuery.data || [];
  const attachmentTypes = attachmentTypesQuery.data || [];
  const filteredTemplates = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return templates;
    return templates.filter((template: PrintTemplate) =>
      template.name.toLocaleLowerCase("pt-BR").includes(term)
      || (template.description || "").toLocaleLowerCase("pt-BR").includes(term)
      || (PRINT_TEMPLATE_TYPE_LABELS[template.document_type] || template.document_type).toLocaleLowerCase("pt-BR").includes(term),
    );
  }, [templates, search]);

  function openNew() { setEditorValue(emptyPrintTemplateEditorValue()); setEditorOpen(true); }
  function closeEditor() { setEditorOpen(false); setEditingTemplateId(null); setEditorValue(emptyPrintTemplateEditorValue()); }

  return {
    templates,
    attachmentTypes,
    filteredTemplates,
    search,
    setSearch,
    loading: templatesQuery.isLoading,
    attachmentTypesLoading: attachmentTypesQuery.isLoading,
    error: templatesQuery.error || openEditorMutation.error || saveMutation.error || activeMutation.error,
    attachmentError: attachmentTypesQuery.error || attachmentMutation.error || attachmentActiveMutation.error || attachmentDeleteMutation.error,
    editorOpen,
    editorValue,
    editingTemplateId,
    openingEditor: openEditorMutation.isPending,
    saving: saveMutation.isPending,
    toggling: activeMutation.isPending,
    savingAttachmentType: attachmentMutation.isPending,
    togglingAttachmentType: attachmentActiveMutation.isPending,
    deletingAttachmentType: attachmentDeleteMutation.isPending,
    openNew,
    openEditor: (template: PrintTemplate) => openEditorMutation.mutate(template),
    closeEditor,
    save: (value: PrintTemplateEditorValue) => saveMutation.mutateAsync(value),
    toggleActive: (template: PrintTemplate) => activeMutation.mutateAsync({ id: template.id, active: !template.is_active }),
    saveAttachmentType: (name: string, id?: string) => attachmentMutation.mutateAsync({ id, name }),
    toggleAttachmentType: (id: string, active: boolean) => attachmentActiveMutation.mutateAsync({ id, active }),
    removeAttachmentType: (id: string) => attachmentDeleteMutation.mutateAsync(id),
  };
}
