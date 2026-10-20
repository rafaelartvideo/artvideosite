import test from "node:test";
import assert from "node:assert/strict";
import { parseContactTable, parseContactsCSV, CONTACT_IMPORT_BATCH_SIZE } from "./contact-file-import.ts";

test("Excel with Nome, Código do país and Número accepts Brazilian DDI 55",()=>{
  const rows=[["Nome","Código do país","Número"],["Rafael",55,79988037605],
    ["Maria","+55","(79) 98888-8888"]];
  const r=parseContactTable(rows);
  assert.deepEqual(r.entries,[{name:"Rafael",phone:"5579988037605"},
    {name:"Maria",phone:"5579988888888"}]);
  assert.equal(r.totalRows,2);
  assert.equal(r.layout,"headed");
});

test("Headerless Nome | DDI | Número and headerless two-column rows",()=>{
  const a=parseContactTable([["Rafael",55,"79988037605"],["Joana","55","79987654321"]]);
  assert.equal(a.entries.length,2);
  assert.equal(a.layout,"without_header");
  const b=parseContactTable([["Rafael","79988037605"],["Joana","79987654321"]]);
  assert.equal(b.entries.length,2);
});

test("Duplicates are unique by normalized phone; invalid and foreign DDI are not guessed",()=>{
  const r=parseContactTable([
    ["Nome","DDI","WhatsApp"],
    ["Rafael",55,"(79) 98803-7605"],
    ["Outro nome",55,"+55 79 98803-7605"],
    ["Cliente externo",1,"2125550123"],
    ["Nome inválido",55,"abc"],
  ]);
  assert.equal(r.entries.length,1);
  assert.equal(r.duplicates,1);
  assert.equal(r.invalidRows,1);
  assert.equal(r.unsupportedCountries,1);
});

test("Supports all 31,000 rows without truncating or processing outside limit",()=>{
  const rows=[["Nome","Código do país","Número"]];
  for(let i=0;i<31000;i++){
    const ddd=11+Math.floor(i/10000);
    const local=900000000+(i%10000);
    rows.push(["Cliente "+i,55,String(ddd)+String(local)]);
  }
  const r=parseContactTable(rows);
  assert.equal(r.entries.length,31000);
  assert.equal(r.invalidRows,0);
  assert.equal(r.duplicates,0);
  assert.equal(r.capped,false);
  assert.equal(Math.ceil(r.entries.length/CONTACT_IMPORT_BATCH_SIZE),124);
});

test("CSV handles quoted names, accented names, commas, semicolons and line breaks",()=>{
  const rows=parseContactsCSV('Nome;Código do país;Número\r\n"Souza, Rafael";55;79988037605\r\n"João; Teste";55;79987654321\r\n');
  assert.equal(rows.length,3);
  const result=parseContactTable(rows);
  assert.equal(result.entries.length,2);
  assert.equal(result.entries[0].name,"Souza, Rafael");
  assert.equal(result.entries[1].name,"João; Teste");
});

test("Detects oversized datasets and protects the directory against partial guesses",()=>{
  assert.throws(()=>parseContactTable([["Nome","DDI","Número"],["Rafael",55,"abc"]],5).entries.length===1,false);
  const rows=[["Nome","Telefone"]];
  for(let i=0;i<20;i++)rows.push(["Contato "+i,"11"+String(900000000+i)]);
  const r=parseContactTable(rows,10);
  assert.equal(r.entries.length,10);
  assert.equal(r.capped,true);
});
