# Pré-OS Digital — implantação e homologação

## Fluxo implementado
1. Em Atendimentos, o operador autorizado abre Pré-OS. O servidor resolve o telefone da conversa por RLS, gera token aleatório de 256 bits, guarda apenas seu hash e vincula convite à empresa, operador e conversa. Validade de 48h. A mensagem pode ser inserida no campo de composição do WhatsApp e enviada pelo fluxo normal.
2. Link individual /solicitacao#t=... abre página móvel sem autenticação do cliente. Solicita nome, CPF/CNPJ, CEP/endereço, equipamento e problema. Catálogo por empresa; marcas filtradas pelo tipo e modelos por marca sob demanda. Cliente não informa WhatsApp, nascimento nem gênero.
3. Até cinco fotos são revisadas, giradas e comprimidas em WebP no celular. O servidor recebe arquivo binário com limites, valida token, dados, catálogo, tamanho e formato; guarda mídia privada com ID reaproveitável. Nenhuma OS/financeiro/estoque é criada por envio público.
4. Pré-OS aparece na lista por empresa/conversa com notificação em realtime (somente metadados). Operador confere CPF/CNPJ e cadastro existente. API de CPF existente é chamada somente no contexto autenticado, com nome oficial, nascimento e gênero quando retornados. Divergências são visíveis. Dados faltantes de cadastro existente só são complementados mediante escolha explícita; nenhum gênero ou nascimento é inferido.
5. Cadastro novo reutiliza QuickCustomerModal com dados e endereço recebidos; número da conversa preenche telefone e WhatsApp. Se a API não retornar nascimento obrigatório, operador resolve internamente. Endereços existentes não são substituídos.
6. Nova OS usa editor, regras, checklist, fila e permissões já existentes. UUID da solicitação é chave idempotente da criação atômica. A conversão é marcada na mesma transação, com conferência de CPF/CNPJ do cliente. Fotos chegam com IDs de mídia já armazenados, sem segundo upload.

## Não publicar antes de homologar
- Validar migração em banco de teste e Edge Function order-intake, com JWT verificado manualmente nas operações privadas. Não aplicar produção antes dos testes.
- Testar operador sem permissões, gestor, empresa diferente, acesso à conversa, token inválido/expirado/cancelado, token reapresentado, requisição concorrente, limites do upload e troca de empresa.
- Testar novo CPF, CPF existente, nome divergente, falha API CPF, CNPJ, CEP indisponível, tipo/marca/modelo removidos do catálogo e endereço diferente.
- Testar câmera e rotação iOS/Android, rede instável, envio repetido, retomada após falha da Edge Function, rejeição de mídia inválida e leitura das imagens vinculadas.
- Confirmar ordem atômica, vínculo da mídia, fila obrigatória, checklist, conversão concorrente e nova tentativa após erro ou perda de resposta.
- Definir política de retenção/expurgo de solicitações e mídias órfãs com a empresa antes de habilitar operação pública. Implementar recuperação automática de submissão interrompida e limites de abuso no gateway.
- Convite público permanente/QR para clientes sem conversa exige identificação segura do telefone; está fora deste fluxo individual. Não habilitar consulta pública de CPF ou dados de cadastro.
- Sem OCR/IA nesta versão; modelo e série são selecionados ou informados pelo cliente, conferidos pelo operador.
- Sem homologação, sem deploy e sem migração de produção nesta PR.
