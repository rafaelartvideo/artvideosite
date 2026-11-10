import type { SupabaseClient } from '@supabase/supabase-js';
import { pbxRequest } from './pbx-request';

export type FlowTarget = { kind: 'hangup' } | { kind: 'extension' | 'queue'; id: string };
export type FlowWindow = { days: number[]; start: string; end: string };
export type CallFlowConfig = {
  version: 1; mode: 'menu' | 'direct'; prompt_id: string | null; closed_prompt_id: string | null;
  options: { digit: string; target: FlowTarget }[]; fallback: FlowTarget; closed_target: FlowTarget;
  timezone: string; schedule_enabled: boolean; windows: FlowWindow[]; holidays: string[];
  timeout_seconds: number; repeats: number;
};
export type CallFlowDraft = { id: string | null; name: string; test_extension: number; enabled: boolean; config: CallFlowConfig };
export type PbxCallFlow = CallFlowDraft & { id: string; organization_id: string; provisioning_status: 'pending' | 'applied' | 'failed'; last_error: string | null };
export type PbxAudioPrompt = { id: string; organization_id: string; label: string; storage_path: string; sha256: string; duration_seconds: number; size_bytes: number; status: 'pending' | 'uploaded' };
export type PreparedPrompt = { blob: Blob; sha256: string; durationSeconds: number };
export type FlowScope = { extensionIds: string[]; queueIds: string[]; promptIds: string[] };

export function newCallFlow(): CallFlowDraft {
  return { id: null, name: '', test_extension: 910, enabled: false, config: {
    version: 1, mode: 'direct', prompt_id: null, closed_prompt_id: null, options: [],
    fallback: { kind: 'hangup' }, closed_target: { kind: 'hangup' }, timezone: 'America/Sao_Paulo',
    schedule_enabled: false, windows: [], holidays: [], timeout_seconds: 10, repeats: 1,
  } };
}

export function validateCallFlow(flow: CallFlowDraft, scope: FlowScope): void {
  if (flow.name.trim().length < 2 || flow.name.trim().length > 80 || /[\x00-\x1f\x7f]/.test(flow.name)) throw new Error('Informe um nome de 2 a 80 caracteres.');
  if (!Number.isInteger(flow.test_extension) || flow.test_extension < 100 || flow.test_extension > 9999 || flow.test_extension >= 850 && flow.test_extension <= 900) throw new Error('Use um número interno entre 100 e 9999, fora da faixa 850 a 900.');
  const c = flow.config;
  const keys = ['version','mode','prompt_id','closed_prompt_id','options','fallback','closed_target','timezone','schedule_enabled','windows','holidays','timeout_seconds','repeats'];
  if (Object.keys(c).length !== keys.length || keys.some(key => !(key in c)) || typeof c.schedule_enabled !== 'boolean') throw new Error('Configuração do fluxo inválida.');
  if (c.version !== 1 || !['direct', 'menu'].includes(c.mode)) throw new Error('Modo do fluxo inválido.');
  if (!Number.isInteger(c.timeout_seconds) || c.timeout_seconds < 5 || c.timeout_seconds > 30 || !Number.isInteger(c.repeats) || c.repeats < 0 || c.repeats > 3) throw new Error('Use espera de 5 a 30 segundos e 0 a 3 repetições.');
  try {
    if (c.timezone.length > 64 || !/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z][A-Za-z0-9_+-]*){0,2}$/.test(c.timezone)) throw new Error();
    new Intl.DateTimeFormat('pt-BR', { timeZone: c.timezone }).format();
  } catch { throw new Error('Informe um fuso horário IANA válido.'); }
  const target = (value: FlowTarget) => {
    if (value.kind === 'hangup' && Object.keys(value).length === 1) return;
    if ((value.kind !== 'extension' && value.kind !== 'queue') || Object.keys(value).length !== 2) throw new Error('Destino do fluxo inválido.');
    if (!(value.kind === 'extension' ? scope.extensionIds : scope.queueIds).includes(value.id)) throw new Error('Selecione um destino da sua empresa.');
  };
  target(c.fallback); target(c.closed_target);
  for (const prompt of [c.prompt_id, c.closed_prompt_id]) if (prompt && !scope.promptIds.includes(prompt)) throw new Error('Selecione um aviso enviado pela sua empresa.');
  if (c.options.length > 10 || c.mode === 'menu' && (!c.prompt_id || !c.options.length) || c.mode === 'direct' && (c.prompt_id !== null || c.options.length)) throw new Error('O menu precisa de um aviso e ao menos uma opção. O modo direto não utiliza menu.');
  const digits = new Set<string>();
  for (const option of c.options) {
    if (option.digit.length !== 1 || !/^[0-9]$/.test(option.digit) || digits.has(option.digit)) throw new Error('Use teclas diferentes de 0 a 9.');
    digits.add(option.digit); target(option.target);
  }
  if (c.windows.length > 28 || c.schedule_enabled && !c.windows.length) throw new Error('Informe de 1 a 28 horários para habilitar o atendimento por horário.');
  for (const window of c.windows) {
    if (!window.days.length || window.days.length > 7 || new Set(window.days).size !== window.days.length || window.days.some(day => !Number.isInteger(day) || day < 1 || day > 7)) throw new Error('Escolha dias da semana entre segunda e domingo.');
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(window.start) || !/^(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)$/.test(window.end) || window.start === window.end) throw new Error('Informe horários diferentes no formato HH:MM. O fim pode ser 24:00.');
  }
  if (c.holidays.length > 366 || new Set(c.holidays).size !== c.holidays.length) throw new Error('Use até 366 feriados diferentes.');
  for (const day of c.holidays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith('0000-') || !Number.isFinite(Date.parse(`${day}T12:00:00Z`)) || new Date(`${day}T12:00:00Z`).toISOString().slice(0,10) !== day) throw new Error('Informe feriados válidos no formato AAAA-MM-DD.');
  }
}

