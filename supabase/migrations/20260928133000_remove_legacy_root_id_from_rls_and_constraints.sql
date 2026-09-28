-- Remove o UUID legado das constraints e policies RLS restantes.
-- Regras exclusivas da ArtVideo passam a resolver o tenant pelo marcador.
-- A policy de organizações resolve a operadora Union World pelo marcador de plataforma.

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      con.conname as constraint_name
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and pg_get_constraintdef(con.oid) like '%00000000-0000-4000-8000-000000000001%'
  loop
    execute format(
      'alter table %I.%I drop constraint %I',
      v_constraint.schema_name,
      v_constraint.table_name,
      v_constraint.constraint_name
    );

    if v_constraint.table_name = 'employees'
       and v_constraint.constraint_name = 'employees_uniq_subscriber_artvideo_only' then
      execute format(
        'alter table %I.%I add constraint %I check (uniq_subscriber_id is null or organization_id = public.artvideo_organization_id())',
        v_constraint.schema_name,
        v_constraint.table_name,
        v_constraint.constraint_name
      );
    else
      execute format(
        'alter table %I.%I add constraint %I check (organization_id = public.artvideo_organization_id())',
        v_constraint.schema_name,
        v_constraint.table_name,
        v_constraint.constraint_name
      );
    end if;
  end loop;
end;
$$;

do $$
declare
  v_policy record;
  v_qual text;
  v_check text;
  v_resolver text;
  v_sql text;
  v_fixed constant text := '''00000000-0000-4000-8000-000000000001''::uuid';
begin
  for v_policy in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) like '%00000000-0000-4000-8000-000000000001%'
  loop
    v_resolver := case
      when v_policy.tablename = 'organizations'
        and v_policy.policyname = 'organizations_update'
      then 'public.platform_operator_organization_id()'
      else 'public.artvideo_organization_id()'
    end;

    v_qual := case
      when v_policy.qual is null then null
      else replace(v_policy.qual, v_fixed, v_resolver)
    end;

    v_check := case
      when v_policy.with_check is null then null
      else replace(v_policy.with_check, v_fixed, v_resolver)
    end;

    v_sql := format(
      'alter policy %I on %I.%I',
      v_policy.policyname,
      v_policy.schemaname,
      v_policy.tablename
    );

    if v_qual is not null then
      v_sql := v_sql || format(' using (%s)', v_qual);
    end if;

    if v_check is not null then
      v_sql := v_sql || format(' with check (%s)', v_check);
    end if;

    execute v_sql;
  end loop;
end;
$$;
