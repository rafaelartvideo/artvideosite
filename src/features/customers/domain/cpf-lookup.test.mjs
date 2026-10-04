import test from "node:test";
import assert from "node:assert/strict";
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
