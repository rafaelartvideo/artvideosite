# Auditoria de desempenho — Union World e Artvideo

Data: 29/10/2026. Horários abaixo em Brasília (UTC−3).

## Resultado

Foram corrigidos dois gargalos confirmados: autorização de fotos que percorria
todas as tarefas e assinaturas repetidas de prévias privadas. Também foram
otimizadas quatro políticas que recalculavam a identidade do usuário por linha.
RLS, permissões, papéis e dados de negócio foram preservados.

Implementação: `b52fcd91d4de06a9bd868ae0b474d8ed70765f54` na `main`.
As duas migrações foram aplicadas no projeto CRM em produção. O workflow Deploy
HostGator, execução `40894331771`, concluiu com sucesso os testes, builds e a
publicação do site e do CRM.

## Causa raiz e sequência do incidente

1. Na janela 10h30–10h45, quatro rotas de Produtos e Serviços somaram 9.831
   requisições. O callback de atualização do resumo/badge participava das
   dependências da carga; a atualização visual disparava outra carga.
2. Os commits anteriores `c8b44f7` e `4204ecf` já haviam estabilizado callbacks
   e limitado repetição de assinaturas. Os commits `0582e0e` e `2d3494f` já
   isolavam o cache por empresa e o descartavam no logout/falha de acesso.
   Essas alterações foram inspecionadas e preservadas nesta auditoria.
3. Restava um gargalo independente no banco: as duas políticas SELECT de
   `technician-task-photos` usavam EXISTS transformados pelo planejador em
   subplanos hash. Para localizar uma foto, o PostgreSQL autorizava as 53 tarefas
   existentes duas vezes. As conversões de UUID para texto impediam a busca
   direta pela chave primária.
4. Os logs enviados pelo usuário registravam autorizações de foto entre 18,7 e
   22,4 segundos, além de statement timeout. Entre 11h00 e 11h15, as duas fotos
   mais repetidas acumularam 240 chamadas, 61 erros HTTP 5xx e média próxima de
   19,7 segundos. A consulta `/auth/v1/user` também acumulou seis erros e média
   de 15,1 segundos nessa janela. A coincidência é compatível com degradação
   compartilhada do backend; não foi realizado ensaio de saturação para medir
   isoladamente CPU ou limite de conexões.

## Correções desta execução

### Banco e Storage

- Migração `20261029142845_optimize_technician_photo_rls_lookup.sql`: duas
  subconsultas escalares correlacionadas, com LIMIT 1, usam a chave primária da
  tarefa. As comparações textuais originais e todos os predicados de permissão
  foram mantidos. `private.try_uuid` já existia e trata caminhos inválidos.
- Não foram criados SECURITY DEFINER, grants, índices extras ou políticas de
  acesso mais amplas. A RLS da tabela de tarefas continua sendo avaliada.
- Migração `20261029143824_cache_auth_uid_in_hot_policies.sql`: transforma
  apenas `auth.uid()` em `(select auth.uid())` nas políticas de captura de
  sessões/eventos, inserção de tarefas e comentários de orçamento.
- Os dois testes SQL em `supabase/tests` falhavam antes da respectiva correção
  e passaram depois. O teste de fotos exige um usuário autenticado com uma
  foto disponível; não cria nem altera registros de negócio.

### Frontend

- Cache de assinatura compartilhado entre OS e Painel do Técnico, dentro do
  QueryClient isolado da empresa. Logout limpa os clientes conforme o fluxo já
  existente. Nenhum cache global ou persistente de URLs privadas foi criado.
- Requisições simultâneas da mesma foto/bucket compartilham a mesma promessa.
- URLs assinadas por dez minutos são renovadas aos oito; consumidores mantêm o
  prazo original em vez de prolongá-lo ao reutilizar uma URL.
- Falhas têm intervalo de dois minutos e nenhuma repetição automática interna.
- Prévias do técnico têm renovação com limpeza de timers/listeners; a renovação
  aguarda a aba voltar a ficar visível e a conexão retornar.
- `test:performance` foi incluído em `test:regressions`, executado também no CI.

## Métricas

| Medição | Antes | Depois |
|---|---:|---:|
| Mesma consulta autenticada de uma foto, EXPLAIN ANALYZE | 773,784 ms | 121,542 ms |
| Blocos em cache acessados pela mesma consulta | 13.722 | 2.394 |
| Tarefas percorridas nos dois subplanos da foto | 53 + 53 | até uma por busca indexada |
| Avisos `auth_rls_initplan` | 4 | 0 |
| Assinaturas para 100 chamadas concorrentes, teste automatizado | 100 chamadas diretas | 1 chamada compartilhada |
| Quatro rotas da OS, janelas observadas de 15 minutos | 9.831 | 17 |

