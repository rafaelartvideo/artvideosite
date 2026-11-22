# PABX: motor de múltiplas contas — entrega parcial, sem ativação

## Escopo real

Esta entrega adiciona um compilador e um motor local de reserva de capacidade,
com testes isolados. **Não habilita múltiplos troncos no CRM, no banco ou na VPS.**
O agente existente não importa estes módulos. O dialplan existente, a FVX legada,
as Edge Functions e as credenciais permanecem no fluxo anterior.

Arquivos:

- `scripts/union-pbx-agent/outbound_capacity.py`: catálogo sem senhas, grupos,
  autorização por ramal, observações recentes e reservas SQLite transacionais.
- `scripts/union-pbx-agent/sip_accounts_v2.py`: compilação de várias contas em
  um tronco lógico ou vários troncos; uma credencial pode ter vários canais sem
  gerar registros duplicados. Não emite rotas de saída concorrentes nem as ativa.
- `test_outbound_capacity.py` e `test_sip_accounts_v2.py`: regressões executáveis.

## Auditoria realizada em 22/11/2026

Base GitHub: `52433627538609cf69d7f187ed50afeb845d18ab`, branch `main`.
Projeto Supabase confirmado: `wmjmtcjpunmzvonlkjcu` (CRM).

Consultas limitadas de catálogo e estado confirmaram:

| Componente | Resultado observado |
| --- | --- |
| Índice `pbx_sip_one_enabled_org` | Ainda limita a um tronco habilitado por organização |
| `pbx_sip_trunk_configs` | Nenhum cadastro gerenciado na consulta realizada |
| Grupos de saída | Não existem tabelas implementando os novos grupos |
| Migrations SIP | `20261111101756`, `20261111163048`, `20261113124416` registradas |
| Agentes | Dois habilitados; plataforma protocolo 2 e perfil isolado protocolo 3 |
| FVX Union | Estado informado pelo agente: habilitada, aplicada, registrada |
| Confirmação FVX consultada | 22/11/2026 19:57:03, horário de Brasília |
| Ambiente Supabase de desenvolvimento | Nenhuma branch existente |

O estado FVX foi lido de `private.pbx_legacy_trunk_controls`, associado ao cadastro
da mesma organização. Isso é evidência do último relatório do agente, **não uma
inspeção direta de canais, RTP ou arquivos do Asterisk**. Não comprova dois canais
contratados, registro das contas 101/102 ou áudio bidirecional.

Bloqueios encontrados:

- SSH: conexão recusada pelo ambiente com `Permission denied` antes de autenticar.
- Git local: escrita em `.git/FETCH_HEAD` negada. O conector GitHub funciona.
- Clone novo em `C:\workspace`: criação do diretório negada.
- Navegador integrado: abertura do painel HostGator falhou com erro de vínculo da
  aba à sessão. Nenhum terminal web foi acessado e a existência dele não foi verificada.
- Python completo no Windows: módulos Linux, incluindo `fcntl`, indisponíveis.
  A validação completa deve ocorrer no runner Ubuntu existente do GitHub Actions.

Não há motivo para reenviar credenciais ou repetir autorização. Para SSH nesta
sessão, o administrador do ambiente precisa permitir a conexão de saída TCP à
VPS autorizada na porta 22022. Para usar Git local, precisa permitir escrita nos
metadados `.git`; o conector dispensa essa segunda alteração.

## Garantias do novo motor em isolamento

1. `BEGIN IMMEDIATE` inclui seleção, verificação de limites e reserva numa única
   transação; não depende de um lock Python compartilhado em memória.
2. Conta, tronco, grupo e empresa possuem limites separados. Todas as reservas
   de uma empresa, inclusive de outros grupos, participam do limite da empresa.
3. O catálogo e as observações devem cobrir a organização inteira. Observações
   ausentes, duplicadas, futuras ou com mais de 30 segundos bloqueiam novas reservas.
4. Prioridade e distribuição circular são determinísticas. A estratégia de
   contingência seleciona alternativas antes de iniciar o INVITE.
5. Apenas indisponibilidade comprovada **antes** do INVITE permite contingência.
   Ocupado, recusa, cancelamento, timeout ou falha ambígua não provocam rediscagem.
6. Reservas persistem durante estabelecimento, ligação longa e reinício do
   processo. Não são liberadas por tempo, desconexão WebRTC ou entrada em espera.
7. A identidade é da perna externa, não da conversa ou `Linkedid`. Uma transferência
   que cria outra perna exige outra reserva e libera cada recurso separadamente.
8. O compilador reaproveita a validação estrita v1 por conta; verifica colisões
   com identidades legadas/externas fornecidas pelo catálogo confiável.
9. Novas entradas continuam rejeitadas. Não são criadas regras `identify` ou ACLs
   inventadas. Não existe fallback implícito à FVX.
10. O motor não armazena senha, número discado ou dados pessoais no ledger.

