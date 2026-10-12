# NFS-e — Etapa 1 (estrutura, sem emissao)

## Objetivo
- Apenas NFS-e de prestacao de servicos.
- Nenhuma API fiscal, certificado ou webhook configurado nesta etapa.
- **Nenhuma nota real emitida:** constraints de banco travam `emission_enabled`, `automatic_emission_enabled` e status `draft`.
- Rascunhos de OS consideram exclusivamente `service_order_items.item_type in ('service','custom_service')`.
- A API futura devera ser integrada no backend, nunca no navegador. O contrato estah em `src/features/nfse/domain/nfse-provider.ts`.

## Implantacao no Supabase CRM
**Aplicada em 12/10/2026** ao projeto CRM `wmjmtcjpunmzvonlkjcu` pelo conector Supabase, como migracao `nfse_stage1_foundation`.

Verificacao no CRM apos aplicacao:
- 4 tabelas fiscais criadas com RLS ativo; nenhuma linha de NFS-e.
- 4 permissoes fiscais; 40 vinculacoes de permissao a funcoes existentes.
- Modulo `nfse` habilitado para as 4 organizacoes existentes.
- Constraints bloqueiam `emission_enabled`, `automatic_emission_enabled` e qualquer status diferente de `draft`.
- O projeto de fila `qaltlxrrbpffjmrfxutd` nao foi alterado.

**Nao execute novamente a migracao em producao.** Para outros ambientes, aplique o SQL apenas apos conferir a estrutura e o historico de migracoes.

Ainda pendente de teste funcional autenticado (na interface):
1. Recarregue a sessao da Union para atualizar permissoes.
2. Abra Notas Fiscais, salve a configuracao fiscal e mapeie um servico.
3. Abra uma OS com servico para preparar um rascunho sem transmissao.
4. Confirme que usuario de outra empresa nao visualiza o rascunho.

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
