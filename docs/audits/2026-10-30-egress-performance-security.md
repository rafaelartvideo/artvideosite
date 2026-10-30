# Auditoria de consumo, desempenho e segurança — 30/10/2026

## 1. Resultado e alcance

Foram implementadas duas intervenções incrementais: reaproveitamento de metadados/assinaturas das fotos de OS e eliminação de leituras repetidas no bootstrap das notificações. A auditoria abrangeu código do CRM/site, configurações e estatísticas dos dois bancos, logs de 24 horas, Storage, Realtime, advisors e fluxo de deploy. Não representa certificação completa de todos os módulos, dispositivos e integrações.

Não foram apagados registros/arquivos, desativadas funcionalidades, removido Realtime, alteradas permissões, contratados serviços ou reiniciada a VPS. As otimizações de 29/10 foram inspecionadas e preservadas.

## 2. Infraestrutura observada

| Item | Medição/estado |
|---|---|
| Repositório principal | `rafaelartvideo/artvideosite`, branch padrão main |
| Frontend | React 18.3.1, Vite 6.3.5, TanStack Query 5.102.8 |
| Banco CRM | PostgreSQL 17.6, projeto wmjmtcjpunmzvonlkjcu, us-east-2, ACTIVE_HEALTHY |
| Plano da organização CRM | Free, confirmado pelo conector |
| Tamanho do banco CRM | 192.736.403 bytes, aproximadamente 193 MB decimais |
| Conexões CRM | 26 na amostra inicial, incluindo conexões internas e desta auditoria |
| Banco fila | projeto qaltlxrrbpffjmrfxutd, us-east-1, ACTIVE_HEALTHY |
| Tamanho do banco fila | 13.700.243 bytes, aproximadamente 13,7 MB |
| Conexões fila | 21 na amostra inicial |
| Deploy | GitHub Actions com testes/builds separados e publicação HostGator |

Esses são snapshots, não máximos ou percentis. CPU, memória e conexões em horários de pico não foram obtidos. Não havia acesso operacional validado à VPS ou ao computador da impressora.

## 3. Egress: dado informado e limite de medição

O usuário informou 3,76 / 5 GB de egress e a seguinte distribuição diária de 29/10:

| Serviço | Volume informado | Participação informada |
|---|---:|---:|
| Storage | 168,891 MB | 62,1% |
| PostgREST | 95,691 MB | 35,2% |
| Realtime | 4,751 MB | 1,7% |
| Auth | 1,824 MB | 0,7% |
| Edge Functions | 701,726 KB | 0,3% |

Esses valores não foram novamente medidos pelo dashboard. As ferramentas disponíveis não forneceram o total faturado atualizado, série histórica mensal ou separação confiável entre egress com/sem cache. `content_length` está ausente em grande parte dos logs: somá-lo produziria uma falsa medição. Não foi calculada economia mensal em GB ou percentual de egress após a mudança.

## 4. Tráfego de borda: últimas 24 horas na coleta

| Grupo CRM | Requisições | HTTP 5xx | Média de origin_time |
|---|---:|---:|---:|
| REST | 37.944 | 2 | 287,2 ms |
| Auth | 1.202 | 0 | 346,6 ms |
| Storage | 1.196 | 0 | 498,7 ms |
| Realtime | 167 | 0 | 69,3 ms |

`origin_time` é uma medição do backend nos logs, não tempo completo de navegação. A janela móvel pode mudar ligeiramente entre consultas.

Maiores frequências CRM: `sac_digital_client_session` 6.230; `sac_digital_service_credentials` 3.560; mensagens SAC 2.046; `finish_sac_digital_job` 1.864; protocolos SAC 1.694; `load_admin_notifications_v1` 1.133. A RPC de notificações apresentou média de 914,4 ms nessa amostra.

Os dois HTTP 500 ocorreram em `get_service_order_workspace_v1` e `project_sac_digital_webhook_event`. Os logs PostgreSQL registraram dois eventos com `statement timeout`. Não há evidência suficiente para atribuir esses eventos às correções desta execução ou declarar eliminada sua causa.

## 5. Consultas PostgreSQL

