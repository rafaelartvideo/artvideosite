import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminCard, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import { getOrderChecklist } from "@/features/checklists/infrastructure/checklists.repository";
import type { OrderChecklistItem, OrderChecklistStage } from "@/features/checklists/domain/checklist";
import { OrderImageThumb, type OrderImage } from "./OrderImages";

function itemImages(item: OrderChecklistItem): OrderImage[] {
  return item.media.map(media => ({
    key: media.id,
    mediaId: media.media_id,
    name: media.media?.file_name || item.title_snapshot || "Foto do checklist",
  }));
}

function stagePhotoCount(stage: OrderChecklistStage) {
  return stage.items.reduce((total, item) => total + item.media.length, 0);
}

export function OrderChecklistDocumentsSection({
  orderId,
  onView,
}: {
  orderId?: string | null;
  onView: (image: OrderImage) => void;
}) {
  const checklistQuery = useQuery({
    queryKey: queryKeys.checklists.order(orderId || ""),
    queryFn: () => getOrderChecklist(orderId!),
    enabled: Boolean(orderId),
  });

  if (checklistQuery.isLoading) return <LoadingState text="Carregando checklist..." />;

  if (checklistQuery.error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
        Não foi possível carregar as fotos do checklist.
      </div>
    );
  }

  const checklist = checklistQuery.data;
  if (!checklist) {
    return (
      <div className="rounded-xl border border-dashed border-[#0d1b2e]/10 px-3 py-10 text-center text-xs text-[#5a6a82]">
        Esta OS não possui checklist.
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-4 overflow-hidden">
      <div className="min-w-0">
        <h2 className="text-sm font-black text-[#0d1b2e]">Checklist</h2>
        <p className="mt-0.5 text-xs text-[#5a6a82]">Fotos organizadas pela etapa e pelo item em que foram registradas.</p>
      </div>

      {checklist.stages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#0d1b2e]/10 px-3 py-10 text-center text-xs text-[#5a6a82]">
          Nenhuma etapa de checklist registrada nesta OS.
        </div>
      ) : checklist.stages.map(stage => {
        const photoCount = stagePhotoCount(stage);
        const itemsWithPhotos = stage.items.filter(item => item.media.length > 0);
        return (
          <AdminCard key={stage.id} className="min-w-0 max-w-full shadow-none">
            <AdminCardHeader>
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eef5ff] text-[#0057e7]">
                  <ClipboardCheck size={17} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-black text-[#0d1b2e]">{stage.name_snapshot}</p>
                  <p className="text-[10px] text-[#5a6a82]">{photoCount} {photoCount === 1 ? "foto" : "fotos"}</p>
                </div>
              </div>
            </AdminCardHeader>

            {itemsWithPhotos.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-[#7c899c]">Nenhuma foto registrada nesta etapa.</div>
            ) : (
              <div className="divide-y divide-[#0d1b2e]/8">
                {itemsWithPhotos.map(item => {
                  const images = itemImages(item);
                  return (
                    <div key={item.id} className="p-4">
                      <p className="mb-2 text-xs font-bold text-[#0d1b2e]">{item.title_snapshot}</p>
                      <div className="flex flex-wrap gap-3">
                        {images.map(image => (
                          <OrderImageThumb key={image.key} image={image} onView={() => onView(image)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </AdminCard>
        );
      })}
    </div>
  );
}
