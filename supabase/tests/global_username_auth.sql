-- Transactional verification for global username constraints.
-- Run only after the global username migration is applied.

begin;

do $$
declare
  v_first uuid;
  v_second uuid;
  v_normalized text;
begin
  select id into v_first from public.profiles order by created_at, id limit 1;
  select id into v_second from public.profiles where id <> v_first order by created_at, id limit 1;

  if v_first is null or v_second is null then
    raise exception 'global_username_auth test requires at least two profiles';
  end if;

  update public.profiles set username = 'username_test_alpha' where id = v_first;

  begin
    update public.profiles set username = 'USERNAME_TEST_ALPHA' where id = v_second;
    raise exception 'expected normalized duplicate username to be rejected';
  exception
    when unique_violation then
      null;
  end;

  update public.profiles set username = 'Username_Test_Upper' where id = v_second;
  select username into v_normalized from public.profiles where id = v_second;
  if v_normalized <> 'username_test_upper' then
    raise exception 'expected username to be normalized to lowercase, got %', v_normalized;
  end if;

  begin
    update public.profiles set username = 'ab' where id = v_second;
    raise exception 'expected short username to be rejected';
  exception
    when check_violation then
      null;
  end;

  update public.profiles set username = 'username_test_beta' where id = v_second;
end;
$$;

select count(*) as invalid_username_count
from public.profiles
where username is null
   or username <> lower(username)
   or char_length(username) not between 3 and 32
   or username !~ '^[a-z0-9][a-z0-9._-]{2,31}$';

rollback;
