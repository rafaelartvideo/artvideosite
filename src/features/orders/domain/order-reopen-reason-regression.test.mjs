import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = filename => readFileSync(filename, "utf8");
const dialog = read("src/features/orders/presentation/OrderReturnStartDialog.tsx");
const sql = read("supabase/migrations/20261110210000_reopen_os_requires_reason.sql");

test("Reabrir OS compartilha o campo Motivo do retorno obrigatório", async () => {
  assert.ok((await transformWithEsbuild(dialog, "OrderReturnStartDialog.tsx", { loader: "tsx" })).code);
  assert.match(dialog, /\{isReopening && <p className="text-sm font-semibold text-foreground">/);
  assert.match(dialog, /Será criada uma nova ordem de serviço com um novo número\./);
  assert.match(dialog, /\{isReopening \|\| \(!loading && \(eligibility\?\.eligible \|\| expired\)\)\}/);
  assert.match(dialog, /Motivo do retorno <span className="text-red-600"/);
  assert.match(dialog, /minLength=\{5\} maxLength=\{2000\}/);
  assert.match(dialog, /if \(reason\.trim\(\)\.length < 5\)/);
  assert.match(dialog, /aria-label="Informações sobre a reabertura da OS"/);
  assert.match(dialog, /<CircleHelp size=\{17\} aria-hidden="true" \/>/);
  assert.match(dialog, /<PopoverContent align="start" side="bottom" sideOffset=\{6\}/);
  assert.match(dialog, /Os dados do cliente, equipamento, campos técnicos e fotos serão reutilizados\./);
  assert.match(dialog, /Valores, pagamentos, soluções anteriores, checklists e aprovações não serão copiados\./);
  assert.match(dialog, /title=\{isReopening \|\| expired/);
  assert.doesNotMatch(dialog, /Você pode reabrir o atendimento com outro número, aproveitando os dados/);
});

test("Reabrir OS usa Cancelar/Confirmar e salva motivo por RPC autenticada", () => {
  assert.match(dialog, /\{isReopening \|\| expired \? "Cancelar" : "Voltar"\}/);
  assert.match(dialog, /\{processing \? "Reabrindo\.\.\." : "Confirmar"\}/);
  assert.match(dialog, /reopen_service_order_as_new_v2/);
  assert.match(dialog, /p_order_id: orderId, p_reason: reason\.trim\(\)/);
  assert.match(dialog, /disabled=\{processing \|\| loading \|\| reason\.trim\(\)\.length < 5\}/);
  assert.doesNotMatch(dialog, /Confirmar reabertura/);
});

test("Backend rejeita motivo vazio, preserva relato anterior e não permite RPC legada sem motivo", () => {
  assert.match(sql, /FUNCTION public\.reopen_service_order_as_new_v2\(p_order_id uuid, p_reason text\)/);
  assert.match(sql, /coalesce\(char_length\(btrim\(p_reason\)\),0\) not between 5 and 2000/);
  assert.match(sql, /btrim\(p_reason\),\s*concat_ws/);
  assert.match(sql, /'Motivo do retorno: '\|\|btrim\(p_reason\)/);
  assert.match(sql, /'Relato anterior: '\|\|v_source\.customer_notes/);
  assert.match(sql, /private\.has_effective_organization_permission\(v_source\.organization_id,'orders\.create'\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reopen_service_order_as_new_v1/);
  assert.match(sql, /Atualize a pagina e tente novamente/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reopen_service_order_as_new_v2\(uuid,text\) TO authenticated/);
  assert.doesNotMatch(sql, /disable row level security|bypassrls/i);
});
