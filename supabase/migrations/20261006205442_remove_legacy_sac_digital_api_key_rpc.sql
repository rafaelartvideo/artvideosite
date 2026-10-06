begin;

drop function if exists public.configure_sac_digital_integration(
  uuid,
  boolean,
  text,
  text,
  text
);

commit;