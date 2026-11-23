import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";
const source=readFileSync("src/features/orders/domain/order-label-print.ts","utf8");
async function render(order) {
  const built=await transformWithEsbuild(source,"order-label-print.ts",{loader:"ts",format:"esm"});
  const module=await import("data:text/javascript;base64,"+Buffer.from(built.code).toString("base64"));
  const original=globalThis.window;
  const writes=[];
  globalThis.window={localStorage:{getItem:()=>null}};
  try {
    module.renderServiceOrderLabel({document:{
      open(){},write(html){writes.push(html);},close(){}
    }},order);
  }finally{
    if(original===undefined)delete globalThis.window;
    else globalThis.window=original;
  }
  assert.equal(writes.length,1);
  return writes[0];
}
test("OS com número externo permite ambos os números ou somente a externa antes da impressão",async()=>{
  const html=await render({os_number:"00126",external_os_number:"EX-0087"});
  assert.match(html,/name="number-mode" value="both" checked/);
  assert.match(html,/OS interna \+ externa/);
  assert.match(html,/name="number-mode" value="external-only"/);
  assert.match(html,/Somente OS externa/);
  assert.match(html,/sheet\.classList\.toggle\("external-only"/);
  assert.match(html,/\.sheet\.external-only \.order-number \{ display: none; \}/);
  assert.match(html,/\.sheet\.external-only \.external/);
  assert.match(html,/OS 00126/);
  assert.match(html,/EX-0087/);
  assert.doesNotMatch(html,/window\.addEventListener\("load", function \(\) \{ window\.focus\(\); window\.print\(\); \}\)/);
  assert.match(html,/printButton\.addEventListener\("click"/);
  assert.equal((html.match(/data-index="[123]"/g)||[]).length,3);
  assert.match(html,/@page \{ size: 104mm 23mm; margin: 0; \}/);
});
test("Sem OS externa mantém impressão automática e nenhuma escolha adicional",async()=>{
  const html=await render({os_number:"00126",external_os_number:"  "});
  assert.doesNotMatch(html,/name="number-mode"/);
  assert.doesNotMatch(html,/Somente OS externa/);
  assert.match(html,/window\.addEventListener\("load", function \(\) \{ window\.focus\(\); window\.print\(\); \}\)/);
  assert.match(html,/OS 00126/);
  assert.equal((html.match(/data-index="[123]"/g)||[]).length,3);
});
test("Caracteres do número externo são escapados no HTML",async()=>{
  const html=await render({os_number:"1",external_os_number:"<& EX-39"});
  assert.match(html,/&lt;&amp; EX-39/);
  assert.doesNotMatch(html,/class="external"[^>]*><&/);
});
