type ServiceOrderLabelOrder = {
  id?: string | null;
  os_number?: string | null;
  external_os_number?: string | null;
};

// Padrão inicial para rolos de três colunas. As medidas podem ser
// calibradas na prévia de impressão e ficam salvas neste navegador.
const DEFAULT_LAYOUT = { width: 32, height: 23, gap: 3, margin: 1, quantity: 3, verticalOffset: 0 };
const L42_MAX_PRINT_WIDTH_MM = 104;

function cleanText(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function escapeHtml(value: unknown) {
  const entities: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  };
  return cleanText(value).replace(/[&<>"']/g, character => entities[character] || character);
}

function fontSizeForNumber(value: string, sizes: [number, number, number, number]) {
  const length = Array.from(value).length;
  return length > 17 ? sizes[3] : length > 12 ? sizes[2] : length > 8 ? sizes[1] : sizes[0];
}

export function renderServiceOrderLabel(
  popup: Window,
  order: ServiceOrderLabelOrder,
  _qrCanvas?: HTMLCanvasElement,
) {
  const osNumber = cleanText(order.os_number);
  if (!osNumber) throw new Error("Esta OS não possui número para impressão.");
  const externalNumber = cleanText(order.external_os_number);
  const osLabel = `OS ${osNumber}`;
  const osFontSize = fontSizeForNumber(osLabel, [17, 14, 11, 9]);
  const externalFontSize = fontSizeForNumber(externalNumber, [9, 8, 7, 6]);
  const caption = externalNumber
    ? `<div class="external" style="font-size: ${externalFontSize}pt">OS externa ${escapeHtml(externalNumber)}</div>`
    : "";
  const label = `<div class="label-content">
      <strong class="order-number" style="font-size: ${osFontSize}pt">${escapeHtml(osLabel)}</strong>
      ${caption}
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
      --label-h: 23mm;
      --gap: 3mm;
      --side-margin: 1mm;
      --sheet-w: 104mm;
      --vertical-offset: 0mm;

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
      align-items: center; justify-content: center; gap: 1mm; overflow: hidden;
      transform: translateY(var(--vertical-offset));
    }
    .order-number {
      display: block; max-width: 100%; font-weight: 900; line-height: 1.08;
      white-space: nowrap; overflow: hidden; text-overflow: clip;
    }
    .external {
      max-width: 100%; font-weight: 700; line-height: 1.15;
      white-space: nowrap; overflow: hidden; text-align: center;
    }
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
      <label class="field" title="Valores negativos sobem o conteúdo; positivos descem.">Posição vertical (mm)<input id="verticalOffset" type="number" min="-5" max="5" step=".5"></label>
      <label class="field">Etiquetas nesta fileira
        <select id="quantity"><option value="3">3 etiquetas</option><option value="2">2 etiquetas</option><option value="1">1 etiqueta</option></select>
      </label>

    </div>
    <div class="actions">
      <button id="print" type="button">Imprimir etiquetas</button>
      <span class="summary" id="summary"></span>
    </div>
    <div class="warning" id="warning" role="status"></div>
    <p class="hint" style="margin: 8px 0 0">Para centralizar na etiqueta impressa, ajuste a posição vertical: -1 ou -2 mm para subir, valores positivos para descer. O ajuste fica salvo neste navegador.</p>
    <p class="hint" style="margin: 8px 0 0">Na impressão selecione a BTP-L42(U), escala 100%, margens nenhuma e sem cabeçalhos/rodapés. No driver, configure um papel personalizado com a largura total e a altura de uma fileira mostradas acima. Confirme as medidas reais com uma régua.</p>
  </div>
  <p class="preview-title">Prévia da fileira (as bordas pontilhadas não são impressas)</p>
  <div class="preview-area"><main class="sheet" id="sheet">${labels}</main></div>
  <script>
    (function () {
      var STORAGE_KEY = "artvideo-order-label-layout-v3";
      var defaults = ${JSON.stringify(DEFAULT_LAYOUT)};
      var maxWidth = ${L42_MAX_PRINT_WIDTH_MM};
      var keys = ["width", "height", "gap", "margin", "quantity", "verticalOffset"];
      var settings = Object.assign({}, defaults);
      try {
        var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (saved && typeof saved === "object") {
          for (var i = 0; i < keys.length; i++) {
            if (typeof saved[keys[i]] === "number" && Number.isFinite(saved[keys[i]])) settings[keys[i]] = saved[keys[i]];
          }

        }
      } catch (_) {}
      keys.forEach(function (key) { document.getElementById(key).value = String(settings[key]); });


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
        var verticalOffset = number("verticalOffset", -5, 5);

        var totalWidth = 3 * width + 2 * gap + 2 * margin;
        var valid = Number.isFinite(totalWidth) && Number.isFinite(height) && Number.isFinite(quantity)
          && Number.isFinite(verticalOffset) && Math.round(quantity) === quantity && totalWidth <= maxWidth && totalWidth > 0;
        var summary = document.getElementById("summary");
        var warning = document.getElementById("warning");
        var printButton = document.getElementById("print");
        printButton.disabled = !valid;

        if (!valid) {
          summary.textContent = "Confira as medidas";
          warning.textContent = "Preencha medidas válidas. A largura total deve ser no máximo " + maxWidth + " mm (limite de impressão da L-42).";
          return;
        }
        var root = document.documentElement;
        root.style.setProperty("--label-w", width + "mm");
        root.style.setProperty("--label-h", height + "mm");
        root.style.setProperty("--gap", gap + "mm");
        root.style.setProperty("--side-margin", margin + "mm");
        root.style.setProperty("--sheet-w", totalWidth + "mm");
        root.style.setProperty("--vertical-offset", verticalOffset + "mm");
        document.getElementById("page-size").textContent = "@page { size: " + totalWidth + "mm " + height + "mm; margin: 0; }";
        var sheet = document.getElementById("sheet");
        // Encaixa números longos no espaço disponível, sem os cortar.
        sheet.querySelectorAll(".order-number, .external-number").forEach(function (element) {
          var initial = Number(element.getAttribute("data-font-size") || 0);
          if (!initial) {
            initial = parseFloat(element.style.fontSize);
            element.setAttribute("data-font-size", String(initial));
          }
          var size = initial;
          element.style.fontSize = size + "pt";
          while (element.scrollWidth > element.clientWidth + 1 && size > 5.5) {
            size -= .5;
            element.style.fontSize = size + "pt";
          }
        });
        var labels = sheet.querySelectorAll(".label");
        labels.forEach(function (label, index) { label.classList.toggle("empty", index >= quantity); });
        summary.textContent = "Papel: " + totalWidth.toFixed(1).replace(".", ",") + " × " + height.toFixed(1).replace(".", ",") + " mm";
        warning.textContent = "";
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: width, height: height, gap: gap, margin: margin, quantity: quantity, verticalOffset: verticalOffset })); } catch (_) {}
      }

      keys.forEach(function (key) {
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
