type ServiceOrderLabelContext = {
  order: {
    id?: string | null;
    os_number?: string | null;
    external_os_number?: string | null;
  };
  qrSvg: string;
};

const labelText = (value: unknown) => value == null || value === "" ? "" : String(value);
const escapeHtml = (value: unknown) => labelText(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

export function buildServiceOrderLabelHtml(context: ServiceOrderLabelContext, autoPrint = true) {
  const order = context.order || {};
  const osNumber = escapeHtml(order.os_number || "—");
  const externalNumber = escapeHtml(order.external_os_number);
  const qrSvg = context.qrSvg || "";
  const externalBlock = externalNumber
    ? `<div class="external"><span>OS externa</span><strong>${externalNumber}</strong></div>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Etiqueta OS ${osNumber}</title>
  <style>
    @page { size: 60mm 40mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; width: 60mm; min-width: 60mm; background: #fff; color: #000; }
    body { font-family: Arial, Helvetica, sans-serif; }
    .label {
      width: 60mm;
      height: 40mm;
      padding: 2.2mm;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 25mm;
      gap: 2mm;
      align-items: stretch;
      overflow: hidden;
    }
    .info {
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 0.5mm 0;
    }
    .eyebrow {
      margin: 0;
      font-size: 2.6mm;
      line-height: 1;
      font-weight: 800;
      letter-spacing: 0.16mm;
      text-transform: uppercase;
    }
    .os-number {
      margin: 1.2mm 0 0;
      font-size: 7mm;
      line-height: 0.95;
      font-weight: 900;
      overflow-wrap: anywhere;
    }
    .external {
      margin-top: 1.4mm;
      border-top: 0.35mm solid #000;
      padding-top: 1.2mm;
    }
    .external span,
    .scan-hint {
      display: block;
      font-size: 2.35mm;
      line-height: 1.15;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08mm;
    }
    .external strong {
      display: block;
      margin-top: 0.5mm;
      font-size: 3.7mm;
      line-height: 1.05;
      font-weight: 900;
      overflow-wrap: anywhere;
    }
    .qr {
      width: 25mm;
      min-width: 25mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.8mm;
    }
    .qr svg {
      display: block;
      width: 23mm !important;
      height: 23mm !important;
      max-width: 23mm;
      max-height: 23mm;
    }
    .scan-hint {
      text-align: center;
      font-size: 2.15mm;
      letter-spacing: 0;
      text-transform: none;
    }
    @media screen {
      body { background: #e5e7eb; padding: 10mm; width: auto; min-width: 0; }
      .label { margin: 0 auto; background: #fff; outline: 1px solid #cbd5e1; }
    }
    @media print {
      html, body { width: 60mm; height: 40mm; overflow: hidden; }
      .label { outline: none; }
    }
  </style>
</head>
<body>
  <main class="label">
    <section class="info">
      <div>
        <p class="eyebrow">Ordem de serviço</p>
        <div class="os-number">${osNumber}</div>
        ${externalBlock}
      </div>
    </section>
    <aside class="qr">
      ${qrSvg}
      <span class="scan-hint">Escaneie para abrir a OS</span>
    </aside>
  </main>
  ${autoPrint ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print();},120);});<\/script>` : ""}
</body>
</html>`;
}

export function renderServiceOrderLabel(
  popup: Window,
  context: ServiceOrderLabelContext,
) {
  popup.document.open();
  popup.document.write(buildServiceOrderLabelHtml(context, true));
  popup.document.close();
}
