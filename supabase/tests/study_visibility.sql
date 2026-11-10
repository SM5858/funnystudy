-- Verify compatibility without retaining changes to any study.
begin;
set local statement_timeout = '15s';
do $$
declare target_id bigint; original_visibility boolean;
begin
  if exists (select 1 from public.studies where is_private is distinct from is_hidden) then
    raise exception 'Visibility backfill did not preserve all studies';
  end if;
  select id, is_hidden into target_id, original_visibility
    from public.studies order by id limit 1;
  if target_id is null then
    raise exception 'Verification requires an existing study';
  end if;
  update public.studies set is_private = not original_visibility where id = target_id;
  if not exists (
    select 1 from public.studies where id = target_id
      and is_private = not original_visibility and is_hidden = not original_visibility
  ) then
    raise exception 'New visibility writes do not update the legacy field';
  end if;
  update public.studies set is_hidden = original_visibility where id = target_id;
  if not exists (
    select 1 from public.studies where id = target_id
      and is_private = original_visibility and is_hidden = original_visibility
  ) then
    raise exception 'Legacy visibility writes do not update the new field';
  end if;
end $$;
rollback;
select 'PASS: study visibility backfill and bidirectional compatibility' as result;
