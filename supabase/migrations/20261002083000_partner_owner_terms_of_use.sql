begin;

-- O Termo de Uso é exclusivo do proprietário de organizações parceiras.
-- O Termo de Responsabilidade continua aplicável aos usuários da organização.

create or replace function public.get_pending_organization_terms_v1(p_organization_id uuid)
returns table (
  id uuid,
  term_type text,
  title text,
  content text,
  version integer,
  organization_name text
)
language sql
stable
security definer
set search_path = public, private
as $$
  with membership as (
    select member.is_owner
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
    limit 1
  )
  select
    term.id,
    term.term_type,
    term.title,
    term.content,
    term.version,
    organization.name
  from public.organization_terms term
  join public.organizations organization on organization.id = term.organization_id
  cross join membership
  where term.organization_id = p_organization_id
    and term.is_active
    and btrim(term.content) <> ''
    and (
      term.term_type = 'responsibility'
      or (
        term.term_type = 'usage'
        and membership.is_owner
        and organization.organization_type = 'partner'
      )
    )
    and not exists (
      select 1
      from public.organization_term_acceptances acceptance
      where acceptance.term_id = term.id
        and acceptance.term_version = term.version
        and acceptance.user_id = (select auth.uid())
    )
  order by case term.term_type when 'usage' then 1 else 2 end;
$$;

