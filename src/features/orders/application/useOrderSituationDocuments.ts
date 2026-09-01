import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attachOrderSituationDocument,
  listOrderSituationDocuments,
  removeOrderSituationDocument,
} from "../infrastructure/order-documents.repository";
import {
  orderSituationUploadPermission,
  type OrderSituation,
  type OrderSituationDocument,
  type ServiceTypeSituationLink,
} from "../domain/order-situation-document";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

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

  const uploadMutation = useMutation({
    mutationFn: async ({ situation, files }: { situation: OrderSituation; files: File[] }) => {
      if (!orderId) throw new Error("OS não informada.");
      if (!hasPermission(orderSituationUploadPermission(situation.id))) {
        throw new Error(`Você não possui permissão para anexar imagens em ${situation.name}.`);
      }
      const accepted = files.filter(file => acceptedTypes.has(file.type));
      if (!accepted.length) throw new Error("Selecione imagens JPG, PNG ou WebP.");
      for (const file of accepted) {
        await attachOrderSituationDocument({
          serviceOrderId: orderId,
          situationId: situation.id,
          file,
        });
      }
      return { count: accepted.length, situation: situation.name };
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
    flowSituations,
    loading: documentsQuery.isLoading,
    error: documentsQuery.error || uploadMutation.error || removeMutation.error,
    uploadingSituationId: uploadMutation.variables?.situation.id || null,
    removingId: removeMutation.variables?.id || null,
    upload: (situation: OrderSituation, files: FileList | null) =>
      uploadMutation.mutateAsync({ situation, files: Array.from(files || []) }),
    remove: (document: OrderSituationDocument) => removeMutation.mutateAsync(document),
    canUpload: (situationId: string) =>
      hasPermission(orderSituationUploadPermission(situationId)),
    canRemove: hasPermission("orders.documents.remove"),
  };
}
