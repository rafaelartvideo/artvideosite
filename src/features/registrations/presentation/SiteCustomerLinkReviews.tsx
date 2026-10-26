import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronDown, RefreshCw, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatCpf } from "@/shared/domain/formatters";
import { AdminCard } from "@/shared/ui/admin/AdminLayout";
import { Toast } from "@/shared/ui/admin/AdminFeedback";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/shared/ui/primitives/alert-dialog";

type Review = {
  user_id: string;
  full_name: string;
  cpf: string;
  site_email: string;
  created_at: string;
  candidate_id: string | null;
  candidate_name: string | null;
  candidate_email: string | null;
  review_reason: string | null;
};
type Decision = { item: Review; approve: boolean };
type Props = {
  organizationId: string | null;
  canEdit: boolean;
  onOpenRegistration: (id: string) => void;
};

const reasons: Record<string, string> = {
  name_mismatch: "Primeiro nome diferente",
  email_mismatch: "E-mail diferente",
  already_linked: "Cadastro já vinculado",
  inactive_or_not_customer: "Cadastro inativo ou sem vínculo de cliente",
  multiple_matches: "CPF encontrado em mais de um cadastro",
  email_conflict: "E-mail pertence a outro cadastro",
};

async function loadReviews(): Promise<Review[]> {
  const { data, error } = await supabase.rpc("artvideo_customer_link_reviews_v1");
  if (error) throw error;
  return Array.isArray(data) ? data as Review[] : [];
}

export function SiteCustomerLinkReviews({ organizationId, canEdit, onOpenRegistration }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const queryClient = useQueryClient();
  const isArtvideo = organizationId === "00000000-0000-4000-8000-000000000001";
  const query = useQuery({
    queryKey: ["site-customer-link-reviews", organizationId],
    queryFn: loadReviews,
    enabled: isArtvideo,
    staleTime: 60_000,
    retry: 1,
  });
  if (!isArtvideo) return null;
  const reviews = query.data || [];
  if (!query.isPending && !query.isError && reviews.length === 0) return null;

  async function decide() {
    if (!decision || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("artvideo_customer_link_review_decide_v1", {
        p_user_id: decision.item.user_id,
        p_approve: decision.approve,
      });
      if (error) throw error;
      setToast({ message: decision.approve ? "Vínculo aprovado." : "Vínculo recusado.", type: "success" });
      setDecision(null);
      await queryClient.invalidateQueries({ queryKey: ["site-customer-link-reviews", organizationId] });
    } catch (failure) {
      setToast({ message: failure instanceof Error ? failure.message : "Não foi possível revisar este vínculo.", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  return <>
    {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    <AdminCard square className="overflow-hidden p-0">
      <button type="button" onClick={() => setExpanded(v => !v)} className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted/30">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><ShieldCheck size={19}/></span>
          <span className="min-w-0">
            <strong className="block text-sm text-foreground">Vínculos do site em análise</strong>
            <span className="block text-xs text-muted-foreground">
              {query.isPending ? "Consultando solicitações..." : query.isError ? "Não foi possível consultar os vínculos" : `${reviews.length} ${reviews.length === 1 ? "solicitação pendente" : "solicitações pendentes"}`}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className={"shrink-0 text-muted-foreground transition-transform " + (expanded ? "rotate-180" : "")}/>
      </button>
      {expanded && <div className="space-y-3 border-t p-4">
        <p className="text-xs text-muted-foreground">O CPF e o primeiro nome são comparados automaticamente. Confirme a identidade antes de aprovar qualquer divergência. A associação não libera acesso às OS.</p>
        {query.isError && <button type="button" onClick={() => void query.refetch()} className="inline-flex items-center gap-2 text-xs font-semibold text-primary"><RefreshCw size={14}/> Tentar novamente</button>}
        {reviews.map(item => <div key={item.user_id} className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border p-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm text-foreground">{item.full_name}</strong>
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Em análise</span>
            </div>
            <p className="text-xs text-muted-foreground">CPF: {formatCpf(item.cpf)} · {item.site_email}</p>
            <p className="text-xs text-muted-foreground">Motivo: {reasons[item.review_reason || ""] || "Conferência necessária"}</p>
            {item.candidate_name && <p className="text-xs text-muted-foreground">Cadastro encontrado: <span className="font-semibold text-foreground">{item.candidate_name}</span></p>}
            {item.candidate_email && <p className="text-xs text-muted-foreground">E-mail no CRM: {item.candidate_email}</p>}
          </div>
          {canEdit && <div className="flex flex-wrap items-center gap-2">
            {item.candidate_id && <button type="button" onClick={() => onOpenRegistration(item.candidate_id!)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted">Ver cadastro</button>}
            <button type="button" onClick={() => setDecision({ item, approve: false })} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted"><X size={14}/> Recusar</button>
            <button type="button" disabled={!item.candidate_id} title={!item.candidate_id ? "Não há cadastro candidato para aprovação direta" : undefined} onClick={() => setDecision({ item, approve: true })} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"><Check size={14}/> Aprovar</button>
          </div>}
        </div>)}
      </div>}
    </AdminCard>
    <AlertDialog open={Boolean(decision)} onOpenChange={open => { if (!open && !saving) setDecision(null); }}>
      <AlertDialogContent className="admin-crm max-w-md rounded-2xl border-border bg-card">
        <AlertDialogHeader>
          <AlertDialogTitle>{decision?.approve ? "Aprovar vínculo de cadastro?" : "Recusar vínculo de cadastro?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {decision?.approve
              ? "Confirme a identidade do cliente antes de aprovar. CPF e primeiro nome sozinhos não comprovam a titularidade. O vínculo não libera acesso ao histórico de OS."
              : "O cadastro do CRM não será vinculado a esta conta. Os pedidos e orçamentos do site continuarão disponíveis."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={event => { event.preventDefault(); void decide(); }} disabled={saving}>
            {saving ? "Salvando..." : decision?.approve ? "Confirmar aprovação" : "Confirmar recusa"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
