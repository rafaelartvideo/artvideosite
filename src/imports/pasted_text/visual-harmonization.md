Analise o projeto inteiro e faça uma **harmonização visual completa do layout**, mantendo todas as funcionalidades, páginas, dados, integrações, banco de dados e regras existentes.

O objetivo é deixar o sistema com aparência de um **painel administrativo profissional, moderno, limpo e consistente**, sem alterar a lógica da aplicação.

## IMPORTANTE

Não recrie funcionalidades.

Não altere:

* Supabase;
* banco de dados;
* tabelas;
* RLS;
* queries;
* autenticação;
* CRUDs;
* regras de negócio;
* Kanban;
* Agenda;
* formulários;
* relacionamentos;
* estados;
* handlers.

Faça somente melhorias de **layout, espaçamento, alinhamento, tipografia, proporções e consistência visual**.

---

# 1. USE O PRÓPRIO SISTEMA COMO REFERÊNCIA

Analise todas as telas existentes antes de alterar.

Quero que você identifique quais telas estão visualmente mais organizadas e use esse padrão como referência para o restante.

O sistema inteiro deve parecer ter sido criado com **um único design system**.

Não quero que cada módulo tenha um layout diferente.

---

# 2. CABEÇALHO

Mantenha o cabeçalho atual.

Preserve:

* título;
* breadcrumb;
* status do Supabase à direita;
* navegação existente.

Não crie títulos duplicados dentro das páginas.

Exemplo:

```text
Ordens de Serviço > Nova OS
```

deve ser suficiente.

Não colocar novamente:

```text
Nova OS
```

como outro título logo abaixo.

---

# 3. TIPOGRAFIA

Substitua a aparência atual por uma tipografia mais elegante e simples.

Prioridade:

**Poppins**

Se Poppins já estiver disponível, utilize-a globalmente.

Caso não esteja, utilize uma fonte sans-serif moderna equivalente.

A tipografia deve ter:

* títulos claros;
* subtítulos discretos;
* labels menores;
* boa hierarquia;
* pesos consistentes.

Evite textos excessivamente grandes.

---

# 4. ESPAÇAMENTO

Padronize:

* margens;
* padding;
* gap;
* espaçamento entre cards;
* espaçamento entre campos;
* espaçamento entre títulos e conteúdo.

Não deixar elementos colados.

Também não deixar espaços exagerados.

Quero um layout equilibrado.

---

# 5. BOTÕES

Padronize todos os botões do sistema.

Todos devem ter:

* altura consistente;
* padding horizontal adequado;
* texto completamente visível;
* `white-space: nowrap`;
* bordas e radius consistentes;
* alinhamento vertical central;
* ícone e texto alinhados.

Não deixar:

```text
Nova
OS
```

ou:

```text
Conver...
```

quando houver espaço suficiente.

O botão deve se adaptar ao conteúdo.

### Cores

Use o padrão visual já existente do sistema.

Apenas mantenha uma hierarquia clara:

* ação principal → azul;
* cancelar/excluir → vermelho;
* ações secundárias → neutras;
* sucesso → verde quando apropriado.

Não mudar a identidade visual da Artvideo.

---

# 6. INPUTS E SELECTS

Todos os:

* inputs;
* selects;
* textareas;

devem ter altura visual consistente.

Os botões próximos aos campos devem possuir a mesma altura.

Exemplo:

```text
[ Tipo de equipamento        ] [ Criar equipamento ]
```

Os dois devem estar perfeitamente alinhados verticalmente.

---

# 7. TOOLBARS

Faça todas as barras de busca/filtros/ações parecerem parte do mesmo sistema.

Não force todos os módulos a terem exatamente a mesma quantidade de elementos.

A regra é:

> **harmonia e equilíbrio, não uniformidade artificial.**

Se uma barra possui muitos filtros, distribua os elementos de maneira inteligente.

Não deixe textos cortados.

Não deixe botões espremidos.

Não faça elementos ficarem sobrepostos.

---

# 8. CARDS

Padronize os cards de:

* OS;
* Orçamentos;
* Clientes;
* Funcionários;
* Produtos;
* Serviços;
* Equipamentos;
* Agenda;
* Dashboard.

Todos devem seguir o mesmo princípio:

* borda discreta;
* radius consistente;
* padding consistente;
* sombra muito suave, quando utilizada;
* conteúdo bem espaçado;
* hover sutil;
* informações importantes destacadas.

Nos cards de OS e Orçamentos, mantenha a indicação visual de status existente.

---

# 9. STATUS

Mantenha as cores de status já existentes.

A identificação visual deve ser rápida.

