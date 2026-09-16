import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "npm:pdf-lib@1.17.1";
import QRCode from "npm:qrcode@1.5.4";

type FinalSignatureEvidence = {
  signer_type: "employee" | "external";
  signer_name: string;
  signer_document_masked?: string | null;
  validation_method: "stored_employee_signature" | "email_otp";
  signed_at: string;
  image_bytes?: Uint8Array | null;
};

type ChecklistMediaValue = {
  mime_type?: string | null;
  bytes: Uint8Array;
};

export type RenderSignedDocumentPdfInput = {
  snapshot: any;
  snapshotHash: string;
  verificationCode: string;
  verificationUrl: string;
  signedAt: string;
  signatures: FinalSignatureEvidence[];
  checklistMedia?: Record<string, ChecklistMediaValue>;
};

const A4 = [595.28, 841.89] as const;
const LETTER = [612, 792] as const;
const BLUE = rgb(0, 0.34, 0.91);
const DARK = rgb(0.05, 0.11, 0.18);
const MUTED = rgb(0.36, 0.43, 0.52);
const LIGHT = rgb(0.94, 0.96, 0.98);
const BORDER = rgb(0.86, 0.89, 0.93);

function printable(value: unknown) {
  return String(value ?? "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");
}

function ptFromMm(value: unknown, fallbackMm: number) {
  const mm = Number(value);
  return (Number.isFinite(mm) ? Math.max(5, Math.min(40, mm)) : fallbackMm) * 72 / 25.4;
}

function dimensions(template: any) {
  const base = String(template?.paper_size || "A4").toUpperCase() === "LETTER" ? LETTER : A4;
  return String(template?.orientation || "portrait").toLowerCase() === "landscape"
    ? [base[1], base[0]] as const
    : base;
}

function splitLines(font: PDFFont, value: unknown, size: number, maxWidth: number) {
  const paragraphs = printable(value || "-").split(/\r?\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let current = words.shift()!;
    for (const word of words) {
      const candidate = `${current} ${word}`;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) current = candidate;
      else {
        lines.push(current);
        if (font.widthOfTextAtSize(word, size) <= maxWidth) current = word;
        else {
          let chunk = "";
          for (const char of word) {
            const next = chunk + char;
            if (font.widthOfTextAtSize(next, size) > maxWidth && chunk) { lines.push(chunk); chunk = char; }
            else chunk = next;
          }
          current = chunk;
        }
      }
    }
    lines.push(current);
  }
  return lines;
}

function checklistAnswer(item: any) {
  const labels: Record<string, string> = { ok: "Conforme", not_ok: "Não conforme", yes: "Sim", no: "Não", confirmed: "Confirmado", na: "Não se aplica" };
  if (item?.response_code && labels[item.response_code]) return labels[item.response_code];
  if (item?.response_number != null) return String(item.response_number);
  return item?.response_text || "Não respondido";
}

