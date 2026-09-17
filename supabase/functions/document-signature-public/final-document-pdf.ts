import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "npm:pdf-lib@1.17.1";
import QRCode from "npm:qrcode@1.5.4";
import { signatureKindsFromSnapshot, signatureSlotLayout } from "./base-pdf-policy.mjs";

export type SignatureSlot = {
  signer_type: "employee" | "external";
  page_index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type FinalSignatureEvidence = {
  signer_type: "employee" | "external";
  signer_name: string;
  signer_document_masked?: string | null;
  validation_method: "stored_employee_signature" | "cpf_cnpj" | "email_otp";
  signed_at: string;
  image_bytes?: Uint8Array | null;
};

type MediaValue = {
  mime_type?: string | null;
  bytes: Uint8Array;
};

export type RenderBaseDocumentPdfInput = {
  snapshot: any;
  checklistMedia?: Record<string, MediaValue>;
  companyLogo?: MediaValue | null;
};

export type RenderBaseDocumentPdfResult = {
  pdfBytes: Uint8Array;
  signatureSlots: SignatureSlot[];
};

export type ApplySignatureEvidenceInput = {
  basePdfBytes: Uint8Array;
  basePdfHash?: string | null;
  snapshotHash: string;
  verificationCode: string;
  verificationUrl: string;
  signedAt: string;
  signatures: FinalSignatureEvidence[];
  signatureSlots?: SignatureSlot[];
};

export type RenderSignedDocumentPdfInput = {
  snapshot: any;
  snapshotHash: string;
  verificationCode: string;
  verificationUrl: string;
  signedAt: string;
  signatures: FinalSignatureEvidence[];
  checklistMedia?: Record<string, MediaValue>;
  companyLogo?: MediaValue | null;
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

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function ptFromMm(value: unknown, fallbackMm: number) {
  return clamp(value, fallbackMm, 5, 40) * 72 / 25.4;
}

function dimensions(template: any) {
  const base = String(template?.paper_size || "A4").toUpperCase() === "LETTER" ? LETTER : A4;
  return String(template?.orientation || "portrait").toLowerCase() === "landscape"
    ? [base[1], base[0]] as const
    : base;
}

function fontNames(template: any) {
  const family = String(template?.layout?.font_family || "Arial");
  if (family === "Times New Roman") return [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold] as const;
  if (family === "Courier New") return [StandardFonts.Courier, StandardFonts.CourierBold] as const;
  return [StandardFonts.Helvetica, StandardFonts.HelveticaBold] as const;
}

function splitLines(font: PDFFont, value: unknown, size: number, maxWidth: number) {
  const paragraphs = printable(value || "-").replaceAll("\\n", "\n").split(/\r?\n/);
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

async function embedMedia(pdf: PDFDocument, media?: MediaValue | null): Promise<PDFImage | null> {
  if (!media?.bytes?.length) return null;
  try {
    const mime = String(media.mime_type || "").toLowerCase();
    if (mime.includes("png")) return await pdf.embedPng(media.bytes);
    if (mime.includes("jpeg") || mime.includes("jpg")) return await pdf.embedJpg(media.bytes);
    try { return await pdf.embedPng(media.bytes); } catch { return await pdf.embedJpg(media.bytes); }
  } catch { return null; }
}

function validationLabel(method: FinalSignatureEvidence["validation_method"]) {
  if (method === "email_otp") return "Validação por e-mail + OTP";
  if (method === "cpf_cnpj") return "Validação por CPF/CNPJ";
  return "Assinatura cadastrada do funcionário";
}

export async function renderBaseDocumentPdf(input: RenderBaseDocumentPdfInput): Promise<RenderBaseDocumentPdfResult> {
  const snapshot = input.snapshot || {};
  const template = snapshot.template || {};
  const company = snapshot.company || {};
  const order = snapshot.order || {};
  const layout = template.layout || {};
  const [pageWidth, pageHeight] = dimensions(template);
  const marginLeft = ptFromMm(template.margin_left, 14);
  const marginRight = ptFromMm(template.margin_right, 14);
  const marginTop = ptFromMm(template.margin_top, 14);
  const marginBottom = ptFromMm(template.margin_bottom, 14);
  const contentWidth = pageWidth - marginLeft - marginRight;
  const bodySize = clamp(layout.body_font_size, 9, 7, 14);
  const labelSize = clamp(layout.label_font_size, 7, 6, 11);
  const sectionSize = clamp(layout.section_title_font_size, 8, 7, 13);
  const lineHeightFactor = clamp(layout.line_height, 1.25, 1.15, 1.8);
  const sectionSpacing = clamp(layout.section_spacing, 4, 0, 18);
  const fieldSpacing = clamp(layout.field_spacing, 2, 0, 12);
  const showSectionBorders = layout.show_section_borders !== false;
  const showFieldBorders = layout.show_field_borders === true;

  const pdf = await PDFDocument.create();
  const [regularName, boldName] = fontNames(template);
  const regular = await pdf.embedFont(regularName);
  const bold = await pdf.embedFont(boldName);
  pdf.setTitle(printable(template.name || "Documento"));
  pdf.setAuthor(printable(company.name || "ArtVideo"));
  pdf.setProducer("ArtVideo - Documento eletrônico");

  let page: PDFPage;
  let y = 0;
  const pages: PDFPage[] = [];
  const signatureSlots: SignatureSlot[] = [];

  const addPage = () => {
    page = pdf.addPage([pageWidth, pageHeight]);
    pages.push(page);
    y = pageHeight - marginTop;
    return page;
  };

  const ensure = (height: number) => {
    if (y - height >= marginBottom + 14) return;
    addPage();
  };

  const line = (value: unknown, options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gapAfter?: number; x?: number; maxWidth?: number } = {}) => {
    const font = options.font || regular;
    const size = options.size || bodySize;
    const x = options.x ?? marginLeft;
    const maxWidth = options.maxWidth ?? contentWidth;
    const lines = splitLines(font, value, size, maxWidth);
    const lineHeight = size * lineHeightFactor;
    ensure(lines.length * lineHeight + (options.gapAfter || 0));
    for (const item of lines) {
      page.drawText(item, { x, y: y - size, size, font, color: options.color || DARK });
      y -= lineHeight;
    }
    y -= options.gapAfter || 0;
  };

  const sectionTitle = (value: unknown) => {
    const height = sectionSize + 13;
    ensure(height + sectionSpacing);
    if (showSectionBorders || layout.section_style === "boxed") {
      page.drawRectangle({ x: marginLeft, y: y - height, width: contentWidth, height, color: LIGHT, borderColor: BORDER, borderWidth: showSectionBorders ? 0.6 : 0 });
    } else {
      page.drawLine({ start: { x: marginLeft, y: y - height + 2 }, end: { x: marginLeft + contentWidth, y: y - height + 2 }, color: BORDER, thickness: 0.6 });
    }
    page.drawText(printable(value).toUpperCase().slice(0, 120), { x: marginLeft + 7, y: y - sectionSize - 3, size: sectionSize, font: bold, color: DARK });
    y -= height + sectionSpacing;
  };

  const renderFieldGrid = (fields: any[], columnsRaw: unknown) => {
    const columns = Math.max(1, Math.min(4, Math.trunc(Number(columnsRaw) || 2)));
    const gap = 8;
    const cellWidth = (contentWidth - gap * (columns - 1)) / columns;
    for (let offset = 0; offset < fields.length; offset += columns) {
      const row = fields.slice(offset, offset + columns);
      const prepared = row.map(field => {
        const value = field?.value == null || field.value === "" ? "-" : field.value;
        const lines = splitLines(regular, value, bodySize, cellWidth - 12);
        return { field, lines };
      });
      const valueHeight = Math.max(...prepared.map(item => Math.max(1, item.lines.length))) * bodySize * lineHeightFactor;
      const rowHeight = labelSize * 1.35 + valueHeight + 12 + fieldSpacing;
      ensure(rowHeight);
      prepared.forEach((item, index) => {
        const x = marginLeft + index * (cellWidth + gap);
        if (showFieldBorders) page.drawRectangle({ x, y: y - rowHeight + fieldSpacing, width: cellWidth, height: rowHeight - fieldSpacing, borderColor: BORDER, borderWidth: 0.5 });
        page.drawText(printable(item.field?.label || item.field?.key || "Campo").toUpperCase().slice(0, 120), { x: x + 5, y: y - labelSize - 2, size: labelSize, font: bold, color: MUTED });
        let valueY = y - labelSize * 1.35 - bodySize - 5;
        for (const textLine of item.lines) {
          page.drawText(textLine, { x: x + 5, y: valueY, size: bodySize, font: regular, color: DARK });
          valueY -= bodySize * lineHeightFactor;
        }
      });
      y -= rowHeight;
      if (!showFieldBorders) page.drawLine({ start: { x: marginLeft, y: y + fieldSpacing }, end: { x: marginLeft + contentWidth, y: y + fieldSpacing }, color: BORDER, thickness: 0.35 });
    }
  };

  const renderMultilineTable = (section: any, fields: any[]) => {
    const rows = Math.max(0, ...fields.map(field => String(field?.value ?? "").replaceAll("\\n", "\n").split("\n").length));
    const columnWidth = contentWidth / Math.max(1, fields.length);
    const headerHeight = 22;
    ensure(headerHeight + 25);
    fields.forEach((field, index) => {
      const x = marginLeft + index * columnWidth;
      page.drawText(printable(field.label || field.key).toUpperCase().slice(0, 60), { x: x + 4, y: y - 14, size: labelSize, font: bold, color: MUTED });
    });
    y -= headerHeight;
    for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
      const values = fields.map(field => String(field?.value ?? "").replaceAll("\\n", "\n").split("\n")[rowIndex] || "-");
      const lineSets = values.map(value => splitLines(regular, value, bodySize, columnWidth - 8));
      const rowHeight = Math.max(...lineSets.map(lines => Math.max(1, lines.length))) * bodySize * lineHeightFactor + 9;
      ensure(rowHeight);
      lineSets.forEach((lines, index) => {
        const x = marginLeft + index * columnWidth + 4;
        let ty = y - bodySize - 2;
        for (const item of lines) { page.drawText(item, { x, y: ty, size: bodySize, font: regular, color: DARK }); ty -= bodySize * lineHeightFactor; }
      });
      page.drawLine({ start: { x: marginLeft, y: y - rowHeight + 2 }, end: { x: marginLeft + contentWidth, y: y - rowHeight + 2 }, color: BORDER, thickness: 0.35 });
      y -= rowHeight;
    }
    if (!rows) line(`Nenhum item em ${section?.label || "esta seção"}.`, { size: bodySize, color: MUTED, gapAfter: 3 });
  };

  addPage();
  const logo = template.show_logo !== false ? await embedMedia(pdf, input.companyLogo) : null;
  if (logo) {
    const maxW = 54;
    const maxH = 34;
    const scale = Math.min(maxW / logo.width, maxH / logo.height, 1);
    page.drawImage(logo, { x: marginLeft, y: y - logo.height * scale, width: logo.width * scale, height: logo.height * scale });
    const headerX = marginLeft + 64;
    page.drawText(printable(company.name || "Empresa"), { x: headerX, y: y - 10, size: 10, font: bold, color: BLUE });
    page.drawText(printable(template.name || "Documento"), { x: headerX, y: y - 28, size: 16, font: bold, color: DARK });
    y -= 43;
  } else {
    line(company.name || "Empresa", { font: bold, size: 10, color: BLUE, gapAfter: 2 });
    line(template.name || "Documento", { font: bold, size: 17, gapAfter: 3 });
  }
  line(`OS ${order.os_number || "-"}${order.external_os_number ? ` | Externa ${order.external_os_number}` : ""}`, { font: bold, size: 9, color: MUTED, gapAfter: 3 });
  if (template.header_text) line(template.header_text, { size: 8.5, color: MUTED, gapAfter: 5 });
  if (template.show_company_info !== false) {
    const companyDetails = [company.document, company.phone, company.email, company.address].filter(Boolean).join(" | ");
    if (companyDetails) line(companyDetails, { size: 7.5, color: MUTED, gapAfter: 8 });
  }

  for (const section of Array.isArray(snapshot.sections) ? snapshot.sections : []) {
    const visibleFields = (Array.isArray(section?.fields) ? section.fields : []).filter((item: any) => item?.kind !== "signature");
    if (!visibleFields.length) continue;
    sectionTitle(section.label || section.key || "Informações");
    if (["used_parts", "part_requests"].includes(String(section.key))) renderMultilineTable(section, visibleFields);
    else renderFieldGrid(visibleFields, section.columns || 2);
    y -= sectionSpacing;
  }

  for (const stage of Array.isArray(snapshot.checklists) ? snapshot.checklists : []) {
    sectionTitle(`Checklist - ${stage.name || stage.stage_code || "Etapa"}`);
    if (stage.situation_name) line(`Situação: ${stage.situation_name}`, { size: 7.5, color: MUTED, gapAfter: 3 });
    for (const item of Array.isArray(stage.items) ? stage.items : []) {
      const answer = `${checklistAnswer(item)}${item.observation ? ` | Observação: ${item.observation}` : ""}`;
      renderFieldGrid([{ label: item.title || "Item", value: answer }], 1);
      const mediaRows = Array.isArray(item.media) ? item.media : [];
      const images: PDFImage[] = [];
      for (const mediaRef of mediaRows) {
        const media = input.checklistMedia?.[String(mediaRef.media_id || "")];
        const image = await embedMedia(pdf, media);
        if (image) images.push(image);
      }
      for (let offset = 0; offset < images.length; offset += 3) {
        const group = images.slice(offset, offset + 3);
        const gap = 8;
        const maxW = Math.min(165, (contentWidth - gap * 2) / 3);
        const maxH = 105;
        const scaled = group.map(image => {
          const scale = Math.min(maxW / image.width, maxH / image.height, 1);
          return { image, width: image.width * scale, height: image.height * scale };
        });
        const height = Math.max(...scaled.map(item => item.height), 0);
        ensure(height + 12);
        scaled.forEach((item, index) => page.drawImage(item.image, { x: marginLeft + index * (maxW + gap), y: y - item.height, width: item.width, height: item.height }));
        y -= height + 12;
      }
    }
    y -= sectionSpacing;
  }

  const signatureKinds = signatureKindsFromSnapshot(snapshot);
  if (signatureKinds.length) {
    sectionTitle("Assinaturas");
    const slotHeight = 92;
    ensure(slotHeight + 8);
    const topY = y;
    const planned = signatureSlotLayout(signatureKinds, marginLeft, contentWidth);
    planned.forEach((slot: any) => {
      const lineY = topY - 58;
      page.drawLine({ start: { x: slot.x + 4, y: lineY }, end: { x: slot.x + slot.width - 4, y: lineY }, color: DARK, thickness: 0.65 });
      const label = slot.signer_type === "external" ? "Assinatura do cliente/responsável" : "Assinatura do funcionário";
      page.drawText(label, { x: slot.x + 4, y: lineY - 13, size: 7.4, font: bold, color: DARK });
      signatureSlots.push({
        signer_type: slot.signer_type,
        page_index: pages.length - 1,
        x: slot.x + 6,
        y: lineY + 4,
        width: slot.width - 12,
        height: 50,
      });
    });
    y -= slotHeight;
  }

  const pageCount = pages.length;
  pages.forEach((currentPage, index) => {
    const footerParts = [template.footer_text ? printable(template.footer_text) : "", template.show_page_number !== false ? `Página ${index + 1}/${pageCount}` : ""].filter(Boolean);
    if (footerParts.length) currentPage.drawText(footerParts.join(" | ").slice(0, 220), { x: marginLeft, y: Math.max(10, marginBottom * 0.42), size: 6.5, font: regular, color: MUTED });
  });

  return {
    pdfBytes: await pdf.save({ useObjectStreams: false, addDefaultPage: false }),
    signatureSlots,
  };
}

export async function applySignatureEvidenceToBasePdf(input: ApplySignatureEvidenceInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(input.basePdfBytes, { updateMetadata: false });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const slots = Array.isArray(input.signatureSlots) ? input.signatureSlots : [];

  for (const signature of input.signatures) {
    const slot = slots.find(item => item.signer_type === signature.signer_type);
    if (!slot || !signature.image_bytes?.length) continue;
    const page = pdf.getPages()[slot.page_index];
    if (!page) continue;
    try {
      const image = await pdf.embedPng(signature.image_bytes);
      const scale = Math.min(slot.width / image.width, slot.height / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, {
        x: slot.x + (slot.width - width) / 2,
        y: slot.y + Math.max(0, (slot.height - height) / 2),
        width,
        height,
      });
    } catch { /* textual evidence remains on authenticity page */ }
  }

  const lastPage = pdf.getPages()[pdf.getPageCount() - 1];
  const size = lastPage?.getSize() || { width: A4[0], height: A4[1] };
  const auth = pdf.addPage([size.width, size.height]);
  const left = 42;
  const top = size.height - 48;
  const maxWidth = size.width - 84;
  auth.drawText("AUTENTICIDADE DA ASSINATURA ELETRÔNICA", { x: left, y: top, size: 13, font: bold, color: DARK });
  auth.drawText(`Código de verificação: ${printable(input.verificationCode)}`, { x: left, y: top - 25, size: 10, font: bold, color: BLUE });
  auth.drawText(`Assinado em: ${new Date(input.signedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, { x: left, y: top - 43, size: 8.5, font: regular, color: DARK });
  let y = top - 66;
  if (input.basePdfHash) {
    auth.drawText("Hash do PDF-base visualizado pelo assinante (SHA-256):", { x: left, y, size: 7.2, font: bold, color: MUTED });
    y -= 12;
    splitLines(regular, input.basePdfHash, 6.7, maxWidth).forEach(item => { auth.drawText(item, { x: left, y, size: 6.7, font: regular, color: MUTED }); y -= 10; });
    y -= 4;
  }
  auth.drawText("Hash do conteúdo congelado (SHA-256):", { x: left, y, size: 7.2, font: bold, color: MUTED });
  y -= 12;
  splitLines(regular, input.snapshotHash, 6.7, maxWidth).forEach(item => { auth.drawText(item, { x: left, y, size: 6.7, font: regular, color: MUTED }); y -= 10; });
  y -= 8;

  for (const signature of input.signatures) {
    if (y < 210) break;
    auth.drawText(signature.signer_type === "employee" ? "Funcionário" : "Cliente / responsável", { x: left, y, size: 7.4, font: bold, color: BLUE });
    y -= 14;
    auth.drawText(printable(signature.signer_name || "-"), { x: left, y, size: 9, font: bold, color: DARK });
    y -= 13;
    if (signature.signer_document_masked) { auth.drawText(printable(signature.signer_document_masked), { x: left, y, size: 7.3, font: regular, color: MUTED }); y -= 12; }
    auth.drawText(`${validationLabel(signature.validation_method)} | ${new Date(signature.signed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, { x: left, y, size: 7.2, font: regular, color: MUTED });
    if (signature.image_bytes?.length) {
      try {
        const image = await pdf.embedPng(signature.image_bytes);
        const maxW = 150;
        const maxH = 44;
        const scale = Math.min(maxW / image.width, maxH / image.height, 1);
        auth.drawImage(image, { x: size.width - left - image.width * scale, y: y - 10, width: image.width * scale, height: image.height * scale });
      } catch { /* optional on evidence page */ }
    }
    y -= 28;
  }

  auth.drawText(`Verifique a autenticidade em: ${printable(input.verificationUrl)}`.slice(0, 220), { x: left, y: 156, size: 7.2, font: regular, color: MUTED });
  try {
    const qrDataUrl = await QRCode.toDataURL(input.verificationUrl, { margin: 1, width: 220, errorCorrectionLevel: "M" });
    const qr = await pdf.embedPng(dataUrlBytes(qrDataUrl));
    auth.drawImage(qr, { x: left, y: 36, width: 105, height: 105 });
    auth.drawText("QR Code de verificação", { x: left + 118, y: 118, size: 8, font: bold, color: DARK });
    auth.drawText("A página pública confirma os hashes e as evidências mínimas", { x: left + 118, y: 101, size: 6.8, font: regular, color: MUTED });
    auth.drawText("sem expor CPF/CNPJ completo, e-mail, IP ou o documento integral.", { x: left + 118, y: 88, size: 6.8, font: regular, color: MUTED });
  } catch { /* textual verification URL remains */ }

  const signedDate = new Date(input.signedAt);
  if (!Number.isNaN(signedDate.getTime())) pdf.setModificationDate(signedDate);
  pdf.setProducer("ArtVideo - Assinatura eletrônica");
  return await pdf.save({ useObjectStreams: false, addDefaultPage: false });
}

export async function renderSignedDocumentPdf(input: RenderSignedDocumentPdfInput): Promise<Uint8Array> {
  const base = await renderBaseDocumentPdf({ snapshot: input.snapshot, checklistMedia: input.checklistMedia, companyLogo: input.companyLogo });
  return applySignatureEvidenceToBasePdf({
    basePdfBytes: base.pdfBytes,
    basePdfHash: null,
    snapshotHash: input.snapshotHash,
    verificationCode: input.verificationCode,
    verificationUrl: input.verificationUrl,
    signedAt: input.signedAt,
    signatures: input.signatures,
    signatureSlots: base.signatureSlots,
  });
}
