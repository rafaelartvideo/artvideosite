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
