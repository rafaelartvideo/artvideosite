# Modos de chamada por ramal

Escopo confirmado: internas e externas. Modos: `both` (faz e recebe),
`receive_only` (só recebe), `make_only` (só faz). Preservar ambos nos ramais
existentes e em novos cadastros, sem ativar restrições durante a instalação.
Não confundir direção da ligação com direção do áudio: a conversa continua
bidirecional. Alterações só são aplicadas sem chamadas ativas.

## Aplicação na central

- Contexto de origem próprio por empresa, vinculado ao endpoint autenticado,
  permite novas chamadas somente a ramais com permissão de fazer ligações.
  Abrange todos os destinos, inclusive fila, URA, eco e saída da operadora.
- Subrotina pré-discagem `b()` em Dial/Queue impede chamar um ramal que só faz
  ligações antes de enviar INVITE ao dispositivo. Compatível com o aviso `U()`
  de gravação e o Gosub de aviso da fila. Transferências ao ramal também passam
  pela validação de recebimento. Transferir uma conversa existente mantém as
  regras atuais de destinos internos; não cria permissão para saída externa.
- Manter namespace de cada empresa, contexto original como destino delegado,
  credenciais, identificação SIP, membros das filas e rotas existentes.
- Incluir o 301 manual da Union por preparação explícita da configuração já
  existente. Nenhuma leitura ou escrita de arquivos de outra empresa.
- Reconciliar renderizadores, verificadores de perfil e gravações com os novos
  contextos/hooks. Todos os escritores de rotas precisam preservar os hooks.

## Banco, CRM e entrega

1. RPCs por empresa para listar/aplicar modo, com revisão esperada, permissão
   PBX de gestão, estados desejado/aplicado/falha e agente preparado. Polls e
   relatórios assinados, escopo de agente e revisão; sem segredos SIP.
2. Editor de permissões em Ramais, inclusive para o 301 manual. Telefone recebe
   somente o modo aplicado e oferece atendimento sem os controles de nova
   ligação quando o ramal só recebe. A central é a autoridade de bloqueio.
3. Compilador puro e runtime transacional: preparo opt-in, arquivos privados,
   guarda de chamadas/lock/backup/reversão e verificação do motor real.
4. Testes de isolamento, revisão antiga, fila/transferência, interno/externo,
   compatibilidade com gravações, origem da OS e opções de UI. Ensaio sintético
   sem ramais humanos nem FVX. Revisão independente, qualidade/CI/builds.
5. Main preservada; banco/Edge/VPS coordenados; preparar Union e Artvideo com
   todos em ambos; confirmar telefonia/gravações/FVX e publicação HostGator.


## Evidências de validação antes da implantação

- Suíte completa test:ci e builds site/CRM: aprovados (13/11/2026).
- Contratos do telefone/Edge: 23 testes aprovados; qualidade aprovada.
- PostgreSQL 14 descartável: test_call_modes_pg.sh aprovado, incluindo
  isolamento, autorização, revisões concorrentes, catálogo e permissões SQL.
- Linux: 295 testes Python aprovados, incluindo transações e reversão do
  instalador. Regressão rejeita comando de recarga inexistente.
- Ensaio nativo 3a8e245e2276492086847d4557785082: sete cenários aprovados,
  cleaned=true, zero chamadas humanas/externas. Origem bloqueada e destinos
  proibidos recebem zero INVITEs, inclusive em fila e caminho de transferência.
- O ensaio detectou comando PJSIP incompatível; corrigido para recarregar
  res_pjsip.so com confirmação explícita e espera limitada pelo contexto.
- Implantação inicial: somente both em Union/Artvideo. Modos restritivos
  dependem de escolha explícita no CRM. Não muda tronco nem plano FVX.
- Teste sintético verifica sinalização e bloqueio; não substitui aceite humano
  de áudio depois de uma alteração de permissão escolhida pelo administrador.
