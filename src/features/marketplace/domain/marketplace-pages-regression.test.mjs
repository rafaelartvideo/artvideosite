import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const app = readFileSync(new URL("../../../app/App.tsx", import.meta.url), "utf8");
const homepage = readFileSync(new URL("../presentation/MarketplaceHomePage.tsx", import.meta.url), "utf8");
const detail = readFileSync(new URL("../presentation/MarketplaceListingDetailPage.tsx", import.meta.url), "utf8");
const management = readFileSync(new URL("../presentation/MarketplaceToolPage.tsx", import.meta.url), "utf8");
const repository = readFileSync(new URL("../infrastructure/marketplace.repository.ts", import.meta.url), "utf8");
const htaccess = readFileSync(new URL("../../../../public/.htaccess", import.meta.url), "utf8");

test("Marketplace possui rotas explicitas no site, no CRM e no build combinado", () => {
  for (const path of [
    "/marketplace",
    "/marketplace/servico/:listingId",
    "/marketplace/produto/:listingId",
    "/marketplace/loja/:slug",
    "/marketplace/solicitar",
    "/marketplace/conta",
  ]) {
    const fragment = '<Route path="' + path + '" element={<MarketplaceRouteContent />} />';
    assert.equal(app.split(fragment).length - 1, 3, "Rota ausente nos tres builds: " + path);
  }
  assert.equal(app.split('<Route path="/marketplace/*" element={<Navigate to="/marketplace" replace />} />').length - 1, 3);
  assert.match(htaccess, /RewriteRule \^ index\.html \[L\]/);
});

test("Detalhes de servico e produto possuem paginas proprias e redirecionamento canonico", () => {
  assert.match(detail, /export function MarketplaceServiceDetailPage/);
  assert.match(detail, /export function MarketplaceProductDetailPage/);
  assert.match(homepage, /<MarketplaceServiceDetailPage/);
  assert.match(homepage, /<MarketplaceProductDetailPage/);
  assert.match(homepage, /currentDetail\.source_kind !== \(path\.startsWith/);
  assert.match(homepage, /resolvedListingId !== listingId/);
});

test("Anuncios publicados abrem seus detalhes, com contexto e RLS publicos", () => {
  assert.match(homepage, /onRequestService=\{item => navigate\("\/marketplace\/solicitar\?anuncio="/);
  assert.match(detail, /onOpenListing\(item\)/);
  assert.match(detail, /onOpenStore\(vendor\)/);
  assert.match(management, /Ver anúncio/);
  assert.match(management, /Ver loja/);
  assert.match(management, /\/marketplace\/loja\//);
  assert.match(repository, /eq\("status", "approved"\)\.maybeSingle/);
  assert.match(repository, /private|marketplace_stores/);
});

test("Pagina de produto informa que ainda nao existe checkout", () => {
  assert.match(detail, /As compras online ainda não estão disponíveis/);
  assert.match(detail, /A negociação com a empresa será disponibilizada em outra etapa/);
});
