# Union World — homologação isolada e reconstrução de migrations

**Status: preparação.** Nenhum Supabase novo, DNS, banco de teste ou publicação de staging foi criado. A produção permanece intacta.

## Inventário read-only, 20/11/2026

- Histórico remoto Supabase CRM: **811 migrations**.
- GitHub, pasta supabase/migrations: **934 arquivos SQL**.
- 855 arquivos com identificador de 14 dígitos; 79 com identificador legado de 8 dígitos.
- 19 identificadores de versão duplicados no repositório.
- 449 arquivos têm o mesmo nome lógico de uma migration remota, mas versão temporal diferente.
- 246 nomes do GitHub sem correspondência exata por nome na produção; 123 nomes remotos sem correspondência exata no GitHub.
- 241 arquivos de 14 dígitos com versão presente no remoto.

**As comparações por nome NÃO comprovam SQL equivalente, nem aplicação real.** Um arquivo sem histórico pode ter sido executado manualmente, alterado ou nunca aplicado. O inventário completo está em docs/homologacao/producao-migrations-2026-11-20.json.

Executar, sem conectar ao banco:

    node scripts/staging/audit-migrations.mjs docs/homologacao/producao-migrations-2026-11-20.json supabase/migrations

## Recuperação segura das migrations

1. Fazer primeiro um backup protegido de produção: roles, schema, histórico de migrations e, em arquivo criptografado, dados reais.
2. Exportar o **esquema atual** de produção para novo workspace de banco limpo. É uma nova linha de base (baseline), não reconstrução fictícia das etapas passadas.
3. Verificar funções, triggers, views, RLS, índices, grants, extensões, configurações personalizadas de Auth/Storage/Realtime, cron e jobs. Não confiar só em tabelas.
4. Reproduzir o baseline primeiro num Supabase local descartável, sem webhooks reais e sem cópia de contatos, senhas, mídias ou documentos.
5. Criar Supabase de homologação **separado** e só aplicar a linha de base depois de testar reconstrução e RLS em local.
6. A partir daqui, usar migrations com timestamp único, geradas pela CLI, com testes, aprovação e aplicação primeiro na homologação.
7. Manter os 934 arquivos antigos como arquivo histórico versionado. Não rodá-los sequencialmente no projeto de staging nem sobre a produção.
8. Não executar migration repair --all, db push --remote ou db reset --remote com a pasta atual. Um repair altera o histórico, mas NÃO aplica SQL; só deve ser executado para uma versão cuja equivalência foi individualmente comprovada.

O baseline captura o estado atual, mas não recria automaticamente o momento, a pessoa ou o SQL original de cada alteração antiga.

## Backup facilitado em Windows (PowerShell 7)

O script scripts/staging/backup-supabase.ps1 faz dumps apenas de leitura usando Supabase CLI v3.

Modo Schema: exporta schema, roles e histórico das migrations; gera ZIP e manifesto SHA-256. **ZIP local não é criptografado** e deve ser guardado em local restrito ou enviado para R2 crypt.

Modo Full: inclui data.sql e exige o remote rclone **crypt** exclusivo para CRM; envia para R2, baixa de volta, compara SHA-256 e somente então remove os arquivos temporários locais.

Configure UNION_PROD_DATABASE_URL diretamente no ambiente local seguro. Nunca a publique no GitHub ou em mensagens.

    pwsh -File scripts/staging/backup-supabase.ps1 -Mode Schema

Para Full, depois de criar e conferir o remote criptografado:

    $env:UNION_BACKUP_CRYPT_REMOTE = 'union-crm-crypt:'
    $env:UNION_BACKUP_CRYPT_CONFIRMED = 'SIM'
    pwsh -File scripts/staging/backup-supabase.ps1 -Mode Full -UploadEncrypted

O dump de banco não inclui bytes de todos os objetos do Supabase Storage nem substitui os backups de VPS, telefonia, R2, segredos e configuração de Edge Functions. Um backup só é confiável após **teste de restauração** em projeto descartável.

## Arquitetura proposta

| Parte | Produção | Homologação |
|---|---|---|
| CRM | unionworld.com.br | homolog.unionworld.com.br (a provisionar) |
| Frontend | build crm normal | build crm-staging |
| Banco/Auth/Storage | Supabase CRM existente | novo Supabase independente |
| Dados | clientes e OS reais | seeds fictícias |
| WhatsApp/WuzAPI | conta e bridge reais | simulador/conta isolada |
| PABX | tronco real | simulador sem PSTN |
| Pagamentos e email | provedores reais | sandbox/captura local |
| R2 | dados reais | bucket e credenciais exclusivos |
| Deploy | GitHub main / HostGator produção | workflow e FTPS separados |

Para staging, nunca usar service_role, chaves JWT, tokens WuzAPI, SMTP, SIP, pagamento ou URLs de callback da produção. Uma função de banco pode disparar webhook/cron ao restaurar o esquema: revisar e bloquear integrações ANTES do restore.

## Build isolado e validação

O build dedicado exige as variáveis publicáveis VITE_UNION_STAGING_PROJECT_ID e VITE_UNION_STAGING_PUBLIC_ANON_KEY. Não há fallback para o backend real.

    npx vite build --mode crm-staging --outDir dist-crm-staging
    node scripts/staging/verify-staging-bundle.mjs dist-crm-staging

O verificador reprova artefatos com a referência ao banco real. Isso ainda NÃO cobre todas as URLs absolutas e integrações externas; revisão funcional é obrigatória.

O workflow manual Build CRM Homologação gera apenas um artefato. Não publica no HostGator e requer secrets GitHub separados.

## Dependências para realmente criar e ativar a homologação

- Confirmar em qual organização Supabase criar (a conexão CRM mostra rafaelartvideo's Org; a Fila pertence a outra conta/organização).
- Consultar cotação de custo da organização escolhida e obter aprovação de qualquer valor não nulo.
- Criar projeto e aguardar ACTIVE_HEALTHY.
- Exportar o baseline real e testá-lo localmente; registrar objetos que precisarem de adaptação de segurança.
- Gerar seeds sintéticas; restaurar staging sem conexões de terceiros reais.
- Configurar subdomínio, pasta FTPS separada, segredos de staging e autenticação; testar isolamento completo.
- Só então ativar o fluxo de deploy de staging e testes de carga.

A main e os serviços atuais não devem ser alterados até a validação dessa estrutura.
