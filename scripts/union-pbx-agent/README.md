# Union PABX — ponte de provisionamento por saída HTTPS

## Tom de chamada na entrada FVX

O chamador deve ouvir o tom antes de um atendente responder. `Queue(r)` já
envia a indicação de toque; não antecipe `Ringing()` ou `Progress()` na rota,
pois isso duplica as respostas provisórias. A sinalização sozinha também
não garante que o tom seja reproduzido pela operadora. Na VPS Union,
a entrada FVX usa `inband_progress=yes` no endpoint `union-fvx-in`, e o Asterisk
precisa ter os tons carregados. O arquivo `indications-br.conf` contém as
definições brasileiras da amostra oficial do Asterisk 22 para servidores sem
configuração prévia; nunca substitua uma configuração de tons existente sem revisão.

Verifique o valor efetivo com `pjsip show endpoint union-fvx-in` e os tons com
`indication show br`. O teste real deve confirmar áudio antes do atendimento,
sem enviar `200 OK` antecipadamente, e voz normal após atender. Não marque
o teste como aprovado apenas porque a fila tocou ou houve SIP 180/183.

Alterações na entrada ativa exigem autorização, backup, ausência de canais
ativos e reversão. Preserve o grupo de leitura `asterisk` e as credenciais
existentes; elas não pertencem ao repositório. Após alterar um arquivo incluído,
confirme que o valor mudou em memória: uma mensagem de recarga bem-sucedida
sozinha não prova que a configuração nova foi aplicada.

Este agente permite que a **VPS** obtenha trabalhos assinados a partir do Supabase, crie
somente **novos endpoints WebRTC da Union** e reporte o resultado. A senha do tronco FVX
não é lida, copiada ou modificada. O ramal manual `union-301` não é gerenciado aqui.

## Proteções

- Nenhuma porta de administração é publicada na VPS; usa apenas HTTPS de saída.
- O agente cria uma chave **Ed25519** local, preservada em `/etc/union-pbx-agent/private.pem`.
- Copie **somente a chave pública** mostrada por `public-key` para o CRM.
- Todas as requisições são assinadas com carimbo de tempo e sequência monotônica.
- O Supabase limita cada agente a uma organização.
- Somente endpoints `uw-<32 caracteres hexadecimais>` são gerenciados.
- Senhas SIP individuais são geradas e armazenadas **apenas na VPS**, com permissões root.
- O agente não permite SQL livre, comandos de shell, alteração de rotas ou da FVX.
- Não recarrega o PJSIP enquanto existirem canais ativos; faz rollback se falhar.
- Novos ramais ficam no contexto `union-internal`; por padrão, somente o 900 está ativo até habilitar as rotas internas.
- A criação de um endpoint não conecta automaticamente o telefone do funcionário.
  A entrega segura das credenciais por operador é uma próxima fase.

## Instalação na VPS — após o PR ser publicado na main

```bash
sudo install -d -m 0755 /opt/union-pbx-agent
sudo install -m 0755 agent.py /opt/union-pbx-agent/agent.py
sudo python3 /opt/union-pbx-agent/agent.py init
```

No CRM: **Ferramentas → PABX Union → Gerenciar ramais → Ponte com VPS**.
Cole a **chave pública**, cadastre um agente e copie o ID devolvido.

Depois vincule a identidade exibida no CRM (sem nenhuma senha):

```bash
sudo python3 /opt/union-pbx-agent/agent.py configure <agent-uuid> <organization-uuid>
sudo python3 /opt/union-pbx-agent/agent.py once --dry-run
```

Verifique a prévia. Para aplicar os ramais pendentes:

```bash
sudo python3 /opt/union-pbx-agent/agent.py once
```

Para processamento contínuo, instale o arquivo `union-pbx-agent.service` em
`/etc/systemd/system/`, execute `systemctl daemon-reload` e
`systemctl enable --now union-pbx-agent`.

**Não habilite o serviço antes de validar manualmente o primeiro ramal gerenciado.**
Consulte `journalctl -u union-pbx-agent -n 50 --no-pager` para diagnóstico
(sem exibição de senhas).