create or replace function public.accept_organization_term_v1(
  p_organization_id uuid,
  p_term_id uuid,
  p_term_version integer
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_term public.organization_terms;
  v_is_owner boolean := false;
  v_organization_type text;
begin
  select term.*
    into v_term
  from public.organization_terms term
  where term.id = p_term_id
    and term.organization_id = p_organization_id
    and term.is_active;

  if not found then
    raise exception 'Termo não encontrado ou inativo.' using errcode = '22023';
  end if;

  if v_term.version <> p_term_version then
    raise exception 'Este termo foi atualizado. Recarregue para aceitar a versão atual.' using errcode = '40001';
  end if;

  select
    coalesce(member.is_owner, false),
    organization.organization_type
    into v_is_owner, v_organization_type
  from public.organization_members member
  join public.organizations organization on organization.id = member.organization_id
  where member.organization_id = p_organization_id
    and member.user_id = (select auth.uid())
    and member.status = 'active'
  limit 1;

  if not found then
    raise exception 'Você não possui acesso ativo a esta empresa.' using errcode = '42501';
  end if;

  if v_term.term_type = 'usage'
     and (not v_is_owner or v_organization_type <> 'partner') then
    raise exception 'O Termo de Uso é exclusivo do proprietário da empresa parceira.' using errcode = '42501';
  end if;

  insert into public.organization_term_acceptances (
    organization_id, term_id, term_version, user_id
  )
  values (
    p_organization_id, v_term.id, v_term.version, (select auth.uid())
  )
  on conflict (term_id, term_version, user_id) do nothing;
end;
$$;

revoke all on function public.get_pending_organization_terms_v1(uuid) from public, anon;
revoke all on function public.accept_organization_term_v1(uuid, uuid, integer) from public, anon;
grant execute on function public.get_pending_organization_terms_v1(uuid) to authenticated;
grant execute on function public.accept_organization_term_v1(uuid, uuid, integer) to authenticated;

-- Preenche o Termo de Uso padrão somente quando a empresa parceira ainda não
-- possui um termo ou quando o conteúdo existente está vazio. Conteúdo já
-- personalizado nunca é sobrescrito.
insert into public.organization_terms (
  organization_id,
  term_type,
  title,
  content,
  version,
  is_active,
  created_at,
  updated_at
)
select
  organization.id,
  'usage',
  'Termos de Uso da Plataforma Union World',
  $terms$
# TERMOS DE USO DA PLATAFORMA UNION WORLD

Ao aceitar estes Termos de Uso, o usuário identificado como **proprietário da empresa parceira** declara que leu, compreendeu e concorda com as condições abaixo, inclusive em nome da empresa à qual sua conta está vinculada, declarando possuir autorização para representá-la perante a plataforma.

## 1. Objeto

Estes Termos de Uso regulam o acesso e a utilização da plataforma Union World e de seus recursos de gestão, atendimento, ordens de serviço, cadastros, estoque, financeiro, vendas, documentos, relatórios, integrações e demais funcionalidades disponibilizadas à empresa parceira.

O uso da plataforma deverá ocorrer exclusivamente para finalidades profissionais, empresariais e lícitas relacionadas às atividades da empresa.

## 2. Responsabilidade do proprietário da empresa

O proprietário é responsável pela administração do acesso da sua empresa à plataforma e declara que os dados cadastrais e empresariais informados são verdadeiros e atualizados.

Compete ao proprietário, diretamente ou por pessoas devidamente autorizadas:

- manter atualizados os dados da empresa;
- definir quais colaboradores poderão utilizar o sistema;
- atribuir funções e permissões compatíveis com as atividades de cada usuário;
- remover ou bloquear acessos quando um colaborador deixar de atuar na empresa ou não precisar mais utilizar o sistema;
- orientar os usuários sobre confidencialidade, proteção de dados e uso adequado da plataforma;
- comunicar imediatamente suspeitas de acesso indevido, fraude, vazamento de dados ou comprometimento de credenciais.

O proprietário reconhece que permissões excessivas ou concedidas indevidamente podem permitir acesso a informações sensíveis da empresa e de seus clientes.

## 3. Contas e credenciais

Cada usuário deverá utilizar sua própria conta. Contas, senhas, códigos de acesso e demais credenciais são pessoais e não deverão ser compartilhados.

A empresa parceira é responsável por administrar os usuários vinculados à sua operação e por tomar medidas razoáveis para impedir acessos não autorizados.

É proibido utilizar conta de outra pessoa, permitir o compartilhamento deliberado de credenciais ou tentar obter acesso a recursos para os quais o usuário não possua autorização.

## 4. Uso permitido da plataforma

A plataforma deverá ser utilizada de acordo com sua finalidade e com as permissões concedidas a cada usuário.

A empresa parceira compromete-se a não utilizar o sistema para:

- praticar fraude ou qualquer atividade ilícita;
- armazenar ou compartilhar conteúdo ilegal;
- violar direitos de terceiros;
- tentar contornar controles de segurança ou permissões;
- acessar dados de outras empresas sem autorização;
- interferir no funcionamento, segurança ou disponibilidade da plataforma;
- realizar engenharia reversa, exploração de vulnerabilidades ou tentativas de acesso não autorizado;
- utilizar automações, integrações ou ferramentas externas de modo que causem risco, abuso ou sobrecarga indevida ao serviço.

## 5. Dados inseridos pela empresa

A empresa parceira é responsável pela legitimidade, exatidão e finalidade dos dados que inserir, importar ou armazenar na plataforma.

Isso inclui, entre outros, dados de clientes, colaboradores, fornecedores, equipamentos, ordens de serviço, produtos, documentos, imagens, informações financeiras e registros operacionais.

A utilização da plataforma não transfere para a Union World a responsabilidade pela origem ou licitude dos dados fornecidos pela empresa parceira.

## 6. Proteção de dados pessoais e privacidade

A empresa parceira compromete-se a tratar dados pessoais em conformidade com a legislação aplicável, inclusive a Lei Geral de Proteção de Dados Pessoais — LGPD, quando aplicável.

A empresa deverá utilizar os dados pessoais armazenados no sistema somente para finalidades legítimas relacionadas às suas atividades e deverá limitar o acesso às pessoas que realmente necessitem dessas informações.

É responsabilidade da empresa orientar seus colaboradores para que dados de clientes não sejam utilizados para interesses pessoais, perseguição, assédio, abordagens particulares, divulgação indevida, discriminação ou qualquer finalidade incompatível com o atendimento ou serviço autorizado.

## 7. Responsabilidade pelos usuários da empresa

O proprietário reconhece que os usuários cadastrados pela empresa poderão executar ações de acordo com as permissões que lhes forem concedidas.

A empresa é responsável por administrar adequadamente esses acessos e por apurar internamente eventual uso indevido realizado por seus colaboradores, sem prejuízo dos registros técnicos e de auditoria existentes no sistema.

Sempre que possível, as ações realizadas poderão ser vinculadas ao usuário responsável, com data, hora e demais informações necessárias para segurança e rastreabilidade.

## 8. Registros e auditoria

Para segurança, prevenção de fraudes, diagnóstico de problemas e rastreabilidade, a plataforma poderá registrar eventos relacionados ao seu uso.

Esses registros poderão incluir acessos, alterações de dados, criação e exclusão de registros, mudanças de situação, ações administrativas, usuário responsável, data e horário e outras informações técnicas necessárias à operação e segurança do sistema.

A tentativa de apagar, alterar, ocultar ou manipular registros de auditoria sem autorização é proibida.

## 9. Segurança

A Union World poderá adotar mecanismos técnicos e administrativos destinados à proteção da plataforma e das informações nela armazenadas.

A empresa parceira também deverá adotar medidas adequadas de segurança em seus dispositivos, redes, contas e processos internos.

A empresa deverá informar prontamente qualquer suspeita de:

- acesso não autorizado;
- comprometimento de senha ou conta;
- vazamento ou exposição indevida de informações;
- comportamento anormal do sistema;
- fraude;
- utilização indevida por colaborador ou terceiro.

## 10. Integrações e serviços de terceiros

Algumas funcionalidades poderão depender de serviços de terceiros, como meios de pagamento, telefonia, mensageria, serviços fiscais, armazenamento, autenticação, APIs ou outras integrações.

Quando houver integração com terceiros, poderão ser aplicáveis também os termos, políticas, limites técnicos, custos e condições estabelecidos pelo respectivo fornecedor.

A disponibilidade de uma integração poderá sofrer alterações quando houver mudanças técnicas, comerciais ou regulatórias promovidas pelo fornecedor responsável.

## 11. Disponibilidade e manutenção

A plataforma poderá passar por manutenções, atualizações, correções e alterações necessárias para sua segurança, estabilidade e evolução.

Embora sejam adotadas medidas para manter o serviço disponível, não se garante funcionamento ininterrupto em todas as circunstâncias, especialmente em situações envolvendo falhas de internet, infraestrutura externa, serviços de terceiros, eventos de força maior ou manutenções necessárias.

## 12. Propriedade intelectual

A plataforma, seu código, estrutura, identidade visual, componentes, recursos, documentação e demais elementos protegidos permanecem de titularidade de seus respectivos proprietários.

O acesso concedido à empresa parceira não implica cessão ou transferência de propriedade intelectual.

É proibida a reprodução, comercialização, distribuição, cópia substancial ou exploração não autorizada da plataforma ou de seus componentes.

## 13. Conteúdo e informações da empresa

Os dados operacionais e conteúdos cadastrados pela empresa continuam relacionados à própria operação da empresa parceira, observadas as condições técnicas, legais e de segurança aplicáveis ao serviço.

A empresa deverá manter procedimentos internos adequados para conferência de informações importantes e, quando necessário ao seu negócio, conservar documentos ou cópias exigidas por legislação, contabilidade, obrigações fiscais ou normas próprias.

## 14. Suspensão ou restrição de acesso

O acesso à plataforma poderá ser temporariamente restringido ou suspenso quando necessário para proteger a segurança do sistema, investigar uso indevido, cumprir obrigação legal, impedir fraude, corrigir risco técnico relevante ou em outras hipóteses previstas na relação comercial aplicável.

Sempre que possível e adequado à situação, a empresa será informada sobre a medida adotada.

## 15. Condições comerciais

Planos, valores, limites, recursos contratados, formas de pagamento, prazos e demais condições comerciais poderão ser estabelecidos em proposta, contrato, pedido, painel de contratação ou outro instrumento específico.

Em caso de condição comercial específica formalmente acordada, ela complementará estes Termos de Uso.

## 16. Atualizações dos termos

Estes Termos de Uso poderão ser atualizados para refletir mudanças legais, operacionais, comerciais, técnicas ou de segurança.

Quando uma nova versão exigir novo aceite, o proprietário da empresa parceira deverá analisá-la e aceitá-la antes de continuar utilizando as funcionalidades sujeitas ao termo.

O sistema poderá registrar a versão aceita, o usuário responsável e a data e hora do aceite.

## 17. Encerramento do uso

Em caso de encerramento da relação com a plataforma, poderão ser aplicados os procedimentos de bloqueio, exportação, retenção ou eliminação de dados previstos nas condições comerciais, obrigações legais e políticas aplicáveis.

A empresa é responsável por solicitar ou realizar, dentro dos meios disponibilizados e prazos aplicáveis, a obtenção de informações que precise conservar após o encerramento.

## 18. Responsabilidade por atos próprios

Cada parte será responsável pelos atos, omissões e obrigações que estejam sob seu controle.

A empresa parceira é responsável pelo uso realizado por seus usuários, pela gestão das permissões concedidas e pela utilização dos dados inseridos na plataforma.

A Union World não se responsabiliza por ações realizadas deliberadamente por usuários autorizados da empresa em desacordo com as orientações do proprietário, as políticas internas da empresa ou estes Termos de Uso, sem prejuízo das responsabilidades que legalmente lhe sejam aplicáveis.

## 19. Aceite

Ao marcar a opção de concordância e prosseguir, o proprietário declara que:

- leu integralmente estes Termos de Uso;
- compreendeu suas condições;
- possui poderes ou autorização para representar a empresa parceira;
- concorda com a utilização da plataforma nos termos aqui estabelecidos;
- compromete-se a orientar e administrar adequadamente os usuários vinculados à empresa;
- reconhece que o aceite poderá ser registrado eletronicamente para fins de comprovação e auditoria.

**Declaro que li, compreendi e concordo com os Termos de Uso da plataforma Union World em nome da empresa parceira que represento.**
$terms$,
  1,
  true,
  now(),
  now()
from public.organizations organization
where organization.organization_type = 'partner'
on conflict (organization_id, term_type) do update
set
  title = case
    when btrim(public.organization_terms.content) = ''
      then excluded.title
    else public.organization_terms.title
  end,
  content = case
    when btrim(public.organization_terms.content) = ''
      then excluded.content
    else public.organization_terms.content
  end,
  is_active = case
    when btrim(public.organization_terms.content) = ''
      then true
    else public.organization_terms.is_active
  end,
  version = case
    when btrim(public.organization_terms.content) = ''
      then public.organization_terms.version + 1
    else public.organization_terms.version
  end,
  updated_at = case
    when btrim(public.organization_terms.content) = ''
      then now()
    else public.organization_terms.updated_at
  end;

commit;
