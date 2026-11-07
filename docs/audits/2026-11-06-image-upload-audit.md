# Auditoria estática de uploads de imagens — 06/11/2026

Escopo: CRM Union World multiempresa e site/loja Eletrônica Artvideo. Auditoria e correções feitas no código; não foram executados uploads reais, navegação das telas, alterações de políticas, publicação nem validação em produção.

## Contagem e método

Foram identificados **29 pontos concretos de gravação no Storage**, contando chamadas `.upload(...)` e `.uploadToSignedUrl(...)` em `src/` e `supabase/functions/`, sem testes. **16 aceitam imagens comuns elegíveis**; **13 são gravações de documentos finais, assinaturas, arquivos originais/arquivados ou a API legada de importação externa**, detalhadas abaixo. Essa é uma contagem reproduzível de destinos de gravação: não confunde o mesmo fluxo passando por navegador e Edge Function com dois fluxos de negócio independentes, nem inventa um fluxo por botão de câmera/galeria.

Há **17 entradas de preparação no frontend**, que reutilizam o mesmo processador. Os múltiplos formulários que convergem nessas entradas aparecem no inventário. A importação externa corrigida também converge no serviço de mídia compartilhado. Uma entrada pode enviar imagens e documentos, e um destino pode servir várias telas.

Comando de reprodução dos 29 pontos:

```sh
rg -n '\.upload\(|\.uploadToSignedUrl\(' src supabase/functions --glob '!*.test.*'
```

Foram pesquisados também `File`, `Blob`, `FileReader`, `FormData`, `storage.from`, URLs diretas de Storage, URLs assinadas de envio, `canvas.toBlob`, `canvas.toDataURL`, entradas de arquivo, câmera, clipboard e drag/drop. Os eventos de arrastar encontrados em agenda/kanban/gestão movem registros, não arquivos. O editor de texto cola HTML/texto sanitizado e não implementa envio de imagens. Capturas usadas apenas para ler códigos/serial e exportações locais de imagens/PDF não gravam arquivos no Storage.

## 16 destinos de imagens comuns

| # | Gravação / fluxo | Origem e tratamento antes da transferência | Situação anterior e correção |
|---|---|---|---|
| 1 | `src/shared/infrastructure/media.repository.ts` / `uploadMediaAtPath` | `uploadMediaFile`, `uploadServiceOrderMediaFile`, `uploadRegistrationRecordMediaFile` | Já centralizava a preparação, mas documentos fotografados eram ignorados pelo preset documental; corrigido no processador. Perfis de avatar/logo e override explícito por finalidade. |
| 2 | `src/features/orders/infrastructure/order-images.repository.ts` | `uploadOrderImage` → `service-photo` ou `service-label` | Já processava fotos de equipamento/etiqueta. |
| 3 | `src/features/orders/infrastructure/order-documents.repository.ts` | `attachOrderSituationDocument` → `payment-proof` ou `document-image` | Comprovantes/documentos comuns não eram otimizados no caminho documental. Agora envia o `File` preparado e registra seus metadados. |
| 4 | `src/features/finance/infrastructure/finance-documents.repository.ts` | `uploadFinancialAttachment` → `payment-proof` | Já chamava a preparação, mas o preset documental devolvia o original; corrigido e perfil explícito de comprovante. |
| 5 | `src/features/orders/infrastructure/order-quote.repository.ts` | `addOrderQuoteComment` → foto ou documento | Fotos já processadas; documentos fotografados passam a ser processados centralmente. PDFs/documentos mantidos. |
| 6 | `src/features/technician-panel/infrastructure/technician-tasks.repository.ts` | `uploadTechnicianPhoto` → `service-photo`, limite final 5 MiB | Já enviava o arquivo preparado. |
| 7 | `src/features/platform-providers/infrastructure/platform-providers.repository.ts` | `addProviderAttachment` → `document-image` | Bypass direto corrigido: otimiza imagens, normaliza MIME ausente usando extensão aceita e grava nome/MIME/tamanho do resultado. |
| 8 | `src/features/management/infrastructure/management.repository.ts` / logo | `uploadManagementLogo` → `logo-image` | Já processava, mas usava perfil de catálogo. Corrigido para preservar transparência/nitidez de logo. |
| 9 | `src/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage.tsx` / envio assinado | `onChooseMedia` → `whatsapp-image`; anexo preparado é enviado | JPEG/PNG já processados. WebP de figurinha preservado pelo contrato do transporte; áudio/vídeo/documentos não são fotos. |
| 10 | `supabase/functions/device-capture/index.ts` | `uploadDeviceCapturePhoto` em `device-capture.gateway.ts` → foto/etiqueta | Navegador móvel já processava. Validação real do contêiner adicionada no Edge. |
| 11 | `supabase/functions/device-checklist/index.ts` | `uploadDeviceChecklistPhoto` → `service-photo` | Navegador móvel já processava. Validação real do contêiner adicionada no Edge. |
| 12 | `supabase/functions/order-mobile-edit/index.ts` | `uploadMobileOrderEditPhoto` → foto/etiqueta | Navegador móvel já processava. Validação real do contêiner adicionada no Edge. |
| 13 | `supabase/functions/order-mobile-checklist/index.ts` / foto de item | `uploadMobileOrderChecklistPhoto` → `service-photo` | Já processava no telefone. Validação de contêiner adicionada no Edge. |
| 14 | `supabase/functions/order-mobile-checklist/index.ts` / documento | `uploadMobileOrderDocument` → `payment-proof`, `document-image` ou foto, conforme destino | Documentos/comprovantes fotografados preservavam original. Agora processados antes do FormData e validados no Edge. |
| 15 | `supabase/functions/artvideo-site-quote-media/index.ts` | `submitServiceBooking` → equipamento/local `service-photo`, etiqueta `service-label` | Fotos já processadas sequencialmente antes de criar solicitação e enviar FormData. Edge agora valida bytes, MIME e dimensões de segurança. |
| 16 | `supabase/functions/sac-digital-api/index.ts` | `sendSacDigitalMediaMessage` → `sac-image`, limite final 1 MiB | Já processava antes do FormData. Edge agora inspeciona o contêiner real de imagem. |

