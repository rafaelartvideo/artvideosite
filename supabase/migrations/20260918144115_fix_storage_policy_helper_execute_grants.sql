begin;

-- These helpers are referenced directly by RLS policies evaluated as
-- authenticated users. Keep anonymous/PUBLIC execution revoked while
-- allowing the authenticated role to evaluate those policies.
revoke all on function private.can_upload_service_order_storage_object(text) from public, anon;
grant execute on function private.can_upload_service_order_storage_object(text) to authenticated;

revoke all on function private.can_insert_media_record(uuid,text,text,uuid) from public, anon;
grant execute on function private.can_insert_media_record(uuid,text,text,uuid) to authenticated;

revoke all on function private.can_manage_catalog_storage_object(text,text,text) from public, anon;
grant execute on function private.can_manage_catalog_storage_object(text,text,text) to authenticated;

revoke all on function private.can_delete_service_order_storage_object(text,text) from public, anon;
grant execute on function private.can_delete_service_order_storage_object(text,text) to authenticated;

revoke all on function private.can_view_service_image_storage_object(text,text) from public, anon;
grant execute on function private.can_view_service_image_storage_object(text,text) to authenticated;

commit;
