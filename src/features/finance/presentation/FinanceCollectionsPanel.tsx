import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Plus } from "lucide-react";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import { FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import type { FinancialCollectionChannel, FinancialEntryDetail } from "../domain/finance.types";
import { listFinancialCollectionLogs, registerFinancialCollectionLog } from "../infrastructure/finance-collections.repository";

const CHANNEL_OPTIONS = [
  { value: "phone", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "E-mail" },
  { value: "sms", label: "SMS" },
  { value: "in_person", label: "Presencial" },
  { value: "other", label: "Outro" },
];

function channelLabel(value: string) {
  return CHANNEL_OPTIONS.find(item => item.value === value)?.label || value;
}

function localDateTimeInput() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}

function toIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function FinanceCollectionsPanel({ detail }: { detail: FinancialEntryDetail }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const organizationId = activeOrganizationId || "";
  const organizationKey = activeOrganizationId || "none";
  const canView = hasPermission("finance.collections.view");
  const canCreate = hasPermission("finance.collections.create");
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<FinancialCollectionChannel>("whatsapp");
  const [installmentId, setInstallmentId] = useState("");
  const [note, setNote] = useState("");
  const [contactedAt, setContactedAt] = useState(localDateTimeInput);
  const [followUpAt, setFollowUpAt] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ note?: string; contactedAt?: string; followUpAt?: string }>({});

  const query = useQuery({
    queryKey: queryKeys.finance.collections(organizationKey, detail.id),
    enabled: Boolean(activeOrganizationId && canView && detail.entry_type === "receivable"),
    queryFn: () => listFinancialCollectionLogs(organizationId, detail.id),
  });

  const mutation = useMutation({
    mutationFn: () => registerFinancialCollectionLog(organizationId, detail.id, {
      installment_id: installmentId || null,
      channel,
      note,
      contacted_at: toIso(contactedAt),
      next_follow_up_at: toIso(followUpAt),
    }),
    onSuccess: async () => {
      setOpen(false);
      setChannel("whatsapp");
      setInstallmentId("");
      setNote("");
      setContactedAt(localDateTimeInput());
      setFollowUpAt("");
      setFieldErrors({});
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.finance.collections(organizationKey, detail.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.finance.entry(organizationKey, detail.id) }),
      ]);
    },
  });

  const logs = query.data || [];
  const error = query.error || mutation.error;
  const errorText = error ? systemErrorMessage(error) : "";
  useEffect(() => {
    if (error) notifyAdmin(systemErrorMessage(error), "error");
  }, [error]);
  if (detail.entry_type !== "receivable" || !canView) return null;

  const submit = async () => {
    const nextErrors: typeof fieldErrors = {};
    if (!note.trim()) nextErrors.note = "Informe a observação da cobrança.";
    if (!toIso(contactedAt)) nextErrors.contactedAt = "Informe uma data/hora de contato válida.";
    if (followUpAt && !toIso(followUpAt)) nextErrors.followUpAt = "Informe uma data/hora válida para o próximo retorno.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    try {
      setFieldErrors({});
      await mutation.mutateAsync();
    } catch {
      // Error is rendered by mutation state.
    }
  };

  const openForm = () => {
    setOpen(true);
    setFieldErrors({});
    setContactedAt(localDateTimeInput());
  };

  return <div className="space-y-3">
    <div className="sticky top-0 z-10 flex min-h-14 items-center justify-end border-b border-border bg-card py-2">
      {canCreate && <AdminButton size="sm" onClick={openForm}><Plus size={15} /> Novo contato</AdminButton>}
    </div>

    {errorText && !open && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{errorText}</p>}
    {query.isLoading ? <LoadingState text="Carregando cobranças..." /> : <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="border-b border-border bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3 text-left">Contato</th>
              <th scope="col" className="px-4 py-3 text-left">Data / hora</th>
              <th scope="col" className="px-4 py-3 text-left">Registro</th>
              <th scope="col" className="px-4 py-3 text-left">Próximo retorno</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {logs.length === 0
              ? <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground"><MessageCircle size={19} className="mx-auto mb-2" />Nenhum contato de cobrança registrado.</td></tr>
              : logs.map(item => <tr key={item.id} className="align-top transition-colors hover:bg-muted/30">
                <td className="px-4 py-3 font-semibold text-foreground">{channelLabel(item.channel)}</td>
                <td className="px-4 py-3 tabular-nums text-muted-foreground">{new Date(item.contacted_at).toLocaleString("pt-BR")}</td>
                <td className="max-w-[360px] whitespace-pre-wrap break-words px-4 py-3 text-foreground">{item.note}</td>
                <td className="px-4 py-3 font-medium tabular-nums text-primary">{item.next_follow_up_at ? new Date(item.next_follow_up_at).toLocaleString("pt-BR") : "—"}</td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>}

    {open && <AdminDialog open onClose={() => { if (!mutation.isPending) setOpen(false); }} title="Novo contato de cobrança" className="max-w-xl" footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={() => { if (!mutation.isPending) setOpen(false); }} disabled={mutation.isPending}>Cancelar</AdminButton><AdminButton onClick={() => void submit()} loading={mutation.isPending} loadingText="Salvando...">Registrar contato</AdminButton></div>}><div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2"><FSelect label="Canal" value={channel} options={CHANNEL_OPTIONS} onChange={(event: any) => setChannel(event.target.value as FinancialCollectionChannel)} /><FSelect label="Parcela (opcional)" value={installmentId} options={[{ value: "", label: "Título geral" }, ...detail.installments.map(item => ({ value: item.id, label: `Parcela ${item.installment_number}/${item.total_installments}` }))]} onChange={(event: any) => setInstallmentId(event.target.value)} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><FInput type="datetime-local" label="Data/hora do contato" error={fieldErrors.contactedAt} value={contactedAt} onChange={(event: any) => { setFieldErrors(current => ({ ...current, contactedAt: undefined })); setContactedAt(event.target.value); }} /><FInput type="datetime-local" label="Próximo retorno" error={fieldErrors.followUpAt} value={followUpAt} onChange={(event: any) => { setFieldErrors(current => ({ ...current, followUpAt: undefined })); setFollowUpAt(event.target.value); }} /></div>
      <FTextarea label="Observação" required error={fieldErrors.note} value={note} onChange={(event: any) => { setFieldErrors(current => ({ ...current, note: undefined })); setNote(event.target.value); }} rows={4} />
      
    </div></AdminDialog>}
  </div>;
}