### Telas que convergem na mídia compartilhada

- Produtos/estoque: capa e galeria em `TabProducts.tsx` → `uploadMediaFile('product-images')`.
- Importação externa de produto: `product-lookup.repository.ts` pede `fetch-image` autenticado ao proxy com validação SSRF, cria `File` e usa o mesmo `uploadMediaFile('product-images')`. Antes, `import-image` transferia e gravava diretamente os bytes externos sem otimização. O frontend atual não usa mais esse bypass.
- Marcas, categorias, serviços, serviços gerais e importação de serviços: `ImageUpload` → perfil por bucket ou override de finalidade.
- Logos da empresa e empresas parceiras: `TabSettings.tsx`, `PartnerCompanyEditorPage.tsx` → `imagePreset='logo-image'` explícito, apesar de compartilharem bucket `public-assets` com fotografias.
- Configurações do site: logo com `logo-image`; capa, fotos institucionais, banners e imagens de serviços com catálogo.
- Fotos de orçamento da OS: `order-quote-photos.repository.ts` → `uploadServiceOrderMediaFile`.
- Fotos de checklists desktop e de entrada: `checklists.repository.ts` → `uploadServiceOrderMediaFile`.
- Campos personalizados de OS, anexos da conclusão/situação: `OrderCustomValues.tsx`, `useOrderResolution.ts` → `uploadServiceOrderMediaFile` ou repositório documental específico.
- Registros de cliente/funcionário/fornecedor/prestador: `registration-records.repository.ts` → `uploadRegistrationRecordMediaFile` com perfil documental.
- Minha Conta, pedidos da loja e agenda não têm outros destinos próprios de upload de imagem identificados; solicitação/agendamento público usa `submitServiceBooking`. Não se atribuem correções a fluxos inexistentes.

## Causa do comprovante na conclusão da OS

A seleção pelo computador/câmera passa por `OrderCompletionPaymentSection.tsx`; `useOrderResolution.ts` salva o comprovante por `attachOrderSituationDocument`. O caminho documental chamava `prepareFileForUpload(..., 'document-image')`, mas essa finalidade preservava o original no processador. Havia também a opção `optimizePhoto`, que não cobria todos os comprovantes/documentos e usava perfil de etiqueta. O telefone tem execução própria: `uploadMobileOrderDocument` também preservava fotografias de documentos no ramo `attachment`.

O perfil `payment-proof` agora é usado explicitamente nos caminhos de comprovante, e `document-image` processa fotografias comuns. O objeto `preparedFile` efetivamente enviado determina extensão, MIME, tamanho e registro em `media`; os vínculos existentes com situação, OS e Financeiro foram preservados. PDFs continuam com seus bytes originais. Obrigatoriedade, permissões, isolamento por organização e regras financeiras não foram alterados.

