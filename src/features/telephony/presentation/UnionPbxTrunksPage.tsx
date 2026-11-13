import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { FInput } from '@/shared/ui/admin/AdminFormControls';
import { PageHeader, AdminButton } from '@/shared/ui/admin/AdminLayout';
import { pbxRequest } from '../application/pbx-request';
import { legacyRegistrationLabel, listLegacySipTrunks, setLegacySipTrunkEnabled, type LegacySipTrunk, listSipTrunks, newSipTrunk, retrySipTrunk, saveSipTrunk, type SipTrunk, type SipTrunkDraft } from '../application/sip-trunks';

type Extension = { id: string; organization_id: string; number: number; display_name: string; endpoint_name: string; desired_enabled: boolean; provisioning_status: string };
const statusLabels = { pending: 'Aguardando aplicação', applied: 'Configuração aplicada', failed: 'Falha na aplicação' };

export function UnionPbxTrunksPage({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId, hasPermission, organizations } = useAuth();
  if (!hasPermission('pbx.manage')) return <p role="alert">Você não tem permissão para gerenciar o PABX.</p>;
  if (!activeOrganizationId) return <p>Selecione uma empresa.</p>;
  const platform = organizations.some(item => item.organization_id === activeOrganizationId && item.is_platform_operator === true);
  // A tenant switch destroys the form, password, requests and operation lock together.
  return <TrunksWorkspace key={activeOrganizationId} organizationId={activeOrganizationId} platform={platform} onBack={onBack} />;
}

