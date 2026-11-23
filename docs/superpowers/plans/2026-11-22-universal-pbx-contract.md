# Integração universal de telefonia — contrato de implementação

**Objetivo:** integrar operadoras, conexões, contratos/capacidade, troncos lógicos,
DIDs e políticas por empresa, preservando toda a telefonia legada. FVX é somente
um caso; contas 101/102 são distintas e a capacidade permanece desconhecida.
**Execução autorizada:** prosseguir sem perguntas sobre capacidade FVX. Campos
configuráveis com proveniência unknown/contract/tested/provider. Unknown nunca
significa ilimitado e não pode ativar nova rota.

## Contrato entre camadas

- Documento versionado por organização com schema_version=1 e arrays separados:
  providers, contracts, connections, trunks, capacity_pools, dids, groups,
  outbound_routes. Identidades UUID canônicas. routing_enabled=false inicial.
- Provedor: id/name/enabled/options (somente opções SIP explicitamente permitidas).
- Contrato: id/provider_id/name/enabled. Conexão: id/provider_id/contract_id/name,
  auth_mode registration/digest/ip, host/port/transport/username/realm,
  inbound_cidrs, enabled, inbound_enabled/outbound_enabled. Segredo separado:
  nunca entra na resposta ao navegador, somente Vault e poll autenticado do agente.
- Tronco lógico: id/name/connection_ids/enabled. Grupo: id/name/strategy,
  members[{connection_id,trunk_id,priority}], extension_ids, enabled.
- Pool: id/scope(organization/provider/contract/trunk/connection/group)/scope_id,
  mode shared/independent, shared_limit/inbound_limit/outbound_limit,
  confidence unknown/contract/tested/provider. Limites positivos ou null desconhecido.
  Nenhum modelo deduz capacidade da quantidade de credenciais ou de registro.
- DID: id/connection_id/number/destination_kind(extension/queue/flow)/destination_id/enabled.
- Rota de saída: id/name/group_id/priority/destination_pattern(br_national/e164_prefix),
  prefix/caller_id(DID autorizado)/max_cost/opções validadas/enabled.
- RPCs browser: pbx_list_universal_telephony(org), pbx_save_universal_telephony
  (org,expected_revision,document,secrets). Envelope de leitura:
  {organization_id,revision,document,status,observed,can_activate,last_error}.
  Secrets: mapa connectionUUID -> senha nova; vazio preserva segredo existente.
- Poll agent feature universal_telephony_v1, protocolos 2/3 existentes, admissão
  por empresa/seq/lease. Snapshot universal_telephony:
  {schema_version:1,organization_id,agent_id,revision,document,extensions,credentials,
  issued_at,expires_at}. Resposta autenticada por HTTPS ao request Ed25519;
  não chamar isso de assinatura independente do payload. Expiração bloqueia apenas
  novas chamadas. Root pode preparar pacote vazio; não ativa contas nem rotas.
- Extensões no snapshot: [{id,number,endpoint_name,enabled,external_mode}].
- Credentials somente agent: [{connection_id,password}]. Nenhum segredo no estado
  observado/erros/auditoria/browser. IDs de agente/org nunca aceitos do navegador.
- Estado aplicado por revisão/hash separado de registro/observação real por conta.
  Auditoria de configuração sem segredos. RLS e claims globais continuam obrigatórias.
- Modelo extensível por campos validados, nunca por texto de configuração Asterisk.

## Responsabilidades

1. Cloud: migração gerada pelo CLI, armazenamento/validação, Vault, claims, RPCs
   browser e agent, isolamento e testes PG descartável. Não implantar sem revisão.
2. UI: página universal integrada à seção Troncos, gateways limitados/abortáveis,
   controles CRM/temas/responsivos, senhas vazias ao editar, regressões TSX.
3. Runtime: compilador/validador e ledger universal por pools hierárquicos,
   reserva atômica entrada/saída antes do INVITE/atendimento, vida por perna,
   manifesto/lease/reconciliação/AGI. Testes locais sem operadora. Não implantar.
4. Root: Edge/agent hooks, composição com permissões e gravações, instalador,
   ensaio nativo, revisão/CI/build, deploy coordenado e verificação de publicação.

## Gates obrigatórios

- Nunca disputar registro FVX legada nem reescrever credenciais. Integração de
  linha legada exige referência confiável própria e guardas entrada/saída,
  não copiar senha nem criar outro registro. Desabilitado preserva fluxo atual.
- Sem alegar limite total da empresa se qualquer perna relevante ficar fora da
  admissão. Para legado não integrado, bloquear ativação agregada em vez de ocultar.
- Identificação de entrada por auth confiável/CIDR configurado + DID exato e
  destino próprio. Falhar fechado se necessário contrato/identificação ausente.
- Nunca liberar reserva por tempo, desconexão do navegador, hold ou transferência.
  Encerramento exato ou reconciliação autoritativa. Sem rediscagem ambígua.
- Conferir backups, zero chamadas e sintaxe real do Asterisk antes da ativação.
  Publicar main e conferir FTPS; migração/Edge/VPS são implantações separadas.
