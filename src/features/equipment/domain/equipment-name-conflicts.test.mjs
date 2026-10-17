import test from "node:test";
import assert from "node:assert/strict";
import { findIntroducedDuplicateNameIndices } from "./equipment-name-conflicts.mjs";

const normalize = value => value.trim().replace(/\s+/g, " ").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

test("duplicidade legada não impede editar outro campo", () => {
  const original = new Map([["b1", "Britania"], ["b2", "Britânia"]]);
  const items = [{ id: "b1", name: "Britania" }, { id: "b2", name: "Britânia" }];
  assert.deepEqual([...findIntroducedDuplicateNameIndices(items, original, normalize)], []);
});

test("marca nova que duplica uma legada é bloqueada", () => {
  const original = new Map([["b1", "Britania"], ["b2", "Britânia"]]);
  const items = [{ id: "b1", name: "Britania" }, { id: "b2", name: "Britânia" }, { name: "BRITANIA" }];
  assert.deepEqual([...findIntroducedDuplicateNameIndices(items, original, normalize)], [0, 1, 2]);
});

test("renomear marca para nome existente é bloqueado", () => {
  const original = new Map([["b1", "Arno"], ["b2", "Philco"]]);
  const items = [{ id: "b1", name: "Arno" }, { id: "b2", name: "arno" }];
  assert.deepEqual([...findIntroducedDuplicateNameIndices(items, original, normalize)], [0, 1]);
});

test("nomes distintos não são bloqueados", () => {
  const original = new Map([["b1", "Arno"]]);
  const items = [{ id: "b1", name: "Arno" }, { name: "Britânia" }];
  assert.deepEqual([...findIntroducedDuplicateNameIndices(items, original, normalize)], []);
});

test("modelos novos duplicados são bloqueados", () => {
  const items = [{ name: "LN50 PT" }, { name: "ln50 pt" }];
  assert.deepEqual([...findIntroducedDuplicateNameIndices(items, new Map(), normalize)], [0, 1]);
});
