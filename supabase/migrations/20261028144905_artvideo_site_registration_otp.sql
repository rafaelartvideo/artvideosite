-- Cadastro da loja sem e-mail: confirmação obrigatória do WhatsApp antes de criar credenciais.
begin;
alter table public.artvideo_customer_access_challenges
  drop constraint if exists artvideo_customer_access_challenges_purpose_check;
alter table public.artvideo_customer_access_challenges
  add constraint artvideo_customer_access_challenges_purpose_check
  check (purpose in ('activation','login','registration'));
alter table public.artvideo_customer_access_challenges
  drop constraint if exists artvideo_customer_challenge_scope;
alter table public.artvideo_customer_access_challenges
  add constraint artvideo_customer_challenge_scope
  check (
    (purpose='activation' and invite_id is not null and account_user_id is null)
    or (purpose='login' and account_user_id is not null and invite_id is null)
    or (purpose='registration' and invite_id is null and account_user_id is null)
  );
commit;
