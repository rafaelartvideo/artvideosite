import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { resourceEnabled } from '../../../../supabase/functions/_shared/sac-runtime.mjs';
import { SAC_ENDPOINTS } from '../../../../supabase/functions/_shared/sac-operational-contracts.mjs';
import { fieldVisible, formValues, resultItems, initialValues, recordContext, friendlyEntries, actionLabel } from '../domain/resource-ui.mjs';
import { operateSacDigitalResource, sacDigitalMediaUrl, type SacDigitalResourceResult } from '../infrastructure/sac-digital.repository';
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader, AdminCardToolbar, AdminIconButton, BtnSecondary, Section } from '@/shared/ui/admin/AdminLayout';
import { FInput, FSelect, FTextarea, FToggle } from '@/shared/ui/admin/AdminFormControls';
import { LoadingState } from '@/shared/ui/admin/AdminFeedback';
import { AdminSubnav } from '@/shared/ui/admin/AdminSubnav';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/primitives/dropdown-menu';
import { SAC_AREA_LABELS, SAC_RESOURCE_GROUPS } from './sac-navigation';

type Field = { name: string; label: string; type: string; required?: boolean; options?: any[]; when?: unknown };
type ResourceContext = { sourceEndpointId: number; parent: { groupId?: string; couponId?: string } };
const FIELD_LABEL = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground';
const CONTENT_TYPES = { texto: 'Texto', imagem: 'Imagem', audio: 'Áudio', video: 'Vídeo', pdf: 'PDF', contato: 'Contato', localizacao: 'Localização', template: 'Template' };
const IDENTIFIER = /^(id|contact|group|protocol|protocolo|code|coupon|operator|department|channel)$|_id$/;
const isRead = (endpoint: any) => endpoint?.method === 'GET' || endpoint?.id === 31;
const defaultAction = (items: any[]) => items.find(e => e.method === 'GET' && !e.fields.some((f: Field) => f.required && f.name !== 'p')) || items.find(e => e.method === 'GET') || items[0];