### Desinstalar o agente (sem afetar o tronco)

```bash
sudo systemctl disable --now union-pbx-agent
```

Desabilitar o agente **não** remove os endpoints previamente aplicados.
A remoção é uma operação de manutenção que deve ser revisada antes de editar
`/etc/asterisk/pjsip.conf`; preserve sempre os arquivos e os backups.

### Observações operacionais

- Recarregar `res_pjsip.so` é menos invasivo que reiniciar o Asterisk, mas sempre
  adie durante chamadas ativas e valide após qualquer alteração.
- Servidores com clock desatualizado rejeitarão as assinaturas (tolerância de 2 min).
- A perda de comunicação com o Supabase não derruba chamadas existentes.
- Não coloque o arquivo de chave privada, JSONs de estado ou senhas SIP no Git.

## Login criptografado por funcionário (versão 2)

A interface do CRM permite **vincular um funcionário** a um ramal gerenciado.
Quando esse funcionário entra no PABX, seu navegador gera uma chave RSA-OAEP
temporária (2048 bits, SHA-256) e solicita uma credencial de uso único.

1. O Supabase confere vínculo do funcionário, organização, permissão `pbx.view`
   e se o ramal está aplicado e ativo.
2. O agente consulta esse pedido, criptografa a **senha SIP local** com a chave
   pública do navegador e retorna somente o texto criptografado.
3. O navegador recebe o resultado uma vez, descriptografa em memória e registra
   seu próprio endpoint no Asterisk via WSS.
4. A chave privada temporária e a senha SIP **não são armazenadas** no navegador
   nem em texto puro no Supabase. O ramal 301 continua manual.

Para atualizar um agente instalado sem alterar a configuração SIP:

```bash
sudo systemctl stop union-pbx-agent
sudo cp -a /opt/union-pbx-agent/agent.py \
  "/root/union-pbx-agent.py.backup.$(date +%Y%m%d-%H%M%S)"
sudo curl -fsSL \
  https://raw.githubusercontent.com/rafaelartvideo/artvideosite/main/scripts/union-pbx-agent/agent.py \
  -o /opt/union-pbx-agent/agent.py
sudo python3 -m py_compile /opt/union-pbx-agent/agent.py
sudo systemctl start union-pbx-agent
sudo systemctl is-active union-pbx-agent
```

Se o agente estava sendo executado manualmente, apenas atualize o script,
sem mexer no systemd. Execute `once --dry-run` para consultar pendências
antes de aplicar qualquer alteração.

**Importante:** as novas credenciais automáticas ainda exigem um ramal gerenciado
vinculado a um funcionário ativo. O ramal `union-301` não é migrado por esta
entrega, e o tronco FVX não é modificado.

## Chamadas internas (ramais 301, 302 e próximos)

A nova versão adiciona a ação opcional **`internal-routes`**.
Ela preserva o contexto `union-internal` (inclusive o eco 900) e apenas inclui
um contexto isolado com **números exatos**, por exemplo:

```ini
[union-pbx-local-extensions]
exten => 301,1,Dial(PJSIP/union-301,25)
 same => n,Hangup()
exten => 302,1,Dial(PJSIP/uw-...,25)
 same => n,Hangup()
```

O agente gera o arquivo real a partir de seus registros protegidos, sem utilizar
um padrão genérico de discagem. **Não existe rota para ligar a números externos**.

Na VPS:

```bash
sudo systemctl stop union-pbx-agent
sudo cp -a /opt/union-pbx-agent/agent.py "/root/agent.py.before-internal.$(date +%Y%m%d-%H%M%S)"
sudo curl -fsSL \
  https://raw.githubusercontent.com/rafaelartvideo/artvideosite/main/scripts/union-pbx-agent/agent.py \
  -o /opt/union-pbx-agent/agent.py
sudo python3 -m py_compile /opt/union-pbx-agent/agent.py
# Atualize a unidade systemd para permitir escrita no novo arquivo de dialplan:
sudo curl -fsSL \
  https://raw.githubusercontent.com/rafaelartvideo/artvideosite/main/scripts/union-pbx-agent/union-pbx-agent.service \
  -o /etc/systemd/system/union-pbx-agent.service
sudo systemctl daemon-reload
sudo asterisk -rx "core show channels count"
# So execute a etapa seguinte se houver zero chamadas ativas:
sudo python3 /opt/union-pbx-agent/agent.py internal-routes
sudo asterisk -rx "dialplan show union-internal"
sudo asterisk -rx "dialplan show union-pbx-local-extensions"
sudo asterisk -rx "pjsip show registrations"
sudo systemctl start union-pbx-agent
sudo systemctl is-active union-pbx-agent
```

