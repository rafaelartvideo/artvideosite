begin;

alter table public.print_templates
  add column if not exists settings jsonb not null default '{
    "font_family": "Arial",
    "body_font_size": 11,
    "label_font_size": 8,
    "section_title_font_size": 11,
    "line_height": 1.4,
    "section_spacing": 14,
    "field_spacing": 8,
    "section_style": "lines",
    "show_section_borders": true,
    "show_field_borders": false
  }'::jsonb;

alter table public.print_templates
  drop constraint if exists print_templates_settings_object_check;

alter table public.print_templates
  add constraint print_templates_settings_object_check
  check (jsonb_typeof(settings) = 'object');

update public.print_templates
set settings = '{
  "font_family": "Arial",
  "body_font_size": 11,
  "label_font_size": 8,
  "section_title_font_size": 11,
  "line_height": 1.4,
  "section_spacing": 14,
  "field_spacing": 8,
  "section_style": "lines",
  "show_section_borders": true,
  "show_field_borders": false
}'::jsonb
where settings is null or settings = '{}'::jsonb;

commit;
