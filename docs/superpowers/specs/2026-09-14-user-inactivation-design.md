# Inativação Segura de Usuários — Design

## Objetivo

Substituir exclusão física de usuários por inativação reversível e auditável. Um usuário inativo não pode acessar o sistema, mas seu histórico, vínculos e referências permanecem preservados.

## Escopo

- Área `Equipes > Usuários`.
- Botão de ação Ativar/Inativar na tabela.
- Sincronização entre `employees`, `profiles` e `organization_members`.
- Permissão específica `employees.toggle_active`.
- Remoção da exclusão física da UI operacional de usuários.

## Regras de negócio

1. Usuários não são excluídos fisicamente pelo fluxo normal do admin.
2. Inativar um usuário deve:
   - definir `employees.is_active = false`;
   - definir `profiles.is_active = false` quando houver `profile_id`;
   - definir `organization_members.status = 'blocked'` para a organização correspondente;
   - preservar `auth.users`, histórico, vínculos, permissões herdadas e referências de auditoria.
3. Reativar deve:
   - definir `employees.is_active = true`;
   - definir `profiles.is_active = true`;
   - definir `organization_members.status = 'active'`;
   - manter a função já atribuída.
4. A operação deve ser autorizada por `employees.toggle_active`; não deve exigir `employees.edit` quando a única alteração é ativar/inativar.
5. O backend deve validar que o usuário-alvo pertence à organização ativa.
6. O próprio usuário não deve conseguir se auto-inativar quando isso deixaria a organização sem um usuário administrativo/owner válido.
7. Owners protegidos não devem ser inativados por usuários sem permissão de administração da organização.
8. O status exibido na tabela deve refletir o estado efetivo de acesso, não apenas um único campo isolado.

## Backend

Criar uma ação dedicada, preferencialmente `toggle_employee_user_active`, na Edge Function `supabase/functions/server/index.ts`.

Entrada:

```ts
{
  action: "toggle_employee_user_active",
  organization_id: string,
  employee_id: string,
  is_active: boolean,
}
```

A operação deve validar autenticação, organização, módulo, membership e `employees.toggle_active`, então sincronizar os três registros relacionados. Em caso de falha parcial, o backend deve desfazer as alterações realizadas ou executar a sincronização por RPC transacional.

## Frontend

Na tabela de Usuários:

- manter botão Ativar/Inativar em Ações;
- remover o botão Excluir do fluxo normal;
- usar confirmação antes de inativar;
- exibir toast específico de sucesso/erro;
- atualizar a query de usuários após a operação.

No formulário de edição, o toggle de status pode permanecer, mas deve chamar a mesma operação dedicada ou seguir a mesma regra de autorização.

## Permissões

- `employees.toggle_active`: ativa/inativa usuários.
- `employees.edit`: edita dados cadastrais, função, telefone, senha, e-mail etc.
- `employees.delete`: deixa de ser exposta na UI operacional; pode ser mantida apenas para manutenção administrativa excepcional se necessário, sem botão no admin comum.

## Segurança e multiempresa

Todas as alterações devem ser restritas a `organization_id`. Um usuário com acesso a uma organização não pode alterar usuários de outra. A integração UNIQ da ArtVideo continua isolada e não participa da regra de ativação, exceto por preservar o vínculo existente.

## Testes de aceitação

- usuário com `employees.toggle_active` e sem `employees.edit` consegue inativar e reativar;
- usuário sem `employees.toggle_active` recebe 403;
- usuário inativado não consegue autenticar/usar o app após a atualização de sessão;
- reativação restaura acesso com a função anterior;
- nenhum registro histórico é apagado;
- UI não oferece exclusão física de usuário;
- tentativa cross-tenant é bloqueada.
