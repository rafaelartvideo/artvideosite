import type { SupabaseClient } from '@supabase/supabase-js';
import { pbxRequest } from './pbx-request';
export type RecordingScope = 'internal' | 'inbound' | 'outbound';
export type RecordingPolicyDraft = { enabled: boolean; scopes: RecordingScope[]; notice_enabled: boolean; notice_prompt_id: string | null; purpose: string; legal_basis: 'consent' | 'contract' | 'legal_obligation' | 'legitimate_interest' | null; information_reference: string; retention_days: number; quota_bytes: number; max_duration_seconds: number };
export type RecordingPolicy = RecordingPolicyDraft & { revision: string; runtime_ready: boolean; status: 'pending' | 'applied' | 'failed'; updated_at: string; last_error: string | null };
export type Recording = { id: string; call_log_id: string; event_id: string; scope: RecordingScope; status: string; size_bytes: number; duration_seconds: number; expires_at: string; started_at: string; source: string; destination: string };
export type RecordingPrompt = { id: string; label: string; status: string; organization_id: string };
export function newRecordingPolicy(): RecordingPolicyDraft { return { enabled: false, scopes: [], notice_enabled: true, notice_prompt_id: null, purpose: '', legal_basis: null, information_reference: '', retention_days: 30, quota_bytes: 1073741824, max_duration_seconds: 3600 }; }
export function recordingPolicyPayload(d: RecordingPolicyDraft): RecordingPolicyDraft {
 return { enabled: d.enabled, scopes: [...d.scopes], notice_enabled: d.notice_enabled, notice_prompt_id: d.notice_enabled ? d.notice_prompt_id : null, purpose: d.purpose.trim(), legal_basis: d.legal_basis, information_reference: d.information_reference.trim(), retention_days: d.retention_days, quota_bytes: d.quota_bytes, max_duration_seconds: d.max_duration_seconds };
}
export function validateRecordingPolicy(d: RecordingPolicyDraft, runtimeReady: boolean, acknowledged: boolean, promptIds: string[]) {
 for (const [value, min, max] of [[d.retention_days,1,90],[d.quota_bytes,67108864,10737418240],[d.max_duration_seconds,300,7200]]) if (!Number.isInteger(value) || value < min || value > max) throw new Error('Confira os limites de retenção, espaço e duração.');
 if (new Set(d.scopes).size !== d.scopes.length || d.scopes.some(s => !['internal','inbound','outbound'].includes(s))) throw new Error('Selecione os tipos de chamada.');
 if (d.legal_basis !== null && !['consent','contract','legal_obligation','legitimate_interest'].includes(d.legal_basis)) throw new Error('Selecione uma base legal válida.');
 if (d.purpose.length > 1000 || d.information_reference.length > 2000) throw new Error('Reduza o texto da finalidade ou da referência de transparência.');
 if (d.notice_enabled && d.notice_prompt_id && !promptIds.includes(d.notice_prompt_id)) throw new Error('Selecione um aviso enviado por esta empresa.');
 if (d.enabled && (!runtimeReady || !acknowledged || !d.scopes.length || !d.purpose.trim() || !d.legal_basis || !d.information_reference.trim() || (d.notice_enabled && !d.notice_prompt_id))) throw new Error('A ativação exige integração disponível, escopo, finalidade, base legal, transparência e confirmação da empresa.');
}
export function createRecordingsApi(client: SupabaseClient, organizationId: string, signal?: AbortSignal) {
 if (!organizationId) throw new Error('Selecione uma empresa.');
 async function rpc<T>(name: string, params: Record<string, unknown> = {}): Promise<T> {
  const result = await pbxRequest(abort => client.rpc(name, { p_organization_id: organizationId, ...params }).abortSignal(abort), 'Gravações', { signal });
  if (result.error) throw new Error('Operação sem confirmação. Atualize os dados antes de repetir.');
  return result.data as T;
 }
 return {
  async policy() { const row = await rpc<(RecordingPolicy & { error?: string | null }) | null>('pbx_get_recording_policy'); return row ? { ...newRecordingPolicy(), ...row, last_error: row.last_error || (row.error ? 'Falha na aplicação.' : null) } : null; },
  list: () => rpc<Recording[]>('pbx_list_recordings', { p_limit: 50 }),
  async prompts(): Promise<RecordingPrompt[]> {
   const result = await pbxRequest(abort => client.from('pbx_audio_prompts').select('id,label,status,organization_id').eq('organization_id', organizationId).eq('status','uploaded').limit(300).abortSignal(abort), 'Avisos de gravação', { signal });
   if (result.error) throw new Error('Não foi possível consultar os avisos.');
   return ((result.data || []) as RecordingPrompt[]).filter(p => p.organization_id === organizationId && p.status === 'uploaded');
  },
  async save(draft: RecordingPolicyDraft, acknowledged: boolean, promptIds: string[]) {
   // Recheck authoritative capability immediately before every enable request.
   const fresh = draft.enabled ? await rpc<RecordingPolicy | null>('pbx_get_recording_policy') : null;
   validateRecordingPolicy(draft, fresh?.runtime_ready === true, acknowledged, promptIds);
   return rpc<RecordingPolicy>('pbx_save_recording_policy', { p_policy: recordingPolicyPayload(draft), p_acknowledged: acknowledged });
  },
  async playback(id: string, supabaseUrl: string): Promise<string> {
   const result = await pbxRequest(abort => client.functions.invoke('union-pbx-recording-access', { body: { recording_id: id }, signal: abort }), 'Acesso à gravação', { signal });
   if (result.error) throw new Error('Não foi possível acessar esta gravação.');
   try {
    const url = new URL(result.data.url); const expected = new URL(supabaseUrl);
    if (url.protocol !== 'https:' || url.origin !== expected.origin || !url.pathname.startsWith('/storage/v1/object/sign/pbx-call-recordings/') || url.username || url.password) throw new Error();
    return url.href;
   } catch { throw new Error('Não foi possível acessar esta gravação.'); }
  },
 };
}
