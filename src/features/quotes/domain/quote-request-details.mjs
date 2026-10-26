// Organize the legacy freeform summary emitted by the public booking RPC.
// Never confuse this auto-generated summary with the customer's own notes.
const prefixes = [
 ['service','Serviço: '],['option','Opção: '],['quantity','Quantidade: '],
 ['schedule','Preferência de atendimento (a confirmar): '],
 ['schedule','Preferência de atendimento: '],
 ['schedule','Preferência de horário (a confirmar): '],
 ['schedule','Agendamento: '],
 ['address','Endereço do atendimento: '],['address','Endereço de atendimento: '],
 ['contact','Contato desta solicitação: '],['contact','Contato: '],
 ['model','Modelo do equipamento: '],['model','Modelo: '],
 ['equipment','Equipamento: '],
 ['brand','Marca do equipamento: '],['brand','Marca: '],
 ['repairType','Tipo de solicitação: '],
 ['repairLocation','Atendimento solicitado: '],['repairLocation','Modalidade: '],
 ['repairPostalCode','CEP informado para consulta: '],
 ['repairPostalCode','CEP informado para coleta: '],
 ['issue','Problema relatado: '],['issue','Descrição do problema: '],
 ['issue','Relato: '],
];
export function parseQuoteRequestMessage(value) {
 const raw=String(value||'').trim();
 const result={service:'',option:'',quantity:'',schedule:'',address:'',
  contact:'',model:'',equipment:'',brand:'',repairType:'',repairLocation:'',
  repairPostalCode:'',issue:'',notes:''};
 const content=[];
 for(const line of raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)){
  if(line==='Solicitação pelo site — orçamento sem pagamento antecipado.')continue;
  const match=prefixes.find(([,prefix])=>line.startsWith(prefix));
  if(match){result[match[0]]=line.slice(match[1].length).trim();continue;}
  // Taxa e demais campos criados automaticamente não são relato do cliente.
  if(/^Taxa de coleta para o CEP /i.test(line))continue;
  content.push(line);
 }
 result.notes=content.join('\n').trim();
 return result;
}
export function quoteRequestAddress(quote) {
 const saved=quote?.service_address;
 if(saved && typeof saved==='object' && !Array.isArray(saved)){
  const fields=['street','number','complement','neighborhood','city','state','zip_code'];
  const cleaned=Object.fromEntries(fields.map(k=>[k,String(saved[k]||'').trim()]));
  if(fields.some(k=>cleaned[k]))return {address:cleaned,source:'quote'};
 }
 const legacy=parseQuoteRequestMessage(quote?.customer_message);
 if(legacy.address){
  const pieces=legacy.address.split(',').map(v=>v.trim()).filter(Boolean);
  if(pieces.length>=5){
   const code=pieces.at(-1)||'',state=pieces.at(-2)||'',city=pieces.at(-3)||'';
   const neighborhood=pieces.at(-4)||'',number=pieces.at(-5)||'';
   const street=pieces.slice(0,-5).join(', ');
   return {address:{street,number,neighborhood,city,state,zip_code:code},source:'legacy'};
  }
  return {address:{text:legacy.address},source:'legacy'};
 }
 if(legacy.repairPostalCode)return {address:{zip_code:legacy.repairPostalCode},source:'legacy'};
 return null;
}
export function quoteAddressLabel(address) {
 if(!address)return '';
 const a=address.address;
 if(a.text)return a.text;
 return [a.street,a.number,a.complement,a.neighborhood,a.city,a.state,a.zip_code].filter(Boolean).join(', ');
}

export function quoteCustomerReport(quote) {
 const direct=String(quote?.issue_reported||'').trim();
 // Registros antigos podem ter recebido o resumo automático no campo de relato.
 // Nunca mostre dados de serviço, endereço ou contato como se fossem descrição.
 const raw=direct||String(quote?.customer_message||'').trim();
 if(!raw)return '';
 const legacy=raw.startsWith('Solicitação pelo site — orçamento sem pagamento antecipado.')
  || /(?:^|\n)(?:Serviço: |Opção: |Endereço do atendimento: |Contato desta solicitação: )/.test(raw);
 if(direct&&!legacy)return direct;
 const parsed=parseQuoteRequestMessage(raw);
 return parsed.issue||parsed.notes||'';
}
