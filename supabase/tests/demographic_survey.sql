-- Run against a database with the survey migrations and an existing
-- non-superadmin participant. All response fixtures are rolled back.
begin;
set local statement_timeout = '15s';

select set_config('request.jwt.claim.sub', (
  select p.id::text from public.profiles p join auth.users u on u.id = p.id
  where not coalesce(p.is_superadmin, false) order by p.id limit 1
), true);
select set_config('demographics_test.other_user', (
  select id::text from auth.users where id <> auth.uid() order by id limit 1
), true);
select set_config('demographics_test.mapping_id', (
  select id::text from public.demographic_answer_question_mapping
  where not is_deleted order by id limit 1
), true);

do $$
begin
  if auth.uid() is null or nullif(current_setting('demographics_test.other_user'), '') is null then
    raise exception 'Verification requires an existing participant and a second account';
  end if;
end $$;

insert into public.demographic_user_responses (id, user_id, answer_question_mapping_id)
values (-2147483647, current_setting('demographics_test.other_user')::uuid,
  current_setting('demographics_test.mapping_id')::integer);

set local role authenticated;
do $$
declare affected integer;
begin
  if public.is_superadmin(auth.uid()) then
    raise exception 'The participant fixture must not be a superadmin';
  end if;
  if (select count(*) from public.demographic_questions) <> 5
    or (select count(*) from public.demographic_answers) <> 131
    or (select count(*) from public.demographic_answer_question_mapping where not is_deleted) <> 132 then
    raise exception 'Participant cannot read the complete staging survey';
  end if;
  if not has_sequence_privilege('authenticated', 'public.demographic_user_responses_id_seq', 'USAGE') then
    raise exception 'Participant cannot allocate response IDs';
  end if;
  insert into public.demographic_user_responses (id, user_id, answer_question_mapping_id)
  values (-2147483646, auth.uid(), current_setting('demographics_test.mapping_id')::integer);
  if not exists (select 1 from public.demographic_user_responses where id = -2147483646) then
    raise exception 'Participant cannot read their saved response';
  end if;
  if exists (select 1 from public.demographic_user_responses where user_id <> auth.uid()) then
    raise exception 'Participant can read another user''s responses';
  end if;
  begin
    insert into public.demographic_user_responses (id, user_id, answer_question_mapping_id)
    values (-2147483645, current_setting('demographics_test.other_user')::uuid,
      current_setting('demographics_test.mapping_id')::integer);
    raise exception 'Participant can submit a response for another user';
  exception when insufficient_privilege then null;
  end;
  update public.demographic_questions set question = question;
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'Participant can edit survey questions';
  end if;
end $$;

set local role anon;
do $$
begin
  if has_table_privilege('anon', 'public.demographic_user_responses', 'SELECT')
    or has_table_privilege('anon', 'public.demographic_user_responses', 'INSERT') then
    raise exception 'Anonymous users can access participant responses';
  end if;
end $$;

reset role;
rollback;
select 'PASS: survey lookup, own-response insert/read, cross-user isolation, and anonymous access' as result;
