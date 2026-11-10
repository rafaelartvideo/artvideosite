import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader, AdminButton, AdminSectionEmpty } from '@/shared/ui/admin/AdminLayout';
import { AdminSelect, FInput, INPUT } from '@/shared/ui/admin/AdminFormControls';
import { AdminWorkspaceSkeleton } from '@/shared/ui/admin/AdminWorkspaceSkeleton';
import { pbxRequest } from '../application/pbx-request';
import { preparePbxPrompt } from '../application/pbx-prompt-audio';
import { createPbxCallFlowsApi, newCallFlow, validateCallFlow, type CallFlowDraft, type CallFlowConfig, type FlowTarget, type PbxAudioPrompt, type PbxCallFlow, type PreparedPrompt } from '../application/pbx-call-flows';

type Destination = { id: string; label: string; kind: 'extension' | 'queue'; ready: boolean };
type PendingUpload = { prompt: PbxAudioPrompt; prepared: PreparedPrompt; stage: 'upload' | 'finish' };
const statusLabels = { pending: 'Aguardando aplicação', applied: 'Aplicado na central', failed: 'Falha na aplicação' };
const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const targetValue = (target: FlowTarget) => target.kind === 'hangup' ? 'hangup' : `${target.kind}:${target.id}`;
const selectedTarget = (value: string): FlowTarget => {
  const [kind, id] = value.split(':');
  return kind === 'extension' || kind === 'queue' ? { kind, id } : { kind: 'hangup' };
};