**Instalação/rollback:** o comando salva backups de `extensions.conf` e
`union-browser.conf` sob `/root`, preserva suas permissões e restaura
os arquivos se a validação falhar. Não edita o arquivo do tronco FVX
nem a rota das chamadas externas recebidas.

Depois de ativada essa opção, as novas configurações de ramal gerenciado
atualizam também o dialplan interno, sempre após confirmar **zero chamadas ativas**.
Os números da lista são os ramais cadastrados e não comprovam presença online.

**Teste:** conecte o ramal 301 e o 302 em dispositivos ou sessões diferentes,
abra o PABX Union, escolha o outro número na lista e clique em **Ligar**.
Faça o teste nos dois sentidos. O 900 continua disponível.


## Filas do PABX Union — ativação segura para teste interno

No CRM, Ferramentas → PABX Union → Gerenciar filas permite cadastrar filas,
vincular ramais 301/302 e definir a distribuição: todos tocam, rodízio ou sequencial.
Os testes utilizam os números internos 850 a 899.

O agente cria arquivos isolados em /etc/asterisk/queues.d e
/etc/asterisk/extensions.d, sem modificar o tronco FVX nem a rota de entrada.
O arquivo principal queues.conf recebe apenas uma referência ao arquivo gerado.
Os arquivos existentes são salvos em /root antes de qualquer modificação.

### Instalação na VPS

Somente depois do merge e da publicação da versão no CRM. Verifique que não há
chamadas ativas e que app_queue.so está carregado.

```bash
set -e
BASE=https://raw.githubusercontent.com/rafaelartvideo/artvideosite/main/scripts/union-pbx-agent
AGENT=/opt/union-pbx-agent/agent.py
UNIT=/etc/systemd/system/union-pbx-agent.service
TMP_AGENT=$(mktemp)
TMP_UNIT=$(mktemp)
trap 'rm -f "$TMP_AGENT" "$TMP_UNIT"; systemctl start union-pbx-agent || true' EXIT
curl -fsSL "$BASE/agent.py" -o "$TMP_AGENT"
curl -fsSL "$BASE/union-pbx-agent.service" -o "$TMP_UNIT"
python3 -m py_compile "$TMP_AGENT"
asterisk -rx 'core show channels count'
asterisk -rx 'module show like app_queue'
systemctl stop union-pbx-agent
cp -a "$AGENT" "/root/agent.before-queues.$(date +%Y%m%d-%H%M%S).py"
cp -a "$UNIT" "/root/union-pbx-agent.service.before-queues.$(date +%Y%m%d-%H%M%S)"
install -m 0755 "$TMP_AGENT" "$AGENT"
install -m 0644 "$TMP_UNIT" "$UNIT"
systemctl daemon-reload
asterisk -rx 'core show channels count'
python3 "$AGENT" queues-init
asterisk -rx 'dialplan show union-pbx-local-extensions'
asterisk -rx 'dialplan show union-pbx-queue-tests'
asterisk -rx 'pjsip show registrations'
```

O comando queues-init apenas prepara o motor de filas. Não cria nem altera a
configuração de entrada da operadora. Caso a validação falhe, o agente tenta
restaurar o que já existia. Não execute durante chamadas ativas.

### Teste pelo CRM

Crie uma fila 850 — Atendimento geral e selecione os ramais 301 e 302.
Quando o agente aplicar a fila, ela aparecerá como Configuração aplicada.
Ao abrir o telefone do CRM, escolha Fila 850 na lista de destinos e clique em Ligar.
Teste o toque simultâneo, o atendimento, o áudio e o tempo máximo de espera.

