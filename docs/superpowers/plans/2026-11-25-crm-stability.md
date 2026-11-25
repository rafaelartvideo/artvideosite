# Estabilidade do CRM e pressão de memória/I/O

Evidência: Nano, swap persistente e picos visuais de I/Owait próximos de70%; comprometimento de memória1,54GB severo; disco27% ocupado e saldo de I/O25% no histórico. Timeouts simultâneos em PostgREST, Realtime, exporter e startup de cron. Não atribuir todos os sintomas a uma única consulta ou afirmar orçamento de I/O esgotado sem evidência.

Correções autorizadas: reduzir repetição automática de consultas pesadas após timeout/erro HTTP e reduzir consultas repetidas de contexto na listagem de permissões. Preservar autorização, overrides de negação, módulos, isolamento e recuperação manual. Nenhum aumento de timeout/conexões ou remoção de RLS.

1. Testes reais de QueryClient reproduzem repetição de57014/erros HTTP, recuperação de transporte limitada e nova tentativa manual. Alterar somente política padrão de retry; manter cache, invalidação, logout e sessão.
2. Baseline live de my_organization_permissions já usa grants em conjuntos, mas reconsulta organização/módulos em permission_belongs_to_organization por chave. Calcular contexto não dinâmico uma vez; manter helper original para situações dinâmicas e seu parser UUID. Guards de definição e cópia anterior antes de aplicar.
3. Fixture PostgreSQL descartável compara todas as permissões de baseline/candidate em cenários de membros, plataforma, módulos e overrides; complementar com benchmark limitado/autenticado na produção e comparação de hashes.
4. Revisão independente, qualidade, suíte CI e ambos builds; main, migration separada e confirmação da publicação HostGator.

Capacidade: validar saldo de I/O, swap e estado após as correções. A mudança paga de plano/compute exige aprovação específica de custo; apresentar uma proposta concreta se a pressão persistir. Essas otimizações não equivalem a aumentar RAM nem garantem eliminar problemas da infraestrutura.

## Resultado verificado

- O proprietário escolheu manter o plano atual e executar somente correções sem custo. Nenhuma troca de plano/compute faz parte desta entrega.
- QueryClient: teste comportamental com cliente real reproduziu falhas antes da correção. HTTP, autorização, cancelamento, pool e timeout não recebem repetição automática; falha de transporte reconhecida admite uma repetição. Nova solicitação manual recupera imediatamente, mantendo cache/sessão/isolamento. Suíte CI completa:1.148 testes aprovados, incluindo qualidade8; ambos builds aprovados.
- SQL descartável:79 comparações exatas de permissões com helpers reais e dados sintéticos; chamadas ao helper de escopo4.884→84. Um controle usando baseline como candidato reprova a redução de chamadas. Inclui módulos, negações, plataforma, revogações, organizações nulas/inativas e situações UUID válidas/inválidas. Não é um benchmark de produção.
- Revisão independente sem bloqueadores. Grants, proprietário, função STABLE SECURITY DEFINER e search_path vazio preservados.
- A CLI encontrou timeout no auth_query do pooler; a aplicação foi realizada pela API de migrations do Supabase, com sucesso. O arquivo gerado inicialmente pela CLI foi reconciliado para a versão real do histórico:20261125145645_stabilize_permission_scope_evaluation.sql. Não houve reparo ou remoção do histórico remoto.
- Na janela de pressão, baseline e candidato executados em leitura atingiram o limite local de8s. Após aplicação, a RPC autenticada retornou437 permissões em413,57ms. O SQL baseline executado em leitura retornou a mesma contagem e hash do resultado novo. A carga varia entre amostras; não atribuir toda a diferença ao patch nem afirmar recuperação global.
- Avisos de segurança mantiveram as mesmas cinco categorias existentes. A confirmação do workflow de publicação e a inspeção final do CRM são etapas separadas.

## Camada adicional do SDK

A inspeção do pacote bloqueado no projeto (`@supabase/postgrest-js`2.117.2) confirmou retries internos habilitados por padrão: até três repetições de GET/HEAD/OPTIONS em503/520 e falhas de rede, abaixo do QueryClient. A configuração `db.retry:false` foi aplicada aos clientes compartilhado e transitório. Autenticação, renovação, persistência de sessão e chaves não mudaram.

O teste executa a fábrica real compilada e o SDK instalado com fetch isolado e credenciais fictícias. Reproduziu quatro requisições antes e uma depois para REST e GET RPC em503/520; POST permanece uma requisição, e leitura manual posterior recupera. Testes focados16/16 e suíte CI1.160/1.160 passaram, incluindo qualidade8. Revisão independente sem bloqueadores. Fonte oficial: https://supabase.com/docs/guides/api/automatic-retries-in-supabase-js . A lista de métodos/status na documentação pode variar em relação ao pacote; a verificação usa a versão efetivamente bloqueada no projeto.

As duas primeiras correções foram publicadas no workflow45640240683 (main ea8cbad6ee40caf5fa5f455ed9ac9e7a81579b08), com ambos FTPS concluídos. A entrega complementar do SDK exige seu próprio workflow e inspeção final.
