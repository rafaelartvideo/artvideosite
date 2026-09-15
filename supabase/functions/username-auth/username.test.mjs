import test from "node:test";
import assert from "node:assert/strict";
import { isValidUsername, normalizeUsername } from "./username.mjs";

test("normalizes username", () => {
  assert.equal(normalizeUsername("  Rafael.Lima  "), "rafael.lima");
});

test("validates username format", () => {
  assert.equal(isValidUsername("rafael.lima_01"), true);
  assert.equal(isValidUsername("ab"), false);
  assert.equal(isValidUsername("rafael lima"), false);
  assert.equal(isValidUsername("_rafael"), false);
});
