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

