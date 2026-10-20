# Union World — Canais de Atendimento (WuzAPI / Fase 1)

## Escopo implementado
- Novo card em **Operação > Integrações > Canais de Atendimento**.
- Metadados da conexão separados por `organization_id` (um número WuzAPI por empresa nesta fase).
- Permissões: `settings.channels.view` e `settings.channels.manage`. Gestores herdam acesso de `settings.update` e `settings.details.view` existente; operadores não recebem acesso administrativo automaticamente.
- Frontend: cadastrar, preparar sessão, consultar estado, conectar, mostrar QR Code temporário e desconectar com confirmação.
- Edge Function: autentica JWT do usuário, valida as permissões reais da empresa ativa e conversa com uma ponte HTTPS assinada.
- Bridge Node: valida HMAC + timestamp + nonce, mantém os tokens WuzAPI exclusivamente na VPS e acessa o WuzAPI em localhost.
- **SAC Digital intacta**. Nenhuma mensagem, fila, protocolo ou histórico foi migrado.

## Situação antes da ponte
A interface e os metadados funcionam após migração e deploy da Edge Function. Os botões de preparação/conexão retornam mensagem clara de indisponibilidade até configurar `UNION_WUZAPI_BRIDGE_URL` e `UNION_WUZAPI_BRIDGE_SECRET`. Não exibir QR fictício.

## Configuração segura da ponte (VPS)
Pré-requisitos: Node.js 20+, Nginx HTTPS com domínio escolhido, WuzAPI isolado rodando em `127.0.0.1:18080`, e token `WUZAPI_ADMIN_TOKEN` já existente no arquivo privado `/opt/union-wuzapi/.env`.

1. Execute o instalador revisado `services/union-wuzapi-bridge/install.sh` como root na VPS. Ele obtém a revisão fixada da ponte, verifica sintaxe com Node, instala um serviço systemd não privilegiado e não altera Nginx nem Docker/Zappro.
2. Crie `/opt/union-wuzapi-bridge/sessions` com dono root e modo `0700`; não compartilhe nem suba ao GitHub.
3. Gere um segredo aleatório de pelo menos 32 caracteres (`openssl rand -hex 32`) e salve como `UNION_WUZAPI_BRIDGE_SECRET` em ambiente protegido somente no servidor. Configure `WUZAPI_ADMIN_TOKEN` com o valor que já existe no arquivo privado do WuzAPI. Nunca copie esse token para React/Vite.
4. Inicialize o processo Node sob systemd, usando `EnvironmentFile` privado (modo `0600`) e `WorkingDirectory=/opt/union-wuzapi-bridge`. O processo fica no **localhost:19080**.
5. No Nginx, adicione somente a rota HTTPS **POST /union-wuzapi/v1/channel-control** encaminhada a `http://127.0.0.1:19080/v1/channel-control`, após inspecionar o server HTTPS existente. Use o modelo em `services/union-wuzapi-bridge/nginx-location.example.conf`. Não publique `18080`, `/admin/users` ou quaisquer rotas brutas WuzAPI. Mantenha regras de firewall ativas.
6. No painel de segredos das Edge Functions do Supabase configure:
   - `UNION_WUZAPI_BRIDGE_URL=https://SEU-DOMINIO-HTTPS/union-wuzapi/v1/channel-control`
   - `UNION_WUZAPI_BRIDGE_SECRET` com o **mesmo segredo gerado** (não exposto ao navegador).
7. Valide resposta não autenticada: sem assinatura, a ponte deve devolver **401**. Depois use um número de teste para conectar e verificar leitura de estado e expiração de QR Code.

O domínio da ponte **precisa existir**. Não configure o endereço `http://127.0.0.1:18080` como variável da Edge Function: nesse ambiente, localhost aponta para o servidor da Supabase, não para sua VPS.

A ponte **não recebe** a service_role do Supabase nem senhas do CRM. O Edge valida o usuário e faz operações de banco; a ponte só conhece sessões e credenciais privadas do WuzAPI.

### Recuperação e limites
- Não apagar a pasta de sessões da ponte nem volumes do PostgreSQL WuzAPI: eles contêm dados de conexão.
- A ação `provision` cria usuário WuzAPI e salva seu token na VPS. Se falhar no meio, **não recriar manualmente o mesmo usuário** antes de examinar o estado e a pasta de sessões.
- O painel só consulta automaticamente o estado enquanto o QR Code estiver aberto, evitando polling desnecessário.
- A API WuzAPI por QR Code é **não oficial** e pode sofrer bloqueios/desconexões do WhatsApp. Testar com número secundário antes de oferecer a clientes.
- Webhooks de recebimento, mensagens, filas, importação de histórico e faturamento são etapas seguintes; não são habilitados automaticamente nesta fase.

## Validação recomendada
1. Migração aplicada no Supabase, RLS ligada e políticas de leitura por empresa presentes.
2. Colaborador sem `settings.channels.manage` não consegue provisionar/conectar, mesmo chamando a Edge Function diretamente.
3. Usuário de outra organização não pode consultar/cadastrar o canal.
4. Token do WuzAPI nunca é retornado ao cliente nem salvo nas tabelas públicas.
5. WuzAPI original do Zappro permanece parado/preservado e não recebe nenhuma ação desta integração.

## Comandos de instalação e auditoria de Nginx

Na VPS (shell Linux, não no PowerShell), a revisão do instalador pode ser baixada e executada assim:

```bash
curl -fsSL https://raw.githubusercontent.com/rafaelartvideo/artvideosite/cc8fc684d9e6f13f2bb94b688fb21d1b006480e8/services/union-wuzapi-bridge/install.sh -o /root/install-union-bridge.sh
bash -n /root/install-union-bridge.sh
bash /root/install-union-bridge.sh
```

O script valida o HTTP 401 da API local, exige Node.js >= 20 acessível ao usuário de serviço, preserva segredos existentes em execução idempotente e executa `systemctl enable`/`restart` **somente** da nova unidade `union-wuzapi-bridge`. A porta de serviço é 127.0.0.1:19080. Nenhum container é recriado.

Para escolher o server HTTPS existente **sem imprimir segredos**:

```bash
nginx -T 2>/dev/null | grep -E '^[[:space:]]*server_name[[:space:]]+' | sort -u
```

Não colar o arquivo de exemplo dentro do bloco `http {}` nem criar um server SSL novo sem conferir os certificados e `server_name`. Após configurar a rota, executar `nginx -t` e só então `systemctl reload nginx`. A URL não assinada deve retornar 401 do bridge. Testes de navegador e QR ocorrem somente depois de configurar os segredos no painel Supabase.
