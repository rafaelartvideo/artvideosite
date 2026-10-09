# Correção de autenticação e estados SAC Digital

**Objetivo:** validar a identidade operacional real, corrigir a decisão de rota de nova conversa e distinguir abandono de espera.

**Evidência:** documentação Apiary v2.3.1 obtida integralmente em 09/10; login documentado gera JWT com sub vazio. Perfil e fila retornam invalid_auth, inclusive com socket ativo. Vínculo de ID não comprova autenticação. A central exige autorização por código para Operador.

## Execução
- [x] Autenticação: teste reproduz token de aplicativo sem Operador; validação do perfil e socket dentro do lease; erro específico antes da mutação, sem renovar e repetir cegamente.
- [x] Nova conversa: testar escolha entre notificação inicial, autoatendimento e sessão operacional. Não encaminhar contato já em atendimento nem exigir atribuição para notificação inicial.
- [x] Estados: testar prioridade do abandono, da fila operacional e da finalização. Expor metadados necessários e aba Abandonados.
- [x] Operações: testar contratos PATCH select/forward/finish, voto e destinos; conferir permissão e titular do protocolo.
- [x] Verificar suíte SAC, sintaxe TS/TSX, publicar main e função, confirmar arquivos implantados.

**Limite externo:** nenhuma alteração local fabrica a autorização de Operador que a SAC não emitiu. Não certificar pegar/devolver/finalizar/encaminhar sem perfil e fila aceitos na conta real. Não enviar mensagens a clientes para testar.


## Resultado da revisão
- Preservado access_mode ao selecionar atendimento; a atualização anterior perdia o perfil do usuário e esvaziava sua caixa.
- Finalização de autoatendimento usa DELETE /client/protocol/finish com notify_contact:false; atendimento operacional usa PATCH /operator/att/finish/{protocol} com vote.
- Abandonados abertos permanecem gerenciáveis pelo Operador responsável (encaminhar/devolver/finalizar); abandono não equivale a protocolo fechado.
- Erros transitórios de fila voltam a ser consultados. Apenas falhas determinísticas de autorização aguardam nova validação manual.
- 69 testes SAC aprovados; sintaxe dos quatro arquivos TS/TSX alterados validada. Build completo será confirmado no workflow do repositório.
- OAuth operacional permanece pendente: /operator/auth2/login emite sub vazio; /operator/perfil/info e /operator/att/queue retornam invalid_auth. As operações não foram certificadas na conta real nem foram enviadas mensagens a clientes.
