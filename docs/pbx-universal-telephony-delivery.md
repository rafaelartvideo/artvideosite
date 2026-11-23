# Telefonia universal — entrega de 23/11/2026

## Escopo

O CRM mantém a configuração legada e acrescenta um cadastro separado de operadoras, contratos, conexões SIP, troncos lógicos, capacidade, DIDs, grupos e rotas por empresa. Os limites e sua procedência são configuráveis; credenciais e sucesso de registro não determinam capacidade. O cadastro usa revisão otimista, auditoria, referências da própria empresa e segredos separados no Vault.

O agente recebe documentos completos apenas quando a revisão muda e renova a concessão por mensagens pequenas. A reserva de canais ocorre na VPS, em SQLite transacional, sem consulta ao Supabase por chamada. O observador local fecha a admissão antes de reconciliar os canais do Asterisk. Um identificador de amostragem por perna impede liberar uma reserva que foi vinculada durante a coleta. Chamadas estabelecidas não expiram por temporizador; o encerramento exige identificação da perna ou reconciliação completa.

O compilador aceita somente opções tipadas e permitidas. A entrada exige identificação confiável do peer, CIDR e DID exato, com destino da mesma empresa. Sobreposição ambígua de redes entre conexões de entrada por IP/digest é recusada: não existe entrada genérica ou seleção por primeiro resultado. Para gateways compartilhados que não forneçam identidade inequívoca, é necessária configuração que permita distinguir as conexões antes da ativação.

Não há repetição automática depois de iniciar o Dial. Prioridade, rodízio e contingência escolhem entre candidatos saudáveis e com capacidade antes do primeiro INVITE. O teto de custo exige tarifa conhecida para o destino. A disponibilidade exibida é conservadora e respeita todos os limites superiores aplicáveis.

## Compatibilidade e implantação

A migração `20261122235933_universal_telephony_registry.sql` é aditiva e preserva as tabelas e rotas antigas. As permissões de entrada/saída internas e externas continuam separadas. O controle de identidade impede a ativação conflitante da mesma conta em empresas diferentes. Uma desativação somente libera a identidade após confirmação de configuração vazia e ausência de pernas ativas.

A Union e a Artvideo foram preparadas com documentos vazios, roteamento universal desativado. A linha FVX legada permanece registrada e operando pela configuração existente. Seus limites ainda desconhecidos impedem migrá-la automaticamente para os limites agregados: ela não é considerada capacidade ilimitada nem fica fora da contabilização silenciosamente. As contas 101/102 não foram cadastradas com credenciais presumidas nem ativadas.

O instalador fixa os hashes das fontes, valida o predecessor e os auxiliares preservados, exige ausência de chamadas, cria backup de bytes/proprietários/permissões, instala o observador local e reinicia somente os agentes. O Asterisk não é reiniciado. A preparação acrescenta includes próprios vazios com transação e reversão; o proprietário original do `pjsip.conf` é preservado.

Backup da instalação: `/root/union-pbx-universal-backups/28458218-6bb8-48fd-b22f-870722d0aa32`.
O manifesto registra os caminhos e metadados anteriores. Não apagar o ledger com chamadas ativas. Para recuperação do ensaio nativo, usar o journal e o comando de limpeza do próprio audit, preservando alterações concorrentes.

## Evidências

- Suíte completa do CRM (`npm run test:ci`) e builds do site/CRM: aprovados na base remota atualizada.
- Suíte Python no Linux: aprovada, incluindo concorrência, rodízio, reinício, limites independentes, múltiplas contas e proteção da reconciliação.
- PostgreSQL descartável: migrações anteriores + nova migração e regressões de isolamento, Vault, revisão, ativação, claims, desativação e concessões aprovadas.
- Banco hospedado: migração aplicada; `anon` não pode salvar configuração e o navegador não pode consultar o endpoint que entrega segredos aos agentes.
- Função `union-pbx-agent` publicada separadamente, mantendo a validação Ed25519 e os protocolos 2/3 existentes.
- Asterisk 22.11.0: seis chamadas sintéticas locais com AGI real. Conta prioritária recebeu um INVITE; com sua capacidade ocupada, somente a segunda recebeu um INVITE; limite agregado, concessão vencida, origem sem permissão e admissão bloqueada geraram zero INVITEs ao destino.
- Journal nativo final `c6579a77143f4518aec7919bf8bdfacd`: `passed=true`, `cleaned=true`, `fvx_preserved=true`, zero chamadas externas e zero chamadas humanas.

O ensaio local prova roteamento/admissão/encerramento, não voz, autenticação ou capacidade contratada de uma operadora real. Os testes humanos anteriores da FVX não foram repetidos nem usados como evidência da arquitetura nova. A validação comercial de cada conexão depende dos dados e limites configurados para seu contrato, sem modificar o código.

## Verificação reproduzível

```
python3 -m unittest discover -s scripts/union-pbx-agent -p 'test_*.py'
pg_virtualenv bash scripts/union-pbx-agent/test_universal_telephony_pg.sh --disposable-cluster
npm run test:quality
npm run test:ci
npm run build
```

O ensaio nativo é opt-in: executar o preview de `audit_universal_telephony.py`, comparar o hash completo com o bundle revisado e só então usar `--apply --expected-bundle-sha`. Ele usa somente endpoints aleatórios e destinos de loopback, exige ausência de chamadas e restaura os arquivos globais com validação de hashes.

O push em main publica o CRM pelo workflow HostGator. A publicação FTPS deve ser conferida separadamente; sucesso do commit não comprova publicação nem implantação do banco/agente.