export function UnionPbxFlowsPage({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canView = hasPermission('pbx.view');
  const canManage = hasPermission('pbx.manage');
  const requestScope = useRef(new AbortController());
  const operationLock = useRef(false);
  const [loadedOrg, setLoadedOrg] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [flows, setFlows] = useState<PbxCallFlow[]>([]);
  const [prompts, setPrompts] = useState<PbxAudioPrompt[]>([]);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [form, setForm] = useState<CallFlowDraft>(newCallFlow);
  const [editorOpen, setEditorOpen] = useState(false);
  const [holidays, setHolidays] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [fileKey, setFileKey] = useState(0);

  useEffect(() => {
    setForm(newCallFlow()); setEditorOpen(false); setHolidays('');
    setFile(null); setLabel(''); setPendingUpload(null); setFileKey(value => value + 1);
    setNotice(''); setError('');
  }, [activeOrganizationId]);

  useEffect(() => {
    const scope = new AbortController(); requestScope.current = scope;
    operationLock.current = false; setBusy(false); setLoading(true); setLoadedOrg(''); setError('');
    setFlows([]); setPrompts([]); setDestinations([]);
    if (!activeOrganizationId || !canView) { setLoading(false); return () => scope.abort(); }
    const api = createPbxCallFlowsApi(supabase, activeOrganizationId, scope.signal);
    void (async () => {
      try {
        const [flowRows, promptRows, extensions, queues] = await Promise.all([
          api.listFlows(), api.listPrompts(),
          pbxRequest(signal => supabase.from('pbx_extensions').select('id,number,display_name,desired_enabled,provisioning_status').eq('organization_id', activeOrganizationId).order('number').limit(300).abortSignal(signal), 'Consulta dos ramais', { signal: scope.signal }),
          pbxRequest(signal => supabase.from('pbx_queues').select('id,name,test_extension,enabled,provisioning_status').eq('organization_id', activeOrganizationId).order('test_extension').limit(100).abortSignal(signal), 'Consulta das filas', { signal: scope.signal }),
        ]);
        if (scope.signal.aborted) return;
        if (extensions.error || queues.error) throw new Error('Não foi possível consultar os destinos da empresa.');
        setFlows(flowRows || []); setPrompts(promptRows || []);
        setDestinations([
          ...(extensions.data || []).map(item => ({ id: item.id, kind: 'extension' as const, label: `Ramal ${item.number} · ${item.display_name}`, ready: item.desired_enabled && ['applied', 'manual'].includes(item.provisioning_status) })),
          ...(queues.data || []).map(item => ({ id: item.id, kind: 'queue' as const, label: `Fila ${item.test_extension} · ${item.name}`, ready: item.enabled && item.provisioning_status === 'applied' })),
        ]);
        setLoadedOrg(activeOrganizationId);
      } catch (cause) { if (!scope.signal.aborted) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os atendimentos.'); }
      finally { if (!scope.signal.aborted) setLoading(false); }
    })();
    return () => scope.abort();
  }, [activeOrganizationId, canView, revision]);

  const writable = canManage && Boolean(activeOrganizationId) && loadedOrg === activeOrganizationId && !loading && !busy;
  const refresh = () => setRevision(value => value + 1);
  const operate = async (work: (api: ReturnType<typeof createPbxCallFlowsApi>, current: () => boolean) => Promise<void>) => {
    if (!writable || operationLock.current || !activeOrganizationId) return;
    const scope = requestScope.current;
    const current = () => requestScope.current === scope && !scope.signal.aborted;
    operationLock.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(createPbxCallFlowsApi(supabase, activeOrganizationId, scope.signal), current); }
    catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : 'Operação sem confirmação. Atualize os dados antes de repetir.'); }
    finally { if (current()) { operationLock.current = false; setBusy(false); } }
  };
  const updateConfig = (patch: Partial<CallFlowConfig>) => setForm(value => ({ ...value, config: { ...value.config, ...patch } }));
  const upload = () => void operate(async (api, current) => {
    if (!file || label.trim().length < 2 || label.trim().length > 80) throw new Error('Selecione um áudio e dê um nome de 2 a 80 caracteres.');
    const prepared = await preparePbxPrompt(file, requestScope.current.signal);
    if (!current()) return;
    const prompt = await api.reservePrompt(label, prepared);
    if (!current()) return;
    setPendingUpload({ prompt, prepared, stage: 'upload' });
    setPrompts(rows => [prompt, ...rows]);
    await api.uploadPrompt(prompt, prepared.blob);
    if (!current()) return;
    setPendingUpload({ prompt, prepared, stage: 'finish' });
    await api.finishPrompt(prompt.id);
    if (!current()) return;
    setPendingUpload(null); setFile(null); setLabel(''); setFileKey(value => value + 1);
    setNotice('Aviso enviado e pronto para uso.'); refresh();
  });
  const retryUpload = () => void operate(async (api, current) => {
    if (!pendingUpload) return;
    const { prompt, prepared, stage } = pendingUpload;
    if (stage === 'upload') {
      await api.uploadPrompt(prompt, prepared.blob);
      if (!current()) return;
      setPendingUpload({ prompt, prepared, stage: 'finish' });
    }
    await api.finishPrompt(prompt.id);
    if (current()) { setPendingUpload(null); setNotice('Envio concluído.'); refresh(); }
  });
  const save = () => void operate(async (api, current) => {
    const draft = { ...form, config: { ...form.config, holidays: holidays.split(/[\s,;]+/).filter(Boolean) } };
    validateCallFlow(draft, {
      extensionIds: destinations.filter(item => item.kind === 'extension' && (!draft.enabled || item.ready)).map(item => item.id),
      queueIds: destinations.filter(item => item.kind === 'queue' && (!draft.enabled || item.ready)).map(item => item.id),
      promptIds: prompts.filter(item => item.status === 'uploaded').map(item => item.id),
    });
    await api.saveFlow(draft);
    if (current()) { setEditorOpen(false); setNotice('Fluxo salvo. Aguarde a aplicação na central antes de testar.'); refresh(); }
  });
  const targetOptions = [{ value: 'hangup', label: 'Encerrar chamada' }, ...destinations.map(item => ({ value: `${item.kind}:${item.id}`, label: item.label + (item.ready ? '' : ' · indisponível para ativação') }))];
  const promptOptions = [{ value: '', label: 'Sem aviso' }, ...prompts.filter(item => item.status === 'uploaded').map(item => ({ value: item.id, label: item.label }))];
  const destinationSelect = (title: string, target: FlowTarget, change: (target: FlowTarget) => void) => <div className="space-y-1"><p className="text-xs font-semibold">{title}</p><AdminSelect ariaLabel={title} value={targetValue(target)} disabled={!writable} options={targetOptions} onValueChange={value => change(selectedTarget(value))} /></div>;

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Atendimentos e avisos" subtitle="Menus, horários e destinos para testes internos da sua empresa." />
    <div className="rounded-lg border border-border bg-muted/20 p-4 text-sm leading-6">Não altera a entrada da operadora. Use o número de teste interno após o fluxo aparecer como aplicado. Novos fluxos são salvos desativados até você habilitar.</div>
    <div className="flex flex-wrap gap-2"><AdminButton variant="ghost" onClick={onBack}>Voltar para o PABX</AdminButton><AdminButton variant="secondary" disabled={busy || loading} onClick={refresh}>Atualizar dados</AdminButton><AdminButton disabled={!writable} onClick={() => { setForm(newCallFlow()); setHolidays(''); setEditorOpen(true); }}>Novo fluxo</AdminButton></div>
    {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">{error}</div>}
    {notice && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{notice}</p>}
    {!canView ? <p>Você não tem permissão para consultar o PABX.</p> : loading || Boolean(loadedOrg && loadedOrg !== activeOrganizationId) ? <AdminWorkspaceSkeleton /> : <>
      <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="font-semibold">Biblioteca de avisos</h2>
        <p className="text-sm text-muted-foreground">Áudios privados da sua empresa. Até 20 MB e 60 segundos; convertidos localmente para WAV mono 8 kHz.</p>
        {canManage && <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2"><FInput id="pbx-prompt-label" label="Nome do aviso" value={label} maxLength={80} disabled={!writable || Boolean(pendingUpload)} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setLabel(event.target.value)} /><FInput key={fileKey} id="pbx-prompt-file" label="Arquivo de áudio" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg" disabled={!writable || Boolean(pendingUpload)} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] || null)} /></div>
          <AdminButton disabled={!writable || !file || Boolean(pendingUpload)} loading={busy} loadingText="Processando..." onClick={upload}>Converter e enviar aviso</AdminButton>
          {pendingUpload && <div role="status" className="space-y-2 rounded-lg border border-amber-500/30 p-3 text-sm"><p>Envio pendente: {pendingUpload.prompt.label}. Se o arquivo já chegou ao servidor, use Concluir envio na lista. Para recomeçar, exclua o aviso pendente.</p><AdminButton variant="secondary" disabled={!writable} onClick={retryUpload}>{pendingUpload.stage === 'upload' ? 'Tentar envio novamente' : 'Concluir envio'}</AdminButton></div>}
        </div>}
        {!prompts.length && <p className="text-sm text-muted-foreground">Nenhum aviso cadastrado.</p>}
        <div className="space-y-2">{prompts.map(prompt => <div key={prompt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div><p className="text-sm font-semibold">{prompt.label}</p><p className="text-xs text-muted-foreground">{Number(prompt.duration_seconds).toFixed(1)} segundos · {prompt.status === 'uploaded' ? 'Pronto para uso' : 'Upload pendente'}</p></div>
          {canManage && <div className="flex flex-wrap gap-2">
            {prompt.status === 'pending' && <AdminButton variant="secondary" size="sm" disabled={!writable} onClick={() => void operate(async (api, current) => { await api.finishPrompt(prompt.id); if (current()) { if (pendingUpload?.prompt.id === prompt.id) setPendingUpload(null); setNotice('Envio concluído.'); refresh(); } })}>Concluir envio</AdminButton>}
            <AdminButton variant="danger" size="sm" disabled={!writable || flows.some(flow => flow.enabled && [flow.config.prompt_id, flow.config.closed_prompt_id].includes(prompt.id))} onClick={() => void operate(async (api, current) => { await api.deletePrompt(prompt); if (current()) { if (pendingUpload?.prompt.id === prompt.id) setPendingUpload(null); setNotice('Aviso excluído.'); refresh(); } })}>Excluir aviso</AdminButton>
          </div>}
        </div>)}</div>
      </section>
      {editorOpen && <section className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <h2 className="font-semibold">{form.id ? 'Editar fluxo' : 'Novo fluxo'}</h2>
        <div className="grid gap-3 sm:grid-cols-2"><FInput id="pbx-flow-name" label="Nome do fluxo" value={form.name} maxLength={80} disabled={!writable} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm(value => ({ ...value, name: event.target.value }))} /><FInput id="pbx-flow-number" label="Número de teste interno" type="number" min={100} max={9999} value={form.test_extension} disabled={!writable} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setForm(value => ({ ...value, test_extension: Number(event.target.value) }))} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.enabled} disabled={!writable} onChange={event => setForm(value => ({ ...value, enabled: event.target.checked }))} />Habilitar fluxo para teste interno</label>
        <AdminSelect ariaLabel="Tipo de atendimento" value={form.config.mode} disabled={!writable} options={[{value:'direct',label:'Encaminhamento direto'},{value:'menu',label:'Menu de opções (URA)'}]} onValueChange={mode => updateConfig({ mode: mode as 'direct' | 'menu', prompt_id: null, options: [] })} />
        {form.config.mode === 'menu' && <div className="space-y-3">
          <AdminSelect ariaLabel="Aviso do menu" value={form.config.prompt_id || ''} disabled={!writable} options={promptOptions} onValueChange={value => updateConfig({ prompt_id: value || null })} />
          {form.config.options.map((option, index) => <div key={index} className="grid items-end gap-2 rounded-lg border border-border p-3 sm:grid-cols-[100px_1fr_auto]">
            <AdminSelect ariaLabel={`Tecla da opção ${index + 1}`} value={option.digit} disabled={!writable} options={Array.from({length:10}, (_,digit)=>({value:String(digit),label:`Tecla ${digit}`}))} onValueChange={digit => updateConfig({ options: form.config.options.map((item,i) => i === index ? { ...item, digit } : item) })} />
            {destinationSelect(`Destino da tecla ${option.digit}`, option.target, target => updateConfig({ options: form.config.options.map((item,i) => i === index ? { ...item, target } : item) }))}
            <AdminButton variant="ghost" disabled={!writable} onClick={() => updateConfig({ options: form.config.options.filter((_,i) => i !== index) })}>Remover opção</AdminButton>
          </div>)}
          <AdminButton variant="secondary" disabled={!writable || form.config.options.length >= 10} onClick={() => { const digit = Array.from({length:10},(_,i)=>String(i)).find(value=>!form.config.options.some(option=>option.digit===value)); if (digit) updateConfig({ options:[...form.config.options,{ digit, target:{kind:'hangup'} }] }); }}>Adicionar opção</AdminButton>
          <div className="grid gap-3 sm:grid-cols-2"><FInput id="pbx-flow-timeout" label="Espera por tecla (segundos)" type="number" min={5} max={30} value={form.config.timeout_seconds} disabled={!writable} onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateConfig({ timeout_seconds: Number(event.target.value) })} /><FInput id="pbx-flow-repeats" label="Repetições do menu" type="number" min={0} max={3} value={form.config.repeats} disabled={!writable} onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateConfig({ repeats: Number(event.target.value) })} /></div>
        </div>}
        {destinationSelect(form.config.mode === 'direct' ? 'Destino do encaminhamento' : 'Destino sem resposta ou tecla inválida', form.config.fallback, fallback => updateConfig({ fallback }))}
        <div className="space-y-3 rounded-lg border border-border p-3"><h3 className="text-sm font-semibold">Horários de atendimento</h3>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.config.schedule_enabled} disabled={!writable} onChange={event => updateConfig({ schedule_enabled:event.target.checked })} />Usar horários e feriados</label>
          <FInput id="pbx-flow-zone" label="Fuso horário IANA" value={form.config.timezone} maxLength={64} disabled={!writable} onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateConfig({ timezone:event.target.value })} hint="Exemplo: America/Sao_Paulo" />
          {form.config.windows.map((window,index) => <div key={index} className="space-y-3 rounded-lg bg-muted/30 p-3">
            <div className="flex flex-wrap gap-3">{days.map((day,i) => <label key={day} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={window.days.includes(i+1)} disabled={!writable} onChange={event => updateConfig({ windows: form.config.windows.map((item,n) => n === index ? { ...item, days:event.target.checked ? [...item.days,i+1].sort() : item.days.filter(value=>value!==i+1) } : item) })} />{day}</label>)}</div>
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><FInput id={`pbx-window-start-${index}`} label="Início" value={window.start} placeholder="08:00" disabled={!writable} onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateConfig({ windows:form.config.windows.map((item,n)=>n===index?{...item,start:event.target.value}:item) })} /><FInput id={`pbx-window-end-${index}`} label="Fim" value={window.end} placeholder="18:00 ou 24:00" disabled={!writable} onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateConfig({ windows:form.config.windows.map((item,n)=>n===index?{...item,end:event.target.value}:item) })} /><AdminButton variant="ghost" disabled={!writable} onClick={()=>updateConfig({windows:form.config.windows.filter((_,n)=>n!==index)})}>Remover horário</AdminButton></div>
          </div>)}
          <AdminButton variant="secondary" disabled={!writable || form.config.windows.length >= 28} onClick={()=>updateConfig({windows:[...form.config.windows,{days:[1,2,3,4,5],start:'08:00',end:'18:00'}]})}>Adicionar horário</AdminButton>
          <p className="text-xs text-muted-foreground">Se o fim for anterior ao início, o horário continua no dia seguinte.</p>
          <label htmlFor="pbx-flow-holidays" className="block text-xs font-semibold">Feriados (AAAA-MM-DD, um por linha)</label><textarea id="pbx-flow-holidays" className={INPUT} rows={3} disabled={!writable} value={holidays} onChange={event=>setHolidays(event.target.value)} />
          <h3 className="text-sm font-semibold">Fora do horário</h3><AdminSelect ariaLabel="Aviso fora do horário" value={form.config.closed_prompt_id || ''} disabled={!writable} options={promptOptions} onValueChange={value=>updateConfig({closed_prompt_id:value||null})} />
          {destinationSelect('Destino fora do horário',form.config.closed_target,closed_target=>updateConfig({closed_target}))}
        </div>
        <div className="flex flex-wrap gap-2"><AdminButton disabled={!writable} loading={busy} loadingText="Salvando..." onClick={save}>Salvar fluxo</AdminButton><AdminButton variant="ghost" disabled={busy} onClick={()=>setEditorOpen(false)}>Cancelar edição</AdminButton></div>
      </section>}
      <section className="space-y-3"><h2 className="font-semibold">Fluxos internos</h2>
        {!flows.length && <AdminSectionEmpty>Nenhum fluxo cadastrado. Crie um atendimento para testar um menu ou encaminhamento interno.</AdminSectionEmpty>}
        {flows.map(flow=><article key={flow.id} className="space-y-3 rounded-xl border border-border bg-card p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">{flow.name}</h3><p className="text-sm text-muted-foreground">Teste interno {flow.test_extension} · {flow.enabled?'Habilitado':'Desativado'}</p></div><span role="status" className={`rounded-full px-3 py-1 text-xs ${flow.provisioning_status==='failed'?'bg-destructive/10 text-destructive':'bg-muted text-muted-foreground'}`}>{statusLabels[flow.provisioning_status]}</span></div>
          {flow.last_error && <p role="alert" className="text-sm text-destructive">{flow.last_error}</p>}
          {canManage && <div className="flex flex-wrap gap-2"><AdminButton variant="secondary" disabled={!writable} onClick={()=>{setForm(structuredClone(flow));setHolidays(flow.config.holidays.join('\n'));setEditorOpen(true);}}>Editar fluxo</AdminButton><AdminButton variant="secondary" disabled={!writable} onClick={()=>void operate(async(api,current)=>{await api.retryFlow(flow.id);if(current()){setNotice('Reprocessamento solicitado. Aguarde a aplicação.');refresh();}})}>Reprocessar</AdminButton></div>}
        </article>)}
      </section>
    </>}
  </div>;
}