As estatísticas de `pg_stat_statements` acumulam desde **13/08/2026**, e não apenas o dia atual:

| Consulta | Chamadas acumuladas | Média acumulada |
|---|---:|---:|
| load_admin_notifications_v1 | 40.319 | 855,06 ms |
| get_sac_digital_unread_counts | 9.893 | 1.880,84 ms |
| search_service_order_page_v1 | 8.098 | 347,21 ms |
| load_orders_reference_data_v1 | 4.673 | 318,35 ms |
| get_service_order_workspace_v1 | 3.350 | 267,11 ms |

As médias históricas incluem versões anteriores e incidentes já corrigidos. `realtime.list_changes` aparece no topo do tempo acumulado, mas é um consumidor interno contínuo; sua contagem não demonstra sozinha duplicação de canais.

O plano autenticado das notificações confirmou que `organization_notification_reads` era acessada em três ramos. A materialização dessa leitura autorizada uma vez reduz trabalho repetido mantendo a função SECURITY INVOKER e as políticas existentes. Não foram criados índices novos: os advisors apontam 331 FKs sem índice de cobertura e 114 índices sem uso observado, mas isso não justifica criar/remover índices em massa sem planos de execução e custo de escrita.

## 6. Storage: inventário

Total: **949 objetos, 240.530.125 bytes** (aproximadamente 240,5 MB decimais).

| Bucket | Arquivos | Bytes | Acima de 1 MiB |
|---|---:|---:|---:|
| service-images | 765 | 187.066.818 | 11 |
| technician-task-photos | 17 | 19.071.891 | 4 |
| public-assets | 26 | 8.938.549 | 3 |
| signed-documents | 56 | 8.734.572 | 0 |
| sac-digital-attachments | 26 | 8.076.177 | 0 |
| union-whatsapp-media | 26 | 7.118.212 | 1 |
| brand-images | 9 | 744.207 | 0 |
| product-images | 14 | 515.598 | 0 |
| employee-signatures | 8 | 115.236 | 0 |
| registration-files | 1 | 86.021 | 0 |
| union-management | 1 | 62.844 | 0 |

A maior imagem em service-images tem 5.685.136 bytes. A média é 244.532 bytes. Nem toda imagem grande é desperdício: etiquetas e detalhes técnicos exigem legibilidade.

O compressor central existente preserva documentos originais, transparência e animações, evita recomprimir arquivos adequados e libera buffers. Foram revisados seus pontos de uso em OS, captura móvel, técnico, catálogo, orçamento, gestão, SAC e WhatsApp; não foi repetido upload real em cada caminho/dispositivo.

## 7. Assinaturas e cache de imagens: correção implementada

Duas imagens tiveram respectivamente 58 e 56 chamadas de assinatura em 24 horas. O código de miniaturas consultava `media` mesmo quando o workspace já havia retornado seus metadados. Impressão e outras prévias também podiam assinar novamente o mesmo caminho.

- O modelo `OrderImage` transporta o descritor de mídia autorizado recebido no workspace/checklist.
- `getMediaPreview` usa esse descritor se ID, bucket e caminho estiverem completos; caso contrário consulta metadados com deduplicação por QueryClient.
- Miniaturas e lightbox ignoram a consulta remota quando já existe uma URL local disponível.
- Prévia e impressão compartilham assinaturas por empresa, bucket, caminho e duração.
- Fluxos que assinavam por uma hora continuam com uma hora; renovação preventiva aos 58 minutos. Fluxos técnicos de dez minutos continuam com dez, renovando aos oito.
- Reutilizar o cache conserva o prazo original. URLs de durações diferentes não se confundem.
- Nenhuma URL privada foi movida para cache público ou persistente. Logout continua limpando os clientes.
- A renovação automática só ocorre para prévias privadas montadas; a consulta de metadados continua reutilizável.

Não foram criadas miniaturas permanentes nem recomprimidas imagens históricas nesta execução. Essas mudanças exigem política de retenção, vínculo com os originais e teste de legibilidade para evitar perda de evidência técnica.

## 8. Resíduos e limpeza

