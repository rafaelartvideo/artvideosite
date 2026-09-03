import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attachOrderSituationDocument,
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
  serviceTypeId,
  situations,
  serviceTypeSituations,
  hasPermission,
}: {
  orderId?: string;
  serviceTypeId?: string | null;
  situations: OrderSituation[];
  serviceTypeSituations: ServiceTypeSituationLink[];
  hasPermission: (permission: string) => boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["orders", orderId || "", "situation-documents"];

  const documentsQuery = useQuery({
    queryKey,
    enabled: Boolean(orderId && hasPermission("orders.section.images")),
    queryFn: async () => {
      const { data, error } = await listOrderSituationDocuments(orderId!);
      if (error) throw error;
      return data || [];
    },
  });

  const attachmentTypesQuery = useQuery({
    queryKey: ["documents", "attachment-types", "active"],
    enabled: Boolean(orderId && hasPermission("orders.section.images")),
    queryFn: async () => {
      const { data, error } = await listAttachmentTypes(true);
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
      situation: OrderSituation;
      attachmentTypeId: string;
      files: File[];
    }) => {
      if (!orderId) throw new Error("OS não informada.");
      if (!attachmentTypeId) throw new Error("Selecione o tipo de anexo.");
      if (!hasPermission(orderSituationUploadPermission(situation.id))) {
        throw new Error(`Você não possui permissão para anexar arquivos em ${situation.name}.`);
      }
      if (!files.length) throw new Error("Selecione um arquivo ou utilize a câmera.");
      for (const file of files) {
        await attachOrderSituationDocument({
          serviceOrderId: orderId,
          situationId: situation.id,
          attachmentTypeId,
          file,
        });
      }
      return { count: files.length, situation: situation.name };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const removeMutation = useMutation({
    mutationFn: async (document: OrderSituationDocument) => {
      if (!hasPermission("orders.documents.remove")) {
        throw new Error("Você não possui permissão para remover documentos.");
      }
      await removeOrderSituationDocument(document.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
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
    documents: documentsQuery.data || [],
    attachmentTypes: attachmentTypesQuery.data || [],
    flowSituations,
    loading: documentsQuery.isLoading || attachmentTypesQuery.isLoading,
    error: documentsQuery.error || attachmentTypesQuery.error || uploadMutation.error || removeMutation.error,
    uploadingSituationId: uploadMutation.variables?.situation.id || null,
    removingId: removeMutation.variables?.id || null,
    upload: (situation: OrderSituation, attachmentTypeId: string, files: File[]) =>
      uploadMutation.mutateAsync({ situation, attachmentTypeId, files }),
    remove: (document: OrderSituationDocument) => removeMutation.mutateAsync(document),
    canUpload: (situationId: string) =>
      hasPermission(orderSituationUploadPermission(situationId)),
    canRemove: hasPermission("orders.documents.remove"),
  };
}
