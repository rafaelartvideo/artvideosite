# Reformulação visual do CRM — 29/10/2026

## Direção aplicada
O pedido atual substitui a abordagem conservadora anterior: visual novo com menu inspirado na Minha Conta da Artvideo e referências de organização do Linear e Atlassian. Mantido o azul #1032DC, com mais uso de superfícies neutras e contraste de seleção.

- Menu lateral claro no tema claro e neutro no escuro, largura 256px (72px recolhido), linhas de 44px, borda esquerda azul e fundo suave na seleção.
- Cabeçalho com empresa/espaço de trabalho à esquerda e utilidades à direita; menus de utilidades ancorados à direita.
- Cards e seções padrão arredondados; cabeçalhos e rótulos menos pesados, filtros em superfícies neutras, ícones de busca azuis. Opções explícitas de card quadrado continuam disponíveis para layouts especializados.
- AdminSectionNav centraliza abas, ícones opcionais, seleção, rolagem local e área de busca/ações. AdminSubnav e AdminSubsectionButtons reutilizam essa implementação.
- Equipamentos: busca junto às abas, criação contextual no cabeçalho, editor com o mesmo tratamento de navegação.
- Ações de criação no cabeçalho de Serviços Gerais, Checklists, Tipos de Atendimento, Situações, Status e Funções. Serviços Gerais tem busca/contagem na barra da listagem.
- Navegação customizada migrada também em Documentos, Documentos da OS, Solicitações do Site, Catálogo Inteligente, Financeiro Union e Configuração de Assinaturas. Documentos da OS mantém as condições de acesso e posiciona Usar celular na área de ações da navegação.

## Sites
Prévia privada publicada em https://union-crm-novo-visual.artvideorafaellima.chatgpt.site (projeto appgprj_6ae3a2172df881919e16b780ed9fefd7, versão 1). Usa os mesmos componentes compartilhados de UI e dados fictícios. Não contém conexão com dados de clientes ou ações de produção. Implementação operacional permanece no repositório artvideosite e na hospedagem existente; não houve migração de domínio, backend ou autenticação.

## Validação
- 471 testes das suítes principais passaram: 254 regressão/desempenho, 28 Financeiro, 189 SAC.
- Builds do site e CRM passaram; avisos conhecidos de chunks grandes permanecem.
- Revisão independente confirmou preservação de rotas, permissões, isolamento de empresa e condições das ações movidas.
- Prévia no navegador: menu claro, busca por Micro-ondas retornando uma linha, abas na mesma barra da busca, tema escuro e abertura do formulário demonstrativo.
- Um teste antigo exigia literalmente o cabeçalho azul e tamanho exato do ícone; essas duas exigências cosméticas foram retiradas conforme o novo pedido. As verificações de integração do filtro e controles técnicos foram preservadas.

## Limites
A navegação compartilhada é o padrão para os componentes e telas acima. Controles especializados de workflow, conversas e gráficos conservam suas funções e podem possuir composição própria. Esta rodada não é uma afirmação de redesenho manual de cada estado de cada tela. O navegador disponível foi conferido em desktop; não foi testado em todos os dispositivos físicos.

## Reversão
Reverter o commit do frontend e publicar novamente. Nenhuma migração de banco, exclusão de dados ou alteração de permissão foi feita.
