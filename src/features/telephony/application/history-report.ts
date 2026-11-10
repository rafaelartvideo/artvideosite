import { historyFilterValues, directionLabels, dispositionLabels, type HistoryFilters, type CallHistoryRow } from './call-history';

export type HistoryReport = { total_records:number; answered_records:number; unanswered_records:number;
 failed_records:number; talk_seconds:number; identified_conversations:number; overflow:boolean; rows:CallHistoryRow[] };

export function historyReportParameters(organizationId:string|null,filters:HistoryFilters,exportRows=false) {
 const range=historyFilterValues(organizationId,filters);
 return {p_organization_id:organizationId,p_from:range.from,p_to:range.to,
  p_direction:filters.direction||null,p_disposition:filters.disposition||null,p_number:range.number||null,p_export:exportRows};
}

export function exportHistoryRows(report:Pick<HistoryReport,'overflow'|'rows'>) {
 if(report.overflow)throw new Error('Reduza o período ou os filtros para exportar até 2.000 registros por arquivo.');
 if(!Array.isArray(report.rows)||report.rows.length>2000)throw new Error('O relatório excedeu o limite de exportação.');
 return report.rows;
}

function csvCell(value:unknown) {
 let text=String(value??'');
 if(/^[\s]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;
 return '"'+text.replaceAll('"','""')+'"';
}

export function callHistoryCsv(rows:CallHistoryRow[]) {
 const lines:unknown[][]=[['Identificador vinculado','Início UTC','Fim UTC','Origem','Destino','Direção','Resultado',
  'Duração do trecho (s)','Após atendimento (s)','Ramal de origem','Identificação da origem','Ramal de destino','Identificação do destino']];
 for(const row of rows)lines.push([row.linked_id,new Date(row.started_at).toISOString(),new Date(row.ended_at).toISOString(),row.source,row.destination,
  directionLabels[row.direction]||row.direction,dispositionLabels[row.disposition]||row.disposition,
  row.duration_seconds,row.billable_seconds,row.source_extension?.number,row.source_extension?.display_name,
  row.destination_extension?.number,row.destination_extension?.display_name]);
 return '\uFEFF'+lines.map(line=>line.map(csvCell).join(';')).join('\r\n')+'\r\n';
}
