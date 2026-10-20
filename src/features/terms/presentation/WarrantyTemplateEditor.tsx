import { useState } from "react";
import { AdminPage, AdminStickyToolbar, BtnPrimary, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { FInput, FTextarea, FToggle } from "@/shared/ui/admin/AdminFormControls";
import type { WarrantyCertificateTemplate } from "@/features/orders/application/warranty-certificate-template";

type TextKey = Exclude<keyof WarrantyCertificateTemplate, "show_seal" | "show_signatures">;
type TextField = { key: TextKey; label: string; rows?: number };
const GROUPS: { title: string; hint?: string; fields: TextField[] }[] = [
  { title: "Identidade e cabeçalho", fields: [
    {key:"title",label:"Título do certificado"}, {key:"brand_subtitle",label:"Descrição da empresa"},
    {key:"brand_values",label:"Valores da empresa (uma linha por item)",rows:4},
    {key:"brand_slogan",label:"Frase de destaque",rows:4},
  ] },
  { title: "Serviços e produtos",
    hint: "Os nomes e as quantidades serão preenchidos com os itens reais da OS, incluindo serviços avulsos. A solução da OS não será utilizada.",
    fields: [{key:"section_services",label:"Título da seção de serviços"},{key:"section_products",label:"Título da seção de produtos"}] },
  { title: "Modalidade e prazo",
    hint: "A modalidade e o prazo selecionados para o equipamento são preenchidos automaticamente.",
    fields: [{key:"warranty_rows",label:"Linhas adicionais (informação | condição, uma por linha)",rows:4}] },
  { title: "Cobertura e exclusões", fields: [
    {key:"section_coverage",label:"Título da cobertura"},{key:"section_exclusions",label:"Título das exclusões"},
    {key:"coverage",label:"Cobertura (um tópico por linha)",rows:8},
    {key:"exclusions",label:"Exclusões (um tópico por linha)",rows:8},
  ] },
  { title: "Assinaturas e rodapé", fields: [
    {key:"technician_label",label:"Identificação do técnico"},
    {key:"client_label",label:"Identificação do cliente"},
    {key:"footer_slogan",label:"Frase do rodapé"},
    {key:"legal_notice",label:"Observação legal",rows:3},
  ] },
];

export function WarrantyTemplateEditor({
  value, canManage, saving, onClose, onSave,
}: {
  value: WarrantyCertificateTemplate;
  canManage: boolean;
  saving: boolean;
  onClose: () => void;
  onSave: (config: WarrantyCertificateTemplate) => void;
}) {
  const [draft, setDraft] = useState<WarrantyCertificateTemplate>(() => ({ ...value }));
  const update = (patch: Partial<WarrantyCertificateTemplate>) => setDraft(current => ({ ...current, ...patch }));
  return <AdminPage
    open onClose={() => { if (!saving) onClose(); }}
    breadcrumb="Operação > Termos/Garantia" title="Personalizar certificado de garantia"
    subtitle="Modelo utilizado na impressão das ordens de serviço."
    maxW="max-w-4xl"
  >
    <div className="space-y-5 p-4 sm:p-5">
      {GROUPS.map(group => <Section key={group.title} title={group.title}>
        {group.hint && <p className="mb-3 text-xs text-muted-foreground">{group.hint}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          {group.fields.filter(field=>!(group.title==="Assinaturas e rodapé" && !draft.show_signatures && (field.key==="technician_label" || field.key==="client_label")))
            .map(field => <div key={field.key} className={field.key==="warranty_rows"?"sm:col-span-2":""}>
              {field.rows ? <FTextarea label={field.label} rows={field.rows} value={draft[field.key]}
                disabled={!canManage || saving} onChange={(event: any)=>update({[field.key]:event.target.value})}/>
                : <FInput label={field.label} value={draft[field.key]}
                  disabled={!canManage || saving} onChange={(event: any)=>update({[field.key]:event.target.value})}/>}
            </div>)}
        </div>
        {group.title==="Identidade e cabeçalho" && <div className="mt-4">
          <FToggle label="Exibir selo de garantia" checked={draft.show_seal} disabled={!canManage||saving}
            onChange={value=>update({show_seal:value})}/>
        </div>}
        {group.title==="Assinaturas e rodapé" && <div className="mt-4">
          <FToggle label="Exibir campos de assinatura" description="Sem área de carimbo."
            checked={draft.show_signatures} disabled={!canManage||saving}
            onChange={value=>update({show_signatures:value})}/>
          <p className="mt-2 text-xs text-muted-foreground">A personalização muda novas impressões, mas não altera número, datas ou prazos das garantias já emitidas. Permanecem aplicáveis os direitos legais do consumidor.</p>
        </div>}
      </Section>)}
    </div>
    <AdminStickyToolbar className="justify-end">
      <BtnSecondary onClick={onClose} disabled={saving}>Fechar</BtnSecondary>
      {canManage && <BtnPrimary onClick={()=>onSave(draft)} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
    </AdminStickyToolbar>
  </AdminPage>;
}
