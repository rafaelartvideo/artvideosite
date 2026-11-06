# Union World — backup manual criptografado (30/10/2026)

**Estado: preparado, não ativado.** Nenhum dado de cliente foi exportado, nenhum destino externo criado, nenhum agendamento ou serviço pago contratado. Não existe evidência de backup recuperável produzida por este trabalho. O objetivo é tornar a ativação concreta e auditável quando o responsável fornecer os acessos e o destino.

## Descoberta e bloqueios

A busca no repositório encontrou referências históricas a backup manual, mas nenhuma rotina dedicada de dump PostgreSQL + arquivos Storage. `docs/sac-digital-optimization-ledger.md` registra projeto `wmjmtcjpunmzvonlkjcu`, PostgreSQL 17.6 e plano Free; esse registro é histórico, não confirmação atual de plano/versão. O cliente público e as funções usam nomes `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`; seus valores não foram coletados. Essas chaves não substituem senha PostgreSQL nem credenciais S3.

Entradas mínimas para ativar:

| Entrada | Onde/configuração | Situação |
| --- | --- | --- |
| Destino aprovado, fora do servidor/projeto de origem | `BACKUP_ROOT`, diretório privado já montado, espaço para dump completo e versões de Storage | Não fornecido |
| Chave pública de criptografia verificada | `BACKUP_RECIPIENT`, fingerprint completo; chave pública importada no GPG | Não fornecida |
| Custódia e recuperação da chave privada | Responsável + cópia offline protegida + teste de abertura; privada fora do executor de backup | Não definidos |
| Conexão PostgreSQL e senha | `PGSERVICE`, `PGSERVICEFILE`, `PGPASSFILE`, CA em `PGSSLROOTCERT`; direto ou pooler de sessão | Não fornecidas; MCP não fornece segredo de conexão |
| Acesso de leitura a todos os buckets | `BACKUP_STORAGE_SOURCE` + `RCLONE_CONFIG`, credenciais S3/endpoint/região confirmados | Não fornecido |
| Máquina operadora e utilitários gratuitos | Python 3, GnuPG, clientes PostgreSQL 17 compatíveis (`pg_dump`, `pg_dumpall`, `pg_restore`), rclone | Aqui só Python e GPG encontrados; demais ausentes |
| Janela tranquila e alvo de recuperação isolado | Responsável, horário, inventário de tabelas/buckets e ambiente de teste | Não definidos |

Escolha mínima sem novo contrato: máquina confiável já existente com disco externo criptografado guardado fora do local, ou volume remoto já contratado e aprovado montado de forma segura. Uma pasta no próprio servidor de produção não constitui cópia externa. Não configurar bucket pago, VPS, cron ou tarefa automática sem esse destino e a custódia da chave.

## Conteúdo e limites

`tools/backup/backup.py` produz:

- `runs/<id>/database.dump.gpg`: um único `pg_dump --format=custom`, contendo esquema e dados no mesmo snapshot PostgreSQL. Preserva DDL, RLS, políticas, índices, triggers, funções, grants e metadados Storage que forem exportáveis. Não usa filtros para ocultar erro de permissão.
- `roles.sql.gpg`: definições globais de roles via `pg_dumpall --roles-only --no-role-passwords`. Senhas de roles precisam ser redefinidas na recuperação. Esse catálogo é capturado separadamente e pode mudar fora do snapshot do dump.
- `objects/<fingerprint>/<uuid>.gpg`: bytes de arquivos Storage criptografados individualmente, somente leitura na origem. Novas versões recebem novos blobs; versões antigas e objetos apagados na origem permanecem na cópia.
- `manifest.json.gpg`: caminhos originais, metadados, hashes SHA-256 de texto claro, tamanhos, referências dos blobs e hashes do ciphertext. Nomes de clientes/arquivos ficam criptografados.
- `READY.json`: somente hashes do ciphertext, contagens e versão do formato; gravado após conclusão e igualdade das listagens Storage anterior/posterior. Arquivos `.json` no pool são índices privados com hashes e referências opacas, sem nomes originais; não são suficientes para recuperar sem os manifests.

Reuso incremental exige hash de conteúdo disponibilizado pelo rclone. Sem hash, o objeto é baixado novamente, mesmo com tamanho/data iguais. Todo blob reutilizado tem SHA-256 do ciphertext conferido. Rotação de destinatário cria outro pool; conservar as chaves antigas enquanto seus manifests forem retidos.

O snapshot PostgreSQL é consistente. A listagem Storage estável antes/depois detecta alterações observáveis, mas não cria transação entre banco e Storage nem garante detectar alterações transitórias. Para ponto coerente entre registros e arquivos, pausar uploads/alterações na janela aprovada ou reconciliar diferenças em um segundo ciclo. Qualquer alteração observada aborta a conclusão. O dump e as cópias consomem egress; o primeiro ciclo copia todo Storage. Não há limite de custo embutido: medir bytes previstos/egress disponível antes de executar, e não iniciar exportação paga sem autorização.

