import test from "node:test";
import assert from "node:assert/strict";
import {
  copyComputedStyle,
  html2pdfMarginOrder,
  signatureSlotFromGeometry,
} from "./order-print-freeze-style.mjs";

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

test("maps template top-right-bottom-left margins to html2pdf top-left-bottom-right", () => {
  assert.deepEqual(html2pdfMarginOrder([10, 12, 14, 16]), [10, 16, 14, 12]);
});

test("keeps signature overlay inside the blank area above its line", () => {
  const slot = signatureSlotFromGeometry({
    lineLeftPx: 40,
    lineTopPx: 24,
    lineWidthPx: 300,
    signatureTopPx: 0,
    pxPerMm: 4,
    pageHeightPx: 1000,
    marginLeftMm: 10,
    marginTopMm: 10,
  });

  assert.equal(slot.page_index, 0);
  assert.equal(slot.y_mm, 11);
  assert.equal(slot.height_mm, 4.5);
  assert.equal(slot.x_mm, 22);
  assert.equal(slot.width_mm, 71);
});
