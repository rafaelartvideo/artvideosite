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
  assert.match(ui, /<Paperclip size=\{21\}/);
  assert.match(ui, /<Send size=\{22\}/);
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
  assert.match(comments, /\{submitting \? <LoadingSpinner size="sm" \/> : <Send size=\{22\} \/>\}/);
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

test("compositor de comentários fica ao final e segue a barra do WhatsApp", async () => {
  const component = read("src/features/orders/presentation/OrderQuoteComments.tsx");
  const emojiPicker = read("src/features/sac-digital/presentation/SacEmojiPicker.tsx");
  assert.ok((await transformWithEsbuild(component, "OrderQuoteComments.tsx", { loader: "tsx" })).code);
  assert.ok((await transformWithEsbuild(emojiPicker, "SacEmojiPicker.tsx", { loader: "tsx" })).code);
  assert.ok(component.indexOf("{canComment && <div className=") > component.indexOf("{roots.length > 0"));
  assert.match(component, /<form onSubmit=\{event =>/);
  assert.match(component, /<Paperclip size=\{21\}/);
  assert.match(component, /<Smile size=\{21\}/);
  assert.doesNotMatch(component, /<Mic size=\{21\}/);
  assert.match(component, /<Send size=\{22\}/);
  assert.match(component, /<SacEmojiPicker embedded recentEmojis=/);
  assert.match(component, /createPortal\(/);
  assert.match(component, /data-quote-emoji-portal/);
  assert.match(component, /fixed z-\[10000\]/);
  assert.match(emojiPicker, /embedded = false/);
});

test("envio de áudio permanece desativado, mas arquivos históricos podem ser reproduzidos", () => {
  const component = read("src/features/orders/presentation/OrderQuoteComments.tsx");
  const repository = read("src/features/orders/infrastructure/order-quote.repository.ts");
  const sql = read("supabase/migrations/20261106132057_disable_quote_comment_audio_uploads.sql");
  assert.doesNotMatch(component, /MediaRecorder|navigator\.mediaDevices\.getUserMedia|startRecording|stopRecording/);
  assert.doesNotMatch(component, /<Mic size=/);
  assert.doesNotMatch(component, /accept="[^"]*audio\//);
  assert.match(component, /<audio controls preload="none"/);
  const acceptedFiles = repository.slice(repository.indexOf("const COMMENT_ALLOWED_MIME"),
    repository.indexOf("export async function addOrderQuoteComment"));
  assert.doesNotMatch(acceptedFiles, /"audio\/(webm|ogg|mp4|mpeg)"/);
  assert.match(repository, /validateOrderQuoteCommentFiles/);
  assert.doesNotMatch(sql, /'audio\/(webm|ogg|mp4|mpeg)'/);
  assert.match(sql, /private\.can_view_service_order\(service_order_id\)/);
  assert.match(sql, /'application\/pdf'/);
});

test("contador de comentários segue exatamente o badge azul dos itens do orçamento", () => {
  const comments = read("src/features/orders/presentation/OrderQuoteComments.tsx");
  const items = read("src/features/orders/presentation/OrderQuoteCommercialEditor.tsx");
  const badge = "inline-flex min-w-6 items-center justify-center rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary";
  assert.ok(comments.includes('className="' + badge + '">{notes.length}'));
  assert.ok(items.includes('className="' + badge + '">{draft.items.length}'));
});
