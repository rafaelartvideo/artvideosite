-- MANUAL ONLY: return promoted custom images to metadata without loss.
-- Does not affect changed/newer images, and requires backup inventory.
begin;
set local lock_timeout='5s';
with restore as (
  select c.id, c.avatar_url
  from public.sac_digital_contacts c
  join private.sac_custom_avatar_promotion_rollback b on b.contact_id=c.id
  where c.avatar_url like 'data:image/jpg;base64,%'
    and md5(c.avatar_url)=b.image_md5
    and not (c.raw_metadata ? 'avatar')
), done as (
  update public.sac_digital_contacts c
  set avatar_url=null,
      raw_metadata=coalesce(c.raw_metadata,'{}'::jsonb)
        || jsonb_build_object('avatar',r.avatar_url)
  from restore r
  where c.id=r.id
  returning c.id
)
select count(*) as restored from done;
commit;
-- The rollback table should remain until explicitly approved for removal.
