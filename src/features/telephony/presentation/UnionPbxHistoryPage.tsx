import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Download, History, PhoneIncoming, PhoneMissed, PhoneOutgoing, Search } from 'lucide-react';
import { formatPbxNumber } from './UnionPbxOperatorWorkspace';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { AdminButton, AdminCard, AdminCardContent, AdminSectionEmpty, PageHeader } from '@/shared/ui/admin/AdminLayout';
import { downloadBlobFile } from '@/shared/application/download-file';
import { AdminWorkspaceSkeleton } from '@/shared/ui/admin/AdminWorkspaceSkeleton';
import { FInput, AdminFieldLabel, AdminSelect } from '@/shared/ui/admin/AdminFormControls';
import { PaginationBar } from '@/shared/ui/admin/AdminPagination';
import { pbxRequest } from '../application/pbx-request';
import { callDuration, dispositionLabels, directionLabels, localHistoryDate, loadCallHistory,
  type CallHistoryRow, type HistoryFilters } from '../application/call-history';
import { callHistoryCsv, exportHistoryRows, historyReportParameters, type HistoryReport } from '../application/history-report';

function initialFilters(): HistoryFilters {
  const today = new Date(), start = new Date(); start.setDate(start.getDate() - 6);
  return { from: localHistoryDate(start), to: localHistoryDate(today), direction: '', disposition: '', number: '' };
}

