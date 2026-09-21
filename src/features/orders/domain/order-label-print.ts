type ServiceOrderLabelOrder = {
  id?: string | null;
  os_number?: string | null;
  external_os_number?: string | null;
};

const LABEL_WIDTH_PX = 480;
const LABEL_HEIGHT_PX = 320;
const LABEL_WIDTH_MM = 60;
const LABEL_HEIGHT_MM = 40;

function cleanText(value: unknown) {
  return value == null || value === "" ? "" : String(value).trim();
}

function fitFont(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  weight = 900,
) {
  let size = startSize;
  do {
    context.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
    if (context.measureText(text).width <= maxWidth) return size;
    size -= 2;
  } while (size >= minSize);
  return minSize;
}

export function createServiceOrderLabelDataUrl(
  order: ServiceOrderLabelOrder,
  qrCanvas: HTMLCanvasElement,
) {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_WIDTH_PX;
  canvas.height = LABEL_HEIGHT_PX;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a imagem da etiqueta.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000000";
  context.textBaseline = "top";
  context.imageSmoothingEnabled = false;

  const leftX = 20;
  const leftWidth = 235;
  const osNumber = cleanText(order.os_number) || "—";
  const externalNumber = cleanText(order.external_os_number);

  context.font = "800 19px Arial, Helvetica, sans-serif";
  context.fillText("ORDEM DE SERVIÇO", leftX, 22);

  const osFontSize = fitFont(context, osNumber, leftWidth, 58, 30);
  context.font = `900 ${osFontSize}px Arial, Helvetica, sans-serif`;
  context.fillText(osNumber, leftX, 60, leftWidth);

  if (externalNumber) {
    context.fillRect(leftX, 147, leftWidth, 3);
    context.font = "800 17px Arial, Helvetica, sans-serif";
    context.fillText("OS EXTERNA", leftX, 162);
    const externalFontSize = fitFont(context, externalNumber, leftWidth, 31, 19, 900);
    context.font = `900 ${externalFontSize}px Arial, Helvetica, sans-serif`;
    context.fillText(externalNumber, leftX, 187, leftWidth);
  }

  const qrSize = 196;
  const qrX = 274;
  const qrY = 22;
  context.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);

  context.font = "700 15px Arial, Helvetica, sans-serif";
  context.textAlign = "center";
  context.fillText("Escaneie para abrir a OS", qrX + qrSize / 2, 231, qrSize);
  context.textAlign = "start";

  context.font = "700 13px Arial, Helvetica, sans-serif";
  context.fillText("ARTVIDEO • ETIQUETA DE EQUIPAMENTO", leftX, 283);

  return canvas.toDataURL("image/png");
}

export function renderServiceOrderLabel(
  popup: Window,
  imageDataUrl: string,
  osNumber?: string | null,
) {
  const safeTitle = cleanText(osNumber).replace(/[<>]/g, "");
  popup.document.open();
  popup.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Etiqueta OS ${safeTitle}</title>
  <style>
    @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: ${LABEL_WIDTH_MM}mm;
      height: ${LABEL_HEIGHT_MM}mm;
      overflow: hidden;
      background: #fff;
    }
    .sheet {
      margin: 0;
      padding: 0;
      width: ${LABEL_WIDTH_MM}mm;
      height: ${LABEL_HEIGHT_MM}mm;
      overflow: hidden;
      background: #fff;
    }
    .label-image {
      display: block;
      width: ${LABEL_WIDTH_MM}mm;
      height: ${LABEL_HEIGHT_MM}mm;
      object-fit: fill;
      margin: 0;
      padding: 0;
    }
    @media screen {
      html, body {
        width: auto;
        height: auto;
        min-width: ${LABEL_WIDTH_MM}mm;
        min-height: ${LABEL_HEIGHT_MM}mm;
        background: #e5e7eb;
      }
      .sheet {
        margin: 10mm auto;
        outline: 1px solid #cbd5e1;
      }
    }
    @media print {
      html, body, .sheet {
        width: ${LABEL_WIDTH_MM}mm !important;
        height: ${LABEL_HEIGHT_MM}mm !important;
        min-width: ${LABEL_WIDTH_MM}mm !important;
        min-height: ${LABEL_HEIGHT_MM}mm !important;
      }
    }
  </style>
</head>
<body>
  <main class="sheet">
    <img id="label-image" class="label-image" src="${imageDataUrl}" alt="Etiqueta da ordem de serviço" />
  </main>
  <script>
    (function () {
      var image = document.getElementById("label-image");
      var printed = false;
      function startPrint() {
        if (printed) return;
        printed = true;
        setTimeout(function () {
          window.focus();
          window.print();
        }, 700);
      }
      if (image && image.complete && image.naturalWidth > 0) startPrint();
      else if (image) {
        image.addEventListener("load", startPrint, { once: true });
        image.addEventListener("error", function () {
          document.body.innerHTML = "<p style='font-family:Arial;padding:16px'>Não foi possível carregar a etiqueta para impressão.</p>";
        }, { once: true });
      }
    }());
  <\/script>
</body>
</html>`);
  popup.document.close();
}
