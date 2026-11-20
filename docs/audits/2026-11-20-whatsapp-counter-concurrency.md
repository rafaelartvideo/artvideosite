# WhatsApp — concorrência e isolamento dos contadores — 20/11/2026

## Causas reproduzidas

O intervalo de 60 segundos do contador Sem resposta iniciava outra consulta mesmo com a anterior ainda pendente. A resposta também podia atualizar o estado após desmontagem ou mudança de empresa/conta. Testes executando o efeito real reproduziram duas chamadas simultâneas para dois disparos do intervalo e uma atualização depois do fechamento.

O cache compartilhado de contadores incluía empresa, canal, número e prioridade, mas não o operador. A RPC depende da visibilidade do solicitante (RLS). Dois operadores distintos na mesma empresa/conexão recebiam a mesma promessa/resposta de cache em uma reprodução isolada; não se fez troca de usuários reais nem leitura de dados de outra pessoa para testar.

## Correções

- Uma consulta pendente por intervalo Sem resposta. Resolução/erro libera a próxima consulta, sem guardar resultado nesse controle. Intervalo continua 60 segundos; timers e comportamento de mensagens não foram acelerados.
- Aba oculta não inicia a consulta. Fechamento/troca de contexto invalida respostas atrasadas, com confirmação da empresa e conta antes de atualizar o contador. A consulta já iniciada mantém seu tratamento de timeout existente; não foram criados limites de tempo novos.
- O cache de contadores inclui viewerId. Sem identidade informada não há reutilização. Os dois consumidores passam o usuário já autenticado: nenhuma chamada extra de autenticação. TTL de 20 segundos, limite de 16 entradas e limpeza de falhas anteriores foram preservados.
- O escopo do componente persistente inclui o usuário para que uma troca de operador na mesma empresa/número descarte respostas e listas do escopo anterior. Não foram alterados filtros de organização/canal, permissões, RLS, mensagens ou marcação de leitura.

## Evidência e limites

Cinco regressões novas cobrem concorrência, resposta depois do fechamento, mudança de empresa, aba oculta, repetição após erro, cache por operador, chamadas sem identidade e mudança do escopo persistente. Os testes executam o efeito e a função reais transformados por esbuild; os provedores são simulados. As verificações existentes de propriedade das requisições foram mantidas e adaptadas apenas ao novo parâmetro de usuário.

Dois disparos com uma resposta pendente passaram de duas consultas para uma. Respostas de contexto encerrado passaram de uma atualização para zero. Mesmo operador continua compartilhando uma consulta; operadores diferentes recebem requisições separadas. São reproduções determinísticas locais, não percentuais de redução medidos em produção ou p95 de operação.

Validação local integrada: 1.032 testes, 1.030 aprovados, zero falhas, dois ignorados por limitações de ambiente. Builds site e CRM passaram. Revisão independente não encontrou bloqueios. Nova regressão integra a seleção existente do deploy, sem alteração nos gates.

Inspecionados também paginação e carregamento sob demanda de conversas/mensagens, cache de páginas, inscrições Realtime compartilhadas, abertura de conta, contador de prioridade e configuração secundária. Não se declarou todo o WhatsApp otimizado nem se reescreveu SQL sem equivalência/plano. Latências p95/p99 continuam dependendo de coleta natural suficiente e condições comparáveis. Nesta etapa não houve consulta de logs, varredura de históricos, download de contatos/mídias, envio de mensagens, alteração de dados operacionais ou reinício de serviços. Não há migração ou Edge Function nova para publicar.
