begin;

-- A transferência encerra a visibilidade do remetente. O acesso aos
-- encaminhamentos passa a ser do destinatário, da fila/departamento de
-- destino e de quem possui a permissão gerencial view_all.
-- Atendimentos finalizados permanecem com o último responsável.
drop policy if exists union_whatsapp_conversations_read on public.union_whatsapp_conversations;
create policy union_whatsapp_conversations_read
on public.union_whatsapp_conversations for select to authenticated
using (
  private.union_whatsapp_active_account_visible(organization_id,channel_id,account_phone)
  and (
    private.union_whatsapp_allowed(organization_id,'view_all')
    or (
      assigned_to=(select auth.uid())
      and private.union_whatsapp_allowed(organization_id,'view_assigned')
    )
    or (
      status='waiting'
      and assigned_to is null
      and private.union_whatsapp_allowed(organization_id,'view_queues')
      and (
        forwarded_at is null
        or forwarded_by is distinct from (select auth.uid())
      )
      and (
        department_id is null or exists(
          select 1 from public.union_whatsapp_department_members member
          where member.organization_id=union_whatsapp_conversations.organization_id
            and member.department_id=union_whatsapp_conversations.department_id
            and member.user_id=(select auth.uid())
        )
      )
    )
  )
);

commit;
