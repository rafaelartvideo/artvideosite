# Gravações automáticas por empresa

Validação de liberação: 12/11/2026. A instalação prepara o recurso com captura
desativada. A empresa configura escopos, finalidade, base legal, informação aos
titulares, retenção, quota e aviso opcional antes de habilitar a política.

## Proteções e funcionamento

- Políticas versionadas por organização; permissões separadas para gestão e
  reprodução. Um usuário com acesso apenas às gravações não recebe o telefone.
- Escopos interno, entrada e saída. Artvideo permanece sem tronco externo.
- Captura condicionada a autorização assinada curta, vínculo do endpoint e
  limite de duração. Falha de gravação não impede a ligação.
- Arquivos privados por empresa, vínculo exato ao evento do histórico e envio
  somente após fechamento. O servidor confere WAV, tamanho e SHA-256.
- Quota serializada e retomada de upload sem substituir arquivo já recebido.
- Reprodução autenticada com URL curta, limitada também pela retenção.
  Limpeza física é periódica e retoma quando a integração está disponível;
  a autorização de reprodução recusa registros vencidos imediatamente.
- Reservas sem mídia e WAVs vazios de chamadas não atendidas são recuperados
  somente após comprovar o encerramento do canal e a propriedade dos arquivos.

## Evidências antes da publicação

- `npm run test:ci`: aprovado; normalização temporária de três arquivos com
  CRLF somente durante regressões existentes, bytes restaurados ao terminar.
- `npm run test:quality`: 5 testes aprovados.
- `npm run build`: site e CRM compilados.
- Python no Linux: 252 testes aprovados como root. Execução sem privilégios
  verifica também o isolamento dos fixtures, sem acessar configurações reais.
- PostgreSQL 14 descartável: cadeia de migrações, políticas, permissões,
  expiração, repetição e concorrência de quota aprovadas. Duas reservas de
  40 MiB para quota de 64 MiB resultam em uma aceitação e uma recusa.
- Ensaio Asterisk `d35cbddddb1e4f47b5155dab0c4cb8aa`: aprovado e limpo;
  uma chamada Local, zero chamadas externas, tom sintético de 1,98 s,
  31.724 bytes, SHA-256
  `d959761026bc73a6611ace20c119d5fe84d593767710d5019b8d113ca931da6ca`.
  Captura iniciada antes do atendimento; nenhuma voz humana nem upload.
- Bundle revisado do ensaio:
  `e2606166bebe96e4559e5bae0d06ddd4732ae0c79a18dcfd589eae290b0bd1f7`.

## Implantação e aceite

Aplicar somente a migração `20261111174408_pbx_automatic_recordings.sql`, as
funções `union-pbx-agent` e `union-pbx-recording-access`, e o instalador revisado
`activate-recordings.sh`. O instalador verifica oito arquivos e o predecessor,
faz backup e reversão, exige ausência de chamadas e reinicia somente os agentes
já ativos. A preparação por empresa usa `recordings-init`, sem habilitar política.

O aceite de conversa real permanece pendente da configuração pelo responsável
da empresa e de uma ligação interna com reprodução autorizada no CRM. O ensaio
sintético não substitui esse aceite. O tom de chamada intermitente FVX continua
adiado por decisão do proprietário.

Commit, publicação HostGator e implantação efetiva devem ser conferidos em
separado; a presença deste documento no Git não comprova implantação.
