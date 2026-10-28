import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const read = path => readFileSync(path, "utf8");
const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? files(path) : /\.tsx?$/.test(path) ? [path] : [];
});
const normalized = path => relative("src", path).split(sep).join("/");
const feedbackPath = "shared/ui/admin/AdminFeedback.tsx";
const inboxPath = "features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx";
const sacPath = "features/sac-digital/presentation/SacDigitalToolPage.tsx";

test("carregamentos globais e modais exibem spinner circular, não três pontos", () => {
  const source = read("src/" + feedbackPath);
  const inline = source.slice(source.indexOf("export function InlineLoading"), source.indexOf("export function LoadingOverlay"));
  const overlay = source.slice(source.indexOf("export function LoadingOverlay"), source.indexOf("export function LoadingState"));
  const section = source.slice(source.indexOf("export function LoadingState"), source.indexOf("export function EmptyState"));
  for (const block of [inline, overlay, section]) {
    assert.match(block, /<LoadingSpinner/);
    assert.doesNotMatch(block, /LoadingDots|animate-bounce/);
  }
  assert.match(source, /animate-spin/);
  assert.doesNotMatch(inline, /indicator\s*===\s*["']dots["']/);
});

test("três pontos ficam exclusivos de Selecionar/Preparando conversa e do estado vazio do SAC", () => {
  const inventory = files("src");
  for (const path of inventory) {
    const code = read(path);
    const name = normalized(path);
    if (code.includes("LoadingDots")) {
      assert.ok([feedbackPath, inboxPath].includes(name), `Uso de LoadingDots fora de conversas: ${name}`);
    }
    if (code.includes("animate-bounce")) {
      assert.ok([feedbackPath, sacPath].includes(name), `Pontos pulando fora de conversas: ${name}`);
    }
  }
  const inbox = read("src/" + inboxPath);
  assert.match(inbox, /Selecione uma conversa/);
  assert.match(inbox, /Preparando conversa\.\.\./);
  assert.equal((inbox.match(/<LoadingDots\s*\/>/g) || []).length, 2);
  assert.match(read("src/" + sacPath), /function EmptySacConversationState/);
  assert.match(read("src/" + sacPath), /animate-bounce/);
});

test("modal de orçamento, PDF e configuração do WhatsApp usam spinner", () => {
  const paths = [
    "features/orders/presentation/OrderQuoteWorkspace.tsx",
    "shared/ui/admin/PdfInlineViewer.tsx",
    "features/whatsapp-channels/presentation/WhatsAppChannelsPage.tsx",
    "features/whatsapp-channels/presentation/WhatsAppRolePermissions.tsx",
  ];
  for (const path of paths) {
    const code = read("src/" + path);
    assert.match(code, /<LoadingSpinner/, path);
    assert.doesNotMatch(code, /LoadingDots|animate-bounce/, path);
  }
});
