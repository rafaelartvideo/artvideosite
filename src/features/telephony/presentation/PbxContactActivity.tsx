import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { pbxRequest } from "../application/pbx-request";
import {
  callDuration, dispositionLabels, loadCallHistory, localHistoryDate,
  type CallHistoryRow, type HistoryFilters,
} from "../application/call-history";
import { formatPbxNumber } from "../domain/pbx-display";

type Props = {
  organizationId: string | null;
  number: string;
  active: boolean;
  revision: number;
  onDialNumber?: (number: string) => void;
  callBusy: boolean;
};

function activityDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const now = new Date();
  const today = localHistoryDate(now);
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  const day = localHistoryDate(date);
  const prefix = day === today ? "Hoje" : day === localHistoryDate(yesterday) ? "Ontem"
    : date.toLocaleDateString("pt-BR", {day:"2-digit",month:"2-digit"});
  return `${prefix}, ${date.toLocaleTimeString("pt-BR", {hour:"2-digit",minute:"2-digit"})}`;
}
function resultTitle(row: CallHistoryRow) {
  if (row.disposition !== "ANSWERED") return row.disposition === "NO ANSWER" ? "Chamada não atendida"
    : `Chamada: ${dispositionLabels[row.disposition] || "sem atendimento"}`;
  return row.direction === "outbound" ? "Chamada realizada" : row.direction === "inbound"
    ? "Chamada recebida" : "Chamada interna atendida";
}
function returnNumber(row: CallHistoryRow): string {
  return row.direction === "inbound" ? row.source : row.destination;
}
function responsibleExtension(row: CallHistoryRow): string {
  // Exibe o ramal e seu responsável cadastrado quando o vínculo estiver presente no histórico.
  const extension = row.direction === "inbound" ? row.destination_extension : row.source_extension;
  if (!extension || !Number.isInteger(extension.number) || extension.number <= 0) return "";
  const name = extension.display_name?.trim();
  return String(extension.number) + (name && name !== String(extension.number) ? " · " + name : "");
}

export function PbxContactActivity({ organizationId, number, active, revision, onDialNumber, callBusy }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const digits = number.replace(/\D/g, "");
  const normalizedNumber = digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2) : digits;
  const today = new Date(), start = new Date(today);
  start.setDate(start.getDate() - 89);
  const from = localHistoryDate(start), to = localHistoryDate(today);
  const enabled = Boolean(active && organizationId && normalizedNumber.length >= 3 && normalizedNumber.length <= 15);
  const historyQuery = useQuery({
    queryKey: ["pbx", "contact-history", organizationId, normalizedNumber, from, to, page],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const filters: HistoryFilters = { from, to, direction: "", disposition: "", number: normalizedNumber };
      const {data,count,error} = await pbxRequest(requestSignal =>
        loadCallHistory(supabase, organizationId!, filters, page, 10, requestSignal),
        "Histórico do contato", { signal });
      if (error) throw error;
      return { data: (data || []) as CallHistoryRow[], count: count || 0 };
    },
  });
  useEffect(() => { setExpanded(false); setPage(1); }, [organizationId, number]);
  useEffect(() => {
    if (revision > 0 && enabled) void queryClient.invalidateQueries({
      queryKey: ["pbx", "contact-history", organizationId, normalizedNumber],
    });
  }, [revision, enabled, organizationId, normalizedNumber, queryClient]);
  const total = historyQuery.data?.count || 0;
  const ready = Boolean(historyQuery.data);
  const failed = historyQuery.isError && !ready;
  const currentRows = historyQuery.data?.data || [];
  const shown = expanded ? currentRows : currentRows.slice(0, 3);
  return <section className="mt-6 space-y-3 border-t border-border pt-4" aria-label="Histórico com o contato">
    <div className="flex items-center justify-between gap-2">
      <h4 className="text-sm font-bold">Histórico com o contato</h4>
      {total > 3 && <button type="button" className="shrink-0 text-xs font-semibold text-primary hover:underline"
        onClick={() => { setExpanded(value => !value); setPage(1); }}>
        {expanded ? "Ver menos" : "Ver tudo"}
      </button>}
    </div>
    {!ready && !failed && <div role="status" aria-label="Preparando histórico" className="space-y-2 py-2" data-pbx-history-skeleton="true">
      <span className="sr-only">Preparando histórico...</span>
      {[0,1,2].map(item => <div key={item} className="flex animate-pulse items-center gap-2 rounded-lg p-2">
        <span className="h-9 w-9 shrink-0 rounded-full bg-muted"/>
        <span className="min-w-0 flex-1 space-y-2">
          <span className="block h-3 w-2/3 rounded bg-muted"/>
          <span className="block h-2.5 w-4/5 rounded bg-muted"/>
        </span>
      </div>)}
    </div>}
    {failed && !ready && <p role="status" className="text-xs text-muted-foreground">Histórico indisponível no momento.</p>}
    {ready && !failed && currentRows.length === 0 && <p className="py-5 text-center text-xs text-muted-foreground">Nenhuma chamada encontrada com este contato.</p>}
    {ready && !failed && <div className="space-y-1.5">
      {shown.map(row => {
        const answered = row.disposition === "ANSWERED";
        const extension = responsibleExtension(row);
        const numberToCall = returnNumber(row);
        const canCall = Boolean(onDialNumber) && !answered && !callBusy && /\d{3,15}/.test(numberToCall.replace(/\D/g, ""));
        return <div key={row.id} className="group flex min-w-0 items-center gap-2 rounded-lg p-2 hover:bg-muted/60">
          <span aria-label={resultTitle(row)} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${answered ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
            {!answered ? <PhoneMissed size={17}/> : row.direction === "outbound" ? <PhoneOutgoing size={17}/> : <PhoneIncoming size={17}/>}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold" title={resultTitle(row)}>{resultTitle(row)}</p>
            <p className="truncate text-[11px] text-muted-foreground">{activityDate(row.started_at)} · {callDuration(row.duration_seconds || 0)}{extension ? ` - ${extension}` : ""}</p>
          </div>
          {canCall && <button type="button" aria-label={`Retornar chamada para ${formatPbxNumber(numberToCall)}`}
            title="Retornar chamada" onClick={() => onDialNumber?.(numberToCall)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-primary hover:bg-primary/10">
            <Phone size={16}/>
          </button>}
        </div>;
      })}
    </div>}
    {expanded && ready && total > 10 && <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
      <span>{page} / {Math.ceil(total / 10)}</span>
      <div className="flex gap-1">
        <button type="button" aria-label="Página anterior do contato" disabled={page <= 1}
          className="rounded-md border border-border p-1 disabled:opacity-40" onClick={() => setPage(v => Math.max(1,v-1))}><ChevronLeft size={15}/></button>
        <button type="button" aria-label="Próxima página do contato" disabled={page >= Math.ceil(total / 10)}
          className="rounded-md border border-border p-1 disabled:opacity-40" onClick={() => setPage(v => v+1)}><ChevronRight size={15}/></button>
      </div>
    </div>}
    {!expanded && total > 3 && <p className="text-[11px] text-muted-foreground">{total} registros nos últimos 90 dias</p>}
  </section>;
}
