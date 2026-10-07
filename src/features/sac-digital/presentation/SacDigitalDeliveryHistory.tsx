import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader } from '@/shared/ui/admin/AdminLayout';
import { LoadingState } from '@/shared/ui/admin/AdminFeedback';
import { deliveryLabel, friendlyEntries } from '../domain/resource-ui.mjs';
import { operateSacDigitalResource } from '../infrastructure/sac-digital.repository';
import { SacResourceValue } from './SacDigitalResources';

export function SacDigitalDeliveryHistory({ organizationId, kind = 'delivery_history' }: {
  organizationId: string; kind?: 'delivery_history' | 'sms_replies';
}) {
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<any[]>([]);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState<string | null>(null);
  const sms = kind === 'sms_replies';
  const reply = (row: any) => row.payload?.data && typeof row.payload.data === 'object' ? row.payload.data : row.payload || {};
  useEffect(() => {
    let alive = true, inFlight = false;
    setLoading(true); setRows([]); setNotice('');
    async function load() {
      if (inFlight || document.visibilityState !== 'visible') return;
      inFlight = true;
      try {
        const { data, error } = await supabase.functions.invoke('sac-digital-api', { body: { action: kind, organization_id: organizationId, page } });
        if (error || !data?.success) throw Error(data?.error || 'Não foi possível carregar o histórico.');
        if (alive) { setRows(data.data.list); setMore(data.has_more); setError(''); }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Não foi possível carregar o histórico.'); }
      finally { inFlight = false; if (alive) setLoading(false); }
    }
    void load(); const timer = window.setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [organizationId, kind, page]);
  async function inspect(row: any) {
    setChecking(row.id); setNotice('');
    try {
      const result = await operateSacDigitalResource(organizationId, 41, { id: row.notification_id });
      setNotice(friendlyEntries(result.data).map(([label, value]: any) => label + ': ' + (typeof value === 'object' ? 'Disponível' : String(value))).join(' · ') || 'Consulta recebida pela SAC. A entrega só aparece quando confirmada.');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Não foi possível consultar esta notificação.'); }
    finally { setChecking(null); }
  }
  return <section aria-label={sms ? 'Respostas SMS' : 'Histórico de envios'} className="admin-operation-mobile-labels space-y-4">
    <AdminCard square>
      <AdminCardHeader><div><h2 className="text-sm font-black">{sms ? 'Respostas SMS' : 'Histórico de envios'}</h2><p className="mt-1 text-xs text-muted-foreground">{sms ? 'Respostas recebidas pelo webhook da empresa.' : 'Cada tentativa permanece registrada. Aceite e fila não confirmam entrega.'}</p></div><span className="shrink-0 text-xs text-muted-foreground">{rows.length} nesta página</span></AdminCardHeader>
      {error && <div role="alert" className="m-4 border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
      {notice && <div role="status" className="m-4 border-l-2 border-primary bg-muted/30 p-3 text-sm">{notice}</div>}
      {loading ? <AdminCardContent><LoadingState text="Carregando histórico..." /></AdminCardContent>
        : rows.length === 0 ? <AdminCardContent><p className="py-8 text-center text-sm text-muted-foreground">Nenhum registro nesta página.</p></AdminCardContent>
        : <div className="overflow-x-auto"><table><thead><tr><th className="text-left">Data e hora</th>{sms ? <><th className="text-left">Contato</th><th className="text-left">Mensagem</th></> : <><th className="text-left">Entrega</th><th className="text-left">Protocolo</th><th className="text-left">Referência</th><th className="text-right">Ações</th></>}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.id || row.source_event_hash}>
            <td data-mobile-label="Data e hora" className="whitespace-nowrap align-top"><SacResourceValue value={sms ? row.received_at : row.created_at} compact /></td>
            {sms ? <><td data-mobile-label="Contato" className="align-top"><SacResourceValue value={reply(row).contact || reply(row).name || reply(row).number || reply(row).phone} compact /></td><td className="min-w-48 max-w-lg align-top"><p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground md:hidden">Mensagem</p><SacResourceValue value={reply(row).text || reply(row).message || reply(row).content || reply(row).body} /></td></>
              : <><td data-mobile-label="Entrega" className="align-top"><p className="font-bold">{deliveryLabel({ delivery_status: row.state })}</p>{row.error_type && <p className="mt-1 text-xs text-red-700 dark:text-red-300">{row.error_type}</p>}</td>
                <td data-mobile-label="Protocolo" className="align-top">{row.protocol || '—'}</td><td data-mobile-label="Referência" className="align-top">{row.notification_id || row.message_id || 'Aguardando referência'}</td>
                <td data-mobile-label="Ações" className="align-top text-right">{row.notification_id ? <AdminButton variant="secondary" size="sm" loading={checking === row.id} onClick={() => void inspect(row)}>Consultar confirmação</AdminButton> : <span className="text-xs text-muted-foreground">Sem confirmação disponível</span>}</td></>}
          </tr>)}</tbody></table></div>}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-muted/35 px-4 py-3">
        <AdminButton variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>Anterior</AdminButton>
        <span className="text-xs font-bold">Página {page}</span>
        <AdminButton variant="secondary" size="sm" disabled={!more || loading} onClick={() => setPage(p => p + 1)}>Próxima</AdminButton>
      </div>
    </AdminCard>
  </section>;
}
