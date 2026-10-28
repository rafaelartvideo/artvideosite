-- Permit authenticated site customers to verify their own WhatsApp.
begin;
alter table public.artvideo_customer_access_challenges
  drop constraint if exists artvideo_customer_access_challenges_purpose_check;
alter table public.artvideo_customer_access_challenges
  add constraint artvideo_customer_access_challenges_purpose_check
  check (purpose in ('activation','login','registration','profile'));
alter table public.artvideo_customer_access_challenges
  drop constraint if exists artvideo_customer_challenge_scope;
alter table public.artvideo_customer_access_challenges
  add constraint artvideo_customer_challenge_scope
  check (
    (purpose='activation' and invite_id is not null and account_user_id is null)
    or (purpose='login' and account_user_id is not null and invite_id is null)
    or (purpose='registration' and invite_id is null and account_user_id is null)
    or (purpose='profile' and invite_id is null and account_user_id is not null)
  );
create or replace function private.artvideo_reset_phone_verification_v1()
returns trigger language plpgsql set search_path='' as $$
begin
  if regexp_replace(coalesce(new.phone,''),'[^0-9]','','g')
    is distinct from regexp_replace(coalesce(old.phone,''),'[^0-9]','','g')
    and new.whatsapp_verified_at is not distinct from old.whatsapp_verified_at then
    new.whatsapp_verified_at := null;
    new.whatsapp_verified_number := null;
  end if;
  return new;
end $$;
drop trigger if exists artvideo_reset_phone_verification on public.artvideo_customer_accounts;
create trigger artvideo_reset_phone_verification before update of phone
on public.artvideo_customer_accounts
for each row execute function private.artvideo_reset_phone_verification_v1();
commit;
