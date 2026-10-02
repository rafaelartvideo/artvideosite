import { useEffect, useMemo, useState } from "react";
import { Eye, Pencil, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { formatDateTime } from "@/shared/domain/formatters";
import {
  AdminCard,
  AdminCardHeader,
  AdminCardToolbar,
  AdminIconButton,
  AdminPage,
  AdminStickyToolbar,
  BtnPrimary,
  BtnSecondary,
  PageHeader,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import { LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { FInput, FIntegerInput, FTextarea, FToggle, INPUT } from "@/shared/ui/admin/AdminFormControls";
import {
  listOrganizationTerms,
  listServiceWarrantyTerms,
  saveOrganizationTerm,
  saveServiceWarrantyTerm,
  type OrganizationTermType,
  type ServiceWarrantyTermRow,
} from "../infrastructure/terms.repository";

type Draft = {
  title: string;
  content: string;
  is_active: boolean;
  version: number;
  updated_at?: string | null;
};

type WarrantyDraft = {
  title: string;
  content: string;
  warranty_days: string;
  is_active: boolean;
};

type EditorState =
  | { kind: "term"; type: OrganizationTermType; draft: Draft }
  | { kind: "warranty"; row: ServiceWarrantyTermRow; draft: WarrantyDraft }
  | null;

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

const TERM_META: Record<OrganizationTermType, { name: string; audience: string; description: string }> = {
  usage: {
    name: "Termos de Uso",
    audience: "Proprietário da empresa",
    description: "Aceite exclusivo do usuário marcado como proprietário da empresa parceira.",
  },
  responsibility: {
    name: "Termo de Responsabilidade",
    audience: "Todos os usuários",
    description: "Aceite individual obrigatório para cada usuário na versão vigente.",
  },
};

function warrantyDraft(row: ServiceWarrantyTermRow): WarrantyDraft {
  return {
    title: row.title || `Termo de Garantia — ${row.service_name}`,
    content: row.content || "",
    warranty_days: String(row.warranty_days ?? 90),
    is_active: Boolean(row.warranty_id && row.is_active),
  };
}

export function TabTerms({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canView = hasPermission("terms.view") || hasPermission("terms.manage");
  const canManage = hasPermission("terms.manage");
  const [drafts, setDrafts] = useState<Record<OrganizationTermType, Draft>>(DEFAULTS);
  const [warranties, setWarranties] = useState<ServiceWarrantyTermRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState<EditorState>(null);
  const [warrantySearch, setWarrantySearch] = useState("");
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const load = async () => {
    if (!activeOrganizationId || !canView) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [rows, warrantyRows] = await Promise.all([
        listOrganizationTerms(activeOrganizationId),
        listServiceWarrantyTerms(activeOrganizationId),
      ]);

      const usage = rows.find(term => term.term_type === "usage");
      const responsibility = rows.find(term => term.term_type === "responsibility");

      setDrafts({
        usage: usage ? {
          title: usage.title,
          content: usage.content,
          is_active: usage.is_active,
          version: usage.version,
          updated_at: usage.updated_at,
        } : DEFAULTS.usage,
        responsibility: responsibility ? {
          title: responsibility.title,
          content: responsibility.content,
          is_active: responsibility.is_active,
          version: responsibility.version,
          updated_at: responsibility.updated_at,
        } : DEFAULTS.responsibility,
      });
      setWarranties(warrantyRows);
    } catch (error) {
      setToast({ msg: systemErrorMessage(error, "Não foi possível carregar termos e garantias."), type: "error" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganizationId, canView]);

  const filteredWarranties = useMemo(() => {
    const search = warrantySearch.trim().toLocaleLowerCase("pt-BR");
    if (!search) return warranties;
    return warranties.filter(row =>
      row.service_name.toLocaleLowerCase("pt-BR").includes(search)
      || String(row.title || "").toLocaleLowerCase("pt-BR").includes(search),
    );
  }, [warranties, warrantySearch]);

  const openTerm = (type: OrganizationTermType) => {
    setEditor({ kind: "term", type, draft: { ...drafts[type] } });
  };

  const openWarranty = (row: ServiceWarrantyTermRow) => {
    setEditor({ kind: "warranty", row, draft: warrantyDraft(row) });
  };

  const closeEditor = () => {
    if (saving) return;
    setEditor(null);
  };

  const saveTerm = async () => {
    if (!activeOrganizationId || !canManage || editor?.kind !== "term") return;
    const { type, draft } = editor;

    if (!draft.title.trim()) {
      setToast({ msg: "Informe o título do termo.", type: "error" });
      return;
    }
    if (draft.is_active && !draft.content.trim()) {
      setToast({ msg: "Informe o conteúdo antes de exigir o aceite.", type: "error" });
      return;
    }

    setSaving(true);
    try {
      await saveOrganizationTerm({
        organizationId: activeOrganizationId,
        termType: type,
        title: draft.title,
        content: draft.content,
        isActive: draft.is_active,
      });
      setToast({ msg: `${TERM_META[type].name} salvo com sucesso.`, type: "success" });
      setEditor(null);
      await load();
    } catch (error) {
      setToast({ msg: systemErrorMessage(error, "Não foi possível salvar o termo."), type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const saveWarranty = async () => {
    if (!activeOrganizationId || !canManage || editor?.kind !== "warranty") return;
    const { row, draft } = editor;
    const days = Number(draft.warranty_days);

    if (!draft.title.trim()) {
      setToast({ msg: "Informe o título do termo de garantia.", type: "error" });
      return;
    }
    if (!Number.isInteger(days) || days < 0 || days > 3650) {
      setToast({ msg: "Informe um prazo de garantia entre 0 e 3650 dias.", type: "error" });
      return;
    }
    if (draft.is_active && days <= 0) {
      setToast({ msg: "A garantia ativa precisa ter prazo maior que zero.", type: "error" });
      return;
    }
    if (draft.is_active && !draft.content.trim()) {
      setToast({ msg: "Informe o conteúdo do termo antes de ativar a garantia.", type: "error" });
      return;
    }

    setSaving(true);
    try {
      await saveServiceWarrantyTerm({
        organizationId: activeOrganizationId,
        generalServiceId: row.general_service_id,
        title: draft.title,
        content: draft.content,
        warrantyDays: days,
        isActive: draft.is_active,
      });
      setToast({ msg: `Garantia de ${row.service_name} salva com sucesso.`, type: "success" });
      setEditor(null);
      await load();
    } catch (error) {
      setToast({ msg: systemErrorMessage(error, "Não foi possível salvar a garantia do serviço."), type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const updateTermDraft = (patch: Partial<Draft>) => {
    setEditor(current => current?.kind === "term"
      ? { ...current, draft: { ...current.draft, ...patch } }
      : current);
  };

  const updateWarrantyDraft = (patch: Partial<WarrantyDraft>) => {
    setEditor(current => current?.kind === "warranty"
      ? { ...current, draft: { ...current.draft, ...patch } }
      : current);
  };

  if (!canView) return null;
  if (loading) return <LoadingState text="Carregando termos e garantias..." />;

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <PageHeader
      title="Termos/Garantia"
      subtitle="Gerencie os termos obrigatórios da empresa e as garantias vinculadas aos serviços."
    />

    <AdminCard>
      <AdminCardHeader>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-foreground">Termos</h2>
          <p className="mt-1 text-xs text-muted-foreground">Documentos de aceite obrigatório dos usuários da empresa.</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-muted-foreground">2 documentos</span>
      </AdminCardHeader>

      <div className="overflow-x-auto">
        <table className="min-w-[820px]">
          <thead>
            <tr>
              <th className="text-left">Documento</th>
              <th className="text-left">Aplicação</th>
              <th className="text-left">Versão</th>
              <th className="text-left">Status</th>
              <th className="text-left">Atualização</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {(["usage", "responsibility"] as OrganizationTermType[]).map(type => {
              const value = drafts[type];
              const meta = TERM_META[type];
              return <tr key={type}>
                <td>
                  <p className="font-bold text-foreground">{meta.name}</p>
                  <p className="mt-0.5 max-w-md text-xs text-muted-foreground">{meta.description}</p>
                </td>
                <td className="text-xs font-semibold text-muted-foreground">{meta.audience}</td>
                <td className="text-xs font-bold text-foreground">v{value.version}</td>
                <td><StatusBadge status={value.is_active ? "Ativo" : "Inativo"} /></td>
                <td className="text-xs text-muted-foreground">{value.updated_at ? formatDateTime(value.updated_at, "—") : "—"}</td>
                <td>
                  <div className="flex justify-end">
                    <AdminIconButton
                      ariaLabel={canManage ? `Editar ${meta.name}` : `Visualizar ${meta.name}`}
                      title={canManage ? "Editar" : "Visualizar"}
                      onClick={() => openTerm(type)}
                    >
                      {canManage ? <Pencil size={14} /> : <Eye size={14} />}
                    </AdminIconButton>
                  </div>
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </AdminCard>

    <AdminCard>
      <AdminCardHeader>
        <div className="min-w-0">
          <h2 className="text-sm font-black text-foreground">Garantias dos serviços</h2>
          <p className="mt-1 text-xs text-muted-foreground">Defina prazo e termo de garantia individualmente para cada Serviço Geral.</p>
        </div>
        <span className="shrink-0 text-xs font-bold text-muted-foreground">{warranties.length} serviço{warranties.length === 1 ? "" : "s"}</span>
      </AdminCardHeader>

      <AdminCardToolbar>
        <div className="relative w-full max-w-md">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={warrantySearch}
            onChange={event => setWarrantySearch(event.target.value)}
            placeholder="Buscar serviço ou termo de garantia"
            className={`${INPUT} h-9 pl-9 text-xs`}
          />
        </div>
      </AdminCardToolbar>

      {warranties.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum Serviço Geral cadastrado para configurar garantia.</div>
      ) : filteredWarranties.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-muted-foreground">Nenhum serviço encontrado para esta busca.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[900px]">
            <thead>
              <tr>
                <th className="text-left">Serviço</th>
                <th className="text-left">Prazo</th>
                <th className="text-left">Versão</th>
                <th className="text-left">Status</th>
                <th className="text-left">Atualização</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredWarranties.map(row => <tr key={row.general_service_id}>
                <td>
                  <p className="font-bold text-foreground">{row.service_name}</p>
                  {!row.service_is_active && <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Serviço inativo</p>}
                </td>
                <td className="text-xs font-semibold text-foreground">
                  {row.warranty_id && row.warranty_days != null ? `${row.warranty_days} dia${row.warranty_days === 1 ? "" : "s"}` : "Não configurada"}
                </td>
                <td className="text-xs font-bold text-foreground">{row.version > 0 ? `v${row.version}` : "—"}</td>
                <td>
                  {row.warranty_id
                    ? <StatusBadge status={row.is_active ? "Ativo" : "Inativo"} />
                    : <span className="text-xs font-semibold text-muted-foreground">Não configurada</span>}
                </td>
                <td className="text-xs text-muted-foreground">{row.updated_at ? formatDateTime(row.updated_at, "—") : "—"}</td>
                <td>
                  <div className="flex justify-end">
                    <AdminIconButton
                      ariaLabel={canManage ? `Configurar garantia de ${row.service_name}` : `Visualizar garantia de ${row.service_name}`}
                      title={canManage ? "Configurar garantia" : "Visualizar garantia"}
                      onClick={() => openWarranty(row)}
                    >
                      {canManage ? <Pencil size={14} /> : <Eye size={14} />}
                    </AdminIconButton>
                  </div>
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>

    <AdminStickyToolbar>
      <BtnSecondary onClick={onBack}>Voltar</BtnSecondary>
    </AdminStickyToolbar>

    {editor?.kind === "term" && <AdminPage
      open
      onClose={closeEditor}
      breadcrumb="Operação > Termos/Garantia"
      title={TERM_META[editor.type].name}
      subtitle={TERM_META[editor.type].description}
      maxW="max-w-3xl"
    >
      <div className="space-y-5 p-4 sm:p-5">
        <Section title="Configuração do termo">
          <div className="space-y-4">
            <FInput
              label="Título"
              value={editor.draft.title}
              disabled={!canManage || saving}
              onChange={(event: any) => updateTermDraft({ title: event.target.value })}
            />
            <div>
              <FTextarea
                label="Conteúdo do termo"
                value={editor.draft.content}
                disabled={!canManage || saving}
                onChange={(event: any) => updateTermDraft({ content: event.target.value })}
                rows={16}
                placeholder="Digite o texto completo que deverá ser aceito..."
              />
              <p className="mt-1 text-[10px] text-muted-foreground">Formatação disponível: # título · ## seção · **negrito** · - lista</p>
            </div>
            <FToggle
              label="Exigir aceite desta versão"
              description={editor.type === "usage"
                ? "Quando ativo, o proprietário da empresa deverá aceitar a versão vigente."
                : "Quando ativo, cada usuário deverá aceitar a versão vigente."}
              checked={editor.draft.is_active}
              disabled={!canManage || saving}
              onChange={value => updateTermDraft({ is_active: value })}
            />
          </div>
        </Section>

        <Section title="Versão">
          <p className="text-sm text-muted-foreground">Versão atual: <strong className="text-foreground">v{editor.draft.version}</strong>. Alterações no conteúdo, título ou status geram uma nova versão.</p>
        </Section>
      </div>

      <AdminStickyToolbar className="justify-end">
        <BtnSecondary onClick={closeEditor} disabled={saving}>Cancelar</BtnSecondary>
        {canManage && <BtnPrimary onClick={() => void saveTerm()} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
      </AdminStickyToolbar>
    </AdminPage>}

    {editor?.kind === "warranty" && <AdminPage
      open
      onClose={closeEditor}
      breadcrumb="Operação > Termos/Garantia"
      title={`Garantia — ${editor.row.service_name}`}
      subtitle="Prazo e condições de garantia aplicáveis a este serviço."
      maxW="max-w-3xl"
    >
      <div className="space-y-5 p-4 sm:p-5">
        <Section title="Serviço">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Serviço Geral</p>
              <p className="mt-1 text-sm font-bold text-foreground">{editor.row.service_name}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Versão</p>
              <p className="mt-1 text-sm font-bold text-foreground">{editor.row.version > 0 ? `v${editor.row.version}` : "Nova configuração"}</p>
            </div>
          </div>
        </Section>

        <Section title="Termo de garantia">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FIntegerInput
                label="Prazo da garantia (dias)"
                value={editor.draft.warranty_days}
                disabled={!canManage || saving}
                onChange={(event: any) => updateWarrantyDraft({ warranty_days: event.target.value })}
              />
              <FInput
                label="Título"
                value={editor.draft.title}
                disabled={!canManage || saving}
                onChange={(event: any) => updateWarrantyDraft({ title: event.target.value })}
              />
            </div>
            <div>
              <FTextarea
                label="Conteúdo do termo de garantia"
                value={editor.draft.content}
                disabled={!canManage || saving}
                onChange={(event: any) => updateWarrantyDraft({ content: event.target.value })}
                rows={16}
                placeholder="Descreva cobertura, condições, exclusões e demais regras da garantia..."
              />
              <p className="mt-1 text-[10px] text-muted-foreground">Formatação disponível: # título · ## seção · **negrito** · - lista</p>
            </div>
            <FToggle
              label="Garantia ativa"
              description="Quando ativa, esta será a configuração vigente de garantia para o serviço."
              checked={editor.draft.is_active}
              disabled={!canManage || saving}
              onChange={value => updateWarrantyDraft({ is_active: value })}
            />
          </div>
        </Section>

        <Section title="Versionamento">
          <p className="text-sm text-muted-foreground">Alterações no prazo, título, conteúdo ou status criam uma nova versão da garantia. Isso preserva a rastreabilidade das condições vigentes ao longo do tempo.</p>
        </Section>
      </div>

      <AdminStickyToolbar className="justify-end">
        <BtnSecondary onClick={closeEditor} disabled={saving}>Cancelar</BtnSecondary>
        {canManage && <BtnPrimary onClick={() => void saveWarranty()} loading={saving} loadingText="Salvando...">Salvar</BtnPrimary>}
      </AdminStickyToolbar>
    </AdminPage>}
  </div>;
}
