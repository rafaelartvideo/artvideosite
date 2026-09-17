import { useMemo, useState } from "react";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import { FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { approvalProgress, canUserApprove } from "../domain/finance-approval.mjs";
import type { FinancialEntryDetail } from "../domain/finance.types";

function reasonLabel(reason: string | null) {
  if (reason === "duplicate_approver") return "Você já aprovou este lançamento neste ciclo.";
  if (reason === "creator_cannot_be_second") return "O criador do lançamento não pode ser o segundo aprovador.";
  if (reason === "already_complete") return "Todas as aprovações necessárias já foram registradas.";
  return null;
}

export function FinanceApprovalPanel({
  detail,
  canApprove,
  currentUserId,
  pending,
  error,
  onApprove,
  onReject,
}: {
  detail: FinancialEntryDetail;
  canApprove: boolean;
  currentUserId: string | null;
  pending: boolean;
  error?: unknown;
  onApprove: () => Promise<void>;
  onReject: (note: string) => Promise<void>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [localError, setLocalError] = useState("");
  const currentApprovals = useMemo(
    () => detail.approvals.filter(item => item.approval_cycle === detail.approval_cycle),
    [detail.approvals, detail.approval_cycle],
  );
  const progress = approvalProgress(detail.required_approvals, currentApprovals);
  const approveRule = canUserApprove({
    requiredApprovals: detail.required_approvals,
    approvals: currentApprovals,
    userId: currentUserId,
    creatorId: detail.created_by,
  });
  const actionError = localError || (error instanceof Error ? error.message : "");
  const approvalRows = currentApprovals.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const reject = async () => {
    const note = rejectNote.trim();
    if (!note) {
      setLocalError("Informe o motivo da rejeição.");
      return;
    }
    try {
      setLocalError("");
      await onReject(note);
      setRejecting(false);
      setRejectNote("");
    } catch {
      // O erro real é exibido pelo mutation state recebido do controller.
    }
  };

  const approve = async () => {
    try {
      setLocalError("");
      await onApprove();
    } catch {
      // O erro real é exibido pelo mutation state recebido do controller.
    }
  };

  return <AdminCard>
    <AdminCardHeader>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-[#0057e7]" />
          <div><h3 className="text-sm font-black text-[#0d1b2e]">Aprovação financeira</h3><p className="text-xs text-[#5a6a82]">Ciclo {detail.approval_cycle}</p></div>
        </div>
        <div className="rounded-full bg-[#eaf1ff] px-3 py-1.5 text-xs font-black text-[#0057e7]">{progress.count}/{progress.required} aprovações</div>
      </div>
    </AdminCardHeader>
    <AdminCardContent className="space-y-4">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[#0057e7] transition-all" style={{ width: `${Math.min(100, progress.count / progress.required * 100)}%` }} />
      </div>

      {approvalRows.length === 0 ? <p className="text-sm text-[#5a6a82]">Nenhuma decisão registrada neste ciclo.</p> : <div className="space-y-2">
        {approvalRows.map(item => <div key={item.id} className="flex items-start gap-3 rounded-xl border border-[#0d1b2e]/8 px-3 py-3">
          {item.action === "approve" ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" /> : <XCircle size={17} className="mt-0.5 shrink-0 text-red-600" />}
          <div className="min-w-0 flex-1"><p className="text-sm font-bold text-[#0d1b2e]">{item.approver_name_snapshot}</p><p className="text-xs text-[#5a6a82]">{item.action === "approve" ? `Aprovação ${item.approval_order || ""}` : "Rejeição"} · {new Date(item.created_at).toLocaleString("pt-BR")}</p>{item.note && <p className="mt-1 text-xs text-[#5a6a82]">{item.note}</p>}</div>
        </div>)}
      </div>}

      {actionError && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}

      {detail.approval_status === "pending" && canApprove && <div className="border-t border-[#0d1b2e]/8 pt-4">
        {reasonLabel(approveRule.reason) && <p className="mb-3 text-xs font-semibold text-amber-700">{reasonLabel(approveRule.reason)}</p>}
        {!rejecting ? <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <AdminButton variant="secondary" onClick={() => { setRejecting(true); setLocalError(""); }} disabled={pending}><XCircle size={15} /> Rejeitar</AdminButton>
          <AdminButton onClick={approve} disabled={pending || !approveRule.ok} loading={pending} loadingText="Registrando..."><CheckCircle2 size={15} /> Aprovar</AdminButton>
        </div> : <div className="space-y-3">
          <FTextarea label="Motivo da rejeição" required value={rejectNote} onChange={(event: any) => setRejectNote(event.target.value)} placeholder="Descreva o motivo para manter o histórico auditável." />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={() => { if (!pending) { setRejecting(false); setRejectNote(""); setLocalError(""); } }}>Cancelar</AdminButton><AdminButton variant="danger" onClick={reject} loading={pending} loadingText="Rejeitando..."><XCircle size={15} /> Confirmar rejeição</AdminButton></div>
        </div>}
      </div>}
    </AdminCardContent>
  </AdminCard>;
}
