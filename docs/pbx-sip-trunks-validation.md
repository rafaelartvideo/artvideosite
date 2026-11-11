# Troncos SIP por empresa — saída nacional

Continuação da missão PABX multiempresa. Esta etapa entrega cadastro protegido,
aplicação pelo agente e autorização de saída por ramal para empresas parceiras.
Não transforma o cadastro manual FVX da Union em um tronco gerenciado.

## Operação

- PABX → Troncos SIP usa permissões da empresa selecionada. As senhas são
  escritas no Vault e não retornam nas consultas do navegador. O formulário
  limpa a senha após a operação e é desmontado ao trocar de empresa.
- Um tronco de saída habilitado por empresa, até 100 configurações incluindo
  rascunhos. Salvar offline é permitido; estado pendente/aplicado/falha distingue
  configuração desejada de configuração realmente carregada.
- O transporte é uma configuração existente da VPS, conferida no motor.
  `transport-udp-local` é o transporte UDP encontrado nesta instalação.
- Ramais autorizados precisam pertencer à empresa. A saída valida o endpoint
  autenticado no Asterisk, sem confiar no número de identificação do chamador.
- O telefone só apresenta saída de parceiros após autorização do servidor para
  o ramal atribuído ao usuário. A normalização mantém somente números nacionais
  comuns com DDD. Emergências, números especiais e outros países são recusados.
- Perfis isolados anunciam a capacidade nova somente após inicialização
  explícita e conferência dos arquivos, contextos, aplicações e módulos reais.
  Cadastros do protocolo legado da Union não recebem credenciais dessa função.
- A autorização local de novas saídas expira em 95 segundos sem uma resposta
  válida do servidor. Não encerra conversas em andamento. Erros e chamadas
  ativas impedem aplicar alterações e renovar uma configuração divergente.

## Evidências

- 206 testes Python aprovados no Linux como root e como usuário sem privilégios.
- 110 testes focados de telefonia/qualidade aprovados. Suíte CI e compilações
  de CRM e site executadas; verificação final de publicação é separada.
- PostgreSQL 14 descartável: funções e políticas verificadas como usuário e
  serviço, com canários de outra empresa, segredos inacessíveis ao usuário,
  senha preservada/alterada, revisões e confirmações antigas, permissões
  negadas, expiração e quota de 100 cadastros. Dados revertidos ao final.
  O Vault usado nesse ensaio é um emulador de sua API, não o Vault de produção.
- No Vault real do projeto, uma transação sintética confirmou criação e troca
  de segredo pelas funções instaladas e terminou em rollback. Não consultou
  credenciais existentes nem deixou o segredo de teste no banco.
- Asterisk 22 real: ensaio `8285ac3a352a424fb6228b1189ef4686`, resultado
  `passed=true`, `cleaned=true`, `configs_restored=true`, `lease_expired=true`.
  Um perfil temporário com ramal 301 usou apenas registro SIP para loopback
  `127.0.0.1:59999`. Não originou chamadas nem usou operadora externa.
- O ensaio conferiu permissões dos arquivos, namespace, whitelist, rejeição de
  entrada, carregamento do tronco e desativação, preservando rotas, fila, pausas
  e registro FVX da Union. Os ensaios anteriores também foram limpos.
- O motor real exigiu recargas explícitas de `res_pjsip.so` e
  `res_pjsip_outbound_registration.so`: `pjsip reload` não existe nessa versão,
  apesar de o cliente CLI retornar zero. Os testes passaram a exigir confirmação
  textual de sucesso. Arquivos globais mantêm seus proprietários originais;
  arquivos novos do motor usam `root:asterisk 0640`, estado/backups `root 0600`.

## Limites e próxima validação

Entrada dos novos troncos permanece bloqueada: precisa identificar origem e
DID de forma segura, com verificação da operadora. `line=yes` sozinho identifica
o endpoint e não autentica a origem. A entrada FVX existente permanece própria.

Configuração aplicada não comprova registro nem uma chamada externa atendida.
Esse aceite depende de credenciais e plano reais fornecidos na interface,
habilitação explícita da saída e teste autorizado. Não foram feitas chamadas
externas nessa entrega. A Artvideo foi escolhida como piloto, mas continuava
sem módulo PABX, agente ou ramais ativos na conferência; não foi ativada por
escolher seu nome. Gravações protegidas e contingência continuam na missão.

## Instalação e recuperação

`activate-sip-trunks.sh --acknowledge-sip-trunk-update` confere o agente anterior
revisado e os hashes do pacote, exige ausência de chamadas e mantém a trava de
operações até reiniciar somente o agente. Não recarrega Asterisk nem inicia
perfis de empresas. Os instaladores anteriores preservam seus pins históricos.

`agent.py --profile UUID sip-trunks-init` prepara somente o perfil já admitido.
`audit_sip_trunks.py` tem prévia por padrão e exige `--apply
--acknowledge-sip-audit --runtime-directory DIRETORIO` para o ensaio. Mantém
journal e recuperação por `--cleanup ID`. `--diagnostics` informa apenas tipos
e localizações de exceções, nunca mensagens, credenciais ou valores locais.
