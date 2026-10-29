-- A photo lookup used hashed EXISTS subplans that authorized every task twice.
-- Keep both access branches and the task table's RLS unchanged. Scalar,
-- correlated subqueries cannot be pulled up into full-table hashed subplans.
-- The additional UUID equality uses the existing task primary key; retaining
-- both original text comparisons preserves canonical path matching exactly.
set lock_timeout = '3s';
set statement_timeout = '15s';

alter policy technician_task_photo_select on storage.objects
using (
  bucket_id = 'technician-task-photos'
  and coalesce((
    select true
    from public.service_order_item_tasks task
    where task.item_id = private.try_uuid((storage.foldername(objects.name))[2])
      and task.organization_id::text = (storage.foldername(objects.name))[1]
      and task.item_id::text = (storage.foldername(objects.name))[2]
      and private.is_my_technician_task(task.item_id, 'technician_panel.data.photos')
    limit 1
  ), false)
);

alter policy technician_task_photo_order_select on storage.objects
using (
  bucket_id = 'technician-task-photos'
  and coalesce((
    select true
    from public.service_order_item_tasks task
    where task.item_id = private.try_uuid((storage.foldername(objects.name))[2])
      and task.organization_id::text = (storage.foldername(objects.name))[1]
      and task.item_id::text = (storage.foldername(objects.name))[2]
      and private.can_view_service_order(task.service_order_id)
      and private.has_effective_organization_permission(task.organization_id, 'orders.section.images')
    limit 1
  ), false)
);

reset lock_timeout;
reset statement_timeout;
