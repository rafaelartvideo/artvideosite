# Cadastro guiado de operadoras — plano de implementação

**Objetivo:** substituir as categorias técnicas soltas por um tutorial de cadastro, mantendo as APIs e a telefonia atual.
**Arquitetura:** guia com etapas ordenadas e explicação contextual; editor atual reutilizado; revisão/ativação ao final; configuração anterior em seção recolhida própria. Capacidade fica depois dos grupos para permitir suas referências. Segredos continuam só em memória, com limpeza por troca de empresa/cancelamento.
**Tecnologia:** React/TypeScript, componentes e tokens de tema existentes do CRM.

- [x] Criar regressões para ordem, dependências, etapa opcional e separação do formulário anterior; verificar falha inicial.
- [x] Implementar guia responsivo com passos, exemplos, anterior/próximo, salvar e continuar e revisão final. Manter bloqueios de ativação do servidor.
- [x] Recolher opções avançadas e diagnóstico; separar configuração anterior sem remover controles.
- [ ] Executar testes focados, qualidade, suíte CI e builds; integrar na main atual e verificar publicação HostGator.

Escopo de interface: sem migração de dados, mudanças na VPS, credenciais ou ativação de rotas.

Validação local: 182 testes de telefonia, qualidade, suíte CI e builds site/CRM aprovados. A publicação será acompanhada pelo workflow da main.
