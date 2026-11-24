import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {transformWithEsbuild} from "vite";
const read=p=>readFileSync(p,"utf8");
const base="src/features/finance/";
test("Digitalização de despesas preserva a confirmação, anexos e baixa financeira",async()=>{
  const editor=read(base+"presentation/FinanceEntryEditorDialog.tsx");
  const entries=read(base+"presentation/FinanceEntriesSection.tsx");
  const repository=read(base+"infrastructure/expense-scan.repository.ts");
  const edge=read("supabase/functions/union-ai-expense/index.ts");
  for(const [name,source,loader] of [["editor.tsx",editor,"tsx"],["entries.tsx",entries,"tsx"],["scan.ts",repository,"ts"],["edge.ts",edge,"ts"]]){
    assert.ok((await transformWithEsbuild(source,name,{loader})).code.length>100);
  }
  assert.match(editor,/entryType==="payable"&&!initial&&accountType==="single"/);
  assert.match(editor,/capture="environment"/);
  assert.match(editor,/scanExpenseDocument\(org,file/);
  assert.match(editor,/setAmount\(""\)/);
  assert.match(editor,/findExpenseScanHints/);
  assert.match(editor,/saveGate\.current=true/);
  assert.match(entries,/uploadFinancialAttachment\(finance\.organizationId,id,source\.file/);
  assert.match(entries,/source\?\.openSettlement&&canSettle\)openSettlement\(id\)/);
  assert.match(edge,/auth\.getUser\(token\)/);
  assert.match(edge,/my_organization_permissions/);
  assert.match(edge,/finance\.payables\.create/);
  assert.match(edge,/union_ai_reserve_expense/);
  assert.match(edge,/union_ai_finalize/);
  assert.match(edge,/store:false/);
  assert.match(repository,/DOMParser/);
  assert.match(repository,/\.eq\("organization_id",org\)/);
  assert.match(repository,/readBoletoCode/);
});
test("Código de boleto validado não aceita dígito incorreto nem inventa valor",async()=>{
  const source=read(base+"infrastructure/expense-scan.repository.ts");
  const part=source.slice(source.indexOf("export function readBoletoCode"),source.indexOf("async function detectBoletoImage"));
  const compiled=await transformWithEsbuild(part,"boleto.ts",{loader:"ts",format:"esm"});
  const {readBoletoCode}=await import("data:text/javascript;base64,"+Buffer.from(compiled.code).toString("base64"));
  const raw="0019"+"0"+"1000"+"0000002450"+"1234567890123456789012345";
  let sum=0,weight=2;
  for(let i=43;i>=0;i--){if(i===4)continue;sum+=Number(raw[i])*weight;weight=weight===9?2:weight+1;}
  const dv=11-sum%11;
  const code=raw.slice(0,4)+([0,10,11].includes(dv)?1:dv)+raw.slice(5);
  assert.equal(readBoletoCode(code)?.amount,24.5);
  const invalid=code.slice(0,4)+(code[4]==="1"?"2":"1")+code.slice(5);
  assert.equal(readBoletoCode(invalid),null);
  assert.equal(readBoletoCode("12345"),null);
});
