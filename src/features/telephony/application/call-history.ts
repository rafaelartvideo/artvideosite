export type HistoryFilters = { from: string; to: string; direction: string; disposition: string; number: string };
export const directionLabels: Record<string, string> = { internal: 'Interna', inbound: 'Entrada', outbound: 'Saída' };
export const dispositionLabels: Record<string, string> = {
  ANSWERED: 'Atendida', 'NO ANSWER': 'Não atendida', BUSY: 'Ocupado', FAILED: 'Falha', CONGESTION: 'Indisponível',
};
export type CallHistoryRow = {
  id: string; linked_id: string; started_at: string; answered_at: string | null; ended_at: string;
  source: string; destination: string; direction: string; disposition: string;
  duration_seconds: number; billable_seconds: number;
  source_extension: { number: number; display_name: string } | null;
  destination_extension: { number: number; display_name: string } | null;
};

export function localHistoryDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function parseDay(value: string) {
  if (!/^\d{4}-\d\d-\d\d$/.test(value)) throw new Error('Informe datas válidas.');
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (localHistoryDate(date) !== value) throw new Error('Informe datas válidas.');
  return date;
}

export function historyFilterValues(organizationId: string | null, filters: HistoryFilters) {
  if (!organizationId || !/^[a-f0-9-]{36}$/i.test(organizationId)) throw new Error('Selecione uma empresa.');
  const start = parseDay(filters.from), end = parseDay(filters.to);
  const calendarDay=(value:Date)=>Date.UTC(value.getFullYear(),value.getMonth(),value.getDate());
  if (end < start || calendarDay(end) - calendarDay(start) > 92 * 86400000) throw new Error('Use um período de até 93 dias.');
  end.setDate(end.getDate() + 1);
  if (filters.direction && !Object.hasOwn(directionLabels, filters.direction)) throw new Error('Direção inválida.');
  if (filters.disposition && !Object.hasOwn(dispositionLabels, filters.disposition)) throw new Error('Resultado inválido.');
  const number = filters.number.trim();
  if (!/^[+0-9#]{0,32}$/.test(number)) throw new Error('Pesquise apenas os dígitos do número, + ou #.');
  return {from:start.toISOString(),to:end.toISOString(),number};
}

// The explicit organization filter is defense in depth; database RLS authorizes it.
export function queryCallHistory(client: any, organizationId: string | null, filters: HistoryFilters,
  page: number, pageSize: number, signal: AbortSignal, extensionIds: string[] = []) {
  const {from,to,number}=historyFilterValues(organizationId,filters);
  if (extensionIds.length > 1 || extensionIds.some(id => !/^[a-f0-9-]{36}$/i.test(id))) throw new Error('Ramal inválido.');
  if (!Number.isInteger(page) || page < 1 || ![10, 25, 50, 100].includes(pageSize)) throw new Error('Página inválida.');
  let query = client.from('pbx_call_logs').select(
    'id,linked_id,started_at,answered_at,ended_at,source,destination,direction,disposition,duration_seconds,billable_seconds,' +
    'source_extension:pbx_extensions!pbx_call_logs_source_extension_id_fkey(number,display_name),' +
    'destination_extension:pbx_extensions!pbx_call_logs_destination_extension_id_fkey(number,display_name)', { count: 'exact' })
    .eq('organization_id', organizationId).gte('started_at', from).lt('started_at', to);
  if (filters.direction) query = query.eq('direction', filters.direction);
  if (filters.disposition) query = query.eq('disposition', filters.disposition);
  if (number) query = query.or([`source.ilike.%${number}%`, `destination.ilike.%${number}%`,
    ...extensionIds.flatMap(id => [`source_extension_id.eq.${id}`, `destination_extension_id.eq.${id}`])].join(','));
  return query.order('started_at', { ascending: false }).order('id', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1).abortSignal(signal);
}

export async function loadCallHistory(client: any, organizationId: string | null, filters: HistoryFilters,
  page: number, pageSize: number, signal: AbortSignal) {
  // Build once to validate every field before issuing the optional directory lookup.
  const validated = queryCallHistory(client, organizationId, filters, page, pageSize, signal);
  if (!/^[0-9]{3,4}$/.test(filters.number.trim())) return await validated;
  const { data, error } = await client.from('pbx_extensions').select('id')
    .eq('organization_id', organizationId).eq('number', Number(filters.number.trim())).limit(1).abortSignal(signal);
  if (error) throw new Error('Não foi possível pesquisar o ramal associado.');
  return await queryCallHistory(client, organizationId, filters, page, pageSize, signal, (data || []).map((row: { id: string }) => row.id));
}

export function callDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
