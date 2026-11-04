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
- Novos ramais ficam no contexto `union-internal` (somente 900 nesta etapa).
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
