# Union World / SAC Digital — otimização e reversão (13/10/2026)

Projeto Supabase: `wmjmtcjpunmzvonlkjcu`. Repositório: `rafaelartvideo/artvideosite`. Ambiente principal de produção. **Não remover as tabelas privadas de recuperação sem autorização explícita.**

## Contexto e objetivo
- Conter o crescimento do PostgreSQL Free (limite reportado: 500 MB) sem perder conversas, clientes, fotografias, protocolos ou auditoria.
- Comparar benefícios reais com custos de Storage, requisições e manutenção antes de manter ou remover a sincronização do SAC Digital no CRM.
- Manter tudo reversível.
- Medidas de `pg_database_size` são dinâmicas e **não são redução física imediata** depois de UPDATE/VACUUM padrão.

## Diagnóstico inicial (13/10)
- Database PostgreSQL: cerca de 171,2 MB na primeira inspeção (painel anteriormente: 177,8 MB).
- SAC Digital (19 tabelas): aproximadamente 101 MB; contatos aproximadamente 69,3 MB; mensagens 17,7 MB; protocolos 11,2 MB.
- `sac_digital_contacts`: 10.433 contatos então, 8.674 avatares embutidos no campo, 1.279 com foto somente nos metadados.
- Aproximadamente 8.676 avatares eram duplicados entre `avatar_url` e `raw_metadata.avatar`; após remoção sem perda, zero duplicatas confirmadas.
- Sincronização de mensagens tinha UPDATE redundante mesmo quando conteúdo não mudava; app/Edge Function melhorada e publicada na versão 81.

## Mudanças concluídas
1. **13/10 — Edge `sac-digital-api` v81**: evitar atualizações idênticas em mensagens, horários, status e contatos. Git commit `f06c3bbf67e85cd438912525ff059ee095ba5c14`.
2. **13/10 — guarda de duplicação**: trigger `sac_contact_dedupe_avatar_before_write` e função `private.sac_contact_dedupe_avatar`. Migr. `20261013115041`; commit `7eb4c4190561cd6313b60df40fb3cef115e22834`. Backfill removeu 8.675 cópias idênticas em `raw_metadata`, preservando `avatar_url`.
3. **13/10 — medição diária**: `private.union_database_capacity_samples` e tarefa `union-database-capacity-daily`, horário UTC 03:30. Migr. `20261013115620`, commit `7da53b8717abffaca5bbf38b1898f3d0c0a03c1d`. Os dados são catálogos de tamanho total e módulos, sem fotos individuais.
4. **13/10 — avatar padrão compartilhado**: foi identificada visualmente a imagem JPEG 85×85 do círculo cinza, original data URI de 1742 caracteres e checksum MD5 `14d84d86f568f2d6762a217923bf48f6`. Foi criada a imagem SVG pública sem dados pessoais `public-assets/sac-digital/default-avatar-v1.svg` (185 bytes). URL:
   `https://wmjmtcjpunmzvonlkjcu.supabase.co/storage/v1/object/public/public-assets/sac-digital/default-avatar-v1.svg`
5. **13/10 — recuperação**: uma única cópia do JPEG original em `private.sac_default_avatar_source`, e inventário de IDs e origem dos contatos em `private.sac_default_avatar_rollback` (6.687 entradas, 6.082 com imagem em avatar_url e 605 somente nos metadados). Migr. `20261013121815`, commit `cff8c8ccd61fbd98d5d3a8b2c3dced795ca7d1ff`.
6. **13/10 — substituição em lotes**: 6.687 contatos passaram a usar URL compartilhada. Nenhuma imagem personalizada foi modificada. O trigger foi atualizado para normalizar futuros avatares idênticos pelo checksum. Migr. `20261013122156`, commit `73075c0089f628876a4d0bae7cc8a811b329db19`.
7. UI reconhece também o recurso estático local `/assets/crm/sac-default-avatar.svg`: commits `27e1d39e6c0941e9f0a079bfa406f46404ec2fd4`, `85a0740f51a80a8732795cfa316217bf37a34c40`, `159cae67c1e67e0d23cbd9b7ea725aa13ab7a333`. Essa URL local é alternativa; os registros atuais apontam ao Storage Supabase.
8. Edge one-off `sac-avatar-maintenance` (version 1, authenticated by existing private SAC worker token) usada só para garantir o objeto público padrão. Código `supabase/functions/sac-avatar-maintenance/index.ts`, commit `f88d0a199628e0963f57001e676da6d4115de8bf`. Caso não seja mais necessária, desativar/excluir após confirmar ausência de dependência.
9. Após o backfill, `VACUUM (ANALYZE) public.sac_digital_contacts` sem erro. **Não** foi executado `VACUUM FULL` (bloqueia a tabela).

