Faça SOMENTE as alterações e novas telas descritas abaixo.

IMPORTANTE:
Economize ao máximo os créditos.
NÃO redesenhe o projeto.
NÃO altere a identidade visual existente.
NÃO recrie componentes que já existem.
NÃO altere a Home além do ajuste específico do botão solicitado abaixo.
Reutilize Header, Footer, botões, cards, tipografia, cores, espaçamentos e componentes existentes.

O objetivo é finalizar a estrutura visual das páginas de:
1. Solicitar orçamento
2. Assistência Técnica

Também adicionar campos de CEP nos detalhes dos serviços.

==================================================
1. CEP NOS DETALHES DOS SERVIÇOS
==================================================

Em TODAS as páginas individuais de serviços já criadas, adicionar uma seção de verificação de disponibilidade por CEP.

Posicionar próximo ao preço e ao botão "Solicitar orçamento".

Título:

"Verifique a disponibilidade na sua região"

Texto:

"Informe seu CEP para verificarmos a disponibilidade deste serviço no seu endereço."

Campo:

"CEP"

Botão:

"Verificar disponibilidade"

Criar visualmente dois estados possíveis:

Estado inicial:
Campo de CEP + botão

Estado disponível:
"Serviço disponível para este CEP."

Estado indisponível:
"Infelizmente, este serviço ainda não está disponível para este CEP."

IMPORTANTE:
Neste momento criar somente a INTERFACE.

Não implementar API.
Não implementar consulta real de CEP.
Não inventar áreas de atendimento.

Deixar o componente preparado para receber essa funcionalidade posteriormente.

==================================================
2. BOTÃO "SOLICITAR ORÇAMENTO" DA HOME
==================================================

Na Home atual existe um botão "Solicitar orçamento".

O estado HOVER desse botão está ficando branco.

CORRIGIR SOMENTE ISSO.

O hover deve continuar seguindo a identidade visual atual.

Não deixar o fundo branco.

Manter contraste adequado entre:
- fundo
- texto
- borda

O botão deve permanecer visualmente consistente com os demais botões do site.

Não alterar tamanho, posição ou texto.

==================================================
3. NOVA PÁGINA — SOLICITAR ORÇAMENTO
==================================================

Criar uma nova página:

/solicitar-orcamento

Reutilizar exatamente o Header e Footer existentes.

Criar uma página de formulário profissional, simples e fácil de preencher.

HERO:

Pequeno texto:

SOLICITAÇÃO DE ORÇAMENTO

Título:

"Conte o que você precisa"

Texto:

"Preencha as informações abaixo e nossa equipe poderá entender melhor o serviço que você precisa."

==================================================
4. FORMULÁRIO DE ORÇAMENTO
==================================================

Criar um formulário organizado em etapas visuais, MAS NÃO criar um wizard complexo.

Quero um formulário único, dividido visualmente em seções.

SEÇÃO 1:

"Sobre o serviço"

Campo obrigatório:

"Selecione o serviço"

Criar um select/dropdown com:

- Instalação de ar-condicionado
- Higienização de ar-condicionado
- Manutenção de ar-condicionado
- Instalação de TV
- Configuração de TV
- Suporte técnico para TV
- Diagnóstico e reparo de TV
- Manutenção de eletrodomésticos
- Diagnóstico de eletrodomésticos
- Reparo eletrônico
- Diagnóstico eletrônico
- Reparo de placas
- Manutenção de computadores
- Manutenção de notebooks
- Configuração de equipamentos
- Outro serviço

==================================================
5. EQUIPAMENTO
==================================================

Criar seção:

"Sobre o equipamento"

Campo:

"Marca"

Dropdown com as marcas atendidas pela Artvideo:

AOC
Britânia
Electrolux
Genis Fitness
LG
Panasonic
Philco
Philips
Semp
TCL
Walita
Samsung

Adicionar opção:

"Outra marca"

Se "Outra marca" for selecionada, deixar preparado um campo:

"Informe a marca"

Adicionar:

"Modelo"

Campo de texto.

Adicionar:

"Descreva o problema ou o que você precisa"

Campo de texto grande.

Placeholder:

"Conte brevemente o que aconteceu ou o que você precisa realizar."

==================================================
6. CEP
==================================================

Criar seção:

"Local do serviço"

Campo obrigatório:

"CEP"

Placeholder:

"00000-000"

Texto auxiliar:

"Utilizaremos o CEP para verificar a disponibilidade do serviço na sua região."

IMPORTANTE:

Não solicitar endereço completo neste momento.

Não pedir:
- rua
- número
- complemento
- bairro

Somente CEP.

O endereço completo poderá ser solicitado posteriormente, caso necessário.

==================================================
7. DADOS DO CLIENTE
==================================================

Criar seção:

"Seus dados"

Campos:

Nome completo

WhatsApp

E-mail

WhatsApp deve ser o campo de maior destaque, pois será o principal meio de contato.

==================================================
8. FOTOS
==================================================

Adicionar uma área opcional:

"Fotos do equipamento"

Texto:

"Se quiser, envie fotos do equipamento ou do local para ajudar nossa equipe a entender melhor o serviço."