export function StructuredEditor({ field, value, onChange }: { field: Field; value: any; onChange: (v: any) => void }) {
  if (field.type === 'variables') return <div className="grid min-w-0 gap-4 lg:grid-cols-3">
    {Object.entries({ body: 'Corpo', header: 'Cabeçalho', buttons: 'Botões' }).map(([section, label]) => <div key={section} className="min-w-0 space-y-3 border border-border bg-muted/20 p-3">
      <p className={FIELD_LABEL}>{label}</p>
      {(value?.[section] || []).map((item: any, index: number) => <div key={index} className="flex min-w-0 items-end gap-2">
        <div className="min-w-0 flex-1"><FInput label={'Variável ' + (index + 1)} aria-label={label + ' — variável ' + (index + 1)} value={item}
          onChange={(e: any) => onChange({ ...value, [section]: value[section].map((v: any, i: number) => i === index ? e.target.value : v) })} /></div>
        <AdminIconButton ariaLabel={'Remover variável ' + (index + 1) + ' do ' + label.toLowerCase()} className="mb-1" onClick={() => onChange({ ...value, [section]: value[section].filter((_: any, i: number) => i !== index) })}><X size={15} /></AdminIconButton>
      </div>)}
      {!(value?.[section] || []).length && <p className="text-xs text-muted-foreground">Nenhuma variável.</p>}
      <AdminButton variant="secondary" size="sm" onClick={() => onChange({ ...value, [section]: [...(value?.[section] || []), ''] })}>Adicionar variável</AdminButton>
    </div>)}
  </div>;

  const rows = Array.isArray(value) ? value : [];
  const update = (index: number, patch: any) => onChange(rows.map((row: any, i: number) => i === index ? { ...row, ...patch } : row));
  return <div className="space-y-3">
    {rows.map((row: any, index: number) => <AdminCard key={index} square>
      <AdminCardToolbar><p className="flex-1 text-xs font-bold">Conteúdo {index + 1}</p><AdminButton variant="secondary" size="sm" onClick={() => onChange(rows.filter((_: any, i: number) => i !== index))}>Remover</AdminButton></AdminCardToolbar>
      <AdminCardContent className="space-y-4">
        <FSelect label="Tipo de conteúdo" value={row.type || 'texto'} options={Object.entries(CONTENT_TYPES).map(([value, label]) => ({ value, label }))}
          onChange={(e: any) => update(index, { type: e.target.value, value: ['contato', 'localizacao'].includes(e.target.value) ? [] : '' })} />
        {['contato', 'localizacao'].includes(row.type)
          ? <div className="grid gap-3 sm:grid-cols-2">{(row.type === 'contato' ? ['Nome', 'Telefone'] : ['Endereço', 'Latitude', 'Longitude']).map((label, position) => <FInput key={label} label={label} aria-label={label} value={row.value?.[position] || ''} onChange={(e: any) => {
            const values = [...(Array.isArray(row.value) ? row.value : [])]; values[position] = e.target.value; update(index, { value: values });
          }} />)}</div>
          : row.type === 'texto'
            ? <FTextarea label="Mensagem" aria-label="Mensagem" value={row.value || ''} onChange={(e: any) => update(index, { value: e.target.value })} rows={4} />
            : <FInput label={row.type === 'template' ? 'Template aprovado' : 'URL do arquivo'} aria-label={row.type === 'template' ? 'Template aprovado' : 'URL do arquivo'} placeholder={row.type === 'template' ? 'Identificador do template' : 'https://…'} value={row.value || ''} onChange={(e: any) => update(index, { value: e.target.value })} />}
        {['imagem', 'video', 'pdf'].includes(row.type) && <FInput label="Legenda" aria-label="Legenda" placeholder="Opcional" value={row.caption || ''} onChange={(e: any) => update(index, { caption: e.target.value })} />}
      </AdminCardContent>
    </AdminCard>)}
    <AdminButton variant="secondary" onClick={() => onChange([...rows, { type: 'texto', value: '' }])}>Adicionar conteúdo</AdminButton>
    {rows.length > 0 && <div className="space-y-2 border-l-2 border-primary bg-muted/30 p-3 text-sm"><p className={FIELD_LABEL}>Prévia dos conteúdos</p>{rows.map((row: any, i: number) => <p key={i} className="break-words"><strong>{CONTENT_TYPES[row.type as keyof typeof CONTENT_TYPES]}: </strong>{Array.isArray(row.value) ? row.value.join(' · ') : row.value}{row.caption ? ' · ' + row.caption : ''}</p>)}</div>}
  </div>;
}