A rotina não é backup físico/PITR nem exporta configurações do Dashboard, segredos de Edge Functions, OAuth/SMTP, senhas de roles, configuração DNS, bridge WhatsApp/VPS, credenciais WuzAPI ou arquivos fora do Storage. O código versionado permanece no git. Configuração e segredos de runtime exigem inventário e cópia criptografada separada em cofre aprovado. Se houver Supabase Vault/colunas criptografadas, seguir a recuperação da chave raiz descrita na documentação oficial; não tentar obter chaves via leitura de arquivos do servidor/SQL. Sem esses itens, não declarar recuperação integral da plataforma.

## Configuração e execução manual

1. Em máquina confiável, revisar e fixar versões dos utilitários. Conferir `pg_dump --help`, `pg_dumpall --help`, `pg_restore --help`, `rclone lsjson --help`, `rclone cat --help` e `gpg --help`. Esta sessão não pôde conferir ajuda de ferramentas ausentes; flags foram cotejadas com documentação oficial. Usar cliente da versão principal 17 para origem 17; rever se a origem mudou.
2. Preparar destino aprovado com permissão 0700. Confirmar montagem, capacidade, espaço livre e acesso independente da conta Supabase. Manter outra cópia verificada dos arquivos criptografados em mídia/local independente; hash local não prova cópia externa.
3. Gerar/importar chave pública no GPG; confirmar fingerprint por canal independente. Guardar privada protegida fora da máquina executora e testar em máquina de recuperação. Nunca colocar chave privada/senha no repositório ou chat.
4. Copiar os exemplos de `tools/backup/` para diretório privado fora do repositório. Preencher conexão, CA e credenciais pelo mecanismo seguro local. Arquivos `PGSERVICEFILE`, `PGPASSFILE` e `RCLONE_CONFIG` exigem 0600 ou mais restrito. O processo usa TLS `verify-full`, senha por libpq, argumentos sem segredo e nenhum shell intermediário. Não usar a chave de serviço do frontend.
5. Validar que o S3 remoto aponta à raiz do projeto correto e enxerga **todos** os buckets, inclusive privados. Não usar filtros globais rclone, credenciais restritas a apenas parte dos buckets, nem listar só um bucket. Revisar config rclone e ambiente `RCLONE_*` para filtros/overrides herdados. Comparar inventário de buckets com Dashboard antes do primeiro ciclo; buckets vazios/configurações estão no catálogo do banco.
6. Carregar os nomes do exemplo com `set -a; source /secure/union-backup/config.env; set +a` no shell local. Não executar shell com rastreamento de comandos/segredos. Executar:

```bash
python3 tools/backup/backup.py --dry-run
python3 tools/backup/backup.py --check
# Só depois de revisar destino, chave, inventário, capacidade e janela:
python3 tools/backup/backup.py --execute
```

`--dry-run` não conecta, não lê credenciais nem escreve arquivos. `--check` verifica apenas configuração local, dependências, permissões e presença da chave pública; não autentica na origem nem comprova completude. `--execute` lê a origem e escreve somente no destino aprovado. Erro/aviso do produtor invalida o artefato; não aceitar run sem `READY.json`. Reexecuções têm IDs únicos, lock impede concorrência. Os arquivos `.partial` do stream são removidos; blobs órfãos de tentativas falhas podem permanecer e não são podados.

A primeira execução real ainda precisa demonstrar permissão de leitura de todos os schemas/tabelas da instância gerenciada. Se `pg_dump` falhar em objeto gerenciado, revisar com DBA a estratégia oficial Supabase e uma lista explícita de cobertura; **não** adicionar exclusões silenciosas nem chamar captura parcial de completa. Um arquivo custom nativo não é script pronto para replay integral em projeto Supabase já inicializado; schemas gerenciados, extensões e roles exigem restauração seletiva revisada.

## Verificação de integridade e ensaio de recuperação

Antes de confiar no backup, copiar o conjunto completo `runs/` + `objects/` ao ambiente de recuperação isolado. Conservar manifesto/READY e todos os blobs referenciados. Uma única pasta `runs/<id>` não contém os arquivos Storage.

```bash
# Usa chave privada disponível apenas no ambiente de recuperação.
python3 tools/backup/verify.py --root /mnt/recovery-copy --run ID_DO_RUN --deep
# Lista o catálogo do arquivo sem gravar SQL/dados em texto claro.
# Bash pipefail é necessário para detectar falha em qualquer lado do pipe.
set -o pipefail
gpg --decrypt /mnt/recovery-copy/runs/ID_DO_RUN/database.dump.gpg | pg_restore --list > /dev/null
```

O verificador compara SHA-256 de todos os ciphertexts e, com `--deep`, decripta banco/roles/objetos por stream e compara tamanho e SHA-256 de cada texto claro. Sem `--deep`, só o manifesto é decriptado. Os checksums detectam corrupção acidental; não substituem isolamento de acesso/imutabilidade do destino. Sucesso de hash/decriptação/listagem **não** é teste de restauração.

