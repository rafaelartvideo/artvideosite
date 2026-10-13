import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./order-print-document.ts", import.meta.url), "utf8");
const frozen = await readFile(new URL("./order-print-pdf-freeze.ts", import.meta.url), "utf8");
const signed = await readFile(new URL("../../../../supabase/functions/document-signature-public/final-document-pdf.ts", import.meta.url), "utf8");

test("all OS PDF versions reserve a physical footer margin", () => {
  assert.match(html, /export function orderPrintSafeMargins\(/);
  assert.match(html, /Math\.max\(14, Number\(template\.margin_bottom\)/);
  assert.match(frozen, /orderPrintSafeMargins\(template\)/);
  assert.match(signed, /Math\.max\(ptFromMm\(template\.margin_bottom, 14\), 14 \* 72 \/ 25\.4\)/);
});

test("browser printing puts page number in center and printed-by on the right", () => {
  assert.match(html, /@bottom-center\{content:/);
  assert.match(html, /@bottom-right\{content:/);
  assert.match(html, /@bottom-left\{content:/);
  assert.match(html, /text-align:center/);
  assert.match(html, /text-align:right/);
  const contentSection = html.slice(html.indexOf("const sectionHtml"), html.indexOf("const orientation ="));
  assert.doesNotMatch(contentSection, /system\.printed_by|Impresso por/);
  assert.match(html, /const customFooterText = template\.footer_text/);
});

test("frozen PDFs stamp page number centered and printed-by at right on EVERY page", () => {
  assert.match(frozen, /for \(let page = 1; page <= pageCount; page \+= 1\)/);
  assert.match(frozen, /footer\.pageNumber/);
  assert.match(frozen, /pageWidthMm \/ 2, footerY, \{ align: "center" \}/);
  assert.match(frozen, /footer\.printedBy/);
  assert.match(frozen, /pageWidthMm - marginRight, footerY, \{ align: "right" \}/);
  assert.match(frozen, /sideMaxWidthMm/);
});

test("tables and form field boxes have more space before bottom dividers", () => {
  assert.match(html, /\.field\{min-width:0;padding:6px 8px 9px/);
  assert.match(html, /\.checklist-table td\{padding:6px 8px 9px/);
  assert.match(signed, /const height = 13 \+ Math\.max\(1, valueLines\.length\) \* 12 \+ 10/);
});

test("server signed PDFs align verification left, page number center and printer right", () => {
  assert.match(signed, /const pageLabelWidth = regular\.widthOfTextAtSize/);
  assert.match(signed, /x: \(pageWidth - pageLabelWidth\) \/ 2/);
  assert.match(signed, /const footerRight = printerName/);
  assert.match(signed, /x: pageWidth - marginRight - regular\.widthOfTextAtSize\(rightText, 6\.5\)/);
});