O inventário encontrou oito arquivos de service-images sem correspondência na tabela genérica `media`, além de quatro em brand-images, quatro em product-images e dois em public-assets. Isso os torna **candidatos a investigação**, não arquivos comprovadamente órfãos. Outros buckets usam tabelas específicas: ausência em `media` não significa ausência de referência.

Nenhum arquivo foi excluído, movido para lixeira ou substituído. Uma limpeza segura precisa cruzar todas as referências e URLs, produzir manifesto e cópia recuperável antes de qualquer exclusão aprovada.

## 9. Cache multiempresa

O `AppQueryProvider` mantém QueryClients separados por empresa, cancela consultas do cliente anterior e limpa todos no logout/falha de acesso. A deduplicação do evento novo/legado de troca foi preservada. O novo cache usa essa mesma fronteira.

Não foram alterados TTLs de estoque, caixa, pagamentos, agenda ou mensagens. Os testes exercitam separação de assinaturas entre clientes, expiração e descarte de cache. A troca real de empresa com sessão de navegador não foi testada nesta execução.

## 10. Realtime

Snapshot CRM: 86 tabelas na publicação `supabase_realtime` e 19 registros de assinatura no banco. Esse número não equivale a usuários ou canais exclusivos. O sincronizador global já aplica seleção por módulos, filtros de empresa, cleanup e invalidação granular; essas otimizações foram preservadas.

Nenhuma assinatura foi removida ou substituída por polling. A contingência das notificações permanece em 60 segundos, além do Realtime. Entrega de eventos entre duas sessões reais não foi exercitada; não há alegação de validação integral de reconexão.

## 11. Frontend e bundles

Foram mantidos roteamento, aparência e loadings existentes. A mudança evita consultas de mídia desnecessárias e conserva a prévia disponível durante renovação. Não houve redesenho visual ou refatoração global.

Os builds ainda avisam sobre chunks acima de 500 kB: `html2pdf` cerca de 984,6 kB; parser PDF 541,9 kB; TabOrders aproximadamente 560 kB; entrada CRM cerca de 578,9 kB. São tamanhos minificados antes de gzip e não significam que todos os chunks sejam baixados na entrada. A aplicação já utiliza imports dinâmicos; ampliar a divisão exige análise por rota e navegador.

Não foi medida redução do bundle como resultado destas correções. O ganho pretendido é evitar rede e autorização repetidas, não reduzir bibliotecas funcionais.

## 12. Segurança

Nos dois projetos, todas as tabelas do schema público observadas têm RLS habilitado. Isso não comprova que todas as políticas estejam corretas.

CRM: advisors antes/depois permaneceram iguais: 74 tabelas com RLS sem política, uma extensão no schema público, 16 funções SECURITY DEFINER executáveis por anon, 289 por authenticated e proteção de senha vazada desativada. Tabelas sem política podem ser intencionalmente restritas ao backend; funções de catálogo público também podem precisar de anon. Não foram abertos grants ou removidos controles para silenciar avisos.

Fila: avisos incluem funções SECURITY DEFINER acessíveis, tabelas sem política, sign-in anônimo habilitado e proteção de senhas vazadas desativada. O quiosque pode depender do fluxo anônimo; não foi desativado sem prova de compatibilidade.

A RPC alterada continua SECURITY INVOKER, com search_path e grants preservados. Não foram adicionados helpers privilegiados. O bucket `sac-digital-outbox` já é público e estava vazio; sua necessidade e retenção exigem revisão específica antes de qualquer alteração.

Referência dos avisos: https://supabase.com/docs/guides/database/database-linter

## 13. Fila eletrônica e agente de impressão

Nos logs da fila, `claim_next_print_job` teve **42.570 chamadas em 24 horas**, sem HTTP 5xx. A média histórica da consulta SQL é aproximadamente 0,39 ms; portanto o problema observado é a frequência, não uma consulta SQL lenta.

O repositório atual já possui polling adaptativo (1 s em atividade, até 10 s ocioso) e horário de operação 07h–20h. Não foi validada a versão/configuração efetivamente instalada no Windows. Pode haver agente antigo ou múltiplas instâncias; isso é hipótese, não diagnóstico confirmado.

