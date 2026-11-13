# Tom de chamada ouvido pelo atendente

Correção de 13/11/2026. O telefone compartilhado reproduzia somente a mídia
remota; não tratava o evento SIP de progresso para gerar tom local. Assim,
uma resposta 180 sem áudio podia deixar o atendente sem tom, apesar do destino
estar tocando. Não se trata do toque do telefone que recebe a chamada.

## Comportamento

- Preparar reprodução no clique de ligar, inclusive fora da página PABX.
- Gerar 425 Hz, 1 segundo de tom e 4 de silêncio, após 180/183.
- Manter fallback com SDP/track silencioso; ceder ao som remoto confirmado.
  Ignorar estalo isolado e não reiniciar cadência por progresso repetido.
- Respeitar a saída de áudio selecionada. Indicar bloqueio do navegador e
  permitir nova tentativa pelo botão existente de habilitar áudio.
- Se a análise de mídia falhar, suprimir fallback quando houver mídia remota,
  evitando sobrepor avisos; tentar recuperar a análise no clique do atendente.
- Parar ao aceitar/confirmar, cancelar, falhar, terminar, desconectar, trocar
  empresa ou desmontar o telefone. Uma sessão anterior não controla a nova.
- Chamadas recebidas não acionam esse tom de saída.

## Caminhos conferidos no código e nas regressões

| Origem | Entrada compartilhada |
| --- | --- |
| OS e links de telefone aceitos pelo CRM | `originateExternal` |
| Discador externo, contatos e retorno externo | `originateExternal` |
| Mini-PABX e confirmação de ligação pendente | Mesmo discador persistente |
| Ramal, fila e URA pelo discador interno | `callInternal` |
| Retorno interno pelo histórico | `onReturnCall`, preparação antes de SIP |
| Eco 900 | `callEcho`; atendimento encerra fallback |
| Espera e transferência de chamada estabelecida | Sem novo tom local; sessão existente preservada |

## Validação

Suíte completa `test:ci`, qualidade, site e CRM compilados. Testes executáveis
cobrem sinalização 100/180/183, track silencioso, som/estalo, cadência, saída,
autoplay, análise bloqueada e recuperação, encerramento e chamadas consecutivas.
Revisão independente concluída sem defeitos materiais pendentes.

Não há migração, atualização de Edge Function nem alteração de rota FVX nesta
correção. Os testes automatizados não substituem a audição de uma ligação real
no navegador do atendente; esse aceite deve ser feito após atualizar o CRM.

Referência da sinalização:
https://jssip.net/documentation/api/session/#event_progress
