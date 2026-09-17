import { PDFDocument, StandardFonts, rgb, type PDFFont } from "npm:pdf-lib@1.17.1";
import QRCode from "npm:qrcode@1.5.4";

export type FrozenSignatureSlot = {
  signer_type: "employee" | "external";
  page_index: number;
  x_mm: number;
  y_mm: number;
  width_mm: number;
  height_mm: number;
};

export type SignatureEvidence = {
  signer_type: "employee" | "external";
  signer_name: string;
  signer_document_masked?: string | null;
  validation_method: "stored_employee_signature" | "cpf_cnpj" | "email_otp";
  signed_at: string;
  image_bytes?: Uint8Array | null;
};

export type ApplyFrozenPdfSignaturesInput = {
  base_pdf_bytes: Uint8Array;
  base_pdf_hash: string;
  snapshot_hash: string;
  verification_code: string;
  verification_url: string;
  signed_at: string;
  signatures: SignatureEvidence[];
  signature_slots: FrozenSignatureSlot[];
};

const MM_TO_PT = 72 / 25.4;
const DARK = rgb(0.05, 0.11, 0.18);
const BLUE = rgb(0, 0.34, 0.91);
const MUTED = rgb(0.36, 0.43, 0.52);

function printable(value: unknown) {
  return String(value ?? "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff]/g, "?");
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
      else { lines.push(current); current = word; }
    }
    lines.push(current);
  }
  return lines;
}

function dataUrlBytes(dataUrl: string) {
  const encoded = String(dataUrl).split(",")[1] || "";
  const binary = atob(encoded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function validationLabel(method: SignatureEvidence["validation_method"]) {
  if (method === "cpf_cnpj") return "Validação por CPF/CNPJ";
  if (method === "email_otp") return "Validação por e-mail + OTP";
  return "Assinatura cadastrada do funcionário";
}

export async function applySignaturesToFrozenPdf(input: ApplyFrozenPdfSignaturesInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(input.base_pdf_bytes, { updateMetadata: false });
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pages = pdf.getPages();

  for (const signature of input.signatures) {
    const slot = input.signature_slots.find(item => item.signer_type === signature.signer_type);
    if (!slot || !signature.image_bytes?.length) continue;
    const page = pages[slot.page_index];
    if (!page) continue;
    try {
      const image = await pdf.embedPng(signature.image_bytes);
      const pageHeight = page.getHeight();
      const x = slot.x_mm * MM_TO_PT;
      const widthLimit = slot.width_mm * MM_TO_PT;
      const heightLimit = slot.height_mm * MM_TO_PT;
      const y = pageHeight - (slot.y_mm + slot.height_mm) * MM_TO_PT;
      const scale = Math.min(widthLimit / image.width, heightLimit / image.height, 1);
      const width = image.width * scale;
      const height = image.height * scale;
      page.drawImage(image, {
        x: x + Math.max(0, (widthLimit - width) / 2),
        y: y + Math.max(0, (heightLimit - height) / 2),
        width,
        height,
      });
    } catch { /* authenticity page still preserves textual evidence */ }
  }

  const sourcePage = pages[pages.length - 1];
  const size = sourcePage?.getSize() || { width: 595.28, height: 841.89 };
  const auth = pdf.addPage([size.width, size.height]);
  const left = 42;
  const top = size.height - 48;
  const maxWidth = size.width - 84;
  auth.drawText("AUTENTICIDADE DA ASSINATURA ELETRÔNICA", { x: left, y: top, size: 13, font: bold, color: DARK });
  auth.drawText(`Código de verificação: ${printable(input.verification_code)}`, { x: left, y: top - 25, size: 10, font: bold, color: BLUE });
  auth.drawText(`Assinado em: ${new Date(input.signed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, { x: left, y: top - 43, size: 8.5, font: regular, color: DARK });

  let y = top - 67;
  const hashRows = [
    ["Hash do PDF original visualizado (SHA-256):", input.base_pdf_hash],
    ["Hash dos dados congelados (SHA-256):", input.snapshot_hash],
  ] as const;
  for (const [label, value] of hashRows) {
    auth.drawText(label, { x: left, y, size: 7.2, font: bold, color: MUTED });
    y -= 12;
    for (const line of splitLines(regular, value, 6.7, maxWidth)) {
      auth.drawText(line, { x: left, y, size: 6.7, font: regular, color: MUTED });
      y -= 10;
    }
    y -= 6;
  }

  for (const signature of input.signatures) {
    if (y < 220) break;
    auth.drawText(signature.signer_type === "employee" ? "Funcionário" : "Cliente / responsável", { x: left, y, size: 7.4, font: bold, color: BLUE });
    y -= 14;
    auth.drawText(printable(signature.signer_name || "-"), { x: left, y, size: 9, font: bold, color: DARK });
    y -= 13;
    if (signature.signer_document_masked) {
      auth.drawText(printable(signature.signer_document_masked), { x: left, y, size: 7.3, font: regular, color: MUTED });
      y -= 12;
    }
    auth.drawText(`${validationLabel(signature.validation_method)} | ${new Date(signature.signed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`, { x: left, y, size: 7.2, font: regular, color: MUTED });
    if (signature.image_bytes?.length) {
      try {
        const image = await pdf.embedPng(signature.image_bytes);
        const maxW = 150;
        const maxH = 44;
        const scale = Math.min(maxW / image.width, maxH / image.height, 1);
        auth.drawImage(image, {
          x: size.width - left - image.width * scale,
          y: y - 10,
          width: image.width * scale,
          height: image.height * scale,
        });
      } catch { /* optional image on evidence page */ }
    }
    y -= 31;
  }

  auth.drawText(`Verifique a autenticidade em: ${printable(input.verification_url)}`.slice(0, 220), { x: left, y: 156, size: 7.2, font: regular, color: MUTED });
  try {
    const qrDataUrl = await QRCode.toDataURL(input.verification_url, { margin: 1, width: 220, errorCorrectionLevel: "M" });
    const qr = await pdf.embedPng(dataUrlBytes(qrDataUrl));
    auth.drawImage(qr, { x: left, y: 36, width: 105, height: 105 });
    auth.drawText("QR Code de verificação", { x: left + 118, y: 118, size: 8, font: bold, color: DARK });
    auth.drawText("A página pública confirma a autenticidade e os hashes", { x: left + 118, y: 101, size: 6.8, font: regular, color: MUTED });
    auth.drawText("sem expor CPF/CNPJ completo ou o conteúdo integral.", { x: left + 118, y: 88, size: 6.8, font: regular, color: MUTED });
  } catch { /* textual verification URL remains */ }

  const signedDate = new Date(input.signed_at);
  if (!Number.isNaN(signedDate.getTime())) pdf.setModificationDate(signedDate);
  pdf.setProducer("ArtVideo - Assinatura eletrônica");
  return pdf.save({ useObjectStreams: false, addDefaultPage: false });
}
