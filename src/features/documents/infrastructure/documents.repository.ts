import { supabase } from "@/lib/supabase";
import { PRINT_FIELD_REGISTRY } from "../domain/print-field-registry";
import type { PrintTemplate, PrintTemplateEditorValue } from "../domain/print-template";

export async function listPrintTemplates() {
  return (supabase as any)
    .from("print_templates")
    .select("*")
    .order("name", { ascending: true }) as Promise<{ data: PrintTemplate[] | null; error: any }>;
}

export async function loadPrintTemplateEditorValue(template: PrintTemplate) {
  const { data: sections, error: sectionsError } = await (supabase as any)
    .from("print_template_sections")
    .select("*")
    .eq("template_id", template.id)
    .order("sort_order", { ascending: true });
  if (sectionsError) throw sectionsError;

  const sectionIds = (sections || []).map((section: any) => section.id).filter(Boolean);
  const { data: fields, error: fieldsError } = sectionIds.length
    ? await (supabase as any)
        .from("print_template_fields")
        .select("*")
        .in("template_section_id", sectionIds)
        .order("sort_order", { ascending: true })
    : { data: [], error: null };
  if (fieldsError) throw fieldsError;

  return {
    id: template.id,
    name: template.name,
    description: template.description || "",
    document_type: template.document_type,
    is_active: template.is_active,
    paper_size: template.paper_size,
    orientation: template.orientation,
    margin_top: Number(template.margin_top || 0),
    margin_right: Number(template.margin_right || 0),
    margin_bottom: Number(template.margin_bottom || 0),
    margin_left: Number(template.margin_left || 0),
    show_logo: template.show_logo,
    show_company_info: template.show_company_info,
    show_page_number: template.show_page_number,
    show_printed_at: template.show_printed_at,
    header_text: template.header_text || "",
    footer_text: template.footer_text || "",
    selectedFields: new Set<string>((fields || []).map((field: any) => field.field_key).filter(Boolean)),
  } satisfies PrintTemplateEditorValue;
}

export async function savePrintTemplate(value: PrintTemplateEditorValue) {
  const payload = {
    name: value.name.trim(),
    description: value.description.trim() || null,
    document_type: value.document_type,
    is_active: value.is_active,
    paper_size: value.paper_size,
    orientation: value.orientation,
    margin_top: value.margin_top,
    margin_right: value.margin_right,
    margin_bottom: value.margin_bottom,
    margin_left: value.margin_left,
    show_logo: value.show_logo,
    show_company_info: value.show_company_info,
    show_page_number: value.show_page_number,
    show_printed_at: value.show_printed_at,
    header_text: value.header_text.trim() || null,
    footer_text: value.footer_text.trim() || null,
  };

  let templateId = value.id;
  if (templateId) {
    const { error } = await (supabase as any).from("print_templates").update(payload).eq("id", templateId);
    if (error) throw error;
    const { error: sectionsError } = await (supabase as any)
      .from("print_template_sections")
      .delete()
      .eq("template_id", templateId);
    if (sectionsError) throw sectionsError;
  } else {
    const { data, error } = await (supabase as any)
      .from("print_templates")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    templateId = data.id;
  }

  const selectedSections = PRINT_FIELD_REGISTRY.filter(section =>
    section.fields.some(field => value.selectedFields.has(field.key)),
  );
  for (const [sectionIndex, section] of selectedSections.entries()) {
    const { data: sectionRow, error: sectionError } = await (supabase as any)
      .from("print_template_sections")
      .insert({
        template_id: templateId,
        section_key: section.key,
        title: section.label,
        sort_order: sectionIndex,
        columns: section.defaultColumns,
        is_enabled: true,
        settings: {},
      })
      .select("id")
      .single();
    if (sectionError) throw sectionError;

    const fields = section.fields.filter(field => value.selectedFields.has(field.key));
    if (!fields.length) continue;
    const { error: fieldsError } = await (supabase as any).from("print_template_fields").insert(
      fields.map((field, index) => ({
        template_section_id: sectionRow.id,
        field_key: field.key,
        label: field.label,
        sort_order: index,
        is_enabled: true,
        settings: {},
      })),
    );
    if (fieldsError) throw fieldsError;
  }

  return templateId as string;
}

export async function setPrintTemplateActive(templateId: string, isActive: boolean) {
  const { error } = await (supabase as any)
    .from("print_templates")
    .update({ is_active: isActive })
    .eq("id", templateId);
  if (error) throw error;
}
