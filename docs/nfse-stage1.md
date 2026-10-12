# NFS-e — Etapa 1 (estrutura, sem emissao)

## Objetivo
- Apenas NFS-e de prestacao de servicos.
- Nenhuma API fiscal, certificado ou webhook configurado nesta etapa.
- **Nenhuma nota real emitida:** constraints de banco travam `emission_enabled`, `automatic_emission_enabled` e status `draft`.
- Rascunhos de OS consideram exclusivamente `service_order_items.item_type in ('service','custom_service')`.
- A API futura devera ser integrada no backend, nunca no navegador. O contrato estah em `src/features/nfse/domain/nfse-provider.ts`.

## Aplicar no Supabase correto
A conexao Supabase disponivel ao preparar esta etapa apontou para o projeto da **fila** (qaltlxrrbpffjmrfxutd); nao foi feito DDL nele. No CRM, confirmar o project ref pelo endpoint usado na Union. O projeto da fila **nao** deve receber esta migracao.

1. Abra SQL Editor do projeto **CRM Union World**.
2. Execute `supabase/migrations/20261012103000_nfse_stage1_foundation.sql` uma unica vez (apos as migracoes anteriores).
3. Confirme tabelas: `fiscal_company_settings`, `fiscal_service_mappings`, `fiscal_documents`, `fiscal_document_items`.
4. Confira permissoes de cada funcao (ver/rascunhos/codigos/configuracoes) e as habilitacoes do modulo `nfse` por empresa.
5. Recarregue a sessao da Union para atualizar o bootstrap de permissoes.
6. Abra Notas Fiscais, salve a configuracao, mapeie um servico e crie rascunho a partir de uma OS de teste.

## Consultas de verificacao
```sql
select key,name,is_active from public.system_modules where key='nfse';
select key,label from public.permissions where key like 'nfse.%' order by key;
select tablename,rowsecurity from pg_tables
where schemaname='public' and tablename in
('fiscal_company_settings','fiscal_service_mappings','fiscal_documents','fiscal_document_items');
select organization_id,module_key,is_enabled from public.organization_modules
where module_key='nfse';
select count(*) from public.fiscal_documents where status <> 'draft';
```
A ultima consulta deve retornar zero. Nao desative as restricoes para tentar transmitir.

## Pontos de revisao fiscal antes da etapa 2
- CNPJ, tomador, regime tributario e inscricao municipal por emitente.
- Classificacao do servico (codigo LC 116, codigo nacional e codigo municipal).
- Tratamento de desconto proporcional da OS, retencoes, ISS e vigencias.
- Servicos agrupaveis na mesma nota; documento separando prestacoes incompatíveis.
- Politica de emissao, datas de competencia, cancelamentos e substituicoes.
- Isolamento RLS entre empresas e testes com perfis gestores e operadores.
- Persistencia de XML/PDF em bucket privado e assinatura no backend.
- Adicionar campos tributarios da Reforma Tributaria e eventos conforme provedor homologado.

**Nao usar estes rascunhos como documento fiscal ou comprovante de autorizacao.**
