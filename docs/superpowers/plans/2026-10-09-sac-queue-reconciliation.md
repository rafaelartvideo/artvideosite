# SAC Digital: reconciliação da fila e das operações

## Problema confirmado

A API `/operator/att/queue` retorna protocolos aguardando (`A`) e protocolos já em atendimento (`E`). A Union descartava o status, exibindo ambos como disponíveis para seleção. A consulta real apresentou um protocolo de cada tipo; o atendimento selecionado permanecia corretamente atribuído na SAC e no banco.

Um gatilho legado também interpretava `protocol_new_inbox` (novo recado) como devolução à fila. Leituras anteriores a uma operação podiam reaparecer após sua confirmação, e snapshots idênticos com operador explicitamente nulo preservavam atribuições antigas.

## Implementação

- A fila de espera aceita apenas status `A`; protocolos finalizados ou abandonados são excluídos. Atribuição confirmada tem precedência sobre listas antigas.
- Leituras de protocolos e fila após operações aguardam leituras anteriores e publicam uma barreira para consultas concorrentes. Resultados fora de ordem são descartados e as consultas ficam isoladas por usuário/Operador.
- Novo recado preserva o Operador. Campos omitidos em snapshots preservam os valores anteriores; valores explicitamente nulos limpam a atribuição, inclusive em snapshots repetidos.
- Encaminhamento exige um único destino. Devolução consulta o departamento atual na SAC. Finalização propaga recusas e resultados indeterminados com os mesmos códigos das demais operações.
- Removidos caminhos legados sem uso para seleção/encaminhamento de atendimento pelo recurso de contato. Nova conversa continua usando sua rota própria.

## Verificação

- 98 testes Node SAC passaram, incluindo estado da fila e concorrência de atualização.
- Sintaxe TypeScript dos três arquivos alterados validada.
- Migração aplicada no projeto CRM; fixture SQL transacional passou por assumir, recado, snapshots parciais repetidos, encaminhamento, devolução com operador nulo e finalização. A transação é revertida ao término.
- Revisão independente não encontrou impedimentos restantes.
- Consulta real de fila confirmou a separação entre `A` e `E`. Nenhum atendimento real foi encaminhado, devolvido ou finalizado durante a validação.
