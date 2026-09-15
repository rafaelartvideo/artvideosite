import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { checklistProgress } from "../domain/checklist";
import { getOrderChecklist } from "../infrastructure/checklists.repository";

export function OrderChecklistToolbarButton({ orderId, onClick }: { orderId: string; onClick: () => void }) {
  const query = useQuery({
    queryKey: queryKeys.checklists.order(orderId),
    queryFn: () => getOrderChecklist(orderId),
    enabled: Boolean(orderId),
  });
  const progress = checklistProgress(query.data);
  const completed = query.data?.status === "completed";

  return <button type="button" onClick={onClick} className="inline-flex items-center gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 py-2 text-xs font-bold text-[#0d1b2e] hover:bg-[#f5f7fa]">
    <ClipboardCheck size={14} /> Checklists
    {progress.total > 0 && <span className={`inline-flex min-w-8 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] text-white ${completed ? "bg-emerald-600" : "bg-[#0057e7]"}`}>{progress.answered}/{progress.total}</span>}
  </button>;
}
