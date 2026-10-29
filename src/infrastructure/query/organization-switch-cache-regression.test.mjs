import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const provider = readFileSync("src/app/providers/AppQueryProvider.tsx", "utf8");
const auth = readFileSync("src/lib/auth.tsx", "utf8");
const events = readFileSync("src/lib/platform-identifiers.ts", "utf8");

test("cada empresa conserva seu QueryClient e retorna ao cache anterior sem clear global", () => {
  assert.match(provider, /new Map<string, QueryClient>/);
  assert.match(provider, /clientsByOrganizationRef\.current\.set\(previousOrganizationId, currentClientRef\.current\)/);
  assert.match(provider, /clientsByOrganizationRef\.current\.get\(nextOrganizationId\)/);
  assert.match(provider, /setQueryClient\(nextClient\)/);
  assert.doesNotMatch(provider, /const clearOrganizationCache = \(\) => queryClient\.clear\(\)/);
});

test("evento de compatibilidade não processa a troca duas vezes", () => {
  assert.match(events, /window\.dispatchEvent\(create\(\)\)/);
  assert.match(events, /window\.dispatchEvent\(createLegacy\(\)\)/);
  assert.match(provider, /lastChangeDetailRef\.current === detail/);
  assert.match(provider, /lastChangeDetailRef\.current = detail \|\| null/);
});

test("logout e falha de acesso eliminam dados de todas as empresas", () => {
  assert.match(provider, /if \(!nextOrganizationId\)/);
  assert.match(provider, /clientsByOrganizationRef\.current\.clear\(\)/);
  assert.match(provider, /client\.clear\(\)/);
  assert.match(provider, /setQueryClient\(freshClient\)/);
  assert.match(auth, /if \(notifyOrganizationChange\) \{/);
  assert.match(auth, /function clearResolvedAccess\(\) \{\s*const previousOrganizationId = activeOrganizationIdRef\.current/);
});

test("a navegação entre empresas não cria requisições antigas simultâneas", () => {
  assert.match(provider, /previousClient\.cancelQueries\(\)/);
  assert.match(provider, /currentOrganizationRef\.current = nextOrganizationId/);
  assert.match(auth, /previousOrganizationId !== resolvedOrganization\.organization_id/);
});
