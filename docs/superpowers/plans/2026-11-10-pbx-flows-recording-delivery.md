# PABX — fluxos, áudio e gravações

Continuação da missão original. Manter as ligações Union 301/302/FVX disponíveis.
Não ativar novas rotas externas nem gravação real sem a configuração e aprovação
correspondentes. Não habilitar parceiros reais como parte dos ensaios.

## Decisões de implementação

- Avisos privados por empresa, com upload no CRM e conversão local para WAV PCM
  mono, 16 bits, 8 kHz, até 60 segundos. Verificar duração antes de decodificar,
  limitar tamanho, calcular SHA-256 e não solicitar microfone nessa operação.
- URA com opções numéricas, repetição limitada, tempo de espera e destinos
  aplicados pertencentes à mesma empresa. Compilação por context próprio.
- Horários semanais com fuso IANA e feriados por data; comportamento fora do
  expediente configurável. Configurações podem ser salvas sem central online.
- Ativação desejada/aplicada, versões e erros explícitos. O agente só recebe
  trabalhos de capacidades realmente instaladas, declaradas em poll assinado.
- Modificações do motor usam trava global, guarda de chamadas, arquivos
  próprios e reversão. Validar o resultado carregado no Asterisk.
- Numeração não pode colidir com ramais, filas ou eco. Remover dependências de
  fluxos ativos antes de desativar destinos.
- Gravação desabilitada inicialmente, com política explícita de aviso/aceite,
  escopo, retenção, quota e permissões distintas para reprodução/administração.
  Armazenamento privado, acesso temporário e metadados vinculados ao registro
  real da chamada. Não atribuir gravação por aproximação de número ou horário.
- Troncos e rotas externos de parceiros exigem credenciais protegidas e
  identificação que combine destino próprio e origem autorizada. Identificação
  somente pelo IP compartilhado da operadora não distingue empresas.

## Sequência

1. Concluir o aceite de admissão interna: migrações e Edge na produção,
   heartbeat/capacidade reais, RLS transacional e evidências atualizadas.
2. Biblioteca de preparação dos avisos no navegador e compilador puro de
   fluxos/horários, em arquivos independentes, com testes de contrato.
3. Tabelas/RLS, ativos privados, RPCs e interface de fluxos usando componentes
   administrativos existentes. Nenhuma alteração automática da entrada FVX.
4. Reconciliação do agente, downloads de avisos validados e capacidades
   assinadas. Ensaio interno temporário e cleanup antes da ativação externa.
5. Administração de troncos/rotas e identificação dos tenants no recebimento.
   Preparar uma migração revisável da identificação FVX antes de compartilhar
   sua operadora com outro tronco. Aprovar e testar a alteração ativa.
6. Gravação e reprodução: política desabilitada, autorização por chamada,
   upload autenticado, ACLs e retenção. Testar inicialmente com áudio sintético;
   pedir aprovação antes de gravar uma chamada real de teste.
7. Contingência/offline, indicadores e medições de qualidade. Aproveitar as
   confirmações humanas existentes e evitar repetir chamadas externas.
8. Entregar em main, aplicar banco/Edge/agente coordenadamente e conferir FTPS.
   Relatório final deve separar aprovação real de simulação e pendências.

## Operação da implantação

O conector Supabase não exibiu seu formulário de confirmação. A CLI oficial
3.1.0 já estava autenticada e foi usada sem criar credenciais ou alterar
permissões do plugin. Antes de cada push, usar área temporária com o histórico
remoto e apenas a nova migração, `--skip-vault` e prévia que confirme os arquivos
exatos. Não aplicar migrações pendentes de outros módulos por aproximação.
