import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listPrintTemplates,
  loadPrintTemplateEditorValue,
  savePrintTemplate,
  setPrintTemplateActive,
} from "../infrastructure/documents.repository";
import {
  emptyPrintTemplateEditorValue,
  PRINT_TEMPLATE_TYPE_LABELS,
  type PrintTemplate,
  type PrintTemplateEditorValue,
} from "../domain/print-template";

export function useDocuments() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editorValue, setEditorValue] = useState<PrintTemplateEditorValue>(
    emptyPrintTemplateEditorValue,
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);

  const templatesQuery = useQuery({
    queryKey: ["documents", "print-templates"],
    queryFn: async () => {
      const { data, error } = await listPrintTemplates();
      if (error) throw error;
      return data || [];
    },
  });

  const openEditorMutation = useMutation({
    mutationFn: loadPrintTemplateEditorValue,
    onMutate: template => setEditingTemplateId(template.id),
    onSuccess: value => {
      setEditorValue(value);
      setEditorOpen(true);
    },
    onSettled: () => setEditingTemplateId(null),
  });

  const saveMutation = useMutation({
    mutationFn: savePrintTemplate,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["documents", "print-templates"] });
      closeEditor();
    },
  });

  const activeMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setPrintTemplateActive(id, active),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["documents", "print-templates"] }),
  });

  const templates = templatesQuery.data || [];
  const filteredTemplates = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return templates;
    return templates.filter((template: PrintTemplate) =>
      template.name.toLocaleLowerCase("pt-BR").includes(term)
      || (template.description || "").toLocaleLowerCase("pt-BR").includes(term)
      || (PRINT_TEMPLATE_TYPE_LABELS[template.document_type] || template.document_type)
        .toLocaleLowerCase("pt-BR")
        .includes(term),
    );
  }, [templates, search]);

  function openNew() {
    setEditorValue(emptyPrintTemplateEditorValue());
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingTemplateId(null);
    setEditorValue(emptyPrintTemplateEditorValue());
  }

  return {
    templates,
    filteredTemplates,
    search,
    setSearch,
    loading: templatesQuery.isLoading,
    error: templatesQuery.error || openEditorMutation.error || saveMutation.error || activeMutation.error,
    editorOpen,
    editorValue,
    editingTemplateId,
    openingEditor: openEditorMutation.isPending,
    saving: saveMutation.isPending,
    toggling: activeMutation.isPending,
    openNew,
    openEditor: (template: PrintTemplate) => openEditorMutation.mutate(template),
    closeEditor,
    save: (value: PrintTemplateEditorValue) => saveMutation.mutateAsync(value),
    toggleActive: (template: PrintTemplate) =>
      activeMutation.mutate({ id: template.id, active: !template.is_active }),
  };
}
