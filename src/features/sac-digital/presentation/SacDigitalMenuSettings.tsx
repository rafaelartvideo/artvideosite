import { useEffect, useState } from 'react';
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader, AdminCardToolbar, Section } from '@/shared/ui/admin/AdminLayout';
import { FInput, FSelect, FTextarea, FToggle } from '@/shared/ui/admin/AdminFormControls';
import { configureSacDigitalMenu, getSacDigitalMenuSettings, getSacDigitalResourceHealth, sacDigitalMenuUrl, type SacDigitalMenuSettings } from '../infrastructure/sac-digital.repository';

const HEALTH_LABELS: Record<string, string> = {
  pending: 'Aguardando processamento', running: 'Em processamento', failed: 'Com falha',
  projection_pending: 'Eventos pendentes', reconciliation_pending: 'Sincronizações pendentes',
  oldest_pending_at: 'Pendência mais antiga', last_completed_at: 'Último processamento',
};
export function SacDigitalMenuConfiguration({ organizationId, token }: { organizationId: string; token?: string | null }) {
  const [settings, setSettings] = useState<SacDigitalMenuSettings>({ enabled: false, text: '', choices: [], source: 'static' });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [notice, setNotice] = useState('');
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    let active = true; setLoading(true);
    getSacDigitalMenuSettings(organizationId).then(data => { if (active) setSettings(data); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    getSacDigitalResourceHealth(organizationId).then(data => { if (active) setHealth((data.data || data) as Record<string, unknown>); }).catch(() => {});
    return () => { active = false; };
  }, [organizationId]);
  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try { setSettings(await configureSacDigitalMenu(organizationId, settings)); setNotice('Menu salvo.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível salvar o menu.'); } finally { setBusy(false); }
  };
  return <div className="space-y-5">
    <Section title="Menu personalizado" description="Configure as opções apresentadas ao cliente na SAC Digital.">
      <form className="space-y-5" onSubmit={e => { e.preventDefault(); void save(); }}>
        <FToggle label="Ativar menu" description="Disponibiliza as opções no callback desta empresa." checked={settings.enabled} disabled={loading || busy} onChange={enabled => setSettings({ ...settings, enabled })} />
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <FTextarea label="Mensagem de abertura" aria-label="Mensagem de abertura" rows={4} disabled={loading || busy} value={settings.text} onChange={(e: any) => setSettings({ ...settings, text: e.target.value })} />
          <FSelect label="Origem das opções" value={settings.source} disabled={loading || busy} options={[{ value: 'static', label: 'Opções configuradas' }, { value: 'service_order_status', label: 'Situação da ordem de serviço' }]} onChange={(e: any) => setSettings({ ...settings, source: e.target.value as SacDigitalMenuSettings['source'] })} />
        </div>
        {settings.source === 'static' ? <AdminCard square>
          <AdminCardToolbar><div className="flex-1"><p className="text-xs font-bold">Opções do menu</p><p className="mt-1 text-[11px] text-muted-foreground">Cada opção deve ter um identificador único e um texto para o cliente.</p></div><AdminButton variant="secondary" size="sm" disabled={loading || busy} onClick={() => setSettings({ ...settings, choices: [...settings.choices, { tag: '', text: '' }] })}>Adicionar opção</AdminButton></AdminCardToolbar>
          <AdminCardContent className="space-y-4">{!settings.choices.length ? <p className="py-3 text-center text-sm text-muted-foreground">Nenhuma opção configurada.</p> : settings.choices.map((choice, index) => <div key={index} className="grid min-w-0 gap-3 border-b border-border pb-4 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
            <FInput label={'Identificador da opção ' + (index + 1)} aria-label={'Identificador da opção ' + (index + 1)} required disabled={busy} value={choice.tag} onChange={(e: any) => setSettings({ ...settings, choices: settings.choices.map((c, i) => i === index ? { ...c, tag: e.target.value } : c) })} />
            <FInput label="Texto apresentado ao cliente" aria-label={'Texto da opção ' + (index + 1)} required disabled={busy} value={choice.text} onChange={(e: any) => setSettings({ ...settings, choices: settings.choices.map((c, i) => i === index ? { ...c, text: e.target.value } : c) })} />
            <AdminButton variant="secondary" size="sm" disabled={busy} className="mb-0.5" onClick={() => setSettings({ ...settings, choices: settings.choices.filter((_, i) => i !== index) })}>Remover</AdminButton>
          </div>)}</AdminCardContent>
        </AdminCard> : <p className="border-l-2 border-primary bg-muted/30 p-3 text-sm text-muted-foreground">O menu consulta as ordens de serviço vinculadas ao contato identificado. Nenhuma opção manual é necessária.</p>}
        {token && <FInput label="URL privada do menu" aria-label="URL privada do menu" readOnly value={sacDigitalMenuUrl(token)} hint="Cadastre este endereço no menu HTTP da SAC Digital e mantenha-o privado." />}
        {error && <p role="alert" className="border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
        {notice && <p role="status" className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{notice}</p>}
        <div className="flex justify-end border-t border-border pt-4"><AdminButton type="submit" loading={busy} disabled={loading}>Salvar menu</AdminButton></div>
      </form>
    </Section>
    {health && <AdminCard square><AdminCardHeader><h3 className="text-xs font-black uppercase tracking-wider">Saúde da sincronização</h3></AdminCardHeader><AdminCardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(health).filter(([name]) => HEALTH_LABELS[name]).map(([name, value]) => <div key={name} className="min-w-0"><p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{HEALTH_LABELS[name]}</p><p className="break-words text-sm font-bold">{value == null ? '—' : typeof value === 'string' && name.endsWith('_at') ? new Date(value).toLocaleString('pt-BR') : String(value)}</p></div>)}
    </AdminCardContent></AdminCard>}
  </div>;
}
