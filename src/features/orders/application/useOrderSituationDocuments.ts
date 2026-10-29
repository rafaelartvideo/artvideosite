import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { REFERENCE_DATA_CACHE_TIME } from "@/infrastructure/query/query-client";
import {
  attachOrderSituationDocument,
  countOrderSituationDocuments,
  getServiceOrderOrganizationId,
  listAttachmentTypes,
  listOrderSituationDocuments,
  removeOrderSituationDocument,
} from "../infrastructure/order-documents.repository";
import {
  orderSituationUploadPermission,
  type OrderSituation,
  type OrderSituationDocument,
  type ServiceTypeSituationLink,
} from "../domain/order-situation-document";

export function useOrderSituationDocuments({
  orderId,
  organizationId,
  serviceTypeId,
  situations,
  serviceTypeSituations,
  hasPermission,
}: {
  orderId?: string;
  organizationId?: string | null;
  serviceTypeId?: string | null;
  situations: OrderSituation[];
  serviceTypeSituations: ServiceTypeSituationLink[];
  hasPermission: (permission: string) => boolean;
}) {
  const queryClient = useQueryClient();

  const organizationQuery = useQuery({
    queryKey: ["orders", orderId || "", "organization"],
    enabled: Boolean(orderId && !organizationId),
    queryFn: () => getServiceOrderOrganizationId(orderId!),
    staleTime: 60_000,
  });
  const effectiveOrganizationId = organizationId || organizationQuery.data || null;
  const queryKey = ["orders", effectiveOrganizationId || "none", orderId || "", "situation-documents"];
  const countKey = ["orders", effectiveOrganizationId || "none", orderId || "", "situation-documents-count"];
  const canViewDocuments = Boolean(orderId && effectiveOrganizationId && hasPermission("orders.section.images"));
  const countQuery = useQuery({
    queryKey: countKey,
    enabled: canViewDocuments,
    staleTime: 5 * 60_000,
    queryFn: () => countOrderSituationDocuments(orderId!, effectiveOrganizationId!),
  });

  const documentsQuery = useQuery({
    queryKey,
    enabled: canViewDocuments,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const started = Date.now();
      try {
        const { data, error } = await listOrderSituationDocuments(orderId!, effectiveOrganizationId);
        if (error) throw error;
        const documents = data || [];
        queryClient.setQueryData(countKey, documents.length);
        return documents;
      } finally {
        const elapsed = Date.now() - started;
        if (elapsed >= 3000) console.warn("[PERF][OS] Documentos lentos", { duration_ms: elapsed });
      }
    },
  });

  const attachmentTypesQuery = useQuery({
    queryKey: ["documents", effectiveOrganizationId || "none", "attachment-types", "active"],
    enabled: Boolean(orderId && effectiveOrganizationId && hasPermission("orders.section.images")),
    staleTime: REFERENCE_DATA_CACHE_TIME,
    gcTime: REFERENCE_DATA_CACHE_TIME,
    queryFn: async () => {
      const { data, error } = await listAttachmentTypes(true, effectiveOrganizationId);
      if (error) throw error;
      return data || [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({
      situation,
      attachmentTypeId,
      files,
    }: {
      situation?: OrderSituation | null;
      attachmentTypeId?: string | null;
      files: File[];
    }) => {
      if (!orderId || !effectiveOrganizationId) throw new Error("OS ou empresa não informada.");
      if (situation && !hasPermission(orderSituationUploadPermission(situation.id))) {
        throw new Error(`Você não possui permissão para anexar arquivos em ${situation.name}.`);
      }
      if (!situation && !hasPermission("orders.section.images")) {
        throw new Error("Você não possui permissão para anexar arquivos nesta OS.");
      }
      if (!situation && !attachmentTypeId) throw new Error("Selecione o tipo de anexo.");
      if (!files.length) throw new Error("Selecione um arquivo ou utilize a câmera.");
      for (const file of files) {
        await attachOrderSituationDocument({
          organizationId: effectiveOrganizationId,
          serviceOrderId: orderId,
          situationId: situation?.id || null,
          attachmentTypeId: attachmentTypeId || null,
          file,
        });
      }
      return { count: files.length, situation: situation?.name || "Anexos" };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: countKey }),
      ]);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (document: OrderSituationDocument) => {
      if (!hasPermission("orders.documents.remove")) {
        throw new Error("Você não possui permissão para remover documentos.");
      }
      await removeOrderSituationDocument(document.id);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: countKey }),
      ]);
    },
  });

  const flowSituations = useMemo(() => {
    if (!serviceTypeId) {
      return situations.slice().sort((left, right) =>
        Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0),
      );
    }
    return serviceTypeSituations
      .filter(link => link.service_type_id === serviceTypeId)
      .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
      .map(link => {
        const related = Array.isArray(link.situation) ? link.situation[0] : link.situation;
        return related || situations.find(item => item.id === link.situation_id) || null;
      })
      .filter((item): item is OrderSituation => Boolean(item));
  }, [serviceTypeId, serviceTypeSituations, situations]);

  return {
    organizationId: effectiveOrganizationId,
    documents: documentsQuery.data || [],
    documentsCount: countQuery.data ?? null,
    attachmentTypes: attachmentTypesQuery.data || [],
    flowSituations,
    loading: organizationQuery.isLoading || documentsQuery.isLoading || attachmentTypesQuery.isLoading,
    error: organizationQuery.error || documentsQuery.error || attachmentTypesQuery.error || uploadMutation.error || removeMutation.error,
    uploading: uploadMutation.isPending,
    uploadingAttachment: uploadMutation.isPending && !uploadMutation.variables?.situation,
    uploadingSituationId: uploadMutation.variables?.situation?.id || null,
    removingId: removeMutation.variables?.id || null,
    upload: (situation: OrderSituation, attachmentTypeId: string, files: File[]) =>
      uploadMutation.mutateAsync({ situation, attachmentTypeId, files }),
    uploadQuick: (situation: OrderSituation, files: File[]) =>
      uploadMutation.mutateAsync({ situation, attachmentTypeId: null, files }),
    uploadAttachment: (attachmentTypeId: string, files: File[]) =>
      uploadMutation.mutateAsync({ situation: null, attachmentTypeId, files }),
    remove: (document: OrderSituationDocument) => removeMutation.mutateAsync(document),
    canUpload: (situationId: string) =>
      hasPermission(orderSituationUploadPermission(situationId)),
    canUploadAttachment: hasPermission("orders.section.images"),
    canRemove: hasPermission("orders.documents.remove"),
  };
}