function TrunksWorkspace({ organizationId, platform, onBack }: { organizationId: string; platform: boolean; onBack: () => void }) {
  const scope = useRef<AbortController | null>(null);
  const operation = useRef(false);
  const [legacyTrunks, setLegacyTrunks] = useState<LegacySipTrunk[]>([]);
  const [confirmDisable, setConfirmDisable] = useState<string | null>(null);
  const [, setClock] = useState(0);
  useEffect(() => { const timer = setInterval(() => setClock(value => value + 1), 30000); return () => clearInterval(timer); }, []);
  const [trunks, setTrunks] = useState<SipTrunk[]>([]);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [draft, setDraft] = useState<SipTrunkDraft | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    scope.current = controller;
    return () => { controller.abort(); scope.current = null; };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void (async () => {
      try {
        const [rows, legacyRows, result] = await Promise.all([
          listSipTrunks(supabase, organizationId, controller.signal),
          listLegacySipTrunks(supabase, organizationId, controller.signal),
          pbxRequest(signal => supabase.from('pbx_extensions')
            .select('id,organization_id,number,display_name,endpoint_name,desired_enabled,provisioning_status')
            .eq('organization_id', organizationId).order('number').limit(300).abortSignal(signal), 'Consulta dos ramais', { signal: controller.signal }),
        ]);
        if (controller.signal.aborted) return;
        if (result.error) throw new Error();
        setLegacyTrunks(legacyRows.filter(item => item.organization_id === organizationId));
        setConfirmDisable(null);
        setTrunks(rows.filter(item => item.organization_id === organizationId));
        setExtensions(((result.data || []) as Extension[]).filter(item => item.organization_id === organizationId));
      } catch {
        if (!controller.signal.aborted) { setTrunks([]); setLegacyTrunks([]); setExtensions([]); setError('Não foi possível carregar os troncos e os ramais. Atualize antes de editar.'); }
      } finally {
        if (!controller.signal.aborted) { operation.current = false; setBusy(false); setLoading(false); }
      }
    })();
    return () => controller.abort();
  }, [organizationId, reload]);

  const eligible = extensions.filter(item => item.desired_enabled && (item.provisioning_status === 'applied' ||
    (platform && item.provisioning_status === 'manual' && item.number === 301 && item.endpoint_name === 'union-301')));
  function open(item?: SipTrunk) {
    setPassword(''); setError(''); setNotice('');
    setDraft(item ? { ...item, inbound_enabled: false, allowed_extension_ids: [...item.allowed_extension_ids] } : newSipTrunk());
  }
  async function mutate(item?: SipTrunk) {
    const controller = scope.current;
    if (!controller || controller.signal.aborted || operation.current || loading) return;
    if (!item && !draft) return;
    if (!item && draft) {
      if(platform&&draft.enabled){setError('A linha FVX da Union é preservada pela configuração atual. Selecione a empresa parceira para habilitar um novo tronco.');return;}
      if (!draft.name.trim() || !draft.host.trim() || !draft.transport.trim() || !Number.isInteger(draft.port) || draft.port < 1 || draft.port > 65535 ||
        (draft.enabled && (draft.allowed_extension_ids.some(id => !eligible.some(extension => extension.id === id)) || !draft.allowed_extension_ids.length))) {
        setError('Confira nome, servidor, porta, transporte e ramais autorizados. Para ativar a saída, selecione pelo menos um ramal disponível.'); return;
      }
      if (draft.enabled && trunks.some(trunk => trunk.enabled && trunk.id !== draft.id)) {
        setError('Desative o outro tronco antes de habilitar este. Cada empresa pode ter somente um tronco de saída habilitado.'); return;
      }
    }
    operation.current = true; setBusy(true); setError(''); setNotice('');
    let confirmed = false;
    try {
      if (item) await retrySipTrunk(supabase, organizationId, item.id, controller.signal);
      else await saveSipTrunk(supabase, organizationId, { ...draft!, inbound_enabled: false }, password, controller.signal);
      if (controller.signal.aborted) return;
      confirmed = true;
      setLoading(true);
      setDraft(null); setNotice('Solicitação salva. Aguardando aplicação por um agente compatível, quando não houver chamadas ativas.');
      setReload(value => value + 1);
    } catch {
      if (!controller.signal.aborted) setError('Operação sem confirmação. Atualize a lista antes de repetir a alteração.');
    } finally {
      if (!controller.signal.aborted) {
        setPassword('');
        // Keep the lock until the authoritative refresh completes: no write gap.
        if (!confirmed) { operation.current = false; setBusy(false); }
      }
    }
  }
  async function toggle(item: SipTrunk | LegacySipTrunk, legacy: boolean, retry = false) {
    const controller = scope.current;
    if (!controller || controller.signal.aborted || operation.current || loading || error) return;
    if (item.organization_id !== organizationId || item.status === 'pending') return;
    if (legacy && !(item as LegacySipTrunk).can_control) return;
    if (!legacy && !item.enabled && (platform || !(item as SipTrunk).allowed_extension_ids.length ||
      (item as SipTrunk).allowed_extension_ids.some(id => !eligible.some(extension => extension.id === id)))) {
      setError('Confira os ramais autorizados antes de ativar a saída. Novos troncos da plataforma permanecem desabilitados.'); return;
    }
    if (!retry && item.enabled && confirmDisable !== item.id) { setConfirmDisable(item.id); return; }
    operation.current = true; setBusy(true); setError(''); setNotice(''); setPassword(''); setDraft(null);
    let confirmed = false;
    try {
      if (legacy) await setLegacySipTrunkEnabled(supabase, organizationId, item.id, retry ? item.enabled : !item.enabled, item.revision, controller.signal);
      else await saveSipTrunk(supabase, organizationId, { ...item as SipTrunk, enabled: !item.enabled, inbound_enabled: false }, '', controller.signal);
      if (controller.signal.aborted) return;
      confirmed = true; setLoading(true); setConfirmDisable(null);
      setNotice('Solicitação salva. Aguarde a aplicação na central; os dados da configuração foram preservados.');
      setReload(value => value + 1);
    } catch {
      if (!controller.signal.aborted) setError('Operação sem confirmação. Atualize a lista antes de repetir a alteração.');
    } finally {
      if (!controller.signal.aborted && !confirmed) { operation.current = false; setBusy(false); }
    }
  }
  function disableConfirmation(item: SipTrunk | LegacySipTrunk, legacy: boolean) {
    return confirmDisable === item.id && <div className="space-y-2 text-sm" role="alert">
      <p>{legacy ? 'Desativar interrompe entrada e saída desta linha quando não houver chamadas em andamento.' : 'Desativar interrompe a saída desta linha quando não houver chamadas em andamento.'} Os dados e a senha serão preservados.</p>
      <div className="flex gap-2"><AdminButton disabled={busy} onClick={() => void toggle(item, legacy)}>Confirmar desativação</AdminButton><AdminButton disabled={busy} onClick={() => setConfirmDisable(null)}>Cancelar</AdminButton></div>
    </div>;
  }
  const update = (field: keyof SipTrunkDraft, value: string | number | boolean | string[]) => setDraft(current => current ? { ...current, [field]: value } : current);
  return <div className="min-w-0 space-y-5 text-foreground">
    <PageHeader title="Troncos SIP" subtitle="Configure a operadora e autorize os ramais de saída da empresa." />
    <div className="flex flex-wrap gap-2"><AdminButton onClick={onBack}>Voltar</AdminButton><AdminButton disabled={busy || loading} onClick={() => { setPassword(''); setDraft(null); setReload(value => value + 1); }}>Atualizar</AdminButton><AdminButton disabled={busy || loading || !!error} onClick={() => open()}>Novo tronco</AdminButton></div>
    <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground space-y-2">
      <p>Somente um tronco de saída pode ficar habilitado por empresa. Essa regra também é verificada no servidor.</p>
      <p>Você pode salvar com o agente offline. Um agente compatível aplica a configuração somente quando não houver chamadas ativas. Configuração aplicada não confirma registro na operadora.</p>
      <p role="note">Entrada para este tronco ainda não está disponível. Essa limitação vale para novos troncos gerenciados; mudar a saída não transfere o número de entrada.</p>
      <p>A mesma conta SIP pode ser salva inativa em outras empresas, mas só pode estar ativa em uma por vez. Desative na empresa atual, aguarde a desativação aplicada e então ative na empresa de destino. Configure os dados uma vez em cada empresa; credenciais não são compartilhadas automaticamente. Para reutilizar uma configuração salva, não é necessário redigitar a senha.</p>
      {platform&&<p>A FVX da Union continua na configuração existente. A ativação de novos troncos nesta etapa é destinada às empresas parceiras.</p>}
    </div>
    {error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Carregando troncos…</p> : <div className="space-y-3">{legacyTrunks.map(item => <article key={`legacy-${item.id}`} className="rounded-xl border border-border bg-card p-4 space-y-2">
      <h2 className="font-semibold break-words">{item.name}</h2><p className="text-sm font-medium">Configurada na VPS</p>
      <p className="text-sm">{statusLabels[item.status]} · Estado solicitado: {item.enabled ? 'ativada' : 'desativada'}</p>
      <p className="text-sm">{legacyRegistrationLabel(item)} · Estado observado: {item.observed_enabled === null ? 'desconhecido' : item.observed_enabled ? 'ativada' : 'desativada'}</p>
      <p className="text-sm text-muted-foreground">Última verificação: {item.checked_at && Number.isFinite(Date.parse(item.checked_at)) ? new Date(item.checked_at).toLocaleString('pt-BR') : 'Sem informação'}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">{[['Operadora', item.provider], ['Servidor', item.host], ['Porta', item.port], ['Usuário', item.username]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-all">{value || 'Não informado'}</dd></div>)}</dl>
      <p className="text-sm text-muted-foreground">Ativar ou desativar preserva a configuração existente na VPS.</p>
      {item.last_error && <p role="alert" className="text-sm text-destructive">A central informou uma falha. Atualize para conferir o estado antes de repetir.</p>}
      {!item.can_control && <p className="text-sm text-muted-foreground">Controle indisponível até a preparação do agente da VPS.</p>}
      <AdminButton disabled={busy || !!error || !item.can_control || item.status === 'pending'} onClick={() => void toggle(item, true)}>{item.enabled ? 'Desativar' : 'Ativar'}</AdminButton>
      {item.status === 'failed' && <AdminButton disabled={busy || !!error || !item.can_control} onClick={() => void toggle(item, true, true)}>Tentar novamente</AdminButton>}
      {item.observed_enabled !== null && item.observed_enabled !== item.enabled && <p className="text-sm text-muted-foreground">Estado observado ainda difere do solicitado. Aguarde a aplicação e atualize a lista.</p>}
      {disableConfirmation(item, true)}
    </article>)}{!trunks.length && !legacyTrunks.length && <p className="text-muted-foreground">Nenhum tronco cadastrado nesta empresa.</p>}{trunks.map(item => <article key={item.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
      <h2 className="font-semibold break-words">{item.name}</h2><p className="text-sm">{statusLabels[item.status] || 'Estado indisponível'} · Saída {item.enabled ? 'habilitada' : 'desabilitada'}</p>
      <dl className="grid gap-2 text-sm sm:grid-cols-2">{[['Operadora', item.provider], ['Servidor', item.host], ['Porta', item.port], ['Transporte', item.transport], ['Usuário', item.username]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="break-all">{value || 'Não informado'}</dd></div>)}</dl>
      {item.last_error && <p role="alert" className="text-sm text-destructive">A central informou uma falha. Revise a configuração antes de reprocessar.</p>}
      <div className="flex flex-wrap gap-2"><AdminButton disabled={busy || !!error} onClick={() => open(item)}>Editar</AdminButton><AdminButton disabled={busy || !!error || item.status === 'pending' || (!item.enabled && (platform || !item.allowed_extension_ids.length || item.allowed_extension_ids.some(id => !eligible.some(extension => extension.id === id))))} onClick={() => void toggle(item, false)}>{item.enabled ? 'Desativar' : 'Ativar'}</AdminButton>{item.status === 'failed' && <AdminButton disabled={busy || !!error} onClick={() => void mutate(item)}>Reprocessar</AdminButton>}</div>
      {disableConfirmation(item, false)}
    </article>)}</div>}
    {draft && <form className="rounded-xl border border-border bg-card p-4 space-y-4" onSubmit={event => { event.preventDefault(); void mutate(); }}>
      <h2 className="font-semibold">{draft.id ? 'Editar tronco' : 'Novo tronco'}</h2>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        {(['name', 'provider', 'host', 'username', 'transport', 'realm'] as const).map(field => <FInput key={field} id={`trunk-${field}`} label={{ name: 'Nome', provider: 'Operadora', host: 'Servidor SIP', username: 'Usuário SIP', transport: 'Transporte existente na central', realm: 'Realm' }[field]} value={draft[field]} onChange={(event: React.ChangeEvent<HTMLInputElement>) => update(field, event.target.value)} />)}
        <FInput id="trunk-port" label="Porta" type="number" min={1} max={65535} value={draft.port} onChange={(event: React.ChangeEvent<HTMLInputElement>) => update('port', Number(event.target.value))} />
        <FInput id="trunk-password" label="Senha SIP" type="password" autoComplete="new-password" value={password} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setPassword(event.target.value)} hint="Deixe em branco para preservar a senha existente. A senha nunca é exibida novamente." />
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy||platform} checked={draft.enabled} onChange={event => update('enabled', event.target.checked)} />Habilitar chamadas de saída explicitamente</label>
      <fieldset disabled={busy} className="space-y-2"><legend className="font-medium">Ramais autorizados a usar a saída</legend>{!eligible.length && <p className="text-sm text-muted-foreground">Nenhum ramal habilitado com configuração aplicada disponível.</p>}{eligible.map(extension => <label key={extension.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.allowed_extension_ids.includes(extension.id)} onChange={event => update('allowed_extension_ids', event.target.checked ? [...draft.allowed_extension_ids, extension.id] : draft.allowed_extension_ids.filter(id => id !== extension.id))} />{extension.number} — {extension.display_name}</label>)}
        {draft.allowed_extension_ids.some(id => !eligible.some(extension => extension.id === id)) && <p role="alert" className="text-sm text-destructive">Há ramais indisponíveis na autorização existente. <AdminButton type="button" variant="ghost" onClick={() => update('allowed_extension_ids', draft.allowed_extension_ids.filter(id => eligible.some(extension => extension.id === id)))}>Remover ramais indisponíveis</AdminButton></p>}
      </fieldset>
      <div className="flex gap-2"><AdminButton type="submit" disabled={busy || loading}>{busy ? 'Salvando…' : 'Salvar configuração'}</AdminButton><AdminButton disabled={busy} onClick={() => { setPassword(''); setDraft(null); }}>Cancelar</AdminButton></div>
    </form>}
  </div>;
}
