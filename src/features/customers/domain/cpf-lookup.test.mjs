import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { transformWithEsbuild } from "vite";
import { cpfAlreadyRegisteredMessage, normalizeCpfLookupPayload } from "./cpf-lookup.mjs";

test("blocks CPF lookup when the CPF is already registered locally", () => {
  assert.throws(
    () => normalizeCpfLookupPayload({
      success: true,
      source: "local",
      registration_id: "abc",
      name: "Maria da Silva",
      birth_date: "1990-05-12",
    }),
    /CPF já cadastrado nesta empresa para Maria da Silva/i,
  );
});

test("normalizes an external CPF result", () => {
  assert.deepEqual(normalizeCpfLookupPayload({
    success: true,
    source: "external",
    name: "Joao Souza",
    birth_date: "1990-05-12",
  }), {
    name: "Joao Souza",
    birthDate: "1990-05-12",
    gender: null,
    source: "external",
    registrationId: null,
  });
});

test("formats a generic duplicate CPF message when the name is unavailable", () => {
  assert.equal(
    cpfAlreadyRegisteredMessage(""),
    "CPF já cadastrado nesta empresa. Abra o cadastro existente.",
  );
});


test("normalizes documented M, F and I gender markers returned by APICPF", () => {
  for (const gender of ["M", "F", "I"]) {
    const result = normalizeCpfLookupPayload({success:true,source:"external",name:"Pessoa Teste",gender});
    assert.equal(result.gender,gender);
  }
});

test("does not infer a gender from the name or unknown provider values", () => {
  for (const gender of ["", "X", null, undefined]) {
    const result=normalizeCpfLookupPayload({success:true,source:"external",name:"Pessoa Teste",gender});
    assert.equal(result.gender,null);
  }
});

test("Union platform managers may consult CPF for an active partner, not arbitrary tenants", async () => {
  const edge = readFileSync("supabase/functions/lookup-cpf/index.ts", "utf8");
  const gateway = readFileSync("src/features/customers/infrastructure/cpf.gateway.ts", "utf8");
  const partner = readFileSync("supabase/functions/partner-users/index.ts", "utf8");
  assert.match(edge, /rpc\("platform_operator_organization_id"\)/);
  assert.match(edge, /rpc\("my_organization_permissions",\s*\{\s*p_organization_id: platformOrganizationId/);
  assert.match(edge, /platformKeys\.has\("organizations\.members\.manage"\)/);
  assert.match(edge, /targetCompany\.id !== platformOrganizationId/);
  assert.match(edge, /targetCompany\.status === "active"/);
  assert.match(edge, /targetCompany\.organization_type === "partner"/);
  assert.match(edge, /targetCompany\.settings\?\.is_artvideo_tenant === true/);
  assert.match(edge, /if \(!canLookup\) \{\s*return json\(\{ success: false, error: "Você não possui permissão/);
  assert.match(partner, /"organizations\.members\.manage"/);
  assert.match(gateway, /context instanceof Response/);
  assert.match(gateway, /context\.status === 403/);
  assert.ok((await transformWithEsbuild(edge, "lookup-cpf/index.ts", { loader: "ts" })).code.length > 100);
  assert.ok((await transformWithEsbuild(gateway, "cpf.gateway.ts", { loader: "ts" })).code.length > 100);
});