A consulta comparável ficou cerca de 84% mais rápida. Uma repetição posterior
mediu 177,397 ms na primeira execução e 34,748 / 35,908 / 45,476 / 43,954 ms nas
quatro execuções seguintes. São medições de banco, não de carregamento da página.

A contagem de requests compara 10h30–10h45 com 11h25–11h40. As atividades dos
usuários eram diferentes e a segunda janela inclui as correções anteriores de
callbacks; portanto, ela demonstra o desaparecimento observado da tempestade,
mas não é um benchmark de carga controlada nem um ganho atribuível somente ao
novo cache. Nas quatro rotas, a segunda janela não registrou erros 5xx.

Entre 11h29min30s e 11h44, os logs registraram 695 eventos HTTP de borda, sem
5xx/544, e nenhum `canceling statement due to statement timeout` no PostgreSQL.
Os eventos de Auth e Storage dessa janela também não indicaram falhas. Isso é
uma amostra limitada, não uma garantia de ausência de incidentes futuros.

## Segurança e equivalência

- Foram comparados os IDs das 15 fotos privadas antes/depois para quatro
  identidades: os mesmos 15 arquivos para duas identidades autorizadas e zero
  para as outras duas. Nenhuma diferença de autorização foi encontrada.
- Como `anon`, continuaram visíveis zero fotos privadas e 48 assets públicos.
- `storage.objects`, tarefas técnicas e as quatro tabelas das políticas de
  identidade continuam com `relrowsecurity = true`.
- O advisor de segurança não ganhou avisos com estas alterações.

## Validação

435 testes automatizados passaram: 218 de regressão/desempenho, 28 de Financeiro
e 189 de SAC. Builds de produção do site e do CRM passaram. A revisão independente
identificou o prazo de validade nos caches secundários do técnico; ele foi
corrigido, junto da atualização do teste antigo que exigia cache permanente.

Após o deploy, foi confirmado no DOM o bundle `index-Cc7pgc9N.js`, igual ao
build validado. A sessão foi restaurada, a OS do técnico abriu com foto de
execução e o fluxo administrativo abriu a mesma OS. A assinatura dessa foto
registrou um POST 200 na janela observada do navegador de teste. Dois cliques
remotos no menu deram timeout no controle de automação; a navegação por teclado
funcionou e não houve erro correspondente da aplicação nos logs inspecionados.

No navegador em nuvem foram exercitados:

- Login de funcionário, Home, lista e detalhes de OS.
- Agenda mensal e semanal com eventos reais.
- Painel do Técnico, OS atribuída, serviços e foto de execução.
- Artvideo → Teste → Artvideo, mantendo a sessão e a identidade da empresa.
  A lista mostrou 298 OS na Artvideo e 64 na empresa de teste, sem reutilizar
  a lista da outra empresa.
- Home pública da Artvideo, loja com quatro produtos e página com quatro
  serviços, além do carrinho vazio. Não foram feitas compras, alterações
  comerciais ou envios a clientes.

Durante a inspeção, os slots lógicos estavam ativos, sem acúmulo relevante de WAL
não confirmado (zero bytes/posição equivalente). As assinaturas continuam
filtradas pelo contexto do módulo/empresa; não foi desativado Realtime.

## Limites e pontos remanescentes

- A validação real cobriu os fluxos acima. Não representa teste de todas as
  combinações de papéis, dispositivos, uploads, pagamentos ou de todas as rotas.
- Permanecem 329 apontamentos informativos de FKs sem índice, 111 índices
  apontados como não utilizados e 35 avisos de políticas permissivas múltiplas.
  Os índices de tarefa necessários ao gargalo confirmado já existiam. Não foram
  criados centenas de índices nem removidos índices/políticas sem evidência de
  benefício e validação funcional.
- O bootstrap de notificações ainda é um custo observável: uma amostra
  autenticada mediu 371 ms. O polling já havia sido limitado a um minuto e o
  Realtime foi mantido. Não foi alterada sua semântica de leitura/visibilidade.
- O build ainda avisa sobre chunks grandes: o módulo de OS tem aproximadamente
  1,54 MB minificado (432 KB gzip). Isso afeta transferência/análise inicial e
  continua sendo uma oportunidade separada de divisão de módulos.
- As estatísticas de `pg_stat_statements` acumulam desde agosto; foram usadas
  para priorização, e não como medição antes/depois desta mudança.

## Reversão

O frontend pode ser revertido pelo commit. Para o banco, restaurar somente as
expressões anteriores das seis políticas, sem desligar RLS. Não é necessária
restauração de dados, pois as migrações não modificaram dados de negócio.
