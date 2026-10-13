import test from "node:test";
import assert from "node:assert/strict";
import { systemErrorMessage } from "./error-message.ts";
import { readFile } from "node:fs/promises";

test("never exposes object Object for an unknown error object", () => {
  assert.equal(systemErrorMessage({ unexpected: { value: true } }, "Falha segura."), "Falha segura.");
});

test("extracts nested backend error messages", () => {
  assert.equal(systemErrorMessage({ error: { message: "Falha do serviço." } }), "Falha do serviço.");
});

test("maps forbidden responses to the standard permission feedback", () => {
  assert.equal(systemErrorMessage({ status: 403, message: "Forbidden" }), "Você não possui permissão para realizar esta ação nesta empresa.");
});

test("strips internal error prefixes while preserving useful messages", () => {
  assert.equal(systemErrorMessage("invalid_auth: Falha ao autenticar."), "Falha ao autenticar.");
  assert.equal(systemErrorMessage("operator_profile_incompatible: A SAC não aceitou a conta."), "A SAC não aceitou a conta.");
  assert.equal(systemErrorMessage("https://example.com/error"), "https://example.com/error");
});

test("an OS message assigned to someone else shows only the responsible operator", () => {
  const response = "protocol_owned_by_other_operator: O cliente já está em atendimento com RAFAEL FERREIRA LIMA. Abra esse protocolo com um perfil autorizado; nenhuma mensagem foi enviada.";
  assert.equal(systemErrorMessage(Object.assign(new Error(response), { type: "protocol_owned_by_other_operator", outcome: "rejected" })),
    "O cliente já está em atendimento com RAFAEL FERREIRA LIMA.");
  assert.equal(systemErrorMessage(response), "O cliente já está em atendimento com RAFAEL FERREIRA LIMA.");
  assert.equal(systemErrorMessage({ type: "protocol_owned_by_other_operator", error: "Este contato já está em atendimento com Maria Silva. Você não pode iniciar outra conversa." }),
    "O cliente já está em atendimento com Maria Silva.");
});

test("shared toasts last 6 seconds for errors and 3 seconds for successes", async () => {
  const ui = await readFile(new URL("../ui/admin/AdminFeedback.tsx", import.meta.url), "utf8");
  assert.match(ui, /type === "error" \? 6000 : 3000/);
});
