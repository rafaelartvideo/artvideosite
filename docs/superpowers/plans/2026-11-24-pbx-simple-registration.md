# Cadastro simples de linhas SIP

**Objetivo:** trocar o caminho obrigatório de nove etapas por um formulário de servidor, usuário, senha, ramais e limite contratado opcional.
**Arquitetura:** construtor puro cria o grafo de configuração existente em uma única revisão, sem senha no documento, sem ativação automática e sem aumentar limites existentes. Mesmo servidor reutiliza um contrato inequívoco; regras compatíveis só são compartilhadas com a mesma autorização de ramais. Casos ambíguos vão para Avançado. A interface técnica existente fica acessível por opção explícita.

- [x] Testar geração do grafo, limites desconhecidos, reutilização conservadora, permissões, duplicidade e nenhum efeito em produção.
- [x] Implementar construtor e formulário simples, com um único envio pela API atual e limpeza da senha.
- [ ] Executar regressões, qualidade, builds e publicação na main/HostGator. Não alterar schema nem VPS.

Validação local: 189 testes de telefonia, suíte CI, qualidade e os dois builds aprovados. O documento gerado também foi validado pelo compilador Python existente. Publicação acompanhada pelo workflow da main.
