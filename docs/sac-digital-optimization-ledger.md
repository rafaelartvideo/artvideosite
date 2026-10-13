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
- Imagens Base64 restantes: 2.592 no campo avatar_url e 774 somente em metadados, 3.366 referências para 3.364 imagens distintas.
- Payload Base64 restante das imagens personalizadas: 10.623.560 bytes (~10,62 MB decimal, ~10,13 MiB). Estimativa de arquivos JPG decodificados: ~8 MB. Logo, migrar todas para o Storage **não** é automaticamente vantajoso: milhares de objetos implicam metadados, assinaturas para acesso privado, tráfego e mais manutenção. **Não foram migradas**.
- Última leitura do PostgreSQL após VACUUM: `pg_database_size` 182.488.211 bytes (~182,5 MB); tabela `sac_digital_contacts` 78.954.496 bytes. O banco não encolheu fisicamente com VACUUM normal. Os bytes de conteúdo nos campos de avatar/metadados foram reduzidos, e o espaço liberado pode ser reutilizado; redução do número exibido no painel pode exigir reescrita da relação, com janela de manutenção.
- Quota Free: 500 MB nominal, uso físico na última leitura ~36,5%, espaço ~317,5 MB. O painel da Supabase é atualizado periodicamente.

## Condições para a próxima decisão
1. Medir crescimento diário durante ao menos 7 dias e comparar imagens, contatos, mensagens e protocolos; distinguir carga de importação inicial de crescimento operacional.
2. Comparar `SELECT * FROM private.union_database_capacity_samples ORDER BY sample_date DESC` (acesso administrativo) com métrica `Database Size` no dashboard.
3. Avaliar se armazenar localmente no CRM o histórico completo SAC tem benefício funcional (Realtime, OS, pesquisa) que compense manutenção e espaço. A integração não deve ser removida antes da decisão.
4. Se a migração de fotos personalizadas para Storage for aprovada, usar bucket **privado**, URL assinada temporária e RLS por empresa, nunca divulgar fotos pessoais em bucket público.
5. A compactação física `VACUUM FULL` ou `pg_repack` requer planejamento técnico/backup/janela segura, porque a tabela é usada em produção.

## Reversão
- Script SQL de **reversão manual** do avatar padrão: `supabase/scripts/manual_rollback_sac_default_avatars.sql` (commit `083342be5eb326589158673370c8f801baaf16ca`). Ele restaura o JPEG original preservado uma vez, restabelece a localização de cada imagem e deixa imagens personalizadas intocadas.
- Não apagar nem limpar `private.sac_default_avatar_source` ou `private.sac_default_avatar_rollback` antes de uma possível reversão. O conteúdo dessas tabelas é necessário para restauração.
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
