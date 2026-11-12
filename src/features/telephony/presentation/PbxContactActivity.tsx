import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { pbxRequest } from "../application/pbx-request";
import {
  callDuration, dispositionLabels, loadCallHistory, localHistoryDate,
  type CallHistoryRow, type HistoryFilters,
} from "../application/call-history";
import { formatPbxNumber } from "./UnionPbxOperatorWorkspace";

type Props = {
  organizationId: string | null;
  number: string;
  active: boolean;
  revision: number;
  onDialNumber: (number: string) => void;
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

export function PbxContactActivity({ organizationId, number, active, revision, onDialNumber, callBusy }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<CallHistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setExpanded(false); setPage(1); setRows([]); setTotal(0); }, [organizationId, number]);
  useEffect(() => {
    const controller = new AbortController();
    const digits = number.replace(/\D/g, "");
    if (!active || !organizationId || digits.length < 3 || digits.length > 15) {
      setLoading(false);
      return () => controller.abort();
    }
    const start = new Date(); start.setDate(start.getDate() - 89);
    const filters: HistoryFilters = {
      from: localHistoryDate(start), to: localHistoryDate(new Date()),
      direction: "", disposition: "",
      number: digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits,
    };
    setLoading(true); setFailed(false);
    void pbxRequest(signal => loadCallHistory(supabase, organizationId, filters, page, 10, signal),
      "Histórico do contato", {signal: controller.signal})
      .then(({data,count,error}) => {
        if (controller.signal.aborted) return;
        if (error) throw error;
        setRows((data || []) as CallHistoryRow[]);
        setTotal(count || 0);
      }).catch(() => {
        if (!controller.signal.aborted) {setRows([]);setTotal(0);setFailed(true);}
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [organizationId, number, active, page, revision]);
  const shown = expanded ? rows : rows.slice(0,3);
  return <section className="mt-6 space-y-3 border-t border-border pt-4" aria-label="Histórico com o contato">
    <div className="flex items-center justify-between gap-2">
      <h4 className="text-sm font-bold">Histórico com o contato</h4>
      {total > 3 && <button type="button" className="shrink-0 text-xs font-semibold text-primary hover:underline"
        onClick={() => { setExpanded(value => !value); setPage(1); }}>
        {expanded ? "Ver menos" : "Ver tudo"}
      </button>}
    </div>
    {loading && <p role="status" className="flex items-center gap-2 py-4 text-xs text-muted-foreground"><LoaderCircle size={14} className="animate-spin"/> Carregando histórico...</p>}
    {!loading && failed && <p role="status" className="text-xs text-muted-foreground">Histórico indisponível no momento.</p>}
    {!loading && !failed && rows.length === 0 && <p className="py-3 text-xs text-muted-foreground">Nenhuma chamada encontrada com este contato.</p>}
    {!loading && !failed && <div className="space-y-1.5">
      {shown.map(row => {
        const answered = row.disposition === "ANSWERED";
        const numberToCall = returnNumber(row);
        const canCall = !answered && !callBusy && /\d{3,15}/.test(numberToCall.replace(/\D/g, ""));
        return <div key={row.id} className="group flex min-w-0 items-center gap-2 rounded-lg p-2 hover:bg-muted/60">
          <span aria-label={resultTitle(row)} className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${answered ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"}`}>
            {!answered ? <PhoneMissed size={17}/> : row.direction === "outbound" ? <PhoneOutgoing size={17}/> : <PhoneIncoming size={17}/>}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold" title={resultTitle(row)}>{resultTitle(row)}</p>
            <p className="truncate text-[11px] text-muted-foreground">{activityDate(row.started_at)} · {callDuration(row.duration_seconds || 0)}</p>
          </div>
          {canCall && <button type="button" aria-label={`Retornar chamada para ${formatPbxNumber(numberToCall)}`}
            title="Retornar chamada" onClick={() => onDialNumber(numberToCall)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-primary hover:bg-primary/10">
            <Phone size={16}/>
          </button>}
        </div>;
      })}
    </div>}
    {expanded && !loading && total > 10 && <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
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
