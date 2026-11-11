# SAC Digital legado — desativação e preservação para backup (11/11/2026)

## Estado aplicado em produção
- Projeto CRM: `wmjmtcjpunmzvonlkjcu`.
- Integração em `public.sac_digital_integrations`: `enabled=false` (configuração/credenciais preservadas temporariamente para o backup).
- Rotinas pg_cron excluídas: `sac-digital-prune-processed-webhook-payloads`, `sac-digital-projection-recovery`, `sac-digital-worker-recovery`, `sac-digital-media-retention`, `sac-digital-external-reconciliation`.
- Edge Functions substituídas por handlers sem acesso ao banco/Storage: `sac-digital-webhook`, `sac-digital-api`, `sac-digital-worker`, `sac-digital-menu`, `sac-digital-oauth`, `sac-avatar-maintenance`.
- `sac-digital-webhook` retorna 204 sem processar; `sac-digital-worker` e `sac-avatar-maintenance` retornam sucesso inerte; API/menu/OAuth retornam 410.
- Função `sac-digital-media` preservada temporariamente para extração de mídias.
- Menu e rota SAC Digital no frontend removidos; o WhatsApp Union e o PABX não foram desativados.
- Callback legado `public/sac.php` excluído do repositório.

## Dados que NÃO podem ser excluídos antes de backup íntegro e teste de restauração
1. Dados da SAC em tabelas `public.sac_digital_*` e estruturas privadas relacionadas; incluir protocolos, mensagens, contatos, leitura, integrações, ledger, eventos, cursores e histórico. Preferir snapshot **completo** do PostgreSQL para não perder referências, identidades ou chaves de relacionamento. Não confundir com tabelas `union_whatsapp_*`, do WhatsApp Union.
2. Storage bucket privado `sac-digital-attachments` com todas as versões necessárias.
3. Storage bucket `sac-digital-outbox`, incluindo objetos ainda referenciados por mensagens.
4. Objetos de prefixo `sac-digital/` no bucket compartilhado `public-assets` (não apagar outros prefixos).
5. Metadados de objetos, identificadores, caminho e relacionamento no banco.
6. Segredos da integração, se precisarem ser retidos para auditoria, tratados como confidenciais; nunca colocar credenciais em commits, logs ou respostas.

## Backup
- Exportar o PostgreSQL por canal autenticado seguro com `pg_dump -Fc` (preferencialmente backup completo); salvar arquivo **fora** do projeto.
- Baixar os arquivos dos buckets e prefixo acima por API autenticada da Storage, mantendo estrutura de caminhos; não basta exportar metadados da tabela `storage.objects`.
- Criptografar o arquivo de banco e as mídias antes de armazenar em R2; verificar listagem, checksums, quantidade de objetos, tamanho e uma restauração de amostra.
- Não excluir tabelas, buckets, objetos, senhas de acesso à mídia nem históricos de execução antes dessa validação. Exclusões grandes geram I/O e podem agravar uma indisponibilidade.
- Depois da validação, remover definitivamente apenas o legado da SAC, em operação controlada e com verificação de dependências. Preservar os módulos Union WhatsApp, OS, Financeiro, PABX e Fila.

## Observação
A desativação das Edge Functions impede processamento e consultas ao banco por seus endpoints, mas um sistema externo ainda pode enviar HTTP para os URLs antigos até o webhook ser removido do lado do provedor. Não há comprovação de que um backup completo já tenha sido efetuado.
