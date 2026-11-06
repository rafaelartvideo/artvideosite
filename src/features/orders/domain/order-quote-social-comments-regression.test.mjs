import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";

const read = path => readFileSync(path, "utf8");

test("comentários sociais compilam sem alterar envio e aprovação do orçamento", async () => {
  for (const [path, loader] of [
    ["src/features/orders/presentation/OrderQuoteWorkspace.tsx", "tsx"],
    ["src/features/orders/presentation/OrderQuoteComments.tsx", "tsx"],
    ["src/features/orders/infrastructure/order-quote.repository.ts", "ts"],
  ]) {
    const source = read(path);
    assert.ok((await transformWithEsbuild(source, path, { loader })).code, path);
  }
  const workspace = read("src/features/orders/presentation/OrderQuoteWorkspace.tsx");
  assert.match(workspace, /<OrderQuoteComments organizationId=\{org\} orderId=\{orderId\}/);
  assert.match(workspace, /Encaminhar <ArrowRight/);
});

test("comentários incluem respostas, curtidas, emojis, anexos e envio seguro", () => {
  const ui = read("src/features/orders/presentation/OrderQuoteComments.tsx");
  const repo = read("src/features/orders/infrastructure/order-quote.repository.ts");
  assert.match(ui, /SacEmojiPicker/);
  assert.match(ui, /setReplyTo\(/);
  assert.match(ui, /setOrderQuoteCommentLike/);
  assert.match(ui, /<Heart size=\{15\}/);
  assert.match(ui, /<Paperclip size=\{19\}/);
  assert.match(ui, /<Send size=\{18\}/);
  assert.match(ui, /disabled=\{submitting \|\| \(!draft\.trim\(\) && !files\.length\)\}/);
  assert.match(repo, /add_service_order_quote_comment_v2/);
  assert.match(repo, /validateOrderQuoteCommentFiles/);
  assert.match(repo, /createSignedUrls/);
  assert.match(repo, /attachments\/quote-comments/);
  assert.match(repo, /setOrderQuoteCommentLike/);
});

test("migração de comentários preserva os registros e limita acesso entre empresas", () => {
  const sql = read("supabase/migrations/20261106122445_order_quote_social_comments.sql");
  assert.match(sql, /add column if not exists parent_id uuid/);
  assert.match(sql, /service_order_quote_comment_likes/);
  assert.match(sql, /service_order_quote_comment_attachments/);
  assert.match(sql, /foreign key \(parent_id, organization_id, service_order_id\)/);
  assert.match(sql, /private\.can_view_service_order\(service_order_id\)/);
  assert.match(sql, /media\.uploaded_by = \(select auth\.uid\(\)\)/);
  assert.match(sql, /security invoker/);
  assert.match(sql, /cardinality\(coalesce\(p_media_ids/);
});

test("comentar não aciona loading dos botões de encaminhamento do orçamento", async () => {
  const workspace = read("src/features/orders/presentation/OrderQuoteWorkspace.tsx");
  const comments = read("src/features/orders/presentation/OrderQuoteComments.tsx");
  assert.ok((await transformWithEsbuild(workspace, "OrderQuoteWorkspace.tsx", { loader: "tsx" })).code);
  assert.match(workspace, /<OrderQuoteComments organizationId=\{org\} orderId=\{orderId\}/);
  assert.match(comments, /\{submitting \? <LoadingSpinner size="sm" \/> : <Send size=\{18\} \/>\}/);
  assert.doesNotMatch(workspace, /\{editable && <BtnPrimary disabled=\{busy\} loading=\{busy\}/);
  assert.doesNotMatch(workspace, /<BtnPrimary disabled=\{busy\} loading=\{busy\} onClick=\{\(\)=>openAction\("approve"\)\}/);
  assert.match(workspace, /loading=\{busy\}\s+loadingText="Processando\.\.\."/);
});

test("serviço avulso pode editar título e descrição no modal sem alterar preços", async () => {
  const editor = read("src/features/orders/presentation/OrderQuoteCommercialEditor.tsx");
  assert.ok((await transformWithEsbuild(editor, "OrderQuoteCommercialEditor.tsx", { loader: "tsx" })).code);
  assert.match(editor, /item\.item_type==="custom_service" && <AdminIconButton/);
  assert.match(editor, /<Pencil size=\{15\}/);
  assert.match(editor, /onClick=\{\(\)=>editCustom\(index,item\)\}/);
  assert.match(editor, /title=\{editingCustomIndex===null\?"Serviço Avulso":"Editar serviço avulso"\}/);
  assert.match(editor, /updateItem\(editingCustomIndex,\{title_snapshot:name,description_snapshot:customDescription\.trim\(\)\}\)/);
  assert.match(editor, /\{editingCustomIndex===null && <div className="grid gap-3 sm:grid-cols-2">/);
});
