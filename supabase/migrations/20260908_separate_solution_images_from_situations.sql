-- Fotos da solução pertencem à resolução da OS e são exibidas em
-- Documentos > Solução. Elas não devem ser classificadas como mídia de uma
-- situação específica.

begin;

select pg_advisory_xact_lock(
  hashtextextended('artvideo:separate_solution_images_from_situations', 0)
);

-- Remove a automação anterior que copiava mídias de solução
-- (service_order_media.sort_order >= 1000) para service_order_situation_media.
drop trigger if exists trg_link_solution_media_to_order_situation
  on public.service_order_media;

drop function if exists public.link_solution_media_to_order_situation();

-- A proteção abaixo existia apenas porque a foto da solução era considerada
-- parte da situação. Com a nova regra, esse vínculo não existe mais.
drop trigger if exists service_order_situation_media_protect_solution_link
  on public.service_order_situation_media;

drop function if exists private.prevent_solution_situation_media_unlink();

-- Remove somente os vínculos de situação que apontam para uma mídia já
-- classificada como foto da solução. O registro em service_order_media e a
-- própria mídia são preservados integralmente.
delete from public.service_order_situation_media situation_media
using public.service_order_media order_media
where situation_media.service_order_id = order_media.service_order_id
  and situation_media.media_id = order_media.media_id
  and situation_media.attachment_type_id is null
  and coalesce(order_media.sort_order, 0) >= 1000;

commit;
