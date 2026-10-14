import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const repository = readFileSync(new URL("../infrastructure/marketplace-requests.repository.ts", import.meta.url), "utf8");
const buyer = readFileSync(new URL("../presentation/MarketplaceBuyerPage.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("../presentation/MarketplaceRequestsPanel.tsx", import.meta.url), "utf8");
const admin = readFileSync(new URL("../presentation/MarketplaceToolPage.tsx", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../../../supabase/migrations/20261014234000_marketplace_union_mediated_requests_and_proposals.sql", import.meta.url), "utf8");

test("Solicitacoes novas precisam de liberacao da Union para serem visiveis", () => {
  assert.match(schema, /alter column status set default 'pending_union'/);
  assert.match(schema, /new\.status <> 'pending_union'/);
  assert.match(schema, /private\.has_platform_permission\('platform\.marketplace\.manage'\)/);
  assert.match(schema, /status='open' and private\.marketplace_can_view_request/);
  assert.match(repository, /status: "pending_union"/);
  assert.match(panel, /moderateMarketplaceRequest\(item\.id, "open"\)/);
  assert.match(buyer, /Em análise pela Union/);
});

test("Empresa so envia proposta para intermediacao, nunca diretamente ao contratante", () => {
  assert.match(schema, /status='submitted'/);
  assert.match(schema, /marketplace_proposal_partner_submit/);
  assert.match(schema, /private\.has_tenant_module_permission/);
  assert.match(schema, /r\.status='open'/);
  assert.match(repository, /sendMarketplaceProposalToUnion/);
  assert.match(panel, /Enviar proposta à Union/);
  assert.match(admin, /storeApproved=\{ownStore\?\.status === "approved"\}/);
});

test("Somente Union encaminha propostas e confirma o atendimento", () => {
  assert.match(schema, /old\.status='submitted' and new\.status in \('presented','rejected'\)/);
  assert.match(schema, /old\.status='accepted' and new\.status in \('confirmed','withdrawn'\)/);
  assert.match(schema, /marketplace_proposal_confirm_request/);
  assert.match(panel, /Encaminhar ao contratante/);
  assert.match(panel, /Confirmar intermediação/);
  assert.match(buyer, /Toda negociação e confirmação é coordenada pela Union World/);
});

test("Cliente so responde a propostas encaminhadas, sem trocar dados comerciais", () => {
  assert.match(schema, /old\.status<>'presented' or new\.status not in \('accepted','declined'\)/);
  assert.match(schema, /to_jsonb\(new\)-'status'-'updated_at'/);
  assert.match(schema, /status in \('presented','accepted','declined','confirmed','withdrawn'\)/);
  assert.match(repository, /respondToMarketplaceProposal/);
  assert.match(buyer, /Aceite enviado à Union/);
});
