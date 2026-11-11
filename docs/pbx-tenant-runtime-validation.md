# Validação da telefonia interna por empresa — 10/11/2026

## Escopo

Perfis separados na VPS compartilhada, ramais internos, filas, pausa, histórico
e entrega individual de credenciais. A linha FVX, o ramal manual Union 301 e a
saída nacional da Union permanecem exclusivos da plataforma. Este lote não
implementa troncos externos para parceiros, URA ou gravação de voz.

## Problemas corrigidos

- A substituição de arquivo 0600 podia trocar o proprietário Asterisk por root,
  impedindo a leitura na recarga. A escrita preserva o proprietário antes de
  substituir o arquivo.
- O Asterisk pode apresentar `set_var` como o campo expandido
  `TRANSFER_CONTEXT`. A validação aceita os dois formatos e exige um único
  contexto próprio em ambos. Contexto externo ou duplicado é recusado.
- Desativar um participante antes de reconciliar sua fila podia impedir novos
  comandos. O banco rejeita a desativação enquanto houver fila ativa; o agente
  adia uma solicitação já em trânsito até aplicar a alteração da fila.
- Leitura recente de telemetria não comprova capacidade. O protocolo 3 exige
  arquivos e rotas carregados correspondentes ao perfil. Somente um poll
  assinado e admitido renova a capacidade por 95 segundos.
- Cadastro e consulta de configurações não exigem agente online. A entrega
  criptografada de credenciais revalida funcionário, organização, permissão,
  agente, validade e consumo único.
- A ponte de produção não tinha `USAGE` no esquema privado para `service_role`,
  embora possuísse `EXECUTE` nos helpers. A migração complementar concede apenas
  esse acesso de resolução ao serviço. O teste descartável passou a reproduzir
  o ACL real e a chamar a fachada como `service_role`, mantendo `anon` sem acesso.

## Evidências

- **122 testes Python aprovados no Linux**, como root e como usuário sem
  privilégios, usando apenas código público em diretórios temporários.
- **79 testes focados do CRM aprovados**, além da suíte CI e das compilações de
  CRM e site. Os controles usam os componentes compartilhados do CRM.
- **PostgreSQL 14.24 descartável:** cadeia de migrações e testes reais com
  `SET ROLE authenticated` e `service_role`, permissões por empresa, negativas
  entre organizações, revisão/replay, expiração e revogação do handoff. Os dados
  sintéticos foram revertidos e o cluster temporário removido.
- **Asterisk 22.11 real:** ensaio `90b6f76d1f594882bf9acd349e1dadc5`, com dois
  perfis temporários, ambos usando ramal 301 e fila 850. Conferidos endpoint,
  contexto de transferência, destinos, aplicações e membros próprios. Alterar a
  estratégia da fila A preservou a pausa do membro da fila B.
- O ensaio terminou com `passed=true`, `cleaned=true`, `calls_originated=0`.
  Foram conferidos os arquivos originais, a ausência dos objetos temporários,
  as rotas Union 301/302/850, a saída nacional e o registro FVX após a limpeza.
  O agente legado foi preservado durante esse ensaio.
- O proprietário confirmou chamadas pelo discador do CRM usando **301 e 302**,
  para o celular autorizado, com áudio nos dois sentidos.
- **Produção Supabase:** migrações `20261110140045` e `20261110165015`
  aplicadas pela CLI oficial, com prévia restrita aos arquivos correspondentes.
  Edge `union-pbx-agent` versão 7 ativa, mantendo a autenticação assinada
  existente. Heartbeat real voltou a renovar a capacidade do agente legado
  (protocolo 2), sem habilitar parceiros.
- A suíte SQL transacional também passou no banco real e terminou em
  `ROLLBACK`: nenhuma organização sintética permaneceu. O teste considera os
  gatilhos reais que criam o Gestor e concedem permissões gerais ao ativar um
  módulo; mede separadamente as concessões exclusivas do helper PABX. As
  negativas de troncos consultam fixtures explícitas, inclusive uma linha
  existente de outra empresa, sem pressupor que o usuário não tenha outras
  organizações legítimas. A mesma suíte passou no PostgreSQL 14 descartável.

## Limites do aceite

O ensaio temporário comprova configuração e isolamento das rotas, não áudio
entre duas empresas reais. Uma empresa só opera após liberar seu módulo,
preparar seu perfil e registrar seu agente individual. Nenhum parceiro real foi
habilitado pelo ensaio. Revogar a ponte bloqueia novos comandos e credenciais;
não desativa automaticamente a telefonia dos ramais já instalados.

O proprietário também validou a transferência pela interface: chamada interna
com eco atendida no 302, transferida para o 301 e atendida com retorno de voz.
Encerramento conferido com zero canais ativos, sem uso da FVX.

O tom intermitente de chamada da FVX permanece na pendência adiada pelo
proprietário.

## Aceite Artvideo e contingência — 11/11/2026

Artvideo Jmg (`00000000-0000-4000-8000-000000000001`) foi habilitada para
telefonia interna na mesma VPS. Agente próprio no protocolo 3, serviço
`union-pbx-agent@UUID` ativo/habilitado, chave privada própria e contexto
`uwi-00000000000040008000000000000001`. Ramal 301 vinculado a Rafael Gestor e
302 a Elmo. Ambos `applied`, sem erros. O proprietário confirmou toque e áudio
nos dois sentidos em 301 → 302 pelas contas da Artvideo. Isso não comprova uma
tentativa de ligação entre empresas; o isolamento das rotas foi conferido
separadamente. Nenhum tronco externo foi cadastrado para a Artvideo.

Ensaio `8c068fbef67646acb4dd72c748b3b69c`: dois perfis temporários, ambos
301/850; uma chamada Local sintética entrou na fila cujo único endpoint estava
offline e sem pausa. Espera observada de 30,71 s, abandono incrementado em 1,
canais liberados. `passed=true`, `cleaned=true`, uma chamada interna sintética,
zero chamadas externas. Rotas/pausas Union e registro FVX preservados; hash do
dialplan Artvideo idêntico antes/depois. Não houve desconexão de um navegador
real nem teste de atendimento com outro membro disponível nesse ensaio.

`contingency_audit.py` usa o bundle revisado de `audit_sip_trunks.py` e o journal
recuperável de `isolation_audit.py`. A prévia não carrega runtime nem faz chamadas.
Aplicação exige `--apply --acknowledge-contingency-audit`; recuperação usa o mesmo
script com `--cleanup ID`. Limpeza e recuperação nunca repetem a chamada de
teste, inclusive se a primeira tentativa falhou. Mantêm as guardas de chamadas
ativas e de arquivos alterados fora do ensaio.
