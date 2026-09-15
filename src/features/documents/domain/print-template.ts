export type PrintLayoutSettings = {
  font_family: "Arial" | "Inter" | "Times New Roman" | "Courier New";
  body_font_size: number;
  label_font_size: number;
  section_title_font_size: number;
  line_height: number;
  section_spacing: number;
  field_spacing: number;
  section_style: "boxed" | "lines" | "table";
  show_section_borders: boolean;
  show_field_borders: boolean;
};

export const DEFAULT_PRINT_LAYOUT_SETTINGS: PrintLayoutSettings = {
  font_family: "Arial",
  body_font_size: 10,
  label_font_size: 8,
  section_title_font_size: 9,
  line_height: 1.2,
  section_spacing: 4,
  field_spacing: 2,
  section_style: "lines",
  show_section_borders: true,
  show_field_borders: false,
};

export function normalizePrintLayoutSettings(value?: Partial<PrintLayoutSettings> | null): PrintLayoutSettings {
  return { ...DEFAULT_PRINT_LAYOUT_SETTINGS, ...(value || {}), line_height: Math.max(1.2, value?.line_height || DEFAULT_PRINT_LAYOUT_SETTINGS.line_height) };
}

export type PrintTemplate = {
  id: string;
  name: string;
  description: string | null;
  document_type: string;
  is_active: boolean;
  paper_size: string;
  orientation: "portrait" | "landscape";
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  show_logo: boolean;
  show_company_info: boolean;
  show_page_number: boolean;
  show_printed_at: boolean;
  header_text: string | null;
  footer_text: string | null;
  settings: Partial<PrintLayoutSettings> | null;
  created_at: string;
  updated_at: string;
};

export type PrintTemplateEditorValue = {
  id?: string;
  name: string;
  description: string;
  document_type: string;
  is_active: boolean;
  paper_size: string;
  orientation: "portrait" | "landscape";
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  show_logo: boolean;
  show_company_info: boolean;
  show_page_number: boolean;
  show_printed_at: boolean;
  header_text: string;
  footer_text: string;
  layout: PrintLayoutSettings;
  selectedFields: Set<string>;
};

export const emptyPrintTemplateEditorValue = (): PrintTemplateEditorValue => ({
  name: "",
  description: "",
  document_type: "CUSTOM",
  is_active: true,
  paper_size: "A4",
  orientation: "portrait",
  margin_top: 12,
  margin_right: 12,
  margin_bottom: 12,
  margin_left: 12,
  show_logo: true,
  show_company_info: true,
  show_page_number: false,
  show_printed_at: true,
  header_text: "",
  footer_text: "",
  layout: { ...DEFAULT_PRINT_LAYOUT_SETTINGS },
  selectedFields: new Set(),
});

export const PRINT_TEMPLATE_TYPE_LABELS: Record<string, string> = {
  OS: "Ordem de Serviço",
  ENTRADA: "Entrada",
  SAIDA_DEVOLUCAO: "Saída / Devolução",
  LAUDO: "Laudo técnico",
  COMPROVANTE: "Comprovante",
  CUSTOM: "Personalizado",
};

