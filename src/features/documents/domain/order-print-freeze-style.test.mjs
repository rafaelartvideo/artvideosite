import test from "node:test";
import assert from "node:assert/strict";
import { copyComputedStyle } from "./order-print-freeze-style.mjs";

test("copies computed layout and page-break styles before html2pdf cloning", () => {
  const names = ["display", "grid-template-columns", "width", "height", "break-inside"];
  const values = {
    display: "grid",
    "grid-template-columns": "420px 180px",
    width: "600px",
    height: "64px",
    "break-inside": "avoid",
  };
  const source = {
    length: names.length,
    item(index) { return names[index] || ""; },
    getPropertyValue(name) { return values[name] || ""; },
    getPropertyPriority() { return ""; },
  };
  const applied = [];
  const target = {
    setProperty(name, value, priority) { applied.push([name, value, priority]); },
  };

  copyComputedStyle(source, target);

  assert.deepEqual(applied, names.map(name => [name, values[name], ""]));
});
