import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCpfLookupPayload } from "./cpf-lookup.mjs";

test("normalizes a local CPF result with name and birth date", () => {
  assert.deepEqual(normalizeCpfLookupPayload({
    success: true,
    source: "local",
    registration_id: "abc",
    name: "Maria da Silva",
    birth_date: "1990-05-12",
  }), {
    name: "Maria da Silva",
    birthDate: "1990-05-12",
    source: "local",
    registrationId: "abc",
  });
});

test("normalizes an external CPF result and ignores a non-ISO birth date", () => {
  assert.deepEqual(normalizeCpfLookupPayload({
    success: true,
    source: "external",
    name: "Joao Souza",
    birth_date: "12/05/1990",
  }), {
    name: "Joao Souza",
    birthDate: null,
    source: "external",
    registrationId: null,
  });
});
