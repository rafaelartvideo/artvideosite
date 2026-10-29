import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const html = await readFile(new URL("./order-print-document.ts", import.meta.url), "utf8");
const frozen = await readFile(new URL("./order-print-pdf-freeze.ts", import.meta.url), "utf8");
const signed = await readFile(new URL("../../../../supabase/functions/document-signature-public/final-document-pdf.ts", import.meta.url), "utf8");
const { outputFiles } = await build({
  absWorkingDir: fileURLToPath(new URL("../../../../", import.meta.url)),
  entryPoints: ["src/features/documents/domain/order-print-document.ts"],
  bundle: true, format: "esm", platform: "browser", write: false,
});
const { orderPrintSafeMargins } = await import(`data:text/javascript;base64,${Buffer.from(
  outputFiles[0].text + "\n//# sourceURL=order-print-margins-runtime.mjs",
).toString("base64")}`);

test("print export respects configured zero and fractional margins while rejecting invalid margins", () => {
  assert.deepEqual(orderPrintSafeMargins({ margin_top: 0, margin_right: 2.5, margin_bottom: 6, margin_left: 8 }), [0, 2.5, 6, 8]);
  assert.deepEqual(orderPrintSafeMargins({ margin_top: -3, margin_right: NaN, margin_bottom: Infinity, margin_left: undefined }), [0, 12, 12, 12]);
  assert.match(frozen, /orderPrintSafeMargins\(template\)/);
});

test("server signed PDF reserves the verification footer area", () => {
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
