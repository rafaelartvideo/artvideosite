# PDF Canônico para Impressão e Assinatura

## Objetivo

Usar um único artefato PDF como fonte visual da impressão, da visualização pública antes da assinatura e do documento final baixado após a assinatura.

## Problema atual

O módulo Imprimir usa o renderer HTML/CSS de `buildOrderPrintDocumentHtml`, enquanto a assinatura online congela um snapshot semântico e o backend gera outro PDF com `pdf-lib`. Isso permite diferenças de layout entre o que o operador imprime, o que o cliente visualiza e o que é baixado após a assinatura.

## Decisão

O backend de documentos assinados passa a ser o gerador PDF canônico. O botão Imprimir também solicita esse mesmo PDF canônico. Ao criar uma solicitação de assinatura, o PDF-base é gerado uma única vez, salvo em Storage e identificado por SHA-256. O cliente visualiza exatamente esse arquivo. Após a assinatura, o backend carrega os mesmos bytes, aplica as assinaturas nos slots reservados e acrescenta a página de autenticidade/QR sem recalcular o conteúdo da OS.

O renderer HTML continua existindo para e-mail legado e para o editor/preview de configuração enquanto essa UI não for migrada, mas não é mais a fonte do arquivo usado no fluxo de impressão da OS nem da assinatura online.

## Fluxo canônico

1. Frontend monta `DocumentSignatureSnapshot` usando o modelo e os dados atuais da OS.
2. Para Imprimir, envia o snapshot ao `document-signature-admin` na ação `preview_pdf`.
3. O admin valida usuário, organização, OS, template e campos permitidos.
4. O admin chama internamente `document-signature-public` com service role para renderizar o PDF-base pelo renderer canônico.
5. A função pública salva/atualiza um preview temporário determinístico e devolve URL assinada.
6. O navegador abre o PDF real e o usuário imprime pelo viewer do navegador.
7. Para assinatura online, `create` congela o snapshot e cria a solicitação.
8. Antes de enviar o link, `prepare_base_internal` gera `{request}/original.pdf`, calcula SHA-256 e grava os slots de assinatura.
9. Após CPF/CNPJ ou OTP, `document` devolve URL assinada de `original.pdf`; a página pública exibe esse PDF.
10. `complete` registra a assinatura PNG normalmente.
11. `finalizeSignatureRequest` carrega `original.pdf`, aplica imagens/metadados nos slots e acrescenta autenticidade/QR. O conteúdo-base nunca é renderizado novamente.

## Persistência

Adicionar a `document_signature_requests`:

- `base_pdf_storage_path text`
- `base_pdf_hash text`
- `base_pdf_signature_slots jsonb not null default '[]'::jsonb`
- `base_pdf_created_at timestamptz`

Registros antigos podem manter esses campos nulos. A finalização mantém fallback para o renderer legado apenas para solicitações criadas antes desta mudança.

## Slots de assinatura

`renderBaseDocumentPdf` reserva uma seção de assinaturas no PDF-base e retorna coordenadas determinísticas:

```ts
type SignatureSlot = {
  signer_type: "employee" | "external";
  page_index: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
```

O PDF final usa exatamente essas coordenadas. Se não houver slot para uma assinatura obrigatória, a geração do PDF-base falha antes do envio do link.

## Segurança e integridade

- `original.pdf` fica no bucket privado `signed-documents`.
- URLs de visualização são assinadas e curtas.
- `base_pdf_hash` é SHA-256 dos bytes congelados.
- O PDF final é derivado exclusivamente de `original.pdf` + evidências de assinatura + dados de autenticidade.
- CPF/CNPJ completo, HMAC, token, IP e service role nunca entram no PDF público.
- `prepare_base_internal` e `render_preview_internal` aceitam apenas `Authorization: Bearer <service-role>`.
- CPF/CNPJ e OTP continuam coexistindo; esta mudança não altera a validação de identidade.

## Compatibilidade

Solicitações antigas sem `base_pdf_storage_path` continuam finalizando pelo renderer anterior. Novas solicitações obrigatoriamente preparam o PDF-base antes de retornar sucesso em `create`.

## Critérios de aceite

- Imprimir abre um PDF real gerado pelo mesmo renderer usado na assinatura.
- Ao abrir o link público, o cliente vê `original.pdf`.
- `base_pdf_hash` corresponde aos bytes exibidos ao cliente.
- Assinar não recria o conteúdo da OS.
- O PDF final preserva todas as páginas do PDF-base e acrescenta apenas assinatura/evidências/autenticidade.
- QR e página pública de verificação continuam funcionando.
- CPF/CNPJ e OTP continuam funcionando.