## Processador e perfis

Processador único: `src/shared/application/upload-file-optimizer.ts`. Configurações compartilhadas: `supabase/functions/_shared/upload-image-profiles.ts`.

| Perfil | Maior dimensão | Qualidade inicial / mínima | Alvo de tamanho | Finalidade |
|---|---:|---:|---:|---|
| `service-photo` | 1600 px | 0,80 / 0,68 | 900 KiB | Equipamentos, checklists, local de serviço |
| `service-label` | 2200 px | 0,88 / 0,82 | 1600 KiB | Etiquetas e detalhes legíveis |
| `document-image` | 2200 px | 0,90 / 0,84 | 1600 KiB | Documentos fotografados |
| `payment-proof` | 2200 px | 0,90 / 0,84 | 1600 KiB | Comprovantes |
| `catalog-image` | 1600 px | 0,82 / 0,70 | 950 KiB | Produtos, loja e fotos institucionais |
| `profile-image` | 512 px | 0,82 / 0,74 | 250 KiB | Avatares |
| `logo-image` | 1600 px | 0,92 / 0,88 | 950 KiB | Logos; PNG sem perdas quando necessário |
| `sac-image` | 1600 px | 0,80 / 0,68 | 900 KiB | SAC, com limite de transporte 1 MiB |
| `whatsapp-image` | 2560 px | 0,86 / 0,68 | 3 MiB | Fotografias JPEG/PNG do WhatsApp |

Os alvos não são promessa de redução para todo arquivo. Imagens pequenas já adequadas, animações e resultados maiores que o original podem preservar o original conforme regras explícitas. Limites finais de cada transporte continuam sendo verificados.

O processador mantém proporção, usa decodificação com orientação EXIF, limita a área de desenho, usa decodificador do navegador com fallback, libera recursos e URLs, identifica animações antes de rasterizar, evita cache de falhas e compartilha preparação do mesmo arquivo. Formatos HEIC/HEIF dependem de decodificador nativo; quando indisponível, há erro explícito e nenhum upload silencioso do original.

## 13 destinos com preservação ou limitação explícita

| Quantidade | Destinos | Motivo |
|---:|---|---|
| 2 | `management.repository.ts`: arquivo inicial e nova versão | Arquivo versionado genérico com contrato de recuperação do original; `preserveOriginal: true` explícito e limite original de 25 MiB preservado. Inclui artes/assets, documentos assinados e binários. Logo do espaço usa outro caminho otimizado. |
| 1 | `employee-signatures.repository.ts` | Assinatura manuscrita original em PNG vinculada ao funcionário. |
| 1 | `document-signature-admin/main.ts`: snapshot HTML | Documento/snapshot de assinatura, não uma foto. |
| 1 | `document-signature-admin/main.ts`: assinatura do funcionário | Evidência original do processo de assinatura. |
| 1 | `document-signature-public/main.ts`: assinatura pública | Evidência original em PNG; não aplicar compressão com perdas. |
| 2 | `document-signature-pdf/main.ts`: PDF final e assinatura | PDF final e evidência assinada devem preservar integridade. |
| 1 | `document-signature-public/final-document-service.ts` | PDF final imutável. |
| 1 | `document-signatures.repository.ts`: envio assinado de PDF congelado | Bytes exatos do documento preparado para assinatura. |
| 1 | `sac-avatar-maintenance/index.ts` | SVG pequeno gerado por código para avatar padrão; não é fotografia raster. |
| 1 | `union-whatsapp-inbox/index.ts`: recuperação de mídia recebida | Arquivo da mensagem recebida, incluindo documento/figurinha; preservar download/evidência do conteúdo do remetente. Não é envio de foto pelo operador. |
| 1 | `product-lookup/index.ts`: ação legada `import-image` | Mantida compatibilidade de resposta para clientes externos/antigos; o Edge não possui codec raster. **Limitação remanescente: esse endpoint legado ainda pode guardar foto original externa**. O CRM corrigido usa `fetch-image` + otimização no navegador, sem upload original duplicado. |

PDFs, DOC/DOCX, arquivos assinados e binários em fluxos mistos não são alterados. GIF/APNG/WebP animados são preservados para não remover animação; figurinhas WebP usam o contrato de transporte próprio. Não há conversão indiscriminada de imagens transparentes para JPEG.

## Limites da garantia no servidor

`supabase/functions/_shared/upload-image-guard.mjs` inspeciona bytes JPEG/PNG/WebP, compatibilidade com MIME e limites de segurança antes das gravações dos gateways de câmera/QR, orçamento público e SAC. Não confia em uma flag enviada pelo cliente. Esse guard **não é um encoder nem prova criptográfica de que um arquivo já foi comprimido**. Navegadores legítimos passam pelo processador antes da transferência; clientes customizados com autorização de upload direto podem ignorar processamento no navegador. Garantir transformação para todo cliente arbitrário exigiria codec no backend e/ou remoção de acessos diretos por Storage, algo não implantado nesta alteração.

## Verificação

Testes novos de integração sem navegador comprovam bytes efetivamente enviados e metadados de anexo de prestador, MIME ausente, preservação de PDF, preservação explícita de arquivo/versionamento de 24 MiB e bloqueio de upload quando decodificação falha. Os 25 testes de prestadores/gestão/novos fluxos executados nesta frente passaram. A validação global de CI e build é registrada abaixo pelo responsável pela integração.

## Ativação coordenada (sem deploy executado)

O frontend novo de importação de produto requer que a ação `fetch-image` esteja disponível em `product-lookup` antes ou junto de sua ativação. Alterações de Edge Functions abrangem `product-lookup`, `device-capture`, `device-checklist`, `order-mobile-edit`, `order-mobile-checklist`, `artvideo-site-quote-media` e `sac-digital-api`, além dos módulos `_shared/upload-image-guard.mjs` e `_shared/upload-image-profiles.ts` importados por elas. A alteração em `union-whatsapp-inbox` documenta preservação do arquivo recebido e não muda comportamento. O preparo foi feito somente em código, sem aguardar nem executar publicação em produção.

## Validação final e arquivos alterados

`npm run test:ci`: 726 testes passaram, zero falhas. `npm run build`: site e CRM passaram, com avisos preexistentes de chunks grandes/importação mista. Revisão independente concluída sem bloqueadores no código alterado. A proteção de arquitetura enumera os 29 pontos atuais e bloqueia novos escritores diretos sem revisão explícita. Não foram usados navegador, testes de produção ou alterações de dados/permissões.

- `docs/audits/2026-11-06-image-upload-audit.md`
- `package.json`
- `scripts/quality/upload-storage-boundaries.test.mjs`
- `src/features/checklists/infrastructure/order-mobile-checklist.gateway.ts`
- `src/features/checklists/presentation/MobileOrderDocumentsSection.tsx`
- `src/features/finance/infrastructure/finance-documents.repository.ts`
- `src/features/management/infrastructure/management.repository.ts`
- `src/features/orders/domain/order-completion-proof-regression.test.mjs`
- `src/features/orders/domain/order-payment-proof-required-regression.test.mjs`
- `src/features/orders/infrastructure/order-documents.repository.ts`
- `src/features/partner-companies/presentation/PartnerCompanyEditorPage.tsx`
- `src/features/platform-providers/domain/provider-search-details-upload.test.mjs`
- `src/features/platform-providers/infrastructure/platform-providers.repository.ts`
- `src/features/products/infrastructure/product-lookup.repository.ts`
- `src/features/settings/presentation/TabSettings.tsx`
- `src/features/settings/presentation/TabSiteSettings.tsx`
- `src/shared/application/media-upload-profiles.test.mjs`
- `src/shared/application/upload-audit-flows.test.mjs`
- `src/shared/application/upload-file-optimizer.test.mjs`
- `src/shared/application/upload-file-optimizer.ts`
- `src/shared/application/upload-flows.test.mjs`
- `src/shared/infrastructure/media.repository.ts`
- `src/shared/ui/admin/AdminMedia.tsx`
- `supabase/functions/_shared/upload-image-guard.mjs`
- `supabase/functions/_shared/upload-image-guard.test.mjs`
- `supabase/functions/_shared/upload-image-profiles.ts`
- `supabase/functions/artvideo-site-quote-media/index.ts`
- `supabase/functions/device-capture/index.ts`
- `supabase/functions/device-checklist/index.ts`
- `supabase/functions/order-mobile-checklist/index.ts`
- `supabase/functions/order-mobile-edit/index.ts`
- `supabase/functions/product-lookup/index.ts`
- `supabase/functions/sac-digital-api/index.ts`
- `supabase/functions/union-whatsapp-inbox/index.ts`