function dataUrlBytes(dataUrl: string) {
  const encoded = String(dataUrl).split(",")[1] || "";
  const binary = atob(encoded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export async function renderSignedDocumentPdf(input: RenderSignedDocumentPdfInput): Promise<Uint8Array> {
  const snapshot = input.snapshot || {};
  const template = snapshot.template || {};
  const company = snapshot.company || {};
  const order = snapshot.order || {};
  const [pageWidth, pageHeight] = dimensions(template);
  const marginLeft = ptFromMm(template.margin_left, 14);
  const marginRight = ptFromMm(template.margin_right, 14);
  const marginTop = ptFromMm(template.margin_top, 14);
  const marginBottom = ptFromMm(template.margin_bottom, 14);
  const contentWidth = pageWidth - marginLeft - marginRight;

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const signedDate = new Date(input.signedAt);
  if (!Number.isNaN(signedDate.getTime())) {
    pdf.setCreationDate(signedDate);
    pdf.setModificationDate(signedDate);
  }
  pdf.setTitle(printable(template.name || "Documento assinado"));
  pdf.setAuthor(printable(company.name || "ArtVideo"));
  pdf.setProducer("ArtVideo - Assinatura eletrônica");

  let page: PDFPage;
  let y = 0;
  const pages: PDFPage[] = [];

  const addPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    pages.push(page);
    y = pageHeight - marginTop;
    return page;
  };

  const ensure = (height: number) => {
    if (y - height >= marginBottom) return;
    addPage();
  };

  const line = (value: unknown, options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gapAfter?: number; indent?: number } = {}) => {
    const font = options.font || regular;
    const size = options.size || 9;
    const indent = options.indent || 0;
    const maxWidth = contentWidth - indent;
    const lines = splitLines(font, value, size, maxWidth);
    const lineHeight = size * 1.35;
    ensure(lines.length * lineHeight + (options.gapAfter || 0));
    for (const item of lines) {
      page.drawText(item, { x: marginLeft + indent, y: y - size, size, font, color: options.color || DARK });
      y -= lineHeight;
    }
    y -= options.gapAfter || 0;
  };

  const sectionTitle = (value: unknown) => {
    ensure(27);
    page.drawRectangle({ x: marginLeft, y: y - 21, width: contentWidth, height: 21, color: LIGHT, borderColor: BORDER, borderWidth: 0.6 });
    page.drawText(printable(value).toUpperCase().slice(0, 120), { x: marginLeft + 8, y: y - 14, size: 8, font: bold, color: DARK });
    y -= 27;
  };

  const field = (label: unknown, value: unknown) => {
    const labelText = printable(label || "Campo");
    const valueText = printable(value == null || value === "" ? "-" : value).replaceAll("\\n", "\n");
    const valueLines = splitLines(regular, valueText, 9, contentWidth - 12);
    const height = 13 + Math.max(1, valueLines.length) * 12 + 7;
    ensure(height);
    page.drawText(labelText.toUpperCase().slice(0, 140), { x: marginLeft + 4, y: y - 8, size: 6.8, font: bold, color: MUTED });
    let fy = y - 20;
    for (const item of valueLines) {
      page.drawText(item, { x: marginLeft + 4, y: fy, size: 9, font: regular, color: DARK });
      fy -= 12;
    }
    page.drawLine({ start: { x: marginLeft, y: y - height + 3 }, end: { x: marginLeft + contentWidth, y: y - height + 3 }, color: BORDER, thickness: 0.45 });
    y -= height;
  };

  const embedMedia = async (media: ChecklistMediaValue): Promise<PDFImage | null> => {
    try {
      const mime = String(media.mime_type || "").toLowerCase();
      if (mime.includes("png")) return await pdf.embedPng(media.bytes);
      if (mime.includes("jpeg") || mime.includes("jpg")) return await pdf.embedJpg(media.bytes);
      try { return await pdf.embedPng(media.bytes); } catch { return await pdf.embedJpg(media.bytes); }
    } catch { return null; }
  };

  addPage();
  line(company.name || "Empresa", { font: bold, size: 10, color: BLUE, gapAfter: 2 });
  line(template.name || "Documento", { font: bold, size: 17, gapAfter: 3 });
  line(`OS ${order.os_number || "-"}${order.external_os_number ? ` | Externa ${order.external_os_number}` : ""}`, { font: bold, size: 9, color: MUTED, gapAfter: 3 });
  if (template.header_text) line(template.header_text, { size: 8.5, color: MUTED, gapAfter: 5 });
  const companyDetails = [company.document, company.phone, company.email, company.address].filter(Boolean).join(" | ");
  if (companyDetails) line(companyDetails, { size: 7.5, color: MUTED, gapAfter: 8 });

  for (const section of Array.isArray(snapshot.sections) ? snapshot.sections : []) {
    const visibleFields = (Array.isArray(section?.fields) ? section.fields : []).filter((item: any) => item?.kind !== "signature");
    if (!visibleFields.length) continue;
    sectionTitle(section.label || section.key || "Informações");
    for (const item of visibleFields) field(item.label || item.key, item.value);
    y -= 5;
  }

  for (const stage of Array.isArray(snapshot.checklists) ? snapshot.checklists : []) {
    sectionTitle(`Checklist - ${stage.name || stage.stage_code || "Etapa"}`);
    if (stage.situation_name) line(`Situação: ${stage.situation_name}`, { size: 7.5, color: MUTED, gapAfter: 3 });
    for (const item of Array.isArray(stage.items) ? stage.items : []) {
      field(item.title || "Item", `${checklistAnswer(item)}${item.observation ? `\nObservação: ${item.observation}` : ""}`);
      const mediaRows = Array.isArray(item.media) ? item.media : [];
      for (const mediaRef of mediaRows) {
        const media = input.checklistMedia?.[String(mediaRef.media_id || "")];
        if (!media) continue;
        const image = await embedMedia(media);
        if (!image) continue;
        const maxW = Math.min(180, contentWidth);
        const maxH = 120;
        const scale = Math.min(maxW / image.width, maxH / image.height, 1);
        const width = image.width * scale;
        const height = image.height * scale;
        ensure(height + 13);
        page.drawImage(image, { x: marginLeft + 4, y: y - height, width, height });
        y -= height + 13;
      }
    }
    y -= 5;
  }

  sectionTitle("Assinaturas");
  for (const signature of input.signatures) {
    ensure(105);
    const imageBytes = signature.image_bytes || null;
    if (imageBytes) {
      try {
        const image = await pdf.embedPng(imageBytes);
        const maxW = Math.min(175, contentWidth * 0.45);
        const maxH = 58;
        const scale = Math.min(maxW / image.width, maxH / image.height, 1);
        const width = image.width * scale;
        const height = image.height * scale;
        page.drawImage(image, { x: marginLeft + 8, y: y - height, width, height });
      } catch { /* evidence text remains */ }
    }
    y -= 62;
    page.drawLine({ start: { x: marginLeft + 4, y }, end: { x: marginLeft + Math.min(230, contentWidth * 0.48), y }, color: DARK, thickness: 0.65 });
    y -= 13;
    line(signature.signer_type === "employee" ? "Assinatura do funcionário" : "Assinatura do cliente/responsável", { font: bold, size: 7.5, gapAfter: 1, indent: 4 });
    line(signature.signer_name || "-", { size: 8.5, gapAfter: 0, indent: 4 });
    if (signature.signer_document_masked) line(signature.signer_document_masked, { size: 7.2, color: MUTED, indent: 4 });
    line(`${signature.validation_method === "email_otp" ? "Validação por e-mail + OTP" : "Assinatura cadastrada do funcionário"} | ${new Date(signature.signed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, { size: 6.8, color: MUTED, gapAfter: 7, indent: 4 });
  }

  ensure(250);
  sectionTitle("Autenticidade da assinatura eletrônica");
  line(`Código de verificação: ${input.verificationCode}`, { font: bold, size: 10, color: BLUE, gapAfter: 4 });
  line(`Assinado em: ${new Date(input.signedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, { size: 8.5, gapAfter: 3 });
  line(`Hash do conteúdo congelado (SHA-256): ${input.snapshotHash}`, { size: 6.8, color: MUTED, gapAfter: 4 });
  line(`Verifique a autenticidade em: ${input.verificationUrl}`, { size: 7.2, color: MUTED, gapAfter: 8 });
  try {
    const qrDataUrl = await QRCode.toDataURL(input.verificationUrl, { margin: 1, width: 220, errorCorrectionLevel: "M" });
    const qr = await pdf.embedPng(dataUrlBytes(qrDataUrl));
    ensure(112);
    page.drawImage(qr, { x: marginLeft, y: y - 105, width: 105, height: 105 });
    page.drawText("QR Code de verificação", { x: marginLeft + 118, y: y - 24, size: 8, font: bold, color: DARK });
    page.drawText("A página pública confirma os hashes e as evidências mínimas", { x: marginLeft + 118, y: y - 40, size: 6.8, font: regular, color: MUTED });
    page.drawText("sem expor CPF/CNPJ completo, e-mail, IP ou o documento integral.", { x: marginLeft + 118, y: y - 53, size: 6.8, font: regular, color: MUTED });
    y -= 116;
  } catch { /* URL textual already provides verification path */ }

  if (template.footer_text) {
    ensure(35);
    line(template.footer_text, { size: 7.2, color: MUTED, gapAfter: 4 });
  }

  const pageCount = pages.length;
  pages.forEach((currentPage, index) => {
    const footer = `Documento assinado eletronicamente | ${input.verificationCode}${template.show_page_number !== false ? ` | Página ${index + 1}/${pageCount}` : ""}`;
    currentPage.drawText(printable(footer), { x: marginLeft, y: Math.max(10, marginBottom * 0.45), size: 6.5, font: regular, color: MUTED });
  });

  return await pdf.save({ useObjectStreams: false, addDefaultPage: false });
}
