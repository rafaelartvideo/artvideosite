# Union World — Motor WhatsApp (controle global)

## Escopo e autorização

- Uma instância WuzAPI compartilhada atende todas as empresas que utilizam aquela VPS. Cada empresa preserva seus próprios usuários, sessões e canais.
- Controle exclusivo no **CRM da organização operadora Union**, em **Central de Gestão → Motor WhatsApp**. Nunca incluir em **Canais de Atendimento** das parceiras.
- Endpoint `union-whatsapp-engine` exige JWT, organização ativa igual à retornada por `platform_operator_organization_id()` e permissão `platform.management.manage`, verificadas no servidor.
- Ponte HTTP interna recebe apenas `engine_info` autenticado com HMAC, sem números de telefone e sem retorno de tokens. Não existe operação `engine_update` ou acesso Docker no servidor Node.
- A versão mais recente é consultada via endpoint público de releases do projeto asternic/wuzapi; não fazer upgrade automático do Whatsmeow por conta própria.

## Implantação pendente na VPS

**A publicação do GitHub e da Edge Function não atualiza a VPS.** O processo `union-wuzapi-bridge` instalado deve receber a nova versão de `services/union-wuzapi-bridge/server.mjs` por uma implantação administrativa controlada, com validação `node --check`, backup do arquivo e reinício apenas da ponte. Não alterar o contêiner WuzAPI nessa etapa.

Para informar a versão instalada sem dar acesso Docker à ponte, instalar o script `services/union-wuzapi-bridge/engine-status-refresh.sh` em diretório administrado pelo root. Executar como root:

```bash
sudo bash engine-status-refresh.sh
```

O nome padrão do contêiner é `wuzapi-api`. Para outro nome: `sudo UNION_WUZAPI_CONTAINER=nome bash engine-status-refresh.sh`.
O script só executa `docker inspect` e grava `/opt/union-wuzapi-bridge/engine-release.json`, dono root, leitura pública (sem segredo). Se a tag do Docker for `latest`, a versão continuará **não identificada**: não inventar uma versão. Para observação periódica, criar timer systemd do root que execute esse mesmo script a cada hora.

A ponte permanece como usuário `unionbridge`, sem socket Docker, sudo, escrita em volumes PostgreSQL ou acesso a senhas de produção. Sua rota continua protegida por HTTPS+HMAC, e a porta 18080 não é publicada.

## Política de atualização de produção

A interface apenas consulta e apresenta estado. O botão de execução remota NÃO foi habilitado, pois o executor privilegiado com rollback verificado ainda não está instalado na VPS.

Antes de instalar qualquer versão:
1. Registrar versão e **digest** da imagem atualmente rodando, versão da ponte e configuração Docker Compose.
2. Backup consistente do PostgreSQL WuzAPI, arquivos de configuração, volumes e diretório privado de sessões da ponte, com **restauração testada fora de produção**. Arquivar em local externo cifrado.
3. Ler as notas de release/migração (mudanças podem alterar o esquema do banco; reverter só a imagem pode não bastar).
4. Homologar com número de teste, verificando login/reconexão, envio/recebimento de texto, arquivos, áudio, imagens, status de entrega e webhook HMAC.
5. Planejar janela de manutenção e informar empresas afetadas. Jamais executar `docker compose down -v`, `docker system prune --volumes`, `logout` ou deletar usuários ao atualizar.
6. Se aprovado, manter versão/digest fixo, validar `docker compose config` e usar apenas a operação necessária para recriar o serviço WuzAPI, sem reinicializar o banco.
7. Verificar todas as sessões e a ponte; em falha, restaurar configuração, imagem **e banco compatível** a partir do backup e executar validação pós-rollback.

Não deixar o painel prometer atualização/rollback que ainda não foi executada. A API WuzAPI é **não oficial** e pode sofrer restrições ou bloqueios; manter o SAC Digital independente.

## Checklist de validação

- União com `platform.management.manage`: botão Motor WhatsApp aparece; endpoint aceita checagem.
- Parceira autenticada: nem vê o botão, nem acessa a Edge Function com sua organização. Tentativa de informar ID da Union também deve ser negada.
- A versão instalada só é exibida se o contêiner informa tag semver via relatório local atualizado.
- Em ponte antiga ou ausente, exibir "Não confirmada" (não alegar que a VPS caiu).
- Verificar novas versões não dispara `restart`, `logout`, `disconnect` nem troca de imagem.