Não foi aumentado o intervalo para economizar à custa da impressão. Próximo passo operacional: conferir versão, configuração, quantidade de processos e logs no computador da impressora. O acompanhamento público também usa polling de 2 s; manter sua prontidão e privacidade é requisito para qualquer alteração futura.

## 14. VPS, integrações e deploy

O código da ponte WuzAPI e o fluxo de publicação foram inspecionados. Não houve acesso operacional validado à VPS; CPU, RAM, processos, portas, retenção de logs, Nginx e Asterisk não foram auditados ao vivo.

Mercado Pago, Resend, entrega real de WhatsApp, chamadas SIP, impressão física e criação de pedidos/OS financeiros não foram acionados como teste. Não foi efetuado pagamento nem mensagem real para terceiros.

O workflow existente já evita commits intermediários, valida testes/builds, compara fingerprints e preserva assets. Foi mantido.

## 15. Backups e perda de dados

Não foi encontrado/comprovado nesta execução um backup externo completo e restaurável do PostgreSQL e dos objetos Storage. GitHub contém código e migrations; não substitui backup dos dados e documentos.

A documentação oficial recomenda exportação periódica externa no Free. Backups automáticos dos planos pagos cobrem o banco, mas **não os bytes dos objetos Storage**: https://supabase.com/docs/guides/platform/backups . A referência foi consultada durante a auditoria.

Estratégia proposta, ainda não instalada:

1. Exportação diária consistente de schemas, funções, políticas, dados e roles necessárias; configuração sensível e senhas guardadas separadamente em cofre.
2. Cópia inicial do Storage e incrementais por caminho/tamanho/atualização; manifesto com hashes, inclusive objetos removidos sob retenção recuperável. Considerar o egress dessa primeira cópia.
3. Criptografia antes da transferência e chave fora da conta/servidor que guarda a cópia; destino independente, com acesso mínimo e versionamento.
4. Retenção inicial: sete diários, quatro semanais e seis mensais. Ajustar à política de retenção e custo, sem apagar originais automaticamente.
5. Alerta de falha e idade da última cópia; relatório de integridade. Teste mensal de restauração em ambiente isolado e registro de tempo/resultado.
6. RPO proposto de 24 h e RTO a estabelecer após o primeiro ensaio; não são garantias de recuperação atuais.

Destino, chave e credenciais de backup ainda precisam ser definidos. Não foram extraídos dados de clientes para um destino novo. A única alteração de banco foi uma função reversível cuja definição anterior está versionada no rollback.

## 16. Validação e medições

| Verificação | Antes | Depois |
|---|---:|---:|
| Leituras de organization_notification_reads no plano do bootstrap | 3 ramos | 1 ramo materializado |
| Blocos compartilhados, comparação SQL pareada | 36.197 | 32.607 |
| Tempos das três consultas de referência | 598,796 / 490,328 / 503,998 ms | 490,831 / 460,575 / 445,626 ms |
| Conteúdo/contagem sob identidades/empresas | referência | 16 casos equivalentes |
| 100 chamadas concorrentes com descritor autorizado da foto | caminho anterior exigia metadados | 0 consultas de metadados, 1 assinatura |
| Segurança dos advisors CRM | avisos acima | mesmos avisos |

As comparações SQL são leituras pequenas em produção, sem carga agressiva. A mediana pareada caiu de 503,998 para 460,575 ms (aproximadamente 8,6%) e os blocos, cerca de 9,9%. Isso não é ganho de tempo de página nem economia faturada de egress. A primeira chamada completa após a migração mediu 521,743 ms; há variabilidade e a redução de latência real deve ser acompanhada. O resultado determinístico é a eliminação de leituras repetidas.

O teste de equivalência normaliza a ordenação de empates: o código anterior não tinha desempate por ID, e notificações com o mesmo timestamp podiam trocar de posição ou ocupar o limite 50. A nova função usa `created_at desc, id desc`, mantendo conteúdo, regras de visibilidade e contagem conforme a referência com esse mesmo desempate.

