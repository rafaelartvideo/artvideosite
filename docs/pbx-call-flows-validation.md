# URA, horários e avisos privados

Esta entrega adiciona fluxos internos configuráveis por empresa. Não substitui
a entrada FVX automaticamente e não habilita gravação de conversas.

## Comportamento

- PABX → URA e horários: encaminhamento direto ou menu com teclas, tempo de
  espera, repetições limitadas, calendário semanal, fuso e feriados.
- Número interno exclusivo, começando em 910. Novos fluxos ficam desativados.
  O telefone lista somente fluxos habilitados e aplicados na central.
- Avisos privados de até 60 segundos, convertidos no navegador para WAV mono
  PCM 16 bits/8 kHz. Upload sem sobrescrita; duração, tamanho e SHA-256 são
  conferidos novamente na VPS antes de carregar o áudio.
- Teclado no telefone principal e flutuante reutiliza a chamada atual. Não
  envia teclas durante espera, transferência ou estado incerto do controle.
- Destinos e avisos pertencem à empresa. Não é possível renumerar ou remover
  um destino usado por um fluxo ativo. Para alterar esse destino, desative ou
  edite primeiro os fluxos que o utilizam.
- Rascunhos podem ser salvos offline. Estado pendente/aplicado/falha distingue
  cadastro de aplicação real; reprocessar cria uma revisão nova e impede que
  uma resposta antiga confirme uma configuração diferente.

## Verificação

- Suíte CI e compilações completas de CRM e site aprovadas localmente.
- 100 testes focados de telefonia/qualidade e 151 testes Python no Linux
  aprovados, incluindo a prioridade de entrega de credenciais antes de mídia.
- PostgreSQL 14 descartável: migrações históricas e novas políticas/RPCs
  passaram com papéis autenticado/serviço, negativas entre empresas, canários
  estrangeiros, uploads incompletos, MIME/tamanho inválidos, dependências e
  permissões explicitamente negadas. Tudo revertido; cluster removido.
- Asterisk 22.11 real: auditoria `7062a65f-ebd7-4cad-9d9f-c2da2b0bd5a1`
  carregou e conferiu as aplicações, prioridades e labels do fluxo com agenda.
  Configurações originais restauradas e FVX preservada.
- Ensaio sintético `50401a3a-1281-498e-b113-d01ba6d606d3`: reprodução do aviso e
  chegada à opção 1 confirmadas no registro temporário da central. Resultado
  `passed=true`, `cleaned=true`, zero chamadas externas e zero canais ao final.
  Não tocou os ramais de funcionários nem gravou voz humana.

## Instalação e recuperação

`activate-call-flows.sh --acknowledge-call-flow-update` exige o agente anterior
revisado, pacote completo com hashes exatos, trava de operações e ausência de
chamadas. Instala apenas agente/compilador/auxiliar e acesso ao diretório de
avisos para os serviços. Não recarrega Asterisk nem inicia empresas parceiras.
O backup privado contém manifesto, conteúdo e metadados para reversão.

`audit_call_flows.py` tem prévia por padrão. `--apply
--acknowledge-flow-audit` cria e remove contextos temporários; o parâmetro
adicional `--synthetic-call` testa aviso e tecla sem usar pessoas ou operadora.
Não executar durante chamadas ativas.

## Limites

O ensaio sintético comprova mídia e seleção no motor. A conversão de arquivos
e o teclado ainda precisam de aceite em um navegador real do operador. A
interface não oferece gravação de conversa nesta etapa. Troncos externos de
parceiros, política de gravação e contingência operacional continuam na missão
geral. O tom intermitente FVX permanece adiado conforme decisão do proprietário.
