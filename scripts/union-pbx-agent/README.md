# Union PABX — ponte de provisionamento por saída HTTPS

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
