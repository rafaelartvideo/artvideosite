import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase, supabaseUrl } from '@/lib/supabase';
import { FInput, AdminSelect, AdminFieldLabel } from '@/shared/ui/admin/AdminFormControls';
import { PageHeader, AdminButton } from '@/shared/ui/admin/AdminLayout';
import { createRecordingsApi, newRecordingPolicy, type Recording, type RecordingPolicy, type RecordingPolicyDraft, type RecordingPrompt, type RecordingScope } from '../application/recordings';

export function UnionPbxRecordingsPage({ onBack }: { onBack: () => void }) {
 const { activeOrganizationId, hasPermission } = useAuth();
 const manage = hasPermission('pbx.recordings.manage'); const view = hasPermission('pbx.recordings.view');
 if (!manage && !view) return <p role="alert">Você não tem permissão para acessar gravações.</p>;
 if (!activeOrganizationId) return <p>Selecione uma empresa.</p>;
 return <RecordingsWorkspace key={`${activeOrganizationId}:${manage}:${view}`} organizationId={activeOrganizationId} manage={manage} view={view} onBack={onBack} />;
}
function RecordingsWorkspace({ organizationId, manage, view, onBack }: { organizationId: string; manage: boolean; view: boolean; onBack: () => void }) {
 const scope = useRef<AbortController | null>(null); const audio = useRef<HTMLAudioElement | null>(null); const operation = useRef(false);
 const [policy, setPolicy] = useState<RecordingPolicy | null>(null); const [draft, setDraft] = useState<RecordingPolicyDraft>(newRecordingPolicy);
 const [rows, setRows] = useState<Recording[]>([]); const [prompts, setPrompts] = useState<RecordingPrompt[]>([]);
 const [acknowledged, setAcknowledged] = useState(false); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [reload, setReload] = useState(0); const [playing, setPlaying] = useState('');
 function clearAudio() { if (audio.current) { audio.current.pause(); audio.current.removeAttribute('src'); audio.current.load(); } }
 useEffect(() => {
  const controller = new AbortController(); scope.current = controller; const media = audio.current;
  const api = createRecordingsApi(supabase, organizationId, controller.signal);
  setLoading(true); setError(''); setAcknowledged(false); clearAudio(); setPlaying(''); setPolicy(null); setRows([]); setPrompts([]); setDraft(newRecordingPolicy());
  void Promise.all([manage ? api.policy() : Promise.resolve(null), manage ? api.prompts() : Promise.resolve([]), view ? api.list() : Promise.resolve([])]).then(([p, a, r]) => {
   if (controller.signal.aborted) return;
   setPolicy(p); setDraft(p || newRecordingPolicy()); setPrompts(a); setRows(r || []);
  }).catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar as gravações. Atualize antes de editar.'); }).finally(() => { if (!controller.signal.aborted) { setLoading(false); setBusy(false); operation.current = false; } });
  return () => { controller.abort(); scope.current = null; if (media) { media.pause(); media.removeAttribute('src'); media.load(); } };
 }, [organizationId, manage, view, reload]);
 const update = <K extends keyof RecordingPolicyDraft>(key: K, value: RecordingPolicyDraft[K]) => { setDraft(d => ({ ...d, [key]: value })); setAcknowledged(false); };
 async function save() {
  const controller = scope.current; if (!controller || controller.signal.aborted || loading || operation.current) return;
  operation.current = true; setBusy(true); setError(''); setNotice('');
  try {
   await createRecordingsApi(supabase, organizationId, controller.signal).save(draft, acknowledged, prompts.map(p => p.id));
   if (controller.signal.aborted) return;
   setNotice('Configuração salva. A aplicação pela central será informada separadamente.'); setReload(n => n + 1);
  } catch { if (!controller.signal.aborted) { setError('Alteração sem confirmação. Confira os campos e atualize antes de repetir. A ativação exige integração pronta e confirmação da empresa.'); setPolicy(null); operation.current = false; setBusy(false); } }
 }
 async function play(id: string) {
  const controller = scope.current; if (!view || !controller || controller.signal.aborted || operation.current) return;
  operation.current = true; setBusy(true); setError(''); clearAudio(); setPlaying('');
  try {
   const url = await createRecordingsApi(supabase, organizationId, controller.signal).playback(id, supabaseUrl);
   if (controller.signal.aborted) return;
   if (audio.current) { audio.current.src = url; setPlaying(id); }
  } catch { if (!controller.signal.aborted) setError('Não foi possível acessar esta gravação.'); }
  finally { if (!controller.signal.aborted) { operation.current = false; setBusy(false); } }
 }
 const scopes: [RecordingScope,string][] = [['internal','Internas'],['inbound','Recebidas'],['outbound','Realizadas']];
 return <div className="min-w-0 space-y-5 text-foreground">
  <PageHeader title="Gravações" subtitle="Gravação automática por empresa, com acesso e retenção controlados." />
  <div className="flex gap-2"><AdminButton onClick={onBack}>Voltar</AdminButton><AdminButton disabled={busy || loading} onClick={() => setReload(n => n + 1)}>Atualizar</AdminButton></div>
  <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-2">
   <p role="status">{policy?.enabled && policy.status === 'applied' && policy.runtime_ready ? 'Política habilitada e aplicada pela central.' : 'Gravações desativadas ou aguardando aplicação pela central.'}</p>
   <p className="text-muted-foreground">Salvar uma configuração não confirma captura de áudio. A ativação depende da integração completa da central e da aplicação da política.</p>
   {manage && !policy?.runtime_ready && <p>A integração ainda não confirmou disponibilidade. Salve somente a configuração desativada.</p>}
   {policy && <p>Configuração: {policy.status === 'applied' ? 'aplicada' : policy.status === 'failed' ? 'falha na aplicação' : 'aguardando aplicação'}.</p>}
   {policy?.last_error && <p role="alert">A central informou falha na aplicação. Revise a configuração.</p>}
  </div>
  {error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status">{notice}</p>}
  <audio ref={audio} controls hidden={!playing} preload="none" onError={() => { clearAudio(); setPlaying(''); setError('Não foi possível reproduzir esta gravação. Solicite o acesso novamente.'); }} />
  {loading ? <p role="status">Carregando gravações…</p> : <>
   {manage && <form onSubmit={e => { e.preventDefault(); void save(); }} className="rounded-xl border border-border bg-card p-4 space-y-4">
    <h2 className="font-semibold">Política da empresa</h2>
    <fieldset disabled={busy || !!error} className="space-y-4">
     <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={draft.enabled} disabled={!policy?.runtime_ready && !draft.enabled} onChange={e => update('enabled', e.target.checked)} />Habilitar gravação automática</label>
     <fieldset className="space-y-2"><legend className="font-medium">Tipos de chamada</legend>{scopes.map(([value,label]) => <label key={value} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={draft.scopes.includes(value)} onChange={e => update('scopes', e.target.checked ? [...draft.scopes,value] : draft.scopes.filter(s => s !== value))} />{label}</label>)}</fieldset>
     <FInput id="recording-purpose" label="Finalidade" maxLength={1000} value={draft.purpose} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('purpose', e.target.value)} />
     <div><AdminFieldLabel label="Base legal definida pela empresa" /><AdminSelect ariaLabel="Base legal" value={draft.legal_basis || ''} onValueChange={value => update('legal_basis', value as RecordingPolicyDraft['legal_basis'] || null)} options={[{value:'',label:'Selecione'},{value:'consent',label:'Consentimento'},{value:'contract',label:'Execução de contrato'},{value:'legal_obligation',label:'Obrigação legal'},{value:'legitimate_interest',label:'Legítimo interesse'}]} /></div>
     <FInput id="recording-information" label="Referência de transparência aos participantes" maxLength={2000} value={draft.information_reference} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('information_reference', e.target.value)} />
     <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={draft.notice_enabled} onChange={e => update('notice_enabled', e.target.checked)} />Reproduzir aviso sonoro (opcional)</label>
     {draft.notice_enabled && <div><AdminFieldLabel label="Aviso enviado pela empresa" /><AdminSelect ariaLabel="Aviso sonoro" value={draft.notice_prompt_id || ''} onValueChange={value => update('notice_prompt_id', value || null)} options={[{value:'',label:'Selecione um aviso'},...prompts.map(p => ({value:p.id,label:p.label}))]} /><p className="text-xs text-muted-foreground">Envie o áudio em URA e horários. O aviso é selecionado independentemente do menu de atendimento.</p></div>}
     <div className="grid gap-4 sm:grid-cols-3">
      <FInput id="recording-retention" label="Retenção (dias)" type="number" min={1} max={90} value={draft.retention_days} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('retention_days', Number(e.target.value))} />
      <FInput id="recording-quota" label="Espaço (MiB)" type="number" min={64} max={10240} value={draft.quota_bytes / 1048576} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('quota_bytes', Number(e.target.value) * 1048576)} />
      <FInput id="recording-duration" label="Duração máxima (segundos)" type="number" min={300} max={7200} value={draft.max_duration_seconds} onChange={(e: React.ChangeEvent<HTMLInputElement>) => update('max_duration_seconds', Number(e.target.value))} />
     </div>
     {draft.enabled && <label className="flex gap-2 items-start text-sm"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />Confirmo que a empresa definiu base legal, finalidade, transparência, retenção e acesso autorizado às gravações.</label>}
    </fieldset>
    <AdminButton type="submit" disabled={busy || !!error || (draft.enabled && (!policy?.runtime_ready || !acknowledged))}>{busy ? 'Salvando…' : 'Salvar configuração'}</AdminButton>
   </form>}
   {view && <section className="space-y-3"><h2 className="font-semibold">Gravações da empresa</h2>{!rows.length && <p className="text-muted-foreground">Nenhuma gravação disponível nesta empresa.</p>}{rows.map(row => <article key={row.id} className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm"><p>{row.source} → {row.destination}</p><p className="text-muted-foreground">{row.started_at ? new Date(row.started_at).toLocaleString('pt-BR') : 'Data indisponível'} · {scopes.find(([scope]) => scope === row.scope)?.[1] || 'Chamada'} · {row.status}</p><p>{row.duration_seconds || 0} segundos · {Math.ceil((row.size_bytes || 0) / 1024)} KiB · Expira em {row.expires_at ? new Date(row.expires_at).toLocaleDateString('pt-BR') : '—'}</p><AdminButton disabled={busy || row.status !== 'ready'} onClick={() => void play(row.id)}>Acessar áudio</AdminButton></article>)}</section>}
  </>}
 </div>;
}
