-- Keep existing production clients using is_hidden compatible with the
-- staging release, which reads and writes is_private.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'studies' and column_name = 'is_private'
  ) then
    alter table public.studies add column is_private boolean not null default false;
    update public.studies set is_private = is_hidden where is_private is distinct from is_hidden;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'studies' and column_name = 'is_hidden'
  ) then
    alter table public.studies add column is_hidden boolean not null default false;
    update public.studies set is_hidden = is_private where is_hidden is distinct from is_private;
  end if;

  if exists (select 1 from public.studies where is_private is distinct from is_hidden) then
    raise exception 'Study visibility columns disagree; reconcile before continuing';
  end if;
end $$;

create or replace function public.sync_study_visibility_columns()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    new.is_private := new.is_private or new.is_hidden;
    new.is_hidden := new.is_private;
  elsif new.is_private is distinct from old.is_private
    and new.is_hidden is distinct from old.is_hidden then
    if new.is_private is distinct from new.is_hidden then
      raise exception 'is_private and is_hidden must agree' using errcode = '23514';
    end if;
  elsif new.is_private is distinct from old.is_private then
    new.is_hidden := new.is_private;
  elsif new.is_hidden is distinct from old.is_hidden then
    new.is_private := new.is_hidden;
  end if;
  return new;
end $$;

create trigger sync_study_visibility_before_write
  before insert or update of is_private, is_hidden on public.studies
  for each row execute function public.sync_study_visibility_columns();

notify pgrst, 'reload schema';
