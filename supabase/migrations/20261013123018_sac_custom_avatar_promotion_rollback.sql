-- Lossless tracking for legitimate SAC JPGs moved from raw_metadata.avatar
-- to avatar_url. No copy of customer image bytes is stored here.
create table if not exists private.sac_custom_avatar_promotion_rollback (
  contact_id uuid primary key references public.sac_digital_contacts(id) on delete cascade,
  image_md5 text not null,
  captured_at timestamptz not null default now()
);
revoke all on private.sac_custom_avatar_promotion_rollback
from public, anon, authenticated;

insert into private.sac_custom_avatar_promotion_rollback(contact_id,image_md5)
select id,md5(raw_metadata->>'avatar')
from public.sac_digital_contacts
where avatar_url is null and raw_metadata->>'avatar' like 'data:image/jpg;base64,%'
on conflict(contact_id) do nothing;

update public.sac_digital_contacts c
set avatar_url=c.raw_metadata->>'avatar',
    raw_metadata=c.raw_metadata-'avatar'
where c.avatar_url is null
  and c.raw_metadata->>'avatar' like 'data:image/jpg;base64,%'
  and exists (
   select 1 from private.sac_custom_avatar_promotion_rollback b
   where b.contact_id=c.id
     and b.image_md5=md5(c.raw_metadata->>'avatar')
  );
