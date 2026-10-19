# Artvideo Service Experience Implementation Plan

**Goal:** Reformular experiência pública e solicitação de serviços sem pagamento.
**Architecture:** Configuração JSON por serviço, funções puras de cobertura/calendário, wizard React e RPC que valida e chama o orçamento existente.
**Tech Stack:** React, Vite, Tailwind, Supabase/Postgres.
**Spec:** docs/superpowers/specs/2026-10-19-artvideo-service-experience.md

## Global Constraints
- Preservar dados, permissões, identidade Artvideo e checkout de produtos.
- Não confirmar agendamento nem cobrar; horários são preferências.
- Sem condições comerciais ou depoimentos inventados.

## Review Focus
- CEP incompleto, limites das faixas e cobertura não configurada.
- Horários passados, fins de semana, datas bloqueadas e fuso brasileiro.
- Troca de serviço ou CEP invalida escolhas anteriores.
- Clientes existentes preservam seu cadastro e registram endereço na solicitação.
- Duplo clique, falha de rede e retorno entre etapas preservam dados sem duplicar envio.

## Tasks
- [x] 1. Criar testes de cobertura e calendário; confirmar falha; implementar funções e rodar node --test.
- [x] 2. Configurar serviço e orientações no CRM; criar migration e RPC; verificar rejeições e gravação em transação com rollback.
- [x] 3. Hero branco, modais, cards, FAQ e wizard com resumo; preservar navegação do serviço e opções.
- [x] 4. Harmonizar home, shell e cards; executar builds site/CRM e regressões. Revisão visual no domínio permanece pendente de publicação.
- [ ] 5. Revisar diff, enviar commit e verificar workflow de publicação.

## Verificação e revisão

- Builds do site e CRM concluídos.
- 106 regressões existentes e 6 testes de cobertura/calendário/endereço passaram.
- SQL com perfil anon verificou envio, repetição sem duplicação, PF/PJ, CEP, datas e endereço/contato do cliente existente; tudo revertido ao final.
- Revisão independente identificou três problemas: endereço sobrescrito ao voltar, data PF oculta bloqueando PJ e repetição com espaços no texto. Os três foram reproduzidos e corrigidos.
- Atualizações recentes da main sobre importação e publicação foram preservadas por rebase.
- Envio à main bloqueado pela revisão automática por exigir autorização explícita de publicação. Entrega em branch de revisão; não publicado.
