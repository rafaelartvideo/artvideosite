type ServiceOrderLabelOrder = {
  id?: string | null;
  os_number?: string | null;
  external_os_number?: string | null;
};

// Layout calibrável em Operação > Documentos > Impressão.
// Mantém a chave legada para preservar os ajustes já feitos neste navegador.
export const ORDER_LABEL_LAYOUT_KEY = "artvideo-order-label-layout-v3";
export const DEFAULT_LABEL_LAYOUT = { width: 32, height: 23, gap: 3, margin: 1, quantity: 3, verticalOffset: 0 };
export type OrderLabelLayout = typeof DEFAULT_LABEL_LAYOUT;
export const L42_MAX_PRINT_WIDTH_MM = 104;

export function isValidOrderLabelLayout(value: OrderLabelLayout) {
  return Number.isFinite(value.width) && value.width >= 15 && value.width <= 34
    && Number.isFinite(value.height) && value.height >= 15 && value.height <= 80
    && Number.isFinite(value.gap) && value.gap >= 0 && value.gap <= 10
    && Number.isFinite(value.margin) && value.margin >= 0 && value.margin <= 5
    && Number.isInteger(value.quantity) && value.quantity >= 1 && value.quantity <= 3
    && Number.isFinite(value.verticalOffset) && value.verticalOffset >= -5 && value.verticalOffset <= 5
    && 3 * value.width + 2 * value.gap + 2 * value.margin <= L42_MAX_PRINT_WIDTH_MM;
}

export function readOrderLabelLayout(): OrderLabelLayout {
  try {
    const stored = JSON.parse(window.localStorage.getItem(ORDER_LABEL_LAYOUT_KEY) || "null");
    if (stored && typeof stored === "object") {
      const candidate = { ...DEFAULT_LABEL_LAYOUT };
      (Object.keys(candidate) as (keyof OrderLabelLayout)[]).forEach(key => {
        if (typeof stored[key] === "number") candidate[key] = stored[key];
      });
      if (isValidOrderLabelLayout(candidate)) return candidate;
    }
  } catch { /* Usar medidas padrão quando o navegador não permitir armazenamento. */ }
  return { ...DEFAULT_LABEL_LAYOUT };
}

export function saveOrderLabelLayout(value: OrderLabelLayout) {
  if (!isValidOrderLabelLayout(value)) throw new Error("Confira as medidas da etiqueta e a largura total da bobina.");
  window.localStorage.setItem(ORDER_LABEL_LAYOUT_KEY, JSON.stringify(value));
}

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
  const layout = readOrderLabelLayout();
  const totalWidth = 3 * layout.width + 2 * layout.gap + 2 * layout.margin;
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
    `<section class="label${index >= layout.quantity ? " empty" : ""}" data-index="${index + 1}">${label}</section>`,
  ).join("");

  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Etiquetas OS ${escapeHtml(osNumber)}</title>
  <style id="page-size">@page { size: ${totalWidth}mm ${layout.height}mm; margin: 0; }</style>
  <style>
    * { box-sizing: border-box; }
    :root {
      --label-w: ${layout.width}mm;
      --label-h: ${layout.height}mm;
      --gap: ${layout.gap}mm;
      --side-margin: ${layout.margin}mm;
      --sheet-w: ${totalWidth}mm;
      --vertical-offset: ${layout.verticalOffset}mm;

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
    <div class="actions" style="margin-top: 0">
      <button id="print" type="button">Imprimir</button>
    </div>
  </div>
  <p class="preview-title">Prévia da fileira (as bordas pontilhadas não são impressas)</p>
  <div class="preview-area"><main class="sheet" id="sheet">${labels}</main></div>
  <script>
    (function () {
      var printButton = document.getElementById("print");
      printButton.addEventListener("click", function () { window.focus(); window.print(); });
      // Abre diretamente a prévia de impressão do Brave ao clicar em Etiqueta.
      // O botão continua disponível caso o navegador não abra automaticamente.
      window.addEventListener("load", function () { window.focus(); window.print(); });
    }());
  <\/script>
</body>
</html>`);
  popup.document.close();
}
