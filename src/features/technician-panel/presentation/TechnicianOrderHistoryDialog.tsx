import { useEffect, useState } from "react";
import { AdminDialog, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { getMyTechnicianOrderHistory, type TechnicianOrderHistoryEntry } from "../infrastructure/technician-tasks.repository";

function dateText(value: string | null) {
  if (!value) return "Sem data";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Sem data" : parsed.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function TechnicianOrderHistoryDialog({
  open, onClose, orderId, orderNumber,
}: {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: number | string;
}) {
  const [entries, setEntries] = useState<TechnicianOrderHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setEntries([]);
    setLoading(true);
    void getMyTechnicianOrderHistory(orderId)
      .then(result => { if (!cancelled) setEntries(result); })
      .catch(error => { if (!cancelled) notifyAdmin(systemErrorMessage(error, "Não foi possível abrir o histórico."), "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, orderId]);

  return <AdminDialog open={open} onClose={onClose}
    title="Histórico da OS" description={"OS " + orderNumber}
    className="max-w-2xl"
    footer={<div className="flex justify-end"><BtnSecondary onClick={onClose}>Fechar</BtnSecondary></div>}>
    {loading ? <p className="text-sm text-muted-foreground">Carregando histórico...</p>
      : !entries.length ? <p className="text-sm text-muted-foreground">Nenhum registro técnico disponível para esta OS.</p>
      : <div className="divide-y divide-border">
        {entries.map((entry, index) => <div key={entry.kind + entry.at + index} className="space-y-1 py-3 first:pt-0 last:pb-0">
          <p className="text-xs font-semibold text-muted-foreground">{dateText(entry.at)}</p>
          <p className="break-words text-sm font-medium text-foreground">{entry.description}</p>
        </div>)}
      </div>}
  </AdminDialog>;
}
