-- Миграция 4: работы, которые учитель собрал в «Конструкторе лабораторных» с ИИ.
-- Выполнить один раз в Supabase: SQL Editor → New query → вставить → Run.
-- Существующие данные не меняются. Скрипт выполняется одной транзакцией и его можно
-- запускать повторно: объекты создаются через if not exists / or replace, политики пересоздаются.
--
-- Содержимое работы (lesson) — JSON той же формы, что встроенные работы в src/data/simLessons.js.
-- Клиент и сервер проверяют его validateLesson (src/customLesson.js) перед запуском и перед опросом ИИ;
-- база ограничивает только размер и форму — схему шагов держать в двух местах незачем.

begin;

create table if not exists public.custom_lessons (
  id uuid primary key default gen_random_uuid(),
  -- Владельца задаёт база: клиент не может записать работу от имени другого учителя
  teacher_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  title text not null check (char_length(title) between 1 and 200),
  subject text not null check (subject in ('physics', 'biology')),
  grade int not null check (grade between 7 and 11),
  lang text not null check (lang in ('ru', 'kk')),
  lesson jsonb not null check (jsonb_typeof(lesson) = 'object' and octet_length(lesson::text) < 20000),
  -- Id работы для результатов и заданий: 'c-' + первые 12 hex uuid. Укладывается в results_lesson_fmt
  -- (миграция 003) и не пересекается с id встроенных работ (в них нет дефиса после «c»).
  lesson_id text generated always as ('c-' || substr(replace(id::text, '-', ''), 1, 12)) stored
);
create unique index if not exists custom_lessons_lesson_id_idx on public.custom_lessons (lesson_id);
create index if not exists custom_lessons_teacher_idx on public.custom_lessons (teacher_id, created_at);
alter table public.custom_lessons enable row level security;

-- Время создания и владельца клиент не задаёт; менять можно только название и содержимое.
revoke all on public.custom_lessons from anon, authenticated;
grant select, delete on public.custom_lessons to authenticated;
grant insert (title, subject, grade, lang, lesson) on public.custom_lessons to authenticated;
grant update (title, lesson) on public.custom_lessons to authenticated;

-- Создавать работы может только учитель (роль из profiles, а не из запроса)
drop policy if exists "teacher inserts own custom lessons" on public.custom_lessons;
create policy "teacher inserts own custom lessons" on public.custom_lessons
  for insert to authenticated
  with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher')
  );

drop policy if exists "teacher updates own custom lessons" on public.custom_lessons;
create policy "teacher updates own custom lessons" on public.custom_lessons
  for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

drop policy if exists "teacher deletes own custom lessons" on public.custom_lessons;
create policy "teacher deletes own custom lessons" on public.custom_lessons
  for delete to authenticated
  using (teacher_id = auth.uid());

-- Читают автор и ученики классов этого учителя: ученику работа нужна, чтобы выполнить задание.
-- Чужим ученикам и гостям работы учителя не видны.
drop policy if exists "owner and own students read custom lessons" on public.custom_lessons;
create policy "owner and own students read custom lessons" on public.custom_lessons
  for select to authenticated
  using (
    teacher_id = auth.uid()
    or exists (
      select 1
      from public.profiles p
      join public.classes c on c.id = p.class_id
      where p.id = auth.uid() and c.teacher_id = custom_lessons.teacher_id
    )
  );

-- Не больше 200 работ на учителя: генерация дешёвая, а без предела таблицу можно завалить.
-- security definer — считает строки в обход RLS, как results_rate_limit в миграции 003.
create or replace function public.custom_lessons_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from custom_lessons where teacher_id = new.teacher_id) >= 200 then
    raise exception 'custom lessons limit';
  end if;
  return new;
end;
$$;
-- Прямой вызов через /rest/v1/rpc не нужен — триггер работает и без права EXECUTE (как в миграции 006)
revoke execute on function public.custom_lessons_limit() from public, anon, authenticated;
drop trigger if exists custom_lessons_limit on public.custom_lessons;
create trigger custom_lessons_limit before insert on public.custom_lessons
  for each row execute function public.custom_lessons_limit();

commit;
