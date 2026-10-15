type ServiceOrderLabelOrder = {
  id?: string | null;
  os_number?: string | null;
  external_os_number?: string | null;
};

// Padrão conservador para rolos de três colunas. As medidas podem ser
// calibradas na prévia de impressão e ficam salvas neste navegador.
const DEFAULT_LAYOUT = { width: 32, height: 30, gap: 2, margin: 1, quantity: 3, qr: true };
const L42_MAX_PRINT_WIDTH_MM = 104;

function cleanText(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function escapeHtml(value: unknown) {
  return cleanText(value).replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character,
  );
}

function fontSizeForNumber(value: string, sizes: [number, number, number, number]) {
  const length = Array.from(value).length;
  return length > 17 ? sizes[3] : length > 12 ? sizes[2] : length > 8 ? sizes[1] : sizes[0];
}

export function renderServiceOrderLabel(
  popup: Window,
  order: ServiceOrderLabelOrder,
  qrCanvas: HTMLCanvasElement,
) {
  if (!qrCanvas.width || !qrCanvas.height) throw new Error("O QR Code da OS não foi gerado.");
  const qrDataUrl = qrCanvas.toDataURL("image/png");
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qrDataUrl)) {
    throw new Error("Não foi possível preparar o QR Code da etiqueta.");
  }

  const osNumber = cleanText(order.os_number);
  if (!osNumber) throw new Error("Esta OS não possui número para impressão.");
  const externalNumber = cleanText(order.external_os_number);
  const osFontSize = fontSizeForNumber(osNumber, [17, 14, 11, 9]);
  const externalFontSize = fontSizeForNumber(externalNumber, [10, 9, 8, 7]);
  const caption = externalNumber
    ? `<div class="external"><span class="external-title">OS EXTERNA</span><strong class="external-number" style="font-size: ${externalFontSize}pt">${escapeHtml(externalNumber)}</strong></div>`
    : "";
  const label = `<div class="label-content">
      <div class="identification">
        <span class="order-title">ORDEM DE SERVIÇO</span>
        <strong class="order-number" style="font-size: ${osFontSize}pt">${escapeHtml(osNumber)}</strong>
        ${caption}
      </div>
      <img class="qr-image" src="${qrDataUrl}" alt="" />
    </div>`;

  const labels = Array.from({ length: 3 }, (_, index) =>
    `<section class="label" data-index="${index + 1}">${label}</section>`,
  ).join("");

  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Etiquetas OS ${escapeHtml(osNumber)}</title>
  <style id="page-size"></style>
  <style>
    * { box-sizing: border-box; }
    :root {
      --label-w: 32mm;
      --label-h: 30mm;
      --gap: 2mm;
      --side-margin: 1mm;
      --sheet-w: 102mm;
      --qr-size: 18mm;
    }
    html, body { margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
    body { background: #e9edf2; }
    .settings {
      max-width: 850px;
      margin: 26px auto 20px;
      padding: 20px;
      border-radius: 12px;
      background: white;
      box-shadow: 0 3px 18px rgba(0,0,0,.08);
    }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .hint { color: #475569; font-size: 13px; line-height: 1.5; margin: 0 0 16px; }
    .fields { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; }
    .field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 700; }
    .field input, .field select {
      padding: 9px; width: 106px; min-height: 37px;
      border: 1px solid #cbd5e1; border-radius: 7px; background: white;
      color: #111827; font: inherit;
    }
    .field select { width: 114px; }
    .checkbox-field { display: inline-flex; gap: 8px; align-items: center; min-height: 37px; font-size: 13px; cursor: pointer; }
    .checkbox-field input { width: 17px; height: 17px; }
    .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin-top: 14px; }
    button {
      background: #1032dc; color: white; border: 0; border-radius: 7px;
      padding: 11px 19px; cursor: pointer; font: 700 13px Arial, Helvetica, sans-serif;
    }
    button:disabled { opacity: .45; cursor: not-allowed; }
    .summary { font-size: 13px; font-weight: 700; }
    .warning { color: #a52525; font-size: 12px; min-height: 17px; margin-top: 10px; }
    .preview-title { margin: 10px auto; width: fit-content; font-size: 13px; color: #475569; }
    .preview-area { overflow: auto; padding: 8px 14px 30px; }
    .sheet {
      display: flex; flex-flow: row nowrap; align-items: flex-start;
      gap: var(--gap); margin: 0 auto; padding: 0 var(--side-margin);
      width: var(--sheet-w); height: var(--label-h); background: #fff;
      outline: 1px solid #94a3b8;
    }
    .label {
      flex: 0 0 var(--label-w);
      width: var(--label-w); height: var(--label-h); min-width: 0;
      padding: 1mm; overflow: hidden; background: #fff;
      outline: 1px dashed #cbd5e1; outline-offset: -1px;
    }
    .label-content {
      height: 100%; width: 100%; display: flex; flex-direction: column;
      align-items: center; justify-content: space-between; overflow: hidden;
    }
    .identification { width: 100%; text-align: center; flex: 0 0 auto; min-width: 0; }
    .order-title { display: block; font-size: 5.4pt; line-height: 1.2; font-weight: 700; white-space: nowrap; }
    .order-number {
      display: block; font-weight: 900; line-height: 1.05;
      white-space: nowrap; overflow: hidden; text-overflow: clip;
    }
    .external {
      display: flex; flex-direction: column; align-items: center; width: 100%;
      border-top: .17mm solid black; margin-top: .5mm; padding-top: .4mm;
      white-space: nowrap; overflow: hidden;
    }
    .external-title { display: block; font-weight: 700; font-size: 5.5pt; line-height: 1.1; }
    .external-number {
      display: block; max-width: 100%; font-weight: 900; line-height: 1.1;
      white-space: nowrap; overflow: hidden;
    }
    .qr-image {
      display: block; width: var(--qr-size); height: var(--qr-size);
      max-width: 100%; flex: 0 0 auto; object-fit: contain;
      image-rendering: pixelated;
    }
    .sheet.hide-qr .qr-image { display: none; }
    .sheet.hide-qr .label-content { justify-content: center; }
    .label.empty .label-content { display: none; }
    @media print {
      html, body {
        width: var(--sheet-w) !important; height: var(--label-h) !important;
        min-width: 0 !important; min-height: 0 !important;
        margin: 0 !important; padding: 0 !important; overflow: hidden !important;
        background: white !important;
      }
      .settings, .preview-title { display: none !important; }
      .preview-area { display: block !important; margin: 0 !important; padding: 0 !important; overflow: hidden !important; }
      .sheet {
        margin: 0 !important; outline: 0 !important;
        page-break-inside: avoid; break-inside: avoid;
        page-break-after: avoid; break-after: avoid;
      }
      .label { outline: 0 !important; }
      .label.empty { visibility: hidden !important; }
      * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="settings">
    <h1>Etiquetas da OS ${escapeHtml(osNumber)}</h1>
    <p class="hint">Rolo com três etiquetas lado a lado. Ajuste as medidas conforme o papel carregado na Elgin L-42. A configuração é lembrada neste navegador.</p>
    <div class="fields">
      <label class="field">Largura de cada etiqueta (mm)<input id="width" type="number" min="15" max="34" step=".5"></label>
      <label class="field">Altura da etiqueta (mm)<input id="height" type="number" min="15" max="80" step=".5"></label>
      <label class="field">Espaço entre colunas (mm)<input id="gap" type="number" min="0" max="10" step=".5"></label>
      <label class="field">Margem lateral (mm)<input id="margin" type="number" min="0" max="5" step=".5"></label>
      <label class="field">Etiquetas nesta fileira
        <select id="quantity"><option value="3">3 etiquetas</option><option value="2">2 etiquetas</option><option value="1">1 etiqueta</option></select>
      </label>
      <label class="checkbox-field"><input id="qr" type="checkbox"> Incluir QR Code</label>
    </div>
    <div class="actions">
      <button id="print" type="button">Imprimir etiquetas</button>
      <span class="summary" id="summary"></span>
    </div>
    <div class="warning" id="warning" role="status"></div>
    <p class="hint" style="margin: 8px 0 0">Na impressão selecione a Elgin L-42, escala 100%, margens nenhuma e sem cabeçalhos/rodapés. Se o driver pedir tamanho personalizado, use a largura e a altura total informadas acima.</p>
  </div>
  <p class="preview-title">Prévia da fileira (as bordas pontilhadas não são impressas)</p>
  <div class="preview-area"><main class="sheet" id="sheet">${labels}</main></div>
  <script>
    (function () {
      var STORAGE_KEY = "artvideo-order-label-layout-v1";
      var defaults = ${JSON.stringify(DEFAULT_LAYOUT)};
      var maxWidth = ${L42_MAX_PRINT_WIDTH_MM};
      var keys = ["width", "height", "gap", "margin", "quantity"];
      var settings = Object.assign({}, defaults);
      try {
        var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (saved && typeof saved === "object") {
          for (var i = 0; i < keys.length; i++) {
            if (typeof saved[keys[i]] === "number" && Number.isFinite(saved[keys[i]])) settings[keys[i]] = saved[keys[i]];
          }
          if (typeof saved.qr === "boolean") settings.qr = saved.qr;
        }
      } catch (_) {}
      keys.forEach(function (key) { document.getElementById(key).value = String(settings[key]); });
      document.getElementById("qr").checked = settings.qr;

      function number(key, minimum, maximum) {
        var value = Number(document.getElementById(key).value);
        return Number.isFinite(value) && value >= minimum && value <= maximum ? value : NaN;
      }
      function updatePreview() {
        var width = number("width", 15, 34);
        var height = number("height", 15, 80);
        var gap = number("gap", 0, 10);
        var margin = number("margin", 0, 5);
        var quantity = number("quantity", 1, 3);
        var qr = document.getElementById("qr").checked;
        var totalWidth = 3 * width + 2 * gap + 2 * margin;
        var valid = Number.isFinite(totalWidth) && Number.isFinite(height) && Number.isFinite(quantity)
          && Math.round(quantity) === quantity && totalWidth <= maxWidth && totalWidth > 0;
        var summary = document.getElementById("summary");
        var warning = document.getElementById("warning");
        var printButton = document.getElementById("print");
        printButton.disabled = !valid;

        if (!valid) {
          summary.textContent = "Confira as medidas";
          warning.textContent = "Preencha medidas válidas. A largura total deve ser no máximo " + maxWidth + " mm (limite de impressão da L-42).";
          return;
        }
        var qrSize = Math.max(4, Math.min(20, width - 3, height - (${Boolean(externalNumber)} ? 13 : 10)));
        var root = document.documentElement;
        root.style.setProperty("--label-w", width + "mm");
        root.style.setProperty("--label-h", height + "mm");
        root.style.setProperty("--gap", gap + "mm");
        root.style.setProperty("--side-margin", margin + "mm");
        root.style.setProperty("--sheet-w", totalWidth + "mm");
        root.style.setProperty("--qr-size", qrSize + "mm");
        document.getElementById("page-size").textContent = "@page { size: " + totalWidth + "mm " + height + "mm; margin: 0; }";
        var sheet = document.getElementById("sheet");
        sheet.classList.toggle("hide-qr", !qr);
        var labels = sheet.querySelectorAll(".label");
        labels.forEach(function (label, index) { label.classList.toggle("empty", index >= quantity); });
        summary.textContent = "Papel: " + totalWidth.toFixed(1).replace(".", ",") + " × " + height.toFixed(1).replace(".", ",") + " mm";
        warning.textContent = qr && qrSize < 16
          ? "Atenção: com esta altura o QR Code pode ficar pequeno para leitura. Aumente a altura ou desmarque QR Code."
          : "";
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: width, height: height, gap: gap, margin: margin, quantity: quantity, qr: qr })); } catch (_) {}
      }

      keys.concat(["qr"]).forEach(function (key) {
        document.getElementById(key).addEventListener("input", updatePreview);
        document.getElementById(key).addEventListener("change", updatePreview);
      });
      document.getElementById("print").addEventListener("click", function () {
        if (this.disabled) return;
        window.focus();
        window.print();
      });
      updatePreview();
    }());
  <\/script>
</body>
</html>`);
  popup.document.close();
}