Quando o card possuir status, mantenha uma pequena indicação lateral/colorida sem deixar o card visualmente pesado.

Não alterar os valores dos status.

---

# 10. PÁGINAS DE DETALHES

As páginas/detalhes de:

* OS;
* Orçamento;
* Cliente;
* Funcionário;
* Produto;
* Serviço;
* Equipamento;

devem seguir a mesma linguagem.

Estrutura visual:

```text
Cabeçalho
Breadcrumb
────────────────────────
Conteúdo
Cards/seções
────────────────────────
Ações
```

Não transformar detalhes em um modal se atualmente são páginas.

Preserve a arquitetura atual.

---

# 11. BOTÕES DE VOLTAR

Padronize todos os botões de voltar.

Quando uma página secundária possuir:

```text
< Voltar
```

ele deve:

* ficar alinhado à esquerda;
* ter tamanho consistente;
* possuir aparência discreta;
* ficar na mesma linha dos botões de ação quando fizer sentido.

Não mover o botão de voltar para o centro ou para a direita.

---

# 12. PÁGINAS DE CONFIGURAÇÃO

As páginas de configuração devem ter uma aparência organizada.

Exemplo:

```text
Configurações

[ Equipamentos ]
Gerencie equipamentos, marcas e modelos.

[ Serviços Gerais ]
Gerencie os serviços utilizados internamente.

[ Tipos de Atendimento ]
Configure os tipos de atendimento da OS.
```

Os módulos devem aparecer de maneira organizada, com:

* título;
* pequena descrição;
* ícone discreto;
* área clicável;
* espaçamento consistente.

Não deixar tudo visualmente amontoado.

---

# 13. OPERAÇÃO E SITE

Mantenha a separação atual entre:

**Operação**

e

**Site**

Cada área deve parecer parte do mesmo sistema.

Não misture funcionalidades.

Não criar novos módulos.

Apenas melhorar a apresentação.

---

# 14. AGENDA

A Agenda deve ficar visualmente limpa.

Preserve:

* calendário;
* filtros;
* visualizações;
* eventos;
* drag and drop;
* navegação.

Ajuste somente:

* espaçamento;
* alinhamento;
* tamanho dos controles;
* hierarquia visual;
* destaque do dia atual.

O dia atual deve possuir uma borda/destaque discreto.

---

# 15. KANBAN

Preserve o Kanban exatamente como funciona.

Apenas harmonize:

* largura das colunas;
* espaçamento;
* cards;
* títulos;
* indicadores;
* área de drop;
* scrollbar.

Não alterar drag and drop.

Não alterar status.

Não alterar lógica.

---

# 16. MODAIS

Revise todos os modais existentes.

Todos devem possuir:

* tamanho proporcional;
* cabeçalho;
* título;
* botão `X` funcional;
* conteúdo bem espaçado;
* ações no rodapé;
* botão cancelar;
* botão principal.

O `X` deve sempre fechar o modal correto.

Não alterar a funcionalidade de abertura.

---

# 17. RESPONSIVIDADE

O sistema deve continuar funcionando em:

* desktop;
* notebook;
* tablet;
* telas menores.

Não resolver problemas de layout simplesmente colocando tudo em coluna.

Quando houver espaço suficiente, elementos relacionados devem permanecer lado a lado.

Quando realmente não houver espaço, permita adaptação responsiva natural.

---

# 18. NÃO ALTERAR O CONTEÚDO

Não remova campos.

Não remova botões funcionais.

Não renomeie funcionalidades.

Não altere dados.

Não altere textos funcionais sem necessidade.

A tarefa é **visual**.

---

# 19. RESULTADO ESPERADO

Quero que, ao navegar pelo sistema inteiro, a sensação seja:

> "Todas essas páginas pertencem ao mesmo sistema."

O layout deve transmitir:

**Artvideo — painel administrativo profissional**

Visual:

* moderno;
* elegante;
* simples;
* limpo;
* organizado;
* consistente;
* profissional.

Evite exageros de sombras, gradientes ou efeitos.

Priorize **espaçamento, alinhamento, tipografia e proporção**.

---

# 20. IMPORTANTE SOBRE AS ALTERAÇÕES ANTERIORES

Não tente reproduzir as alterações quebradas que foram feitas recentemente no GitHub/Copilot.

Analise o estado atual do projeto no Figma Make e **corrija visualmente o que estiver desalinhado**, sem tentar reconstruir as alterações anteriores.

Não faça uma grande reestruturação de código.

Prefira alterações pequenas e seguras de:

* classes;
* estilos;
* wrappers visuais quando realmente necessários;
* espaçamento;
* tipografia;
* dimensões;
* alinhamento.

**Não altere a lógica da aplicação.**
