import { readFileSync } from 'node:fs';
import { counterDelta, statementDeltas } from './counter-deltas.mjs';
const input=process.argv[2];
if(!input)throw new Error('Informe o JSON de contadores; este comando não faz consultas de rede.');
const data=JSON.parse(readFileSync(input,'utf8'));
console.log(JSON.stringify({
  database:counterDelta(...data.database_snapshots,{database:['xact_commit','xact_rollback','blks_read','temp_bytes','deadlocks'],wal:['wal_bytes','wal_records','wal_buffers_full']}),
  statements:statementDeltas(data.rpc_start,data.rpc_end),
  usage:data.usage,
  limitations:['PG buffer reads are not physical disk IOPS or IO budget','WAL is cluster-wide, not egress','rollbacks are not API errors','SQL averages cannot supply percentiles','billing usage can lag one hour'],
},null,2));
