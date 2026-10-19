import { isValidOrderLabelLayout, type OrderLabelLayout } from "@/features/orders/domain/order-label-print";

export type PrinterSetupProfile = {
  id: string;
  label: string;
  manufacturer: string;
  matchPattern: string;
  driverUrl: string;
  format: "order-label";
};

// Novos modelos devem ter driver, dimensoes e identificadores confirmados antes de entrar neste registro.
export const PRINTER_SETUP_PROFILES: PrinterSetupProfile[] = [
  {
    id: "elgin-l42",
    label: "Elgin L42 / BTP-L42(U)",
    manufacturer: "Elgin",
    matchPattern: "L[- ]?42|BTP[- ]?L42",
    driverUrl: "https://www.elgin.com.br/download-center",
    format: "order-label",
  },
];

export function getOrderLabelPaper(layout: OrderLabelLayout) {
  if (!isValidOrderLabelLayout(layout)) throw new Error("Medidas inválidas. Revise-as na aba Etiquetas.");
  const widthMm = Math.round((3 * layout.width + 2 * layout.gap + 2 * layout.margin) * 100) / 100;
  const heightMm = layout.height;
  const formName = "Union OS " + String(widthMm).replace(".", "_") + "x" + String(heightMm).replace(".", "_") + " mm";
  if (formName.length > 31) throw new Error("Nome do papel excede o limite do Windows.");
  return { formName, widthMm, heightMm, widthUnits: Math.round(widthMm * 1000), heightUnits: Math.round(heightMm * 1000) };
}

export function preparePrinterScript(source: string, profile: PrinterSetupProfile, paper: ReturnType<typeof getOrderLabelPaper>) {
  if (!PRINTER_SETUP_PROFILES.some(item => item.id === profile.id)) throw new Error("Modelo não suportado.");
  const tokens: Record<string, string> = {
    "@@MODEL_LABEL@@": profile.label,
    "@@MODEL_MATCH@@": profile.matchPattern,
    "@@FORM_NAME@@": paper.formName,
    "@@WIDTH_UNITS@@": String(paper.widthUnits),
    "@@HEIGHT_UNITS@@": String(paper.heightUnits),
    "@@WIDTH_MM@@": String(paper.widthMm),
    "@@HEIGHT_MM@@": String(paper.heightMm),
  };
  for (const [token, value] of Object.entries(tokens)) {
    if (!source.includes(token)) throw new Error("O configurador está desatualizado. Atualize a página.");
    source = source.split(token).join(value);
  }
  if (source.includes("@@")) throw new Error("O configurador possui campos não preenchidos.");
  return source;
}