Verificações na VPS:

```bash
systemctl is-active union-pbx-agent
asterisk -rx 'queue show'
asterisk -rx 'dialplan show union-pbx-queue-tests'
asterisk -rx 'pjsip show registrations'
```

A linha principal (11) 4290-1575 continuará com seu roteamento atual. A troca
para uma fila externa, a pausa de atendentes, URA, gravações e histórico ainda
serão fases separadas, após o teste interno.


## Monitoramento das filas no CRM (sem alterar rotas)

O agente envia uma amostra de status das filas ao Supabase junto com seu polling HTTPS
assinado. Ele executa um unico `asterisk -rx 'queue show'` em cada ciclo de 30s.
O CRM abre uma unica assinatura Supabase Realtime para as filas da organizacao
quando a tela Gerenciar filas estiver aberta. Sem polling frequente do navegador.

Campos: chamadas em espera, ramais disponiveis, ocupados, chamando, pausados
ou indisponiveis. Se o agente deixar de comunicar por 95s ou a fila nao existir,
o CRM deixa de afirmar disponibilidade. Este painel nao controla ainda pausas,
recusas, transferencias ou o recebimento da linha FVX.

### Atualizacao segura na VPS

Execute somente depois do merge e dos testes. O script abaixo nao edita arquivos
do Asterisk, nao altera senhas e nao executa reload de modulos.

```bash
set -e
BASE=https://raw.githubusercontent.com/rafaelartvideo/artvideosite/main/scripts/union-pbx-agent
AGENT=/opt/union-pbx-agent/agent.py
NEW=$(mktemp)
trap 'rm -f "$NEW"' EXIT
curl -fsSL "$BASE/agent.py" -o "$NEW"
python3 -m py_compile "$NEW"
cp -a "$AGENT" "/root/agent.before-queue-metrics.$(date +%Y%m%d-%H%M%S).py"
systemctl stop union-pbx-agent
install -m 0755 "$NEW" "$AGENT"
systemctl start union-pbx-agent
systemctl is-active union-pbx-agent
```

Verifique o painel com uma chamada de teste para a fila 850 e confirme
que a leitura aparece em aproximadamente 30 segundos. A sincronizacao e
aproximada, nao substitui eventos instantaneos do Asterisk/AMI.


## Entrada FVX — preparação de troca segura, NÃO ativada automaticamente

O contexto confirmado na VPS recebe chamadas em [union-entrada], s, e executa
`Dial(PJSIP/union-301,25)`. O arquivo é
`/etc/asterisk/extensions.d/union-fvx.conf`, com padrão `_X.` que vai para s e
contexto `h` de encerramento. A linha FVX está registrada separadamente.

O novo `inbound_router.py` é uma ferramenta de operação manual e estritamente
opt-in, e **NÃO é executado pelo serviço do agente**. Não está ligado ao
botão 'Salvar planejamento' do CRM. Publicá-lo no GitHub não altera nenhuma
rota. O estado atual do PABX permanece como está.

Proteções de implantação:
- Recusa arquivos FVX diferentes da versão auditada.
- Não altera tronco SIP, senha, pjsip.conf nem o provisionamento de ramais.
- Comandos mutáveis exigem root, flag `--acknowledge-live-change`,
  zero canais ativos, tronco FVX registrado e validação de `dialplan reload`.
- Antes da primeira mudança salva o arquivo original sob /root.
- `prepare` cria uma subrotina separada e **continua enviando tudo ao 301**.
- Somente uma segunda ação manual `activate-queue --queue 850` permite a fila;
  valida que ela existe, está ativa e possui atendente disponível.
- A fila usa o tempo de espera cadastrado e, quando o Queue retorna ao dialplan,
  tenta o ramal 301 como contingência; quando o chamador já desligou,
  não há chamada ativa para encaminhar.
- `restore-301` troca a subrotina para chamada direta; `restore-original`
  repõe os bytes originais verificados do arquivo confirmado.
- Falha de reload ou de verificação provoca tentativa de restauração imediata.
- Se faltar qualquer condição de segurança, a operação é recusada.

