import { useEffect, useState } from "react";
import { FileCheck2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminCard, BtnPrimary, BtnSecondary, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
import {
  listOrganizationTerms,
  saveOrganizationTerm,
  type OrganizationTermType,
} from "../infrastructure/terms.repository";

type Draft = {
  title: string;
  content: string;
  is_active: boolean;
  version: number;
};

const DEFAULTS: Record<OrganizationTermType, Draft> = {
  usage: {
    title: "Termos de Uso da Plataforma Union World",
    content: "# TERMOS DE USO DA PLATAFORMA UNION WORLD\n\nAo aceitar estes Termos de Uso, o usuário identificado como **proprietário da empresa parceira** declara que leu, compreendeu e concorda com as condições abaixo, inclusive em nome da empresa à qual sua conta está vinculada, declarando possuir autorização para representá-la perante a plataforma.\n\n## 1. Objeto\n\nEstes Termos de Uso regulam o acesso e a utilização da plataforma Union World e de seus recursos de gestão, atendimento, ordens de serviço, cadastros, estoque, financeiro, vendas, documentos, relatórios, integrações e demais funcionalidades disponibilizadas à empresa parceira.\n\nO uso da plataforma deverá ocorrer exclusivamente para finalidades profissionais, empresariais e lícitas relacionadas às atividades da empresa.\n\n## 2. Responsabilidade do proprietário da empresa\n\nO proprietário é responsável pela administração do acesso da sua empresa à plataforma e declara que os dados cadastrais e empresariais informados são verdadeiros e atualizados.\n\nCompete ao proprietário, diretamente ou por pessoas devidamente autorizadas:\n\n- manter atualizados os dados da empresa;\n- definir quais colaboradores poderão utilizar o sistema;\n- atribuir funções e permissões compatíveis com as atividades de cada usuário;\n- remover ou bloquear acessos quando um colaborador deixar de atuar na empresa ou não precisar mais utilizar o sistema;\n- orientar os usuários sobre confidencialidade, proteção de dados e uso adequado da plataforma;\n- comunicar imediatamente suspeitas de acesso indevido, fraude, vazamento de dados ou comprometimento de credenciais.\n\nO proprietário reconhece que permissões excessivas ou concedidas indevidamente podem permitir acesso a informações sensíveis da empresa e de seus clientes.\n\n## 3. Contas e credenciais\n\nCada usuário deverá utilizar sua própria conta. Contas, senhas, códigos de acesso e demais credenciais são pessoais e não deverão ser compartilhados.\n\nA empresa parceira é responsável por administrar os usuários vinculados à sua operação e por tomar medidas razoáveis para impedir acessos não autorizados.\n\nÉ proibido utilizar conta de outra pessoa, permitir o compartilhamento deliberado de credenciais ou tentar obter acesso a recursos para os quais o usuário não possua autorização.\n\n## 4. Uso permitido da plataforma\n\nA plataforma deverá ser utilizada de acordo com sua finalidade e com as permissões concedidas a cada usuário.\n\nA empresa parceira compromete-se a não utilizar o sistema para:\n\n- praticar fraude ou qualquer atividade ilícita;\n- armazenar ou compartilhar conteúdo ilegal;\n- violar direitos de terceiros;\n- tentar contornar controles de segurança ou permissões;\n- acessar dados de outras empresas sem autorização;\n- interferir no funcionamento, segurança ou disponibilidade da plataforma;\n- realizar engenharia reversa, exploração de vulnerabilidades ou tentativas de acesso não autorizado;\n- utilizar automações, integrações ou ferramentas externas de modo que causem risco, abuso ou sobrecarga indevida ao serviço.\n\n## 5. Dados inseridos pela empresa\n\nA empresa parceira é responsável pela legitimidade, exatidão e finalidade dos dados que inserir, importar ou armazenar na plataforma.\n\nIsso inclui, entre outros, dados de clientes, colaboradores, fornecedores, equipamentos, ordens de serviço, produtos, documentos, imagens, informações financeiras e registros operacionais.\n\nA utilização da plataforma não transfere para a Union World a responsabilidade pela origem ou licitude dos dados fornecidos pela empresa parceira.\n\n## 6. Proteção de dados pessoais e privacidade\n\nA empresa parceira compromete-se a tratar dados pessoais em conformidade com a legislação aplicável, inclusive a Lei Geral de Proteção de Dados Pessoais — LGPD, quando aplicável.\n\nA empresa deverá utilizar os dados pessoais armazenados no sistema somente para finalidades legítimas relacionadas às suas atividades e deverá limitar o acesso às pessoas que realmente necessitem dessas informações.\n\nÉ responsabilidade da empresa orientar seus colaboradores para que dados de clientes não sejam utilizados para interesses pessoais, perseguição, assédio, abordagens particulares, divulgação indevida, discriminação ou qualquer finalidade incompatível com o atendimento ou serviço autorizado.\n\n## 7. Responsabilidade pelos usuários da empresa\n\nO proprietário reconhece que os usuários cadastrados pela empresa poderão executar ações de acordo com as permissões que lhes forem concedidas.\n\nA empresa é responsável por administrar adequadamente esses acessos e por apurar internamente eventual uso indevido realizado por seus colaboradores, sem prejuízo dos registros técnicos e de auditoria existentes no sistema.\n\nSempre que possível, as ações realizadas poderão ser vinculadas ao usuário responsável, com data, hora e demais informações necessárias para segurança e rastreabilidade.\n\n## 8. Registros e auditoria\n\nPara segurança, prevenção de fraudes, diagnóstico de problemas e rastreabilidade, a plataforma poderá registrar eventos relacionados ao seu uso.\n\nEsses registros poderão incluir acessos, alterações de dados, criação e exclusão de registros, mudanças de situação, ações administrativas, usuário responsável, data e horário e outras informações técnicas necessárias à operação e segurança do sistema.\n\nA tentativa de apagar, alterar, ocultar ou manipular registros de auditoria sem autorização é proibida.\n\n## 9. Segurança\n\nA Union World poderá adotar mecanismos técnicos e administrativos destinados à proteção da plataforma e das informações nela armazenadas.\n\nA empresa parceira também deverá adotar medidas adequadas de segurança em seus dispositivos, redes, contas e processos internos.\n\nA empresa deverá informar prontamente qualquer suspeita de:\n\n- acesso não autorizado;\n- comprometimento de senha ou conta;\n- vazamento ou exposição indevida de informações;\n- comportamento anormal do sistema;\n- fraude;\n- utilização indevida por colaborador ou terceiro.\n\n## 10. Integrações e serviços de terceiros\n\nAlgumas funcionalidades poderão depender de serviços de terceiros, como meios de pagamento, telefonia, mensageria, serviços fiscais, armazenamento, autenticação, APIs ou outras integrações.\n\nQuando houver integração com terceiros, poderão ser aplicáveis também os termos, políticas, limites técnicos, custos e condições estabelecidos pelo respectivo fornecedor.\n\nA disponibilidade de uma integração poderá sofrer alterações quando houver mudanças técnicas, comerciais ou regulatórias promovidas pelo fornecedor responsável.\n\n## 11. Disponibilidade e manutenção\n\nA plataforma poderá passar por manutenções, atualizações, correções e alterações necessárias para sua segurança, estabilidade e evolução.\n\nEmbora sejam adotadas medidas para manter o serviço disponível, não se garante funcionamento ininterrupto em todas as circunstâncias, especialmente em situações envolvendo falhas de internet, infraestrutura externa, serviços de terceiros, eventos de força maior ou manutenções necessárias.\n\n## 12. Propriedade intelectual\n\nA plataforma, seu código, estrutura, identidade visual, componentes, recursos, documentação e demais elementos protegidos permanecem de titularidade de seus respectivos proprietários.\n\nO acesso concedido à empresa parceira não implica cessão ou transferência de propriedade intelectual.\n\nÉ proibida a reprodução, comercialização, distribuição, cópia substancial ou exploração não autorizada da plataforma ou de seus componentes.\n\n## 13. Conteúdo e informações da empresa\n\nOs dados operacionais e conteúdos cadastrados pela empresa continuam relacionados à própria operação da empresa parceira, observadas as condições técnicas, legais e de segurança aplicáveis ao serviço.\n\nA empresa deverá manter procedimentos internos adequados para conferência de informações importantes e, quando necessário ao seu negócio, conservar documentos ou cópias exigidas por legislação, contabilidade, obrigações fiscais ou normas próprias.\n\n## 14. Suspensão ou restrição de acesso\n\nO acesso à plataforma poderá ser temporariamente restringido ou suspenso quando necessário para proteger a segurança do sistema, investigar uso indevido, cumprir obrigação legal, impedir fraude, corrigir risco técnico relevante ou em outras hipóteses previstas na relação comercial aplicável.\n\nSempre que possível e adequado à situação, a empresa será informada sobre a medida adotada.\n\n## 15. Condições comerciais\n\nPlanos, valores, limites, recursos contratados, formas de pagamento, prazos e demais condições comerciais poderão ser estabelecidos em proposta, contrato, pedido, painel de contratação ou outro instrumento específico.\n\nEm caso de condição comercial específica formalmente acordada, ela complementará estes Termos de Uso.\n\n## 16. Atualizações dos termos\n\nEstes Termos de Uso poderão ser atualizados para refletir mudanças legais, operacionais, comerciais, técnicas ou de segurança.\n\nQuando uma nova versão exigir novo aceite, o proprietário da empresa parceira deverá analisá-la e aceitá-la antes de continuar utilizando as funcionalidades sujeitas ao termo.\n\nO sistema poderá registrar a versão aceita, o usuário responsável e a data e hora do aceite.\n\n## 17. Encerramento do uso\n\nEm caso de encerramento da relação com a plataforma, poderão ser aplicados os procedimentos de bloqueio, exportação, retenção ou eliminação de dados previstos nas condições comerciais, obrigações legais e políticas aplicáveis.\n\nA empresa é responsável por solicitar ou realizar, dentro dos meios disponibilizados e prazos aplicáveis, a obtenção de informações que precise conservar após o encerramento.\n\n## 18. Responsabilidade por atos próprios\n\nCada parte será responsável pelos atos, omissões e obrigações que estejam sob seu controle.\n\nA empresa parceira é responsável pelo uso realizado por seus usuários, pela gestão das permissões concedidas e pela utilização dos dados inseridos na plataforma.\n\nA Union World não se responsabiliza por ações realizadas deliberadamente por usuários autorizados da empresa em desacordo com as orientações do proprietário, as políticas internas da empresa ou estes Termos de Uso, sem prejuízo das responsabilidades que legalmente lhe sejam aplicáveis.\n\n## 19. Aceite\n\nAo marcar a opção de concordância e prosseguir, o proprietário declara que:\n\n- leu integralmente estes Termos de Uso;\n- compreendeu suas condições;\n- possui poderes ou autorização para representar a empresa parceira;\n- concorda com a utilização da plataforma nos termos aqui estabelecidos;\n- compromete-se a orientar e administrar adequadamente os usuários vinculados à empresa;\n- reconhece que o aceite poderá ser registrado eletronicamente para fins de comprovação e auditoria.\n\n**Declaro que li, compreendi e concordo com os Termos de Uso da plataforma Union World em nome da empresa parceira que represento.**",
    is_active: true,
    version: 1,
  },
  responsibility: {
    title: "Termo de Responsabilidade",
    content: "",
    is_active: true,
    version: 1,
  },
};

function TermEditor({
  type,
  value,
  canManage,
  saving,
  onChange,
  onSave,
}: {
  type: OrganizationTermType;
  value: Draft;
  canManage: boolean;
  saving: boolean;
  onChange: (value: Draft) => void;
  onSave: () => void;
}) {
  const usage = type === "usage";
  return <AdminCard className="overflow-hidden p-0">
    <div className="border-b border-[#0d1b2e]/8 bg-[#f8fafc] px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8eef8] text-[#0057e7]">
          {usage ? <FileCheck2 size={19} /> : <ShieldCheck size={19} />}
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-black text-[#0d1b2e]">{usage ? "Termos de Uso" : "Termo de Responsabilidade"}</h2>
          <p className="mt-1 text-sm leading-5 text-[#5a6a82]">
            {usage
              ? "Aceite exclusivo do usuário marcado como proprietário de uma empresa parceira. Uma nova versão exige novo aceite."
              : "Aceite individual de cada usuário no primeiro acesso à versão vigente."}
          </p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[#8a96a8]">Versão atual: {value.version}</p>
        </div>
      </div>
    </div>

    <div className="space-y-4 p-4 sm:p-5">
      <div>
        <label className="mb-1.5 block text-xs font-bold text-[#35465c]">Título</label>
        <input
          value={value.title}
          disabled={!canManage || saving}
          onChange={event => onChange({ ...value, title: event.target.value })}
          className="h-10 w-full rounded-lg border border-[#cfd8e6] bg-white px-3 text-sm font-semibold text-[#0d1b2e] outline-none transition focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/10 disabled:bg-[#f5f7fa]"
        />
      </div>

      <div>
        <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
          <label className="block text-xs font-bold text-[#35465c]">Conteúdo do termo</label>
          <span className="text-[11px] font-medium text-[#7a8799]">Formatação: # título · ## seção · **negrito** · - lista</span>
        </div>
        <textarea
          value={value.content}
          disabled={!canManage || saving}
          onChange={event => onChange({ ...value, content: event.target.value })}
          placeholder="Digite aqui o texto completo que deverá ser aceito..."
          className="min-h-[280px] w-full resize-y rounded-lg border border-[#cfd8e6] bg-white px-3 py-3 text-sm leading-6 text-[#0d1b2e] outline-none transition focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/10 disabled:bg-[#f5f7fa]"
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#35465c]">
        <input
          type="checkbox"
          checked={value.is_active}
          disabled={!canManage || saving}
          onChange={event => onChange({ ...value, is_active: event.target.checked })}
          className="h-4 w-4 accent-[#0057e7]"
        />
        Exigir aceite desta versão
      </label>

      {canManage && <div className="flex justify-end border-t border-[#0d1b2e]/8 pt-4">
        <BtnPrimary onClick={onSave} loading={saving} loadingText="Salvando...">Salvar termo</BtnPrimary>
      </div>}
    </div>
  </AdminCard>;
}

export function TabTerms({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canView = hasPermission("terms.view") || hasPermission("terms.manage");
  const canManage = hasPermission("terms.manage");
  const [drafts, setDrafts] = useState<Record<OrganizationTermType, Draft>>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState<OrganizationTermType | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    if (!activeOrganizationId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listOrganizationTerms(activeOrganizationId);
      setDrafts({
        usage: rows.find(term => term.term_type === "usage")
          ? {
              title: rows.find(term => term.term_type === "usage")!.title,
              content: rows.find(term => term.term_type === "usage")!.content,
              is_active: rows.find(term => term.term_type === "usage")!.is_active,
              version: rows.find(term => term.term_type === "usage")!.version,
            }
          : DEFAULTS.usage,
        responsibility: rows.find(term => term.term_type === "responsibility")
          ? {
              title: rows.find(term => term.term_type === "responsibility")!.title,
              content: rows.find(term => term.term_type === "responsibility")!.content,
              is_active: rows.find(term => term.term_type === "responsibility")!.is_active,
              version: rows.find(term => term.term_type === "responsibility")!.version,
            }
          : DEFAULTS.responsibility,
      });
    } catch (error) {
      setToast({ msg: systemErrorMessage(error, "Não foi possível carregar os termos."), type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganizationId, canView]);

  const save = async (type: OrganizationTermType) => {
    if (!activeOrganizationId || !canManage) return;
    const draft = drafts[type];
    if (!draft.title.trim()) {
      setToast({ msg: "Informe o título do termo.", type: "error" });
      return;
    }
    if (draft.is_active && !draft.content.trim()) {
      setToast({ msg: "Informe o conteúdo antes de exigir o aceite.", type: "error" });
      return;
    }

    setSavingType(type);
    try {
      await saveOrganizationTerm({
        organizationId: activeOrganizationId,
        termType: type,
        title: draft.title,
        content: draft.content,
        isActive: draft.is_active,
      });
      setToast({ msg: `${type === "usage" ? "Termos de Uso" : "Termo de Responsabilidade"} salvos.`, type: "success" });
      await load();
    } catch (error) {
      setToast({ msg: systemErrorMessage(error, "Não foi possível salvar o termo."), type: "error" });
    } finally {
      setSavingType(null);
    }
  };

  if (!canView) return null;
  if (loading) return <LoadingState text="Carregando termos..." />;

  return <div className="space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    <PageHeader
      title="Termos"
      subtitle="Configure os documentos de aceite obrigatório da empresa."
      actions={<BtnSecondary onClick={onBack}>Voltar</BtnSecondary>}
    />
    <div className="grid gap-4 xl:grid-cols-2">
      <TermEditor
        type="usage"
        value={drafts.usage}
        canManage={canManage}
        saving={savingType === "usage"}
        onChange={value => setDrafts(current => ({ ...current, usage: value }))}
        onSave={() => void save("usage")}
      />
      <TermEditor
        type="responsibility"
        value={drafts.responsibility}
        canManage={canManage}
        saving={savingType === "responsibility"}
        onChange={value => setDrafts(current => ({ ...current, responsibility: value }))}
        onSave={() => void save("responsibility")}
      />
    </div>
  </div>;
}