Criar área visual de upload:

"Adicionar fotos"

Não implementar upload real neste momento.

Apenas criar a interface.

Permitir visualmente até 3 imagens.

==================================================
9. RESUMO
==================================================

Antes do botão final, criar uma pequena seção:

"Revise sua solicitação"

Mostrar visualmente:

Serviço:
[serviço selecionado]

Marca:
[marca]

Modelo:
[modelo]

CEP:
[CEP]

Descrição:
[descrição]

IMPORTANTE:

Criar somente a interface visual.

Não precisa implementar lógica real de preenchimento.

==================================================
10. BOTÃO FINAL
==================================================

Criar botão principal:

"Solicitar orçamento"

Abaixo do botão:

"Após o envio, nossa equipe entrará em contato para avaliar sua solicitação."

Não prometer prazo de resposta.

==================================================
11. AVISO
==================================================

Adicionar pequeno texto próximo ao final:

"Os valores apresentados ou informados previamente podem variar conforme as condições do equipamento, local e serviço necessário. O orçamento final será confirmado pela equipe."

==================================================
12. PÁGINA — ASSISTÊNCIA TÉCNICA
==================================================

Criar nova página:

/assistencia-tecnica

Reutilizar Header e Footer atuais.

Hero:

ASSISTÊNCIA TÉCNICA ARTVIDEO

Título:

"Seu equipamento precisa de atenção?"

Texto:

"Conte com nossa equipe para diagnóstico, manutenção e reparo de equipamentos eletrônicos."

Botões:

"Solicitar orçamento"

"Falar pelo WhatsApp"

Adicionar imagem relacionada a bancada técnica, eletrônica, manutenção ou reparo.

==================================================
13. SERVIÇOS DE ASSISTÊNCIA
==================================================

Criar seção:

"O que atendemos"

Cards:

TVs
Computadores e notebooks
Eletrodomésticos
Eletrônicos
Placas e componentes

Cada card deve possuir:
- ícone ou imagem
- título
- descrição curta
- botão "Ver serviços"

Não incluir videogames.

==================================================
14. MARCAS AUTORIZADAS
==================================================

Criar uma seção de bastante destaque:

"Marcas autorizadas"

IMPORTANTE:

Usar exatamente esta expressão conforme solicitado.

Subtítulo:

"Confira algumas das marcas atendidas pela nossa assistência técnica."

Criar grid de marcas com:

LOGO
NOME DA MARCA

Marcas:

AOC
Britânia
Electrolux
Genis Fitness
LG
Panasonic
Philco
Philips
Semp
TCL
Walita
Samsung

Cada marca deve ter um card individual.

Exemplo:

[ LOGO ]
Samsung

[ LOGO ]
LG

[ LOGO ]
Philips

Os logos devem manter proporções e ter tamanho visual semelhante.

Não criar logos falsos.

Se a logo oficial não estiver disponível, utilizar o nome da marca como placeholder.

==================================================
15. COMO FUNCIONA A ASSISTÊNCIA
==================================================

Criar seção:

"Como funciona"

01 — Solicitação
Você informa o equipamento e o problema.

02 — Diagnóstico
Nossa equipe avalia o equipamento.

03 — Orçamento
Você recebe as informações antes da execução.

04 — Reparo
Após aprovação, realizamos o serviço.

==================================================
16. CTA FINAL
==================================================

Criar:

"Precisa de assistência?"

Texto:

"Solicite um orçamento e conte para nossa equipe o que aconteceu com seu equipamento."

Botões:

"Solicitar orçamento"

"Falar pelo WhatsApp"

==================================================
17. WHATSAPP FLUTUANTE
==================================================

Garantir que o componente de WhatsApp flutuante já criado anteriormente apareça também:

- Home
- Serviços
- páginas individuais de serviços
- Solicitar orçamento
- Assistência Técnica
- Sobre nós
- Contato

Reutilizar o MESMO componente.

Não criar versões diferentes.

Posição:

canto inferior direito.

==================================================
18. RESPONSIVIDADE
==================================================

Garantir que as novas páginas funcionem em:

Desktop
Tablet
Mobile

No mobile:

- formulário em uma coluna
- cards de marcas reorganizados
- botões adequadamente dimensionados
- sem overflow horizontal
- WhatsApp flutuante permanece acessível
- campos de formulário ocupam a largura disponível

==================================================
19. REGRA FINAL
==================================================

NÃO alterar a Home além do hover do botão "Solicitar orçamento".

NÃO redesenhar páginas existentes.

NÃO criar funcionalidades reais de backend.

NÃO criar consulta real de CEP.

NÃO criar upload real de imagens.

NÃO inventar preços.

NÃO inventar endereço.

NÃO inventar telefone.

NÃO inventar dados da empresa.

Reutilizar o máximo possível dos componentes existentes.

Prioridade:

1. Solicitar orçamento
2. Assistência Técnica
3. CEP nos serviços
4. WhatsApp em todas as páginas
5. Correção do hover do botão da Home

Manter exatamente a identidade visual já criada no projeto.