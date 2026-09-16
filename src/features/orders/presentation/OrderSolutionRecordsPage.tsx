import { CheckCircle2, History, RotateCcw } from "lucide-react";
import { AdminCard, AdminCardHeader, AdminPage, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { formatCurrency, formatDateTime } from "@/shared/domain/formatters";
import type { ServiceOrderSolutionAttempt } from "../infrastructure/order-solution-history.repository";
import { OrderImageThumb, type OrderImage } from "./OrderImages";

export function OrderSolutionRecordsPage({
  open,
  order,
  attempts,
  loading,
  error,
  onClose,
  onViewImage,
}: {
  open: boolean;
  order: any;
  attempts: ServiceOrderSolutionAttempt[];
  loading: boolean;
  error: string;
  onClose: () => void;
  onViewImage: (image: OrderImage) => void;
}) {
  if (!open) return null;

  return <AdminPage
    open
    onClose={onClose}
    breadcrumb={`Ordens de Serviço > ${order?.os_number || "OS"} > Registros da solução`}
    title="Registros da solução"
    subtitle="Histórico completo das soluções e reversões desta OS"
    maxW="max-w-4xl"
  >
    <div className="space-y-4 p-4 sm:p-5">
      {loading && <LoadingState text="Carregando registros da solução..." />}
      {!loading && error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-xs font-semibold text-red-700">{error}</div>}
      {!loading && !error && attempts.length === 0 && <div className="rounded-xl border border-dashed border-[#0d1b2e]/10 px-3 py-10 text-center text-xs text-[#5a6a82]"><History className="mx-auto mb-2 text-[#8b98aa]" size={22} />Nenhuma solução registrada nesta OS.</div>}

      {!loading && !error && attempts.map(attempt => {
        const active = !attempt.reverted_at;
        const itemTotal = (attempt.items || []).reduce((sum, item) => sum + Number(item.total_sale_price || 0), 0);
        return <AdminCard key={attempt.id} className={active ? "border-emerald-200 shadow-none" : "shadow-none"}>
          <AdminCardHeader className={active ? "bg-emerald-50/60" : undefined}>
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black text-[#0d1b2e]">{attempt.attempt_number}ª solução</p>
                <p className="mt-0.5 text-[10px] text-[#7c899c]">{formatDateTime(attempt.solved_at)} · {attempt.solved_by_profile?.full_name || "Usuário não informado"}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                {active ? <CheckCircle2 size={11} /> : <RotateCcw size={11} />}{active ? "Solução ativa" : "Solução desfeita"}
              </span>
            </div>
          </AdminCardHeader>

          <div className="space-y-4 p-4">
            {attempt.reverted_at && <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-800"><p className="font-black">Solução desfeita em {formatDateTime(attempt.reverted_at)}</p><p className="mt-1">Por: {attempt.reverted_by_profile?.full_name || "Usuário não informado"}</p>{attempt.revert_reason && <p className="mt-1 whitespace-pre-line"><strong>Motivo:</strong> {attempt.revert_reason}</p>}</div>}
            <RecordText label="Diagnóstico" value={attempt.diagnosis} />
            <RecordText label="Solução" value={attempt.solution} />
            <RecordText label="Peças avulsas" value={attempt.loose_parts} />

            {(attempt.items || []).length > 0 && <div><p className="mb-2 text-[10px] font-bold uppercase text-[#5a6a82]">Produtos utilizados</p><div className="space-y-2">{(attempt.items || []).map(item => <div key={item.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-2 text-xs"><span className="min-w-0 break-words font-semibold text-[#0d1b2e]">{item.inventory_name_snapshot}</span><span className="shrink-0 font-black text-[#0d1b2e]">{Number(item.quantity)} {item.unit_snapshot}{item.unit_sale_price != null && item.total_sale_price != null ? ` × ${formatCurrency(Number(item.unit_sale_price))} = ${formatCurrency(Number(item.total_sale_price))}` : ""}</span></div>)}</div>{itemTotal > 0 && <div className="mt-2 flex items-center justify-between rounded-lg bg-[#eef5ff] px-3 py-2 text-xs"><span className="font-bold">Total dos produtos</span><span className="font-black text-[#0057e7]">{formatCurrency(itemTotal)}</span></div>}</div>}

            {(attempt.media || []).length > 0 && <div><p className="mb-2 text-[10px] font-bold uppercase text-[#5a6a82]">Imagens da solução</p><div className="flex flex-wrap gap-3">{(attempt.media || []).map(media => {
              const image: OrderImage = { key: media.id, mediaId: media.media_id, name: media.file_name_snapshot || media.media?.file_name || "Imagem da solução", kind: "solution" };
              return <OrderImageThumb key={media.id} image={image} onView={() => onViewImage(image)} />;
            })}</div></div>}
          </div>
        </AdminCard>;
      })}
    </div>

    <div className="sticky bottom-0 border-t border-[#0d1b2e]/8 bg-white px-4 py-4 sm:px-5"><BtnSecondary onClick={onClose}>Voltar para a OS</BtnSecondary></div>
  </AdminPage>;
}

function RecordText({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <div><p className="mb-1 text-[10px] font-bold uppercase text-[#5a6a82]">{label}</p><p className="whitespace-pre-line break-words text-sm text-[#0d1b2e]">{value}</p></div>;
}