export function SacResourceValue({ value, compact = false }: { value: any; compact?: boolean }) {
  if (value == null || value === '') return <span className="text-muted-foreground">—</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Sim' : 'Não'}</span>;
  if (Array.isArray(value)) return value.length
    ? <span className="break-words">{value.map(v => typeof v === 'object' ? v?.name || v?.title || v?.text || v?.id || 'Registro' : String(v)).join(' · ')}</span>
    : <span className="text-muted-foreground">—</span>;
  if (typeof value === 'object') {
    if (compact) return <span>{value.name || value.title || value.number || value.id || 'Ver detalhes'}</span>;
    return <dl className="space-y-2">{friendlyEntries(value).map(([label, v]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd><SacResourceValue value={v} /></dd></div>)}</dl>;
  }
  const url = sacDigitalMediaUrl(String(value));
  if (!compact && url && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) return <img src={url} alt="Mídia do recurso" className="max-h-48 max-w-full rounded" />;
  if (!compact && url && /\.(mp3|ogg|wav)(\?|$)/i.test(url)) return <audio controls src={url} className="max-w-full" />;
  if (!compact && url && /\.(mp4|webm)(\?|$)/i.test(url)) return <video controls src={url} className="max-h-48 max-w-full" />;
  if (url) return <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-primary underline">Abrir arquivo</a>;
  const text = String(value);
  const date = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text) ? new Date(text) : null;
  return <span className="break-words">{date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR') : text}</span>;
}

export function SacDigitalResources({ organizationId, hasPermission, protocol, onInsertAnswer, onOpenSettings, initialArea = 'Contatos' }: {
  initialArea?: string; organizationId: string; hasPermission: (p: string) => boolean; protocol?: string;
  onInsertAnswer?: (text: string) => void; onOpenSettings?: () => void;
}) {
  const endpoints = (SAC_ENDPOINTS as any[]).filter(e => resourceEnabled(e.id));
  const areas = useMemo(() => [...new Set(endpoints.map(e => e.area))], []);
  const groups = useMemo(() => {
    const assigned = new Set(SAC_RESOURCE_GROUPS.flatMap(g => g.areas));
    const extra = areas.filter(a => !assigned.has(a));
    return [...SAC_RESOURCE_GROUPS.map(g => ({ ...g, areas: g.areas.filter(a => areas.includes(a)) })), ...(extra.length ? [{ id: 'other', label: 'Outros', areas: extra }] : [])].filter(g => g.areas.length);
  }, [areas]);
  const [group, setGroup] = useState(initialArea === 'Contatos' ? 'registries' : 'communication');
  const [area, setArea] = useState(initialArea);
  const available = endpoints.filter(e => e.area === area);
  const [selectedId, setSelectedId] = useState<number>(() => defaultAction(available)?.id);
  const endpoint = available.find(e => e.id === selectedId) || available[0];
  const [values, setValues] = useState<Record<string, any>>(() => initialValues(endpoint?.fields || [], protocol));
  const [record, setRecord] = useState<any>(null);
  const [recordSource, setRecordSource] = useState<number | null>(null);
  const [parent, setParent] = useState<ResourceContext['parent']>({});
  const [result, setResult] = useState<SacDigitalResourceResult | null>(null);
  const [resultSource, setResultSource] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [page, setPage] = useState(1);
  const requestGeneration = useRef(0);
  const uncertain = error.includes('Confirmação pendente');
  const read = isRead(endpoint);
  const privateCredential = endpoint?.fields.some((f: Field) => /password|credential|secret/i.test(f.name));
  const allowed = !privateCredential && hasPermission(read ? 'sac_digital.messages.view' : /campanh|sms|telefon/i.test(area) ? 'sac_digital.settings.manage' : endpoint?.scopes?.includes('send') ? 'sac_digital.messages.send' : 'sac_digital.protocols.manage');
  const fields = (endpoint?.fields || []).filter((f: Field) => !privateCredential && !['p', 'page'].includes(f.name) && fieldVisible(f, values));
  const items = result ? resultItems(result.data) : [];
  const columns = useMemo(() => {
    const priority = ['Nome', 'Título', 'Número', 'Telefone', 'Protocolo', 'Código', 'Situação', 'Ativo', 'Online', 'Departamento', 'Operador', 'Mensagem', 'Criado em', 'Identificador'];
    const found = [...new Set(items.flatMap(item => friendlyEntries(item).map(([label]) => label)))];
    return [...priority.filter(label => found.includes(label)), ...found.filter(label => !priority.includes(label))].slice(0, 5);
  }, [result]);
  const areaLabel = SAC_AREA_LABELS[area] || area;
  const optionLabels: Record<string, string> = { '1': 'Transmissão', '3': 'Status', todos: 'Todos os contatos', contatos: 'Contatos selecionados', grupos: 'Grupos', sexo: 'Gênero', etiquetas: 'Etiquetas', M: 'Masculino', F: 'Feminino', I: 'Não informado', text: 'Texto', image: 'Imagem', audio: 'Áudio', video: 'Vídeo', file: 'Arquivo', map: 'Localização', vcard: 'Contato', template: 'Template aprovado' };

  const change = (name: string, value: any) => { setValues(v => ({ ...v, [name]: value })); setConfirm(false); };
  const selectArea = (name: string) => {
    requestGeneration.current += 1;
    const first = defaultAction(endpoints.filter(e => e.area === name));
    setArea(name); setRecord(null); setRecordSource(null); setParent({}); setSelectedId(first?.id);
    setValues(initialValues(first?.fields || [], protocol)); setResult(null); setResultSource(null); setError(''); setConfirm(false); setPage(1); setBusy(false);
  };
  const chooseAction = (action: any, row?: any, sourceId?: number) => {
    requestGeneration.current += 1;
    const source = sourceId ?? recordSource ?? endpoint.id;
    const nextParent = { ...parent, ...(source === 19 && row?.id ? { groupId: row.id } : {}), ...(source === 45 && row?.id ? { couponId: row.id } : {}) };
    setParent(nextParent); setSelectedId(action.id); setPage(1);
    setValues(row ? recordContext(action.fields, row, area, protocol, { sourceEndpointId: source, parent: nextParent }) : initialValues(action.fields, protocol));
    setResult(null); setResultSource(null); setError(''); setConfirm(false); setBusy(false);
  };
  const execute = async (nextPage?: number) => {
    if (!endpoint || !allowed || busy || uncertain) return;
    const generation = ++requestGeneration.current;
    setBusy(true); setError('');
    try {
      const submitted = formValues(endpoint.fields, values);
      if (nextPage !== undefined) submitted[endpoint.fields.some((f: Field) => f.name === 'p') ? 'p' : 'page'] = nextPage;
      const response = await operateSacDigitalResource(organizationId, endpoint.id, submitted);
      if (generation !== requestGeneration.current) return;
      setResult(response); setResultSource(endpoint.id); setConfirm(false);
      if (nextPage !== undefined) { setPage(nextPage); setValues(v => ({ ...v, [endpoint.fields.some((f: Field) => f.name === 'p') ? 'p' : 'page']: nextPage })); }
    } catch (caught) {
      if (generation === requestGeneration.current) setError(caught instanceof Error ? caught.message : 'Não foi possível concluir a operação.');
    } finally { if (generation === requestGeneration.current) setBusy(false); }
  };
  useEffect(() => {
    const first = defaultAction(endpoints.filter(e => e.area === area));
    if (!first || first.method !== 'GET' || first.fields.some((f: Field) => f.required && f.name !== 'p') || !hasPermission('sac_digital.messages.view')) return;
    const generation = ++requestGeneration.current;
    let cancelled = false; setBusy(true);
    operateSacDigitalResource(organizationId, first.id, initialValues(first.fields, protocol)).then(response => {
      if (!cancelled && generation === requestGeneration.current) { setResult(response); setResultSource(first.id); }
    }).catch(caught => {
      if (!cancelled && generation === requestGeneration.current) setError(caught instanceof Error ? caught.message : 'Área indisponível.');
    }).finally(() => { if (!cancelled && generation === requestGeneration.current) setBusy(false); });
    return () => { cancelled = true; };
  }, [area, organizationId]);

  const rowActions = available.filter(action => action.fields.some((f: Field) => IDENTIFIER.test(f.name)));
  const canPaginate = read && endpoint?.fields.some((f: Field) => ['p', 'page'].includes(f.name));
  return <section aria-label="Recursos SAC Digital" className="admin-operation-mobile-labels min-w-0 space-y-4">
    {false && <AdminSubnav value={group} items={groups.map(g => ({ id: g.id, label: g.label }))} ariaLabel="Grupos de recursos SAC Digital" onSelect={id => { setGroup(id); selectArea(groups.find(g => g.id === id)!.areas[0]); }} />}
    {false && <AdminSubnav value={area} items={(groups.find(g => g.id === group)?.areas || []).map(id => ({ id, label: SAC_AREA_LABELS[id] || id }))} ariaLabel="Áreas de recursos SAC Digital" onSelect={selectArea} />}

    <AdminCard square>
      <AdminCardToolbar className="sm:items-end">
        <div className="min-w-0 flex-1"><h2 className="text-sm font-black">{areaLabel}</h2><p className="mt-1 text-xs text-muted-foreground">Selecione uma operação. As ações de cada registro ficam na lista.</p></div>
        <div className="w-full sm:w-72"><FSelect label="Operação" value={String(endpoint?.id || '')} disabled={busy} options={available.map(action => ({ value: String(action.id), label: actionLabel(action) }))} onChange={(e: any) => chooseAction(available.find(action => action.id === Number(e.target.value)), record)} /></div>
      </AdminCardToolbar>
      <AdminCardContent className="space-y-4">
        {record && <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-l-2 border-primary bg-primary-soft/40 p-3">
          <div className="min-w-0"><p className={FIELD_LABEL}>Registro selecionado</p><p className="break-words text-sm font-bold">{record.name || record.title || record.titulo || record.number || record.code || record.protocol || record.id}</p></div>
          <AdminButton variant="secondary" size="sm" disabled={busy} onClick={() => { setRecord(null); setRecordSource(null); setValues(initialValues(endpoint?.fields || [], protocol)); }}>Limpar seleção</AdminButton>
        </div>}
        {privateCredential ? <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">{area === 'Operador — Login' ? 'A autenticação usa o operador vinculado ao seu usuário. Os vínculos são administrados nas configurações da integração.' : 'As credenciais da conta Gestor são administradas nas configurações privadas da integração.'}</p>
          {onOpenSettings && hasPermission('sac_digital.settings.manage') && <BtnSecondary onClick={onOpenSettings}>Abrir configurações</BtnSecondary>}
        </div> : <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!read && !confirm) { setConfirm(true); return; } void execute(); }}>
          {fields.length > 0 && <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{fields.map((field: Field) => {
            const hint = IDENTIFIER.test(field.name) && !values[field.name] ? 'Selecione um registro na lista ou informe o identificador SAC.' : undefined;
            const shared = { label: field.label, 'aria-label': field.label, required: field.required, disabled: busy || !allowed, value: values[field.name] ?? '' };
            return <div key={field.name} className={['textarea', 'content', 'variables'].includes(field.type) ? 'min-w-0 sm:col-span-2 xl:col-span-3' : 'min-w-0'}>
              {field.type === 'content' || field.type === 'variables' ? <><p className={FIELD_LABEL}>{field.label}{field.required ? ' *' : ''}</p><fieldset disabled={busy || !allowed}><StructuredEditor field={field} value={values[field.name]} onChange={v => change(field.name, v)} /></fieldset></>
                : field.type === 'boolean' ? <FToggle label={field.label} checked={!!values[field.name]} disabled={busy || !allowed} onChange={v => change(field.name, v)} />
                : field.type === 'select' ? <><FSelect {...shared} options={[{ value: '', label: 'Selecionar' }, ...(field.options || []).map((o: any) => ({ value: String(o.value ?? o), label: o.label ?? (['tipo_campanha', 'tipo_filtro', 'type', 'sexo_filtro'].includes(field.name) ? optionLabels[String(o)] : undefined) ?? String(o) }))]} onChange={(e: any) => change(field.name, e.target.value)} />{hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}</>
                : field.type === 'textarea' ? <FTextarea {...shared} rows={4} onChange={(e: any) => change(field.name, e.target.value)} />
                : <FInput {...shared} hint={hint} type={field.type === 'number' ? 'number' : 'text'} value={Array.isArray(values[field.name]) ? values[field.name].join(', ') : values[field.name] ?? ''} placeholder={field.type === 'array' ? 'Identificadores separados por vírgula' : undefined} onChange={(e: any) => change(field.name, field.type === 'array' ? e.target.value.split(',').map((v: string) => v.trim()).filter(Boolean) : e.target.value)} />}
            </div>;
          })}</div>}
          {!allowed && <p role="status" className="text-sm text-muted-foreground">Você não tem permissão para executar esta operação.</p>}
          {confirm && <div role="alert" className="border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground"><p className="font-bold">Confirmar {actionLabel(endpoint).toLocaleLowerCase('pt-BR')}</p><p className="mt-1">Esta operação altera dados ou inicia uma ação na SAC Digital. Confira os campos antes de confirmar.</p></div>}
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
            {confirm && <BtnSecondary disabled={busy} onClick={() => setConfirm(false)}>Cancelar</BtnSecondary>}
            <AdminButton type="submit" loading={busy} loadingText={read ? 'Consultando...' : 'Processando...'} disabled={!allowed || uncertain}>{read ? fields.length ? 'Consultar' : 'Carregar registros' : confirm ? 'Confirmar operação' : actionLabel(endpoint)}</AdminButton>
          </div>
        </form>}
        {error && <p role="alert" className="border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
      </AdminCardContent>
    </AdminCard>

    {busy && !result ? <LoadingState text={'Carregando ' + areaLabel.toLocaleLowerCase('pt-BR') + '...'} /> : result && <>
      {!read && <p role="status" className="border-l-2 border-primary bg-muted/30 p-3 text-sm">{result.outcome === 'unknown' ? 'Confirmação pendente. Não repita a operação.' : ['accepted', 'queued'].includes(result.outcome || '') ? 'Operação aceita. Aguarde a confirmação da SAC Digital.' : 'Operação concluída pela SAC Digital.'}</p>}
      <AdminCard square>
        <AdminCardHeader><h3 className="text-xs font-black uppercase tracking-wider">Registros · {areaLabel}</h3><span className="text-xs text-muted-foreground">{items.length} nesta página</span></AdminCardHeader>
        {items.length === 0 ? <AdminCardContent><p className="py-6 text-center text-sm text-muted-foreground">Nenhum registro encontrado.</p></AdminCardContent>
          : <div className="overflow-x-auto"><table><thead><tr>{columns.map(label => <th key={label} className="text-left">{label}</th>)}{!columns.length && <th className="text-left">Registro</th>}<th className="text-right">Ações</th></tr></thead>
            <tbody>{items.map((item: any, index: number) => {
              const entries = Object.fromEntries(friendlyEntries(item));
              const hasIdentity = item.id != null || item.code != null || item.protocol != null;
              return <tr key={item.id || item.code || index} className={record === item ? 'bg-primary-soft/40' : undefined}>
                {columns.map(label => <td key={label} data-mobile-label={label} className="max-w-64 align-top"><div className="line-clamp-2"><SacResourceValue value={entries[label]} compact /></div></td>)}
                {!columns.length && <td data-mobile-label="Registro">Registro {index + 1}</td>}
                <td data-mobile-label="Ações" className="align-top"><div className="flex justify-end gap-2">
                  <AdminButton variant="secondary" size="sm" disabled={busy} onClick={() => { setRecord(item); setRecordSource(resultSource); }}>Detalhes</AdminButton>
                  {(hasIdentity && rowActions.length > 0 || onInsertAnswer && /resposta/i.test(area)) && <DropdownMenu><DropdownMenuTrigger asChild><AdminButton variant="secondary" size="sm" disabled={busy} aria-label={'Ações de ' + (item.name || item.title || item.protocol || 'registro ' + (index + 1))}>Ações<ChevronDown size={13} /></AdminButton></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-80">{hasIdentity && rowActions.map(action => <DropdownMenuItem key={action.id} onSelect={() => { setRecord(item); setRecordSource(resultSource); chooseAction(action, item, resultSource ?? endpoint.id); }}>{actionLabel(action)}</DropdownMenuItem>)}
                      {onInsertAnswer && /resposta/i.test(area) && <DropdownMenuItem onSelect={() => onInsertAnswer(String(item.text || item.message || item.content || item.body || ''))}>Inserir no atendimento</DropdownMenuItem>}
                    </DropdownMenuContent></DropdownMenu>}
                </div></td>
              </tr>;
            })}</tbody></table></div>}
        {canPaginate && <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border bg-muted/35 px-4 py-3">
          <AdminButton variant="secondary" size="sm" disabled={busy || page <= 1} onClick={() => void execute(page - 1)}>Anterior</AdminButton>
          <span className="text-xs font-bold">Página {page}</span>
          <AdminButton variant="secondary" size="sm" disabled={busy || !result.has_more || result.next_page == null} onClick={() => void execute(Number(result.next_page))}>Próxima</AdminButton>
        </div>}
      </AdminCard>
    </>}
    {record && <Section title="Detalhes do registro" contentClassName="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {friendlyEntries(record).map(([label, value]) => <div key={label} className="min-w-0"><p className={FIELD_LABEL}>{label}</p><div className="text-sm"><SacResourceValue value={value} /></div></div>)}
    </Section>}
  </section>;
}