## Contrato obrigatório para integração, ainda pendente

O motor é uma biblioteca de entrada confiável, **não uma API para o navegador**.
Antes de ativá-lo, implementar e validar em conjunto:

- Migration nova gerada pelo CLI: grupos, membros, políticas de capacidade,
  revisões e estado observado; RLS e RPCs com `pbx.manage`, vínculo imutável de
  organização e reutilização das claims globais de identidade SIP existentes.
- Protocolo assinado v2 com catálogo completo, revisão e lease próprios. Agentes
  antigos não podem receber payload v2. Nenhuma chamada pode partir de catálogo
  em cache quando a admissão cloud/lease expirou. Este motor não renova leases.
- Remover a unicidade de um tronco por empresa apenas junto da nova admissão;
  não remover as claims de identidade nem liberar a plataforma indiscriminadamente.
- Adaptador AGI/AMI revisado que reserve antes do INVITE e escolha exclusivamente
  o endpoint produzido pelo compilador. Nenhum dado do cliente decide o endpoint.
- Uma única base SQLite local por PBX físico e todos os workers. Diretório e
  schema provisionados antes de conceder acesso aos processos Asterisk; modo
  restrito, nenhum symlink e nenhum armazenamento em filesystem de rede.
- Captura de todas as pernas externas, incluindo entrada e pernas não originadas
  pelo roteador. Para limites simultâneos estritos abrangendo entrada e saída,
  ambas precisam participar da mesma reserva atômica: observação periódica de
  chamadas recebidas, isoladamente, não elimina corridas com novas entradas.
- Reconciliação após reinício: bloquear novas chamadas enquanto houver estado
  incompleto; liberar órfãos apenas com evidência autoritativa de término/ausência
  e nenhuma operação de estabelecimento ainda em voo. Não expirar reservas cegamente.
- Drenar chamadas antes de mudar capacidades/membros ou desabilitar uma conta.
  O bundle tem de ser verificado no Asterisk antes de confirmar aplicação no banco.
- Observador de registro/endpoint real, erros seguros e horários de verificação;
  configuração aplicada e registro SIP são estados distintos.
- UI de contas, canais, grupos, prioridade e estratégia, com regressões e teste
  no navegador. Campos de senha de edição devem continuar vazios.

Esses componentes não estão entregues neste commit; não existe comando honesto
de ativação completa para uma integração ainda ausente.

## Procedimento exato para retomar a inspeção na VPS

Os comandos abaixo são somente de leitura e não originam chamadas:

```sh
asterisk -rx 'core show version'
asterisk -rx 'core show channels'
asterisk -rx 'pjsip show registrations'
asterisk -rx 'pjsip show endpoints'
asterisk -rx 'pjsip show contacts'
systemctl is-active asterisk union-pbx-agent
systemctl list-units 'union-pbx-agent@*' --no-pager
```

Identificar os caminhos efetivos do serviço e os includes sem imprimir arquivos
de auth. Fazer backup root 0700 dos arquivos afetados e manifesto de propriedade,
modo e SHA-256 antes de instalar. Não usar instaladores históricos sem conferir
seus hashes fixos correspondem ao runtime da VPS.

Depois de implementar os adaptadores pendentes, testar primeiro um perfil
sintético com registro em loopback; comparar entrada e dialplan legado antes e
depois. Com zero chamadas, aplicar configuração, recarregar somente os módulos
necessários e verificar objetos/registro reais. Nesta versão do projeto os
módulos usados são `res_pjsip.so` e `res_pjsip_outbound_registration.so`;
confirmar a sintaxe no Asterisk instalado. Não executar uma recarga às cegas.

Para validar 101/102, obter as credenciais corretas e a capacidade autorizada pela
FVX. Usar apenas destino de teste explicitamente autorizado. Sem esses dados,
testes externos, áudio, simultaneidade contratada e recebimento ficam pendentes.

## Recuperação desta entrega

Como os módulos novos não são carregados pelo agente e nenhum schema/serviço foi
alterado, não há migração ou configuração de telefonia a reverter. Reverter o
commit remove apenas a biblioteca, testes e este registro. Não apagar o ledger
de uma futura implantação enquanto houver chamadas: isso perde reservas.

## Validação reproduzível

```sh
python3 -m unittest discover -s scripts/union-pbx-agent -p 'test_outbound_capacity.py' -v
python3 -m unittest discover -s scripts/union-pbx-agent -p 'test_sip_accounts_v2.py' -v
python3 -m unittest discover -s scripts/union-pbx-agent -p 'test_*.py'
npm run test:quality
npm run test:ci
npm run build
```

Os testes novos não contatam operadora, Asterisk ou Supabase. O workflow de PR já
executa a suíte Python no Ubuntu e os dois builds; não enfraquecer esses gates.
Após integrar em `main`, conferir o workflow HostGator separadamente. A publicação
do site não instala bibliotecas Python na VPS nem aplica migrations Supabase.
