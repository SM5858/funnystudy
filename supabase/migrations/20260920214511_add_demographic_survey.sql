-- Match the demographic survey tables used by the staging application.
-- Reference data is readable by participants and editable by superadmins.
-- Participant responses are readable/insertable only by their owner;
-- superadmins retain access for research administration.

create table if not exists public.demographic_questions (
  id smallserial primary key,
  question text not null,
  created_datetime_utc timestamptz not null default now(),
  modified_datetime_utc timestamptz not null default now(),
  created_by_user_id uuid not null default auth.uid()
    references auth.users(id) on update cascade on delete cascade,
  modified_by_user_id uuid not null default auth.uid()
    references auth.users(id) on update cascade on delete cascade
);

create table if not exists public.demographic_answers (
  id smallserial primary key,
  answer text not null unique,
  created_datetime_utc timestamptz not null default now(),
  modified_datetime_utc timestamptz not null default now(),
  created_by_user_id uuid not null default auth.uid()
    references auth.users(id) on update cascade on delete cascade,
  modified_by_user_id uuid not null default auth.uid()
    references auth.users(id) on update cascade on delete cascade
);

create table if not exists public.demographic_answer_question_mapping (
  id serial primary key,
  question_id smallint not null references public.demographic_questions(id)
    on update cascade on delete cascade,
  answer_id smallint not null references public.demographic_answers(id)
    on update cascade on delete cascade,
  display_order integer not null default 0,
  is_deleted boolean not null default false,
  created_datetime_utc timestamptz not null default now(),
  modified_datetime_utc timestamptz not null default now(),
  created_by_user_id uuid not null default auth.uid()
    references auth.users(id) on update cascade on delete cascade,
  modified_by_user_id uuid not null default auth.uid()
    references auth.users(id) on update cascade on delete cascade
);

create table if not exists public.demographic_user_responses (
  id serial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer_question_mapping_id integer not null
    references public.demographic_answer_question_mapping(id),
  created_datetime_utc timestamptz not null default now(),
  modified_datetime_utc timestamptz default now()
);

create index if not exists demographic_user_responses_user_id_idx
  on public.demographic_user_responses(user_id);
create index if not exists demographic_user_responses_mapping_id_idx
  on public.demographic_user_responses(answer_question_mapping_id);
create index if not exists demographic_mapping_question_id_idx
  on public.demographic_answer_question_mapping(question_id);
create index if not exists demographic_mapping_answer_id_idx
  on public.demographic_answer_question_mapping(answer_id);

alter table public.demographic_questions enable row level security;
alter table public.demographic_answers enable row level security;
alter table public.demographic_answer_question_mapping enable row level security;
alter table public.demographic_user_responses enable row level security;

revoke all on public.demographic_questions, public.demographic_answers,
  public.demographic_answer_question_mapping, public.demographic_user_responses
  from public, anon, authenticated;
grant select, insert, update, delete on public.demographic_questions,
  public.demographic_answers, public.demographic_answer_question_mapping,
  public.demographic_user_responses to authenticated;

revoke all on sequence public.demographic_questions_id_seq,
  public.demographic_answers_id_seq, public.demographic_answer_question_mapping_id_seq,
  public.demographic_user_responses_id_seq from public, anon, authenticated;
grant usage on sequence public.demographic_questions_id_seq,
  public.demographic_answers_id_seq, public.demographic_answer_question_mapping_id_seq,
  public.demographic_user_responses_id_seq to authenticated;

create policy "Participants can read demographic questions"
  on public.demographic_questions for select to authenticated using (true);
create policy "Superadmins can manage demographic questions"
  on public.demographic_questions for all to authenticated
  using (public.is_superadmin((select auth.uid())))
  with check (public.is_superadmin((select auth.uid())));

create policy "Participants can read demographic answers"
  on public.demographic_answers for select to authenticated using (true);
create policy "Superadmins can manage demographic answers"
  on public.demographic_answers for all to authenticated
  using (public.is_superadmin((select auth.uid())))
  with check (public.is_superadmin((select auth.uid())));

create policy "Participants can read demographic mappings"
  on public.demographic_answer_question_mapping for select to authenticated using (true);
create policy "Superadmins can manage demographic mappings"
  on public.demographic_answer_question_mapping for all to authenticated
  using (public.is_superadmin((select auth.uid())))
  with check (public.is_superadmin((select auth.uid())));

create policy "Participants can read their demographic responses"
  on public.demographic_user_responses for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Participants can insert their demographic responses"
  on public.demographic_user_responses for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.demographic_answer_question_mapping mapping
      where mapping.id = answer_question_mapping_id and not mapping.is_deleted
    )
  );
create policy "Superadmins can manage demographic responses"
  on public.demographic_user_responses for all to authenticated
  using (public.is_superadmin((select auth.uid())))
  with check (public.is_superadmin((select auth.uid())));