Passaram **486 testes automatizados** (45 de desempenho, 202 de regressões principais, 6 de importação de contatos, 10 de integridade da gestão, 34 de financeiro e 189 de SAC). Os dois builds de produção, site e CRM, passaram. Permanecem os avisos conhecidos de chunks grandes. Os testes incluem: regressões/desempenho, financeiro, SAC, deduplicação, metadados incompletos, empresas diferentes, expiração e durações distintas. Os testes SQL são somente leitura, com contexto autenticado em transação e rollback. O teste de plano falhou antes com três leituras e passou depois com uma.

O navegador do CRM abriu a tela de login, sem sessão disponível. Não foram realizados login, CRUD, upload/download autenticado, troca real de empresa, teste mobile físico ou fluxo operacional completo. Builds e testes de domínio não substituem essas verificações.

## 17. Arquivos e migração

Arquivos de aplicação alterados:

- `src/shared/infrastructure/media.repository.ts`
- `src/shared/application/useMediaUrl.ts`
- `src/infrastructure/query/storage-preview-cache.ts`
- `src/features/orders/domain/order-image.ts`
- `src/features/orders/application/useOrderDetails.ts`
- `src/features/orders/application/useOrderImages.ts`
- `src/features/orders/application/useOrderResolution.ts`
- `src/features/orders/presentation/OrderImages.tsx`
- `src/features/orders/presentation/OrderChecklistDocumentsSection.tsx`
- `src/features/orders/presentation/OrderDetailsPage.tsx`

Testes: `src/infrastructure/query/media-preview.test.mjs`, `storage-preview-cache.test.mjs`, `supabase/tests/notification-read-plan.sql`, `supabase/tests/notification-read-snapshot-equivalence.sql`.

Migração aplicada somente no CRM: `20261030151204_optimize_notification_read_snapshot.sql`. Rollback: `docs/audits/2026-10-30-notification-rollback.sql`. Não houve alteração de tabelas, índices, grants ou RLS. Nenhuma migração foi aplicada na fila.

## 18. Prioridades remanescentes

| Prioridade | Intervenção | Motivo/limite |
|---|---|---|
| Alta | Instalar backup externo com restauração verificada | Não existe recuperação completa comprovada nesta auditoria |
| Alta | Conferir agente de impressão instalado | 42.570 chamadas/dia; versão local desconhecida |
| Alta | Medir callbacks/mensagens/credenciais SAC por fluxo | Alto volume real; preservar filas, sessões e entrega |
| Alta | Investigar os dois timeouts com contexto de evento | Não presumir que média histórica identifica a causa atual |
| Média | Completar testes autenticados no navegador | Sessão não disponível nesta execução |
| Média | Revisar funções privilegiadas e bucket outbox | Avaliar contrato público e proteção real individualmente |
| Média | Miniaturas históricas e inventário completo de referências | Necessário antes de limpeza ou recompressão |
| Média | Métricas de CPU/memória/VPS e egress diário | Dados indisponíveis nesta sessão |

Nenhuma dessas pendências é apresentada como resolvida.

## 19. Supabase Free ou Pro

As amostras de tamanho do banco e Storage não demonstram necessidade de trocar o PostgreSQL ou migrar para infraestrutura própria. Falta medir CPU, picos, crescimento e o egress faturado atualizado para afirmar que o Free atende ao uso operacional futuro.

Há justificativa técnica para avaliar Pro pela necessidade de backups automáticos e margem operacional, especialmente com dados empresariais críticos e o consumo informado de 3,76/5 GB. Isso não resolve sozinho backup de fotos/documentos. Se permanecer no Free, uma cópia externa restaurável deve ser prioridade. Não houve troca de plano ou contratação.

## 20. Publicação e acompanhamento

O status final do commit e do workflow é registrado na entrega da sessão. O banco recebeu a migração reversível acima. A publicação do frontend usa o workflow existente somente após as verificações.

Para acompanhamento: comparar períodos equivalentes nos logs e no dashboard, separando número de usuários/ações; contar chamadas de `media` e assinatura por abertura de OS/impressão; acompanhar erros e tempo de notificações. A redução de custo mensal precisa de observação posterior. Não foi criada automação recorrente nem coleta permanente adicional de dados pessoais.
