import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Plus } from "lucide-react";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { useAuth } from "@/lib/auth";
import { FInput, FSelect, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
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
  const canView = hasPermission("finance.collections.view") || hasPermission("finance.collections.create");
  const canCreate = hasPermission("finance.collections.create");
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<FinancialCollectionChannel>("whatsapp");
  const [installmentId, setInstallmentId] = useState("");
  const [note, setNote] = useState("");
  const [contactedAt, setContactedAt] = useState(localDateTimeInput);
  const [followUpAt, setFollowUpAt] = useState("");
  const [message, setMessage] = useState("");

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
      setMessage("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.finance.collections(organizationKey, detail.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.finance.entry(organizationKey, detail.id) }),
      ]);
    },
  });

  if (detail.entry_type !== "receivable" || !canView) return null;
  const logs = query.data || [];
  const error = query.error || mutation.error;
  const errorText = message || (error instanceof Error ? error.message : "");

  const submit = async () => {
    if (!note.trim()) { setMessage("Informe a observação da cobrança."); return; }
    if (!toIso(contactedAt)) { setMessage("Informe uma data/hora de contato válida."); return; }
    if (followUpAt && !toIso(followUpAt)) { setMessage("Informe uma data/hora válida para o próximo retorno."); return; }
    try {
      setMessage("");
      await mutation.mutateAsync();
    } catch {
      // Error is rendered by mutation state.
    }
  };

  const openForm = () => {
    setOpen(true);
    setMessage("");
    setContactedAt(localDateTimeInput());
  };

  return <AdminCard>
    <AdminCardHeader>
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="text-sm font-black text-[#0d1b2e]">Cobranças</h3><p className="mt-1 text-xs text-[#5a6a82]">Histórico de contatos e próximos retornos deste recebível.</p></div>
        {canCreate && <AdminButton size="sm" onClick={openForm}><Plus size={14} /> Novo contato</AdminButton>}
      </div>
    </AdminCardHeader>
    <AdminCardContent className="space-y-3">
      {errorText && !open && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorText}</div>}
      {query.isLoading ? <p className="text-sm text-[#5a6a82]">Carregando cobranças...</p> : logs.length === 0 ? <div className="flex items-center gap-2 rounded-xl border border-dashed border-[#0d1b2e]/15 p-4 text-sm text-[#5a6a82]"><MessageCircle size={17} /> Nenhum contato de cobrança registrado.</div> : logs.map(item => <div key={item.id} className="rounded-xl border border-[#0d1b2e]/8 p-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><p className="text-sm font-black text-[#0d1b2e]">{channelLabel(item.channel)}</p><p className="text-xs font-semibold text-[#5a6a82]">{new Date(item.contacted_at).toLocaleString("pt-BR")}</p></div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-[#44546a]">{item.note}</p>
        {item.next_follow_up_at && <p className="mt-2 text-xs font-bold text-[#0057e7]">Próximo retorno: {new Date(item.next_follow_up_at).toLocaleString("pt-BR")}</p>}
      </div>)}
    </AdminCardContent>

    {open && <div className="fixed inset-0 z-[135] flex items-center justify-center bg-[#07111f]/65 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl"><div className="border-b px-5 py-4"><h2 className="text-lg font-black text-[#0d1b2e]">Novo contato de cobrança</h2></div><div className="space-y-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2"><FSelect label="Canal" value={channel} options={CHANNEL_OPTIONS} onChange={(event: any) => setChannel(event.target.value as FinancialCollectionChannel)} /><FSelect label="Parcela (opcional)" value={installmentId} options={[{ value: "", label: "Título geral" }, ...detail.installments.map(item => ({ value: item.id, label: `Parcela ${item.installment_number}/${item.total_installments}` }))]} onChange={(event: any) => setInstallmentId(event.target.value)} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><FInput type="datetime-local" label="Data/hora do contato" value={contactedAt} onChange={(event: any) => setContactedAt(event.target.value)} /><FInput type="datetime-local" label="Próximo retorno" value={followUpAt} onChange={(event: any) => setFollowUpAt(event.target.value)} /></div>
      <FTextarea label="Observação" required value={note} onChange={(event: any) => setNote(event.target.value)} rows={4} />
      {errorText && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorText}</div>}
    </div><div className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end"><AdminButton variant="secondary" onClick={() => { if (!mutation.isPending) setOpen(false); }} disabled={mutation.isPending}>Cancelar</AdminButton><AdminButton onClick={() => void submit()} loading={mutation.isPending} loadingText="Salvando...">Registrar contato</AdminButton></div></div></div>}
  </AdminCard>;
}