export function createPbxCallFlowsApi(client: SupabaseClient, organizationId: string, signal?: AbortSignal) {
  if (!organizationId) throw new Error('Selecione uma empresa.');
  const rpc = async <T>(name: string, params: Record<string, unknown> = {}): Promise<T> => {
    const result = await pbxRequest(abort => client.rpc(name, { p_organization_id: organizationId, ...params }).abortSignal(abort), 'Configuração do atendimento', { signal });
    if (result.error) throw new Error(result.error.message);
    return result.data as T;
  };
  const ownPrompt = (prompt: PbxAudioPrompt) => {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(prompt.id) || prompt.organization_id !== organizationId || prompt.storage_path !== `${organizationId}/${prompt.id}.wav`) throw new Error('O aviso não pertence à empresa selecionada.');
  };
  return {
    listFlows: () => rpc<PbxCallFlow[]>('pbx_list_call_flows'),
    listPrompts: () => rpc<PbxAudioPrompt[]>('pbx_list_audio_prompts'),
    saveFlow: (flow: CallFlowDraft) => rpc<string>('pbx_save_call_flow', { p_flow_id: flow.id, p_name: flow.name.trim(), p_test_extension: flow.test_extension, p_enabled: flow.enabled, p_config: flow.config }),
    retryFlow: (id: string) => rpc<void>('pbx_retry_call_flow', { p_flow_id: id }),
    reservePrompt: async (label: string, prepared: PreparedPrompt) => {
      const prompt = await rpc<PbxAudioPrompt>('pbx_create_audio_prompt', { p_label: label.trim(), p_sha256: prepared.sha256, p_duration_seconds: prepared.durationSeconds, p_size_bytes: prepared.blob.size });
      ownPrompt(prompt); return prompt;
    },
    uploadPrompt: async (prompt: PbxAudioPrompt, blob: Blob) => {
      ownPrompt(prompt);
      const result = await pbxRequest(abort => client.storage.from('pbx-audio-prompts').upload(prompt.storage_path, blob, { contentType: 'audio/wav', upsert: false, signal: abort }), 'Envio do aviso', { signal });
      if (result.error) throw new Error(result.error.message);
    },
    finishPrompt: (id: string) => rpc<PbxAudioPrompt>('pbx_finish_audio_prompt_upload', { p_prompt_id: id }),
    deletePrompt: async (prompt: PbxAudioPrompt) => {
      ownPrompt(prompt);
      const result = await pbxRequest(() => client.storage.from('pbx-audio-prompts').remove([prompt.storage_path]), 'Exclusão do aviso', { signal });
      if (result.error) throw new Error(result.error.message);
      await rpc<void>('pbx_delete_audio_prompt', { p_prompt_id: prompt.id });
    },
  };
}