**Somente leitura** (após copiar também `inbound_router.py` para o mesmo diretório
do script `agent.py` na VPS):

```bash
python3 /opt/union-pbx-agent/inbound_router.py status
python3 /opt/union-pbx-agent/inbound_router.py preview --queue 850
```

**NÃO execute prepare ou activate-queue sem aprovação separada, janela de teste,
atendentes online e plano de contingência.** Alterar roteamento telefônico
pode interromper o atendimento. O CRM, neste estágio, guarda somente
o destino planejado; não envia comando para mudar a FVX.

Quando autorizado, a operação deverá ser feita por uma pessoa com acesso root
na VPS, em duas etapas separadas: primeiro apenas preservar o 301 através de
uma subrotina controlada, e só depois ativar a fila externa com teste real.

## Histórico assinado de chamadas (metadados)

O histórico usa `pbx_call_logs`, separado da integração `uniq_calls`. A migração
`20261110010215_pbx_signed_call_history_foundation.sql` registra a propriedade
dos endpoints FVX já existentes, sem alterar credenciais ou rotas. O navegador
tem somente SELECT protegido por organização e `pbx.view`; a ingestão é permitida
apenas ao serviço, após a assinatura Ed25519 do agente. A organização e a direção
são derivadas no banco. Não habilita telefonia em empresas parceiras antes da
separação dos contexts e dos troncos de cada empresa.

`call_history.py` deve ser instalado ao lado de `agent.py`. No final de cada ciclo,
o agente envia até dez pernas de chamadas, usando os endpoints autorizados pelo
backend. Falhas não impedem o provisionamento nem a entrega de credenciais.
Chamadas de endpoints desconhecidos ou com uma perna de outra empresa não saem
da VPS. O cursor só avança após confirmação; a chave agente/evento impede
duplicação quando uma resposta se perde. O identificador vinculado agrupa pernas,
não é uma contagem de conversas distintas. O histórico não é fonte de faturamento.

Os modelos `cdr.conf` e `cdr_custom.conf` são **opt-in**. Sua ativação requer
aprovação do proprietário, zero canais ativos, backup do agente/configuração e
reversão preparada. Não sobrescrever um CDR já configurado sem reconciliar seus
destinos. Recarregar apenas `cdr` e carregar `cdr_custom.so`; não reiniciar o
Asterisk nem recarregar PJSIP/dialplan para ativar este histórico. O agente precisa
ser reiniciado após a instalação dos dois arquivos Python. A unidade existente
permite ler `/var/log/asterisk` e escrever o cursor em `/var/lib/union-pbx-agent`.

`activate-history.sh` prepara a aplicação única para a VPS auditada: exige a opção
`--acknowledge-history-activation`, confere o hash do agente anterior, recusa CDR
ou helper já existentes, bloqueia chamadas ativas, faz backup root e tenta
restaurar o estado anterior se a ativação falhar. **Preparar/copiar o script não
é aprovação para executá-lo.** Não usar em outro servidor sem nova auditoria.

Não são gravados áudio, nome de chamador, argumentos de aplicações, userfield,
cabeçalhos SIP ou segredos. A pasta `cdr-custom` deve pertencer a `asterisk`, modo
0750; os arquivos devem ter acesso restrito. Não adicionar gravação de voz ou
exclusão automática de dados nesta implantação. A política de retenção precisa
ser definida antes de habilitar limpeza automática. Monitorar espaço em disco.
Não apagar arquivos rotacionados que ainda contenham dados não confirmados.

Rotação suportada: rename numerado `.1`, `.2`, etc., sem compressão enquanto
estiver pendente, seguido de reabertura do backend. `copytruncate` não garante
ausência de perda durante a própria rotação e deve ser evitado. Arquivo pendente
ausente ou cursor corrompido interrompe somente a coleta e exige diagnóstico.

