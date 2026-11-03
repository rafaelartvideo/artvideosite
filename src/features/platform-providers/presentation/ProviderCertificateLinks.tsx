import { ExternalLink, FileCheck2, ShieldCheck } from "lucide-react";
import { Section } from "@/shared/ui/admin/AdminLayout";

const PF_URL = "https://www.gov.br/pf/pt-br/assuntos/antecedentes-criminais/antecedentes-criminais/";
const STATE_DIRECTORY = "https://www.gov.br/pf/pt-br/assuntos/imigracao/declaracoes-e-formularios/certidoes-criminais";
const TJ_SE = "https://www.tjse.jus.br/portal/servicos/judiciais/certidao-online/solicitacao-de-certidao-negativa";
const TRF5 = "https://certidoes.trf5.jus.br/certidoes/";

function CertificateLink({label,description,href}:{
  label:string;description:string;href:string;
}) {
  return <a href={href} target="_blank" rel="noopener noreferrer"
    className="group flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-primary/5">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <FileCheck2 size={19}/>
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-xs font-bold text-foreground">{label}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
    </span>
    <ExternalLink size={15} className="shrink-0 text-primary"/>
  </a>;
}

/** Links oficiais para emissão manual; nenhuma consulta automática, custo ou dado criminal é enviado. */
export function ProviderCertificateLinks({state}:{state?:string}) {
  const uf=(state||"").toUpperCase();
  const isTrf5=["AL","CE","PB","PE","RN","SE"].includes(uf);
  return <Section title="Antecedentes criminais"
    description="Emissão manual de certidões oficiais para conferência documental.">
    <div className="grid gap-3 lg:grid-cols-3">
      <CertificateLink label="Polícia Federal" description="Antecedentes criminais da PF"
        href={PF_URL}/>
      <CertificateLink label={uf ? "Justiça Estadual ("+uf+")" : "Justiça Estadual (TJ)"}
        description={uf==="SE"?"Emissão pelo Tribunal de Justiça de Sergipe":"Escolha o Tribunal de Justiça do estado"}
        href={uf==="SE"?TJ_SE:STATE_DIRECTORY}/>
      <CertificateLink label="Justiça Federal (TRF)"
        description={isTrf5?"Emissão de certidão criminal na 5ª Região":"Escolha a Justiça Federal do estado"}
        href={isTrf5?TRF5:STATE_DIRECTORY}/>
    </div>
    <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
      <ShieldCheck size={15} className="mt-0.5 shrink-0"/>
      <p>Use o filtro de Estado para orientar os links. Se outro estado for necessário, o diretório oficial da Polícia Federal reúne os portais de todos os TJs e TRFs.
        As certidões podem ser anexadas aos detalhes de cada prestador. Uma certidão ou processo não gera impedimento automático.</p>
    </div>
  </Section>;
}
