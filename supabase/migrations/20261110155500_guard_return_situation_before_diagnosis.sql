-- Nenhuma transicao de situacao da OS de retorno antes da classificacao do defeito.
create or replace function private.prevent_return_situation_before_diagnosis()
returns trigger language plpgsql set search_path to ''
as $$
begin
  if old.return_root_id is not null and old.return_classification='analysis'
      and new.return_classification='analysis'
      and old.situation_id is distinct from new.situation_id then
    raise exception 'Registre e classifique o diagnostico do retorno antes de alterar a situacao.' using errcode='23514';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_return_situation_before_diagnosis on public.service_orders;
create trigger prevent_return_situation_before_diagnosis
  before update of situation_id on public.service_orders
  for each row execute function private.prevent_return_situation_before_diagnosis();