## Medidas após o avatar padrão
- Contatos: 10.533 na verificação (dados podem crescer).
- Avatares compartilhados: 6.687.
- Imagens personalizadas Base64 restantes: **3.366 no campo avatar_url** e **zero apenas nos metadados**, 3.366 referências para 3.364 imagens distintas. Em 13/10, 774 imagens foram promovidas do metadata para avatar_url sem modificar os bytes da foto; inventário privado `private.sac_custom_avatar_promotion_rollback` guarda os 774 fingerprints MD5 para reversão. Migração `20261013123018`, commit `86ea8d45479ef160fca939f28db8b0fb707bdf98`.
- Payload Base64 restante das imagens personalizadas: 10.623.560 bytes (~10,62 MB decimal, ~10,13 MiB). Estimativa de arquivos JPG decodificados: ~8 MB. Logo, migrar todas para o Storage **não** é automaticamente vantajoso: milhares de objetos implicam metadados, assinaturas para acesso privado, tráfego e mais manutenção. **Não foram migradas**.
- Última leitura do PostgreSQL após VACUUM: `pg_database_size` 182.865.043 bytes (~182,9 MB); tabela `sac_digital_contacts` 78.954.496 bytes. `n_dead_tup=0` para contatos após autovacuum manual. O banco não encolheu fisicamente com VACUUM normal. Os bytes de conteúdo nos campos de avatar/metadados foram reduzidos, e o espaço liberado pode ser reutilizado; redução do número exibido no painel pode exigir reescrita da relação, com janela de manutenção.
- Quota Free: 500 MB nominal, uso físico na última leitura ~36,5%, espaço ~317,5 MB. O painel da Supabase é atualizado periodicamente.

## Condições para a próxima decisão
1. Medir crescimento diário durante ao menos 7 dias e comparar imagens, contatos, mensagens e protocolos; distinguir carga de importação inicial de crescimento operacional.
2. Comparar `SELECT * FROM private.union_database_capacity_samples ORDER BY sample_date DESC` (acesso administrativo) com métrica `Database Size` no dashboard.
3. Avaliar se armazenar localmente no CRM o histórico completo SAC tem benefício funcional (Realtime, OS, pesquisa) que compense manutenção e espaço. A integração não deve ser removida antes da decisão.
4. Se a migração de fotos personalizadas para Storage for aprovada, usar bucket **privado**, URL assinada temporária e RLS por empresa, nunca divulgar fotos pessoais em bucket público.
5. A compactação física `VACUUM FULL` ou `pg_repack` requer planejamento técnico/backup/janela segura, porque a tabela é usada em produção.

## Reversão
- Script SQL de **reversão manual** do avatar padrão: `supabase/scripts/manual_rollback_sac_default_avatars.sql` (commit `083342be5eb326589158673370c8f801baaf16ca`). Ele restaura o JPEG original preservado uma vez, restabelece a localização de cada imagem e deixa imagens personalizadas intocadas.
- Script de reversão da **promoção das fotos personalizadas**: `supabase/scripts/manual_rollback_sac_custom_avatar_promotion.sql` (commit `9d878d163e88b3e3e71f684750909887fd0071d6`). Restaura somente fotos que não mudaram depois da promoção.
- Não apagar nem limpar `private.sac_default_avatar_source`, `private.sac_default_avatar_rollback` nem `private.sac_custom_avatar_promotion_rollback` antes de uma possível reversão. O conteúdo dessas tabelas é necessário para restauração.
- Mudanças de código podem ser revertidas pelos commits listados, após checar conflitos com mudanças posteriores no main.
- Se o usuário pedir para remover toda a otimização, revisar **separadamente**: normalizador/manifesto, Edge de manutenção, URL compartilhada, ajustes de UI, medição diária, trigger de duplicação e algoritmo anti-UPDATE. O algoritmo anti-UPDATE pode ser mantido sem SAC se ajudar performance; deletar não é requisito.
- **Não** remover os dados históricos do SAC Digital sem instrução explícita, avaliação legal e cópia de segurança. Não confundir otimização dos avatares com exclusão do SAC.
- O Storage público da imagem padrão só deve ser apagado depois de não haver registros/referências à sua URL.

## Segurança
- Fotos personalizadas não foram enviadas a buckets públicos.
- Nenhuma permissão de leitura de contatos foi ampliada.
- A imagem pública compartilhada é apenas um círculo neutro, sem informações pessoais.
- Os arquivos reversíveis não contêm credenciais ou senhas.

Atualizar este registro a cada etapa futura e antes de confirmar a decisão final.

## Análise de custo-benefício das 3.364 imagens personalizadas
- Conteúdo atual Base64: ~10,62 MB (aproximadamente 8 MB decodificados).
- `storage.objects` no mesmo projeto: 393 linhas, 1.228.800 bytes físicos incluindo índices e espaço auxiliar (~3,13 KB por linha como média grosseira). Extrapolar para 3.364 novos objetos sugere até ~10,5 MB adicionais de metadados/indexação, mas **não** é previsão exata porque existem custos fixos, TOAST e bloat.
- Migrar todas as imagens a bucket privado exigiria RLS específica por empresa e criação/renovação de URLs assinadas no aplicativo. O ganho líquido de Database Size é incerto e poderia ser pequeno ou até negativo.
- Recomendação operacional nesta data: **manter fotos personalizadas inline temporariamente**, corrigir acesso nas telas (774 promovidas), manter avatar padrão compartilhado, e medir crescimento real por 7 dias. Não publicar fotos de pessoas em bucket público para economizar DB.
- Economia bruta estimada da troca de 6.687 cópias do avatar comum por URL curta: aproximadamente 10–11 MB em conteúdo lógico dos campos, mas sem queda física imediata no PostgreSQL.


