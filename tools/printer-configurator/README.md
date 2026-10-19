# Union World — Configurador de Impressoras

Aplicativo WinForms/.NET 8 para Windows 10/11. A compilação gera um único executável x64 autocontido hospedado em [GitHub Releases](https://github.com/rafaelartvideo/artvideosite/releases/tag/union-printer-configurator).

## Atualizações do próprio aplicativo

- No início do aplicativo, ele lê exclusivamente o release fixo do repositório oficial, via API HTTPS do GitHub.
- O botão **Verificar atualização** permite consultar manualmente.
- Se a versão publicada for mais nova, pede confirmação antes de baixar.
- A compilação do GitHub Actions define a versão como 1.0.<número da execução> e a grava no executável e no label do asset do release.
- A API oficial fornece a assinatura de integridade SHA-256 do asset (campo digest). O arquivo só poderá iniciar se tiver tamanho e SHA-256 idênticos ao divulgado no GitHub.
- A nova cópia do EXE é baixada em LocalAppData e usada como processo auxiliar de instalação. O antigo fecha; o novo processo espera e substitui a cópia original.
- Uma cópia do executável antigo fica no arquivo <caminho-do-exe>.previous para restauração se for necessária.
- Se não tiver internet, estiver offline ou a atualização falhar, o aplicativo continuará funcionando normalmente.
- Para **a primeira instalação do recurso** é necessário baixar uma vez o EXE atualizado. As versões anteriores à implementação não conseguem se atualizar sozinhas.

**Segurança:** o SHA-256 garante integridade relativamente ao release informado pelo GitHub, mas o executável **ainda não tem assinatura Authenticode**. Para distribuição comercial a diversas empresas, assinar o aplicativo e verificar o certificado do publicador antes de executar é um reforço recomendado.

## Impressoras

- Detecta impressoras instaladas localmente e reconhece alguns modelos pelo nome da fila.
- Permite escolher manualmente o perfil ou formato personalizado.
- Perfis são mantidos em public/assets/crm/impressoras/perfis.json e lidos por HTTPS da Union; o catálogo embarcado funciona offline.
- Cadastra um formulário de papel no spooler do Windows com a API Win32 AddForm. Não altera o driver, porta USB, padrão de impressão nem firmware.
- Driver deve ser instalado pelo fabricante; alguns modelos exigem selecionar o formato nas preferências do próprio driver.
- Elgin L42: papel da fileira 104 × 23 mm, com 3 etiquetas de 32 × 23 mm, espaçamento de 3 mm e 1 mm de margem lateral.

## Publicação e validação

O workflow .github/workflows/build-printer-configurator.yml é separado do deploy da Union e publica sempre o mesmo nome de asset do mesmo release; novas versões são distinguidas pelo número crescente de compilação e label, sem alterar o link de download.

Testes recomendados com Windows real: primeira instalação manual, atualização pela interface, backup, restauração em falha simulada, execução sem administrador, internet indisponível, driver sem suporte ao formulário, caminhos com espaços e mais de uma impressora instalada.
