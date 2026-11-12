# Union World — Motor WhatsApp (controle global)

## Escopo e autorização

- Uma instância WuzAPI compartilhada atende todas as empresas que utilizam aquela VPS. Cada empresa preserva seus próprios usuários, sessões e canais.
- Controle exclusivo no **CRM da organização operadora Union**, em **Central de Gestão → Motor WhatsApp**. Nunca incluir em **Canais de Atendimento** das parceiras.
- Endpoint `union-whatsapp-engine` exige JWT, organização ativa igual à retornada por `platform_operator_organization_id()` e permissão `platform.management.manage`, verificadas no servidor.
- Ponte HTTP interna recebe apenas `engine_info` autenticado com HMAC, sem números de telefone e sem retorno de tokens. Não existe operação `engine_update` ou acesso Docker no servidor Node.
- A versão mais recente é consultada via endpoint público de releases do projeto asternic/wuzapi; não fazer upgrade automático do Whatsmeow por conta própria.

## Monitoramento recorrente (sem executar upgrade)

O workflow GitHub Actions `.github/workflows/wuzapi-release-monitor.yml` verifica diariamente, às **08h25 em Brasília**, a última release estável do repositório oficial. Quando identifica uma tag ainda não registrada, cria uma issue no repositório da Union (possivelmente pública, se o repositório for público); portanto **não incluir dados de produção, números, senhas, URLs privadas ou logs nessa issue**.

Este monitoramento é **somente aviso**. Não consulta a VPS, não sabe se existe atualização pendente para o contêiner instalado e não executa modificações. A execução diária depende de GitHub Actions estar habilitado e da permissão `issues:write` do `GITHUB_TOKEN`. A página da Union consulta a versão oficial sob demanda via Edge Function e só afirma existir atualização se a versão instalada tiver sido informada de forma confiável.

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

## Cache de fotos do WhatsApp (09/11/2026)

A importação Excel/CSV de até 50 mil contatos grava **somente nome e telefone**. Não baixa imagens de perfil. A agenda consulta miniaturas dos itens visíveis e o atendimento prioriza a conversa aberta e as primeiras 12 conversas da lista, com até três buscas paralelas por tela.

- Ponte Node: cache temporário LRU limitado a **24 MiB estimados** e **512 entradas**, o que for atingido primeiro. Estimativa conservadora baseada no comprimento das strings; não representa toda a memória do processo. Fotos presentes expiram após 60 minutos, ausência/privacidade após 15 minutos. Solicitações simultâneas ao mesmo contato compartilham uma única consulta. Downloads de avatares HTTPS respeitam teto de 200 kB durante a leitura em streaming, mesmo sem `Content-Length`.
- Navegador: cache volátil por tela limitado a **8 MiB estimados** e **96 entradas**. A interface revalida apenas fotos **exibidas** com TTL expirado; verifica ao retornar à aba e a cada cinco minutos quando visível. Falhas transitórias mantêm a foto antiga e tentam novamente depois de cinco minutos. Não há sincronização em massa de imagens nem gravação de avatares no PostgreSQL/Storage da Union WhatsApp.
- Trocar a foto ou alterar a privacidade no WhatsApp **não produz atualização imediata garantida**: a foto será renovada no próximo carregamento visível após o TTL. A disponibilidade depende das permissões de privacidade e do serviço WhatsApp.
- **Implantação:** alterações do frontend e do código de `server.mjs` estão no GitHub. O frontend segue o fluxo habitual de publicação; **a ponte na VPS exige implantação separada** com backup do `server.mjs`, `node --check` e reinício **somente** de `union-wuzapi-bridge`. Não reiniciar o contêiner WuzAPI e não alterar sessões ou banco de dados.
- **Verificação após publicação:** abrir contato sem foto (iniciais), abrir contato com foto, alternar telas e empresas, deixar a aba aberta além do TTL para confirmar renovação, testar fallback de CDN e medir RSS da ponte sob consultas concorrentes. Os testes de código não substituem validação ponta a ponta na VPS.



## Cache privado e redução de tráfego (12/11/2026)
Esta seção substitui os prazos de cache descritos no bloco de 09/11.
- Online/digitando removidos: interface não solicita presença; webhook ignora eventos antigos sem escrita no Postgres. Nova configuração da ponte retira Presence/ChatPresence das assinaturas; a atualização manual da VPS é necessária para isso.
- Fotos: o navegador carrega somente as conversas visíveis, sem timer. A Edge busca primeiro o índice privado union_whatsapp_avatar_cache, por empresa, canal e conta. A cópia da imagem fica no bucket privado union-whatsapp-media, e não no corpo das linhas SQL. Fotos existentes são revalidadas no máximo a cada 7 dias; ausência/erro fica em cache por 24 horas. O frontend recebe URL temporária de 2 horas e nunca vê o token WuzAPI.
- Números: resultados positivos ficam em union_whatsapp_number_check_cache por até 30 minutos; respostas not_registered por até 10 minutos. Respostas inconclusivas não são cacheadas. Cada entrada é isolada por empresa, canal e telefone da conta.
- Implantação: aplicar a migração 20261112113500_union_whatsapp_private_caches.sql primeiro, publicar as Edge Functions union-whatsapp-inbox (incluindo avatar-cache.ts) e union-whatsapp-webhook, depois o frontend. A ponte Node exige atualização separada na VPS com backup e node --check, reiniciando somente union-wuzapi-bridge, nunca o motor WuzAPI.
- Não testar envios com contas temporariamente restritas. Reduzir consultas não é método de contornar controles do WhatsApp; a conexão continua não oficial.