## 13/10/2026 — ciclo de otimização de reconciliação e consultas (etapa seguinte)
- Auditoria de `pg_stat_statements` no projeto Union: `get_sac_digital_unread_counts` tinha ~8.900 execuções acumuladas desde último reset de estatísticas (24/07) e média histórica ~2.021 ms; leitura da caixa de protocolos ~7.877 execuções, média histórica ~1.571 ms. **São valores históricos, não taxas diárias.**
- `sac_digital_messages` acumulava ~258.666 atualizações desde o reset, principalmente anteriores ao fix v81 que evita UPDATES idênticos; não interpretar como novas gravações por dia.
- Foi executado `VACUUM (ANALYZE)` não bloqueante em `sac_digital_messages`, `sac_digital_protocols` e `sac_digital_jobs`, sem excluir dados nem `VACUUM FULL`.
- No plano de execução representativo de contagem de não lidas, após VACUUM, a duração caiu de 2.438,6 ms para 199,5 ms, aproximadamente -92%; `Index Only Scan` deixou de exigir 7.496 leituras da heap (`Heap Fetches=0`). Resultado de teste único, não promessa de ganho sustentado.
- `sac_digital_protocols` participa da publicação Realtime. O antigo `private.enqueue_sac_digital_reconciliation` rodava a cada 5 minutos, verificando 5 protocolos e executando `UPDATE sac_digital_protocols SET reconciliation_checked_at=now()` mesmo sem mudanças reais do protocolo. Isso podia provocar refresh integral da caixa no frontend.
- **Migração aplicada** `20261013125921_sac_reconciliation_private_checkpoints` (commit `84f265eb2e1bc4d7f67a6509793046a33a04815e`): timestamps de reconciliação agora são mantidos em `private.sac_digital_reconciliation_checks`, com 517 checkpoints existentes copiados na implantação. A mesma rotina de 5 protocolos/5 minutos segue habilitada. O campo original `public.sac_digital_protocols.reconciliation_checked_at` permanece no banco como referência de reversão, mas não é mais atualizado por essa rotina. A execução manual da nova função foi testada com êxito: os checkpoints privados avançaram.
- **Migração aplicada** `20261013130013_sac_hot_tables_autovacuum_tuning` (commit `2729b9054be94facc5ba81c6d335fed969db45c8`): autovacuum e autoanalyze configurados com fator 0,05 e limiar 100 para `sac_digital_messages`, `sac_digital_protocols` e `sac_digital_jobs`. Opções verificadas via `pg_class.reloptions`. Limita excesso de linhas mortas com manutenção automatizada mais frequente; deve-se observar eventual custo de manutenção.
- **Scripts de reversão manual, NÃO executados**: `supabase/scripts/manual_rollback_sac_reconciliation_private_checkpoints.sql` (commit `c44d9fa731b4f93c9eca5dbca786426a9dca6ea5`) e `supabase/scripts/manual_rollback_sac_hot_tables_autovacuum_tuning.sql` (commit `fa356922875eb4633f0aa8d79a59eb4e9389cbd6`). Não remover checkpoints privados antes de restaurar os timestamps ou decidir abandoná-los.
- A UI existente usa 517 protocolos ativos + 400 finalizados no carregamento da caixa. Nessas referências os avatares representam aproximadamente 716.022 + 297.424 = **1.013.446 bytes (~1 MB) somente de strings de foto** por consulta completa. Essa estimativa demonstra que deixar de disparar refresh para mudanças técnicas pode poupar tráfego relevante, mas não equivale a consumo de banda medido em produção.
- Última amostra pontual `pg_database_size`: 183.438.483 bytes (~183,4 MB) em 13/10, após várias migrações simultâneas do catálogo empresarial. Diferenças durante a implantação **não** são crescimento diário nem economia líquida confiável. Os dados reais de tendência virão das amostras diárias.
- Há aproximadamente 517 protocolos classificados ativos (`status <> finished`, `closed_at IS NULL`), dos quais muitos têm pouca atividade recente. **Não** alterar status nem apagar protocolos com base apenas na idade; a SAC Digital é fonte de verdade para estado operacional.
- **Decisão em aberto**: manter/migrar/remover espelhamento completo SAC no CRM. Medir 7 dias de crescimento e frequência de consultas após estas alterações. Preservar conversas e fotos, não executar compactação bloqueante sem backup/janela.
