# Administração central do PABX

Pedido: disponibilizar a vinculação de centrais por empresa em Integrações → PABX da Union.

Implementação: reutilizar o painel de agentes por empresa, com empresa selecionada explicitamente, chave pública e instruções de preparação/configuração na VPS. Mostrar comunicação recente, nunca confundir autorização com implantação concluída. O perfil ainda é instalado pelo administrador técnico na VPS; esta entrega não promete execução remota automática.

Restringir registro/revogação no servidor à participação ativa na organização operadora, permissão platform.management.manage e empresa de destino com PABX habilitado. Leitura de estado continua restrita à própria empresa ou administração da plataforma. Não ampliar permissões dos demais recursos PABX.

Etapas: testes de interface e autorização; migration com cópia prévia e guard de definição; UI central e painel de empresa somente leitura; testes SQL descartáveis de acesso; suíte completa e builds; aplicação SQL separada; main e confirmação FTPS.

Preservar agentes já autorizados, chamadas, troncos, perfis existentes e isolamento. Revogação explícita exige confirmação e não equivale à desativação de telefonia na VPS.

## Validação e operação

- `node --test src/features/telephony/domain/platform-pbx-administration.test.mjs`: interface, troca de empresa, leitura fora do bloco administrativo, autorização explícita e parser TSX.
- Fixture descartável: instalar `@electric-sql/pglite@0.5.16` fora do repositório, definir `PGLITE_MODULE` para seu `dist/index.js` e executar `node supabase/tests/platform-pbx-administration.mjs`. São 19 verificações SQL, incluindo revogação após desativação, bloqueio de administrador tenant, empresa/agente divergentes e revalidação de permissão. O resolvedor inferior de permissões é sintético; APIs e guardas de autoridade são reais.
- Suíte `test:ci`, qualidade e os dois builds passaram. Revisão independente apontou e resolveu o bloqueio de consulta/revogação de empresas inativas e a atualização de estado na tela tenant.
- Migration aplicada separadamente após backup das três definições anteriores, guard de hash e dry-run de somente um arquivo. Não cria agentes nem instala perfis. Leitura autenticada da plataforma e rejeição da escrita de um usuário sem autoridade verificadas em transações somente leitura de produção. Grants anteriores preservados; helper de autoridade executável apenas pelo proprietário. As categorias de avisos de segurança permaneceram iguais às anteriores.
- Acesso: administração Union → Integrações → PABX → Gerenciar central na empresa desejada. Central da Union abre o perfil legado. A área apresenta etapas manuais, autorização de chave pública, instruções persistentes de configuração e atualização do estado. Empresa inativa ou módulo desligado permite consulta/revogação, mas bloqueia nova autorização.
- Publicação HostGator exige confirmação no workflow do commit final, independentemente da aplicação da migration.
