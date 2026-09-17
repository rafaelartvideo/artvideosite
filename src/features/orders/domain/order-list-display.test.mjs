import test from "node:test";
import assert from "node:assert/strict";
import { filteredRowNumber, filteredTotalLabel } from "./order-list-display.mjs";

test("numbers filtered rows continuously across pages", () => {
  assert.equal(filteredRowNumber({ page: 1, pageSize: 10, index: 0 }), 1);
  assert.equal(filteredRowNumber({ page: 2, pageSize: 10, index: 0 }), 11);
  assert.equal(filteredRowNumber({ page: 3, pageSize: 5, index: 4 }), 15);
});

test("shows explicit filter total only when filters are active", () => {
  assert.equal(filteredTotalLabel(7, true), "Total do filtro: 7 OS");
  assert.equal(filteredTotalLabel(1, true), "Total do filtro: 1 OS");
  assert.equal(filteredTotalLabel(7, false), "7 OS encontradas");
  assert.equal(filteredTotalLabel(1, false), "1 OS encontrada");
});