Validação: `python3 -m unittest discover -s scripts/union-pbx-agent -p 'test_*.py'`.
`test_call_history_database.sql` testa ingestão, duplicação, endpoint registrado de
outra empresa, direção e RLS em transação com rollback de todos os dados fictícios.
Após a ativação, validar chamadas reais internas e entrada FVX; dados anteriores
à ativação não estão disponíveis retroativamente. A interface fica em
Ferramentas → PABX → Histórico de ligações e mantém o telefone montado.

Referências de formato e opções: [CDR Asterisk 22](https://docs.asterisk.org/Asterisk_22_Documentation/API_Documentation/Dialplan_Functions/CDR/)
e [backend customizado oficial](https://github.com/asterisk/asterisk/blob/22/configs/samples/cdr_custom.conf.sample).

## Pausa por integrante da fila

O protocolo 2 adiciona `queue_availability.py`, instalado ao lado de `agent.py`.
Sem esse módulo importável, o agente anuncia protocolo 1 e mantém as demais
operações. O backend registra a capacidade a cada poll; um rollback volta a
bloquear os controles. A tela exige `pbx.manage`, leitura recente da fila e um
agente compatível com comunicação nos últimos 95 segundos.

As migrações `20261110015339_pbx_queue_member_availability_controls.sql` e
`20261110021308_pbx_queue_control_generation_order.sql` guardam o estado desejado
e a confirmação separadamente. Não criam pausas por padrão. O RPC verifica
organização, permissão, integrante ativo e fila aplicada. A revisão UUID impede
confirmar uma solicitação substituída; o contador sequencial ordena solicitações
na interface mesmo quando transações têm horários iguais ou fora de ordem.

O agente reconcilia até dez integrantes por ciclo, com limite de tempo. Verifica
o endpoint e número no estado local da fila da própria organização. O UUID do
cadastro e o UUID do nome do endpoint são independentes e não são derivados um
do outro. Todo comando CLI inclui a fila exata; nunca pausa em todas as filas.
O estado é consultado após a ação. Falhas não são reportadas como aplicação, nem
incluem a saída bruta do comando. Não recarrega módulos, dialplan ou PJSIP e não
derruba uma conversa em andamento. Pausa é diferente de registro SIP e de mudo.

`activate-availability.sh` é a atualização única para o agente auditado que já
possui histórico. Exige `--acknowledge-availability-activation`, hash anterior
confirmado, diretório de staging revisado, ausência de chamadas e aprovação do
proprietário. Faz backup, instala agente/módulo e reinicia somente o agente.
Não envia qualquer solicitação de pausa. Sua reversão automática mantém o
histórico e restaura o agente anterior se houver falha local.

Antes de aplicar: testes Python e de banco, backup e janela autorizada. O arquivo
`test_queue_availability_database.sql` usa o papel authenticated de verdade,
valida RLS, membro/organização, revisão substituída, geração, confirmação repetida
e protocolo antigo; todas as alterações fictícias são revertidas. Depois da
aplicação, testar pausa e retomada de um integrante mantendo outro disponível,
conferir o estado efetivo no Asterisk e no CRM e restabelecer a disponibilidade.

## Relatório e exportação do histórico

`pbx_call_history_report` é uma função somente de leitura, SECURITY INVOKER,
com as mesmas políticas RLS do histórico e dos ramais. Usa os filtros da lista,
inclusive o ramal associado quando o destino técnico está vazio. O resumo conta
registros/trechos e identificadores vinculados; resposta na sinalização não é
garantia de atendimento humano. A soma de durações pode conter trechos
simultâneos e não representa faturamento.

A exportação é integral, com até 2.000 registros por arquivo. Acima do limite,
nenhuma lista parcial é retornada e a interface pede filtros mais restritos.
Totais e registros são calculados no mesmo snapshot; a tela adota o resumo da
exportação confirmada. CSV usa UTF-8 com BOM, separador ponto e vírgula, horários
normalizados em UTC e proteção contra fórmulas em campos de texto. O download
é local após uma consulta autorizada; nenhuma mensagem é enviada a terceiros.
Troca de empresa/filtro e desmontagem cancelam exportações pendentes antes do
download. O teste `test_call_history_report_database.sql` verifica permissões,
RLS, filtros, snapshot e limite com dados fictícios integralmente revertidos.
