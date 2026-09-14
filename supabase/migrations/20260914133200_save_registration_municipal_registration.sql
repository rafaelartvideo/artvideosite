begin;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.save_registration(uuid,uuid,jsonb,text[],jsonb,jsonb)'::regprocedure)
    into v_def;

  if position('municipal_registration' in v_def) = 0 then
    v_def := replace(v_def,
      'state_registration, birth_date, foundation_date, phone, whatsapp, email, is_active',
      'state_registration, municipal_registration, birth_date, foundation_date, phone, whatsapp, email, is_active');

    v_def := replace(v_def,
      'nullif(trim(coalesce(p_entity->>''state_registration'','''')),''''),' || chr(10) || '      nullif(p_entity->>''birth_date'','''')::date,',
      'nullif(trim(coalesce(p_entity->>''state_registration'','''')),''''),' || chr(10) || '      nullif(trim(coalesce(p_entity->>''municipal_registration'','''')),''''),' || chr(10) || '      nullif(p_entity->>''birth_date'','''')::date,');

    v_def := replace(v_def,
      'state_registration = nullif(trim(coalesce(p_entity->>''state_registration'','''')),''''),' || chr(10) || '      birth_date =',
      'state_registration = nullif(trim(coalesce(p_entity->>''state_registration'','''')),''''),' || chr(10) || '      municipal_registration = nullif(trim(coalesce(p_entity->>''municipal_registration'','''')),''''),' || chr(10) || '      birth_date =');

    v_def := replace(v_def,
      'trade_name, legal_name, cnpj, state_registration, foundation_date, birth_date',
      'trade_name, legal_name, cnpj, state_registration, municipal_registration, foundation_date, birth_date');

    v_def := replace(v_def,
      'case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end',
      'case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end');

    v_def := replace(v_def,
      'case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end,' || chr(10) || '        case when v_person_type = ''PJ'' then nullif(p_entity->>''foundation_date'','''')::date else null end,',
      'case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end,' || chr(10) || '        case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''municipal_registration'','''')),'''' ) else null end,' || chr(10) || '        case when v_person_type = ''PJ'' then nullif(p_entity->>''foundation_date'','''')::date else null end,');

    -- Formato normalizado efetivo, sem espaço antes de ")".
    v_def := replace(v_def,
      'case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end',
      'case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end');

    v_def := replace(v_def,
      'case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end',
      'case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end');

    v_def := replace(v_def,
      'case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end',
      'case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end');

    -- Replacements exatos do pg_get_functiondef atual.
    v_def := replace(v_def,
      'case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end',
      'case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end');

    v_def := replace(v_def,
      'state_registration = case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end,' || chr(10) || '        foundation_date =',
      'state_registration = case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end,' || chr(10) || '        municipal_registration = case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''municipal_registration'','''')),'''' ) else null end,' || chr(10) || '        foundation_date =');

    -- As versões acima usam o texto SQL; cobre também a serialização sem espaço extra.
    v_def := regexp_replace(
      v_def,
      'case when v_person_type = ''PJ'' then nullif\(trim\(coalesce\(p_entity->>''state_registration'',''''\)\),''''\) else null end,\n        case when v_person_type = ''PJ'' then nullif\(p_entity->>''foundation_date'',''''\)::date else null end,',
      'case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''state_registration'','''')),'''' ) else null end,' || chr(10) || '        case when v_person_type = ''PJ'' then nullif(trim(coalesce(p_entity->>''municipal_registration'','''')),'''' ) else null end,' || chr(10) || '        case when v_person_type = ''PJ'' then nullif(p_entity->>''foundation_date'','''')::date else null end,',
      'g'
    );

    if position('municipal_registration' in v_def) = 0 then
      raise exception 'Não foi possível evoluir save_registration para Inscrição Municipal.';
    end if;

    execute v_def;
  end if;
end $$;

commit;
