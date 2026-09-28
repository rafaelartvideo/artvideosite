import test from "node:test";
import assert from "node:assert/strict";
import { systemErrorMessage } from "./error-message.ts";

test("never exposes object Object for an unknown error object", () => {
  assert.equal(systemErrorMessage({ unexpected: { value: true } }, "Falha segura."), "Falha segura.");
});

test("extracts nested backend error messages", () => {
  assert.equal(systemErrorMessage({ error: { message: "Falha do serviço." } }), "Falha do serviço.");
});

test("maps forbidden responses to the standard permission feedback", () => {
  assert.equal(systemErrorMessage({ status: 403, message: "Forbidden" }), "Você não possui permissão para realizar esta ação nesta empresa.");
});