export function UnionPbxHistoryPage({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId } = useAuth();
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10);
  const [rows, setRows] = useState<CallHistoryRow[]>([]), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [summary,setSummary]=useState<HistoryReport|null>(null),[summaryError,setSummaryError]=useState('');
  const [exporting,setExporting]=useState(false),[exportNotice,setExportNotice]=useState('');
  const exportAbortRef=useRef<AbortController|null>(null);
  const summaryGenerationRef=useRef(0);

  // Stop a download before painting another organization/filter or unmounting.
  useLayoutEffect(()=>()=>{exportAbortRef.current?.abort();},[activeOrganizationId,filters]);

  useEffect(()=>{
    let cancelled=false;const controller=new AbortController();setSummary(null);setSummaryError('');
    const generation=++summaryGenerationRef.current;
    if(!activeOrganizationId)return()=>controller.abort();
    void pbxRequest(signal=>supabase.rpc('pbx_call_history_report',historyReportParameters(activeOrganizationId,filters)).abortSignal(signal),
      'Resumo do histórico',{signal:controller.signal}).then(({data,error:reportError})=>{
        if(cancelled||summaryGenerationRef.current!==generation)return;
        if(reportError)throw new Error('Não foi possível consultar o resumo. Verifique a conexão.');
        setSummary(data as HistoryReport);
      }).catch(reason=>{if(!cancelled&&summaryGenerationRef.current===generation)setSummaryError(reason instanceof Error?reason.message:'Falha no resumo.');});
    return()=>{cancelled=true;controller.abort();};
  },[activeOrganizationId,filters,revision]);


  useEffect(() => {
    if (!activeOrganizationId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase.channel(`pbx-history:${activeOrganizationId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "pbx_call_logs",
        filter: `organization_id=eq.${activeOrganizationId}`,
      }, () => {
        if (!timer) timer = setTimeout(() => { timer = undefined; setRevision(value => value + 1); }, 500);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [activeOrganizationId]);

  async function exportCsv(){
    if(!activeOrganizationId||exporting||exportAbortRef.current)return;
    const controller=new AbortController();exportAbortRef.current?.abort();exportAbortRef.current=controller;
    setExporting(true);setExportNotice('');
    try{
      const {data,error:reportError}=await pbxRequest(signal=>supabase.rpc('pbx_call_history_report',
        historyReportParameters(activeOrganizationId,filters,true)).abortSignal(signal),'Exportação do histórico',{signal:controller.signal});
      if(controller.signal.aborted||exportAbortRef.current!==controller)return;
      if(reportError)throw new Error('Não foi possível preparar o arquivo do histórico.');
      const records=exportHistoryRows(data as HistoryReport);
      summaryGenerationRef.current+=1;
      setSummary(data as HistoryReport);
      setSummaryError('');
      setTotal((data as HistoryReport).total_records);
      downloadBlobFile(new Blob([callHistoryCsv(records)],{type:'text/csv;charset=utf-8'}),`pabx-historico-${filters.from}-${filters.to}.csv`);
      setExportNotice(`${records.length} registros exportados em CSV.`);
    }catch(reason){if(!controller.signal.aborted)setExportNotice(reason instanceof Error?reason.message:'Falha na exportação.');}
    finally{if(exportAbortRef.current===controller){exportAbortRef.current=null;setExporting(false);}}
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setRows([]); setTotal(0); setError('');
    if (!activeOrganizationId) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    void pbxRequest(signal => loadCallHistory(supabase, activeOrganizationId, filters, page, pageSize, signal),
      'Consulta do histórico', { signal: controller.signal })
      .then((result: any) => {
        if (cancelled) return;
        if (result.error) throw new Error('Não foi possível consultar o histórico. Tente novamente.');
        setRows((result.data || []) as CallHistoryRow[]); setTotal(result.count || 0);
      }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Falha no histórico.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [activeOrganizationId, filters, page, pageSize, revision]);

  return <div className="space-y-5">
    <PageHeader title="Histórico de ligações" subtitle="Origem, destino e resultado dos registros recebidos do motor de telefonia."
      actions={<><AdminButton variant="secondary" onClick={onBack}>Voltar ao telefone</AdminButton>
        <AdminButton variant="secondary" onClick={exportCsv} disabled={loading||exporting||total===0} loading={exporting} loadingText="Preparando CSV..."><Download size={16}/> Exportar CSV</AdminButton>
        {exporting&&<AdminButton variant="ghost" onClick={()=>{exportAbortRef.current?.abort();setExportNotice('Exportação cancelada.');}}>Cancelar exportação</AdminButton>}
</>} />
    <form className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={event => { event.preventDefault(); setFilters({ ...draft }); setPage(1); }}>
      <FInput label="De" aria-label="Data inicial" type="date" value={draft.from} onChange={(e: any) => setDraft({ ...draft, from: e.target.value })} />
      <FInput label="Até" aria-label="Data final" type="date" value={draft.to} onChange={(e: any) => setDraft({ ...draft, to: e.target.value })} />
      <FInput label="Origem ou destino" aria-label="Pesquisar número" value={draft.number} maxLength={32}
        placeholder="Número ou ramal completo" onChange={(e: any) => setDraft({ ...draft, number: e.target.value })} />
      <div><AdminFieldLabel label="Direção" /><AdminSelect ariaLabel="Filtrar direção" value={draft.direction}
        onValueChange={direction => setDraft({ ...draft, direction })}
        options={[{ value: '', label: 'Todas as direções' }, ...Object.entries(directionLabels).map(([value, label]) => ({ value, label }))]} /></div>
      <div><AdminFieldLabel label="Resultado" /><AdminSelect ariaLabel="Filtrar resultado" value={draft.disposition}
        onValueChange={disposition => setDraft({ ...draft, disposition })}
        options={[{ value: '', label: 'Todos os resultados' }, ...Object.entries(dispositionLabels).map(([value, label]) => ({ value, label }))]} /></div>
      <div className="flex items-end"><AdminButton type="submit" disabled={loading}><Search size={16} /> Pesquisar</AdminButton></div>
    </form>
    <section className="space-y-2" aria-label="Resumo dos registros">
      <h2 className="text-sm font-semibold">Resumo dos registros</h2>
      {summaryError?<p role="status" className="text-xs text-muted-foreground">{summaryError}</p>:!summary?<AdminWorkspaceSkeleton variant="cards" rows={1}/>
       :<div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{[
        ['Registros',summary.total_records],['Trechos atendidos',summary.answered_records],['Trechos sem atendimento',summary.unanswered_records],
        ['Ocupados e falhas',summary.failed_records],['Identificadores de ligação',summary.identified_conversations],['Após atendimento · soma',callDuration(summary.talk_seconds)],
       ].map(([label,value])=><AdminCard key={label}><AdminCardContent className="p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums text-primary">{value}</p></AdminCardContent></AdminCard>)}</div>}
      <p className="text-[11px] leading-5 text-muted-foreground">Totais por trecho no filtro aplicado. “Atendido” indica resposta na sinalização; a soma de durações pode incluir trechos simultâneos. Estes dados não representam valores de cobrança.</p>
    </section>
    {exportNotice&&<p role="status" className="text-sm text-muted-foreground">{exportNotice}</p>}
    <p className="text-xs leading-5 text-muted-foreground">Os registros são pernas de chamadas: transferências e filas podem gerar mais de uma linha com o mesmo identificador. São metadados, não são gravações de voz. Chamadas anteriores à ativação da coleta não são recuperadas automaticamente.</p>
    {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
    <section className="overflow-hidden rounded-xl border border-border bg-card" aria-label="Registros de ligações" aria-busy={loading}>
      <div className="border-b border-border px-4 py-3 text-sm font-semibold">{total} registros no filtro</div>
      {loading ? <AdminWorkspaceSkeleton columns={7} rows={4} />
        : !rows.length && !error ? <AdminSectionEmpty className="gap-2"><History size={28} /><p>Nenhum registro neste período.</p><p>A coleta precisa estar ativa na VPS para receber novas ligações.</p></AdminSectionEmpty>
          : <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{['Início', 'Origem', 'Destino', 'Direção', 'Chamada', 'Duração', 'Conversa'].map(label => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
            <tbody>{rows.map(row => <tr key={row.id} className="border-t border-border">
              <td className="px-4 py-3"><time dateTime={row.started_at}>{new Date(row.started_at).toLocaleString('pt-BR')}</time><p className="max-w-40 truncate text-[10px] text-muted-foreground" title={row.linked_id}>ID: {row.linked_id}</p></td>
              <td className="px-4 py-3">{formatPbxNumber(row.source) || 'Não informado'}{row.source_extension && <p className="text-xs text-muted-foreground">{row.source_extension.display_name} · {row.source_extension.number}</p>}</td>
              <td className="px-4 py-3">{row.destination ? formatPbxNumber(row.destination) : (row.destination_extension ? String(row.destination_extension.number) : row.direction === 'inbound' ? 'Entrada principal' : 'Não informado')}{row.destination_extension && <p className="text-xs text-muted-foreground">{row.destination_extension.display_name} · {row.destination_extension.number}</p>}</td>
              <td className="px-4 py-3">{directionLabels[row.direction] || row.direction}</td>
              <td className="px-4 py-3">
                 <span role="img" title={dispositionLabels[row.disposition] || row.disposition} aria-label={dispositionLabels[row.disposition] || row.disposition}
                   className={row.disposition === "ANSWERED" ? "inline-flex text-emerald-600 dark:text-emerald-400" : "inline-flex text-red-600 dark:text-red-400"}>
                   {row.disposition !== "ANSWERED" ? <PhoneMissed size={19}/> : row.direction === "outbound" ? <PhoneOutgoing size={19}/> : <PhoneIncoming size={19}/>}
                 </span>
               </td>
              <td className="px-4 py-3 tabular-nums">{callDuration(row.duration_seconds)}</td>
              <td className="px-4 py-3 tabular-nums">{callDuration(row.billable_seconds)}</td>
            </tr>)}</tbody>
          </table></div>}
      <PaginationBar page={page} pageSize={pageSize} totalItems={total} onPageChange={setPage}
        onPageSizeChange={size => { setPageSize(size); setPage(1); }} defaultPageSize={10} pageSizeOptions={[10]} storageKey="union.pbx.history.pageSize" showFilteredTotal />
    </section>
  </div>;
}
