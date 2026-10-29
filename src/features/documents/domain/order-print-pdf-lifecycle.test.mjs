import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const entry = "src/features/documents/domain/order-print-pdf-freeze.ts";

test("opening the order PDF module does not eagerly load the PDF renderer", async () => {
  const { metafile } = await build({
    absWorkingDir: root, entryPoints: [entry], bundle: true, splitting: true,
    format: "esm", platform: "browser", outdir: ".pdf-bundle-test", write: false, metafile: true,
  });
  const outputs = metafile.outputs;
  const initial = Object.keys(outputs).find(key => outputs[key].entryPoint === entry);
  assert.ok(initial);
  const eager = new Set();
  function visit(output) {
    if (eager.has(output)) return;
    eager.add(output);
    for (const dependency of outputs[output].imports) {
      if (!dependency.external && dependency.kind !== "dynamic-import") visit(dependency.path);
    }
  }
  visit(initial);
  const rendererOutputs = Object.keys(outputs).filter(output =>
    Object.keys(outputs[output].inputs).some(input => input.includes("node_modules/html2pdf.js/")));
  assert.ok(rendererOutputs.length > 0, "export must still include the PDF renderer");
  assert.ok(rendererOutputs.every(output => !eager.has(output)), "PDF renderer must load only on export");
});

// Canvas rasterization requires a browser. Replace only that library boundary;
// execute the real export function, HTML builder, styling and cleanup in Node.
const runtime = await build({
  absWorkingDir: root, stdin: {
    contents: `export { freezeOrderPrintPdf } from "./${entry}";
      export { emptyPrintTemplateEditorValue } from "./src/features/documents/domain/print-template.ts";`,
    resolveDir: root, loader: "ts",
  },
  bundle: true, format: "esm", platform: "browser", write: false,
  plugins: [{ name: "canvas-boundary", setup(builder) {
    builder.onResolve({ filter: /^html2pdf\.js$/ }, () => ({ path: "renderer", namespace: "test" }));
    builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
      contents: "export default function () { return globalThis.pdfWorkerFactory(); }", loader: "js",
    }));
  } }],
});
const { freezeOrderPrintPdf, emptyPrintTemplateEditorValue } = await import(
  `data:text/javascript;base64,${Buffer.from(runtime.outputFiles[0].text).toString("base64")}`
);

class Element {
  children = [];
  style = { setProperty() {} };
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute() {}
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { width: 700, top: 0, left: 0 }; }
}

for (const failure of ["container", "canvas", null]) {
  test(`export ${failure ? `failure during ${failure}` : "success"} removes only its own temporary DOM`, async t => {
    const previous = Object.fromEntries(["document", "window", "HTMLElement", "pdfWorkerFactory"].map(key => [key, globalThis[key]]));
    t.after(() => { for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    } });
    const body = new Element();
    const foreignOverlay = new Element();
    const overlay = new Element();
    const container = overlay.appendChild(new Element());
    const frame = new Element();
    const listeners = {};
    frame.addEventListener = (name, callback) => { listeners[name] = callback; };
    frame.contentDocument = {
      documentElement: new Element(), body: new Element(), images: [],
      defaultView: { getComputedStyle: () => ({ length: 0 }) },
      open() {}, write() {}, close() { queueMicrotask(() => listeners.load()); },
    };
    globalThis.HTMLElement = Element;
    globalThis.window = { setTimeout, clearTimeout };
    globalThis.document = {
      body, createElement: () => frame,
      querySelectorAll: () => body.children.filter(child => child !== frame),
    };
    const blob = new Blob(["%PDF-test"], { type: "application/pdf" });
    const error = new Error(`failed ${failure}`);
    const worker = {
      prop: { overlay, container },
      set() { return this; }, from() { return this; },
      toContainer() { body.appendChild(overlay); body.appendChild(foreignOverlay); return this; },
      async get(key) {
        if (key === "container") { if (failure === "container") throw error; return container; }
        return { internal: { getNumberOfPages: () => 1 }, setPage() {}, setFont() {}, setFontSize() {}, setTextColor() {} };
      },
      toCanvas() { return { toPdf: async () => { if (failure === "canvas") throw error; } }; },
      async outputPdf() { return blob; },
    };
    globalThis.pdfWorkerFactory = () => worker;
    const template = { ...emptyPrintTemplateEditorValue(), show_printed_at: false };
    if (failure) await assert.rejects(freezeOrderPrintPdf(template, { order: {} }), error);
    else assert.deepEqual(await freezeOrderPrintPdf(template, { order: {} }), { blob, page_count: 1, signature_slots: [] });
    assert.deepEqual(body.children, [foreignOverlay], "keep another export's overlay and remove this frame/overlay");
  });
}