Procedimento de ensaio, nunca na produção:

1. Registrar run, horário, responsável, tamanho, contagem por tabela/bucket e tempo inicial. Preparar Supabase local descartável ou alvo de teste já autorizado, compatível com PostgreSQL/extensões de origem. Bloquear envio de e-mails/WhatsApp/webhooks/cron para serviços reais. Nenhum novo projeto pago deve ser criado automaticamente.
2. Inspecionar o catálogo `pg_restore --list` e DDL em ambiente privado; identificar custom roles, extensões, schemas gerenciados, publicações, auth, Storage e histórico de migrations. Revisar `roles.sql.gpg`; recriar somente custom roles necessárias. Não reproduzir indiscriminadamente roles internas/superusuários.
3. Criar alvo vazio/isolado com as dependências necessárias. Elaborar lista de itens a restaurar compatível com Supabase gerenciado; em laboratório totalmente vazio e compatível, a base é `gpg --decrypt database.dump.gpg | pg_restore --exit-on-error --single-transaction --dbname='service=union_restore_test sslmode=verify-full'`. `union_restore_test` deve apontar exclusivamente ao alvo descartável. Não usar `--clean`, `DROP` nem credenciais de produção. Falha é bloqueio real; não ignorar erros para declarar sucesso. Aplicar procedimento oficial de auth/Vault/migrations quando pertinente.
4. Para cada entrada do manifesto decriptado, localizar `objects/<recipient>/<blob>`, conferir hashes e reconstruir bucket/caminho. Recriar configurações de bucket a partir do inventário; enviar **bytes** pelos endpoints/API S3 de Storage do alvo de teste. Restaurar somente linhas `storage.objects` não restaura o arquivo; não inserir metadados manualmente para fingir upload. Não reutilizar credenciais da origem no destino. Definir ordenação/limpeza de metadados conflitantes em plano DBA para o alvo isolado antes dos uploads.
5. Comparar contagens, PK/FK, sequências, funções/triggers, grants, RLS com dois tenants, auth/login, listagem de pedidos/SAC e amostra de download autenticado de cada bucket, incluindo arquivo privado e versão histórica. Confirmar byte SHA-256 dos arquivos reconstruídos. Documentar itens ausentes/conflitos de schema e corrigi-los antes de considerar backup recuperável.
6. Registrar duração real de captura/transferência/restore, erro zero, contagens reconciliadas, evidência de isolamento e responsável. Definir RPO/RTO apenas depois dessa medida; não prometer RPO diário enquanto a execução é manual e não agendada.

## Retenção proposta (não aplicada)

Manter **7 diários, 4 semanais e 6 mensais**, sujeitos a capacidade e decisão do responsável. Não há poda automática. Como os manifests compartilham blobs incrementais, apagar por idade de blob destrói snapshots recentes. Qualquer futura poda deve marcar todas as referências de todos os manifests retidos, manter todas as chaves necessárias, simular a exclusão, verificar recuperação/cópia externa e obter revisão do responsável antes de remover arquivos. Falha de captura não altera backups antigos.

## Validação realizada nesta sessão

- `python3 -m unittest discover -s tools/backup -p 'test_*.py' -v`: 8 testes, 7 passaram, 1 pulado. Cobrem dry-run sem escrita, falha de configuração sem vazamento, paths/duplicatas inseguros, reuso apenas com hash, falha do produtor sem publicar parcial, captura/roles/reuso/tamper e verificação de corrupção.
- Binários externos são simulados nos testes de orquestração; isso não valida conectividade real PostgreSQL/S3 nem criptografia real.
- Ensaio GPG real de ida/volta incluído, mas **não executável neste ambiente**: `gpg-agent` não pode criar socket Unix (`Operation not permitted`). Deve passar na máquina operadora/recuperação.
- `--dry-run` retornou plano e nomes das oito configurações ausentes, sem exportação; `--check` falhou fechado pela falta dessas entradas. Nenhum teste de restauração de dados reais foi executado.

## Fontes oficiais consultadas em 30/10/2026

- https://supabase.com/docs/guides/platform/backups — backup PostgreSQL não inclui os bytes de Storage; plano Free deve manter exports externos.
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore — roles/schema/data, conexões de sessão e considerações de migração/auth/Vault.
- https://supabase.com/docs/guides/storage/s3/compatibility — S3, listagens e ausência de versionamento nativo de objetos.
- https://www.postgresql.org/docs/17/app-pgdump.html — snapshot consistente, arquivo custom, limites de globals.
- https://www.postgresql.org/docs/17/app-pg-dumpall.html — roles sem hashes de senha.
- https://rclone.org/commands/rclone_lsjson/ e https://rclone.org/commands/rclone_cat/ — listagem recursiva/hashes e stream de conteúdo.

A tentativa de leitura de `https://supabase.com/changelog.md` foi bloqueada pelo leitor por content-type markdown; não foi possível completar essa verificação do changelog nesta sessão. Nenhuma mudança Supabase foi aplicada por esta preparação.
