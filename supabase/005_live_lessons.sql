-- Миграция 5: «Живой урок» — учитель в реальном времени видит, кто на каком шаге работы.
-- Выполнить один раз в Supabase: SQL Editor → New query → вставить → Run.
-- Существующие данные не меняются. Скрипт выполняется одной транзакцией и его можно
-- запускать повторно: объекты создаются через if not exists / or replace, политики пересоздаются.
--
-- Устройство: приватный канал Supabase Realtime `live:<class_id>` на класс.
--   Presence  — ученик публикует своё состояние (номер шага, ошибки; только числа и id);
--   Broadcast — учитель рассылает подсказки и «урок начат / завершён».
-- Кто может войти в канал и что в нём делать, решают политики на realtime.messages ниже
-- (Supabase «Realtime Authorization»). В настройках проекта: Realtime → Settings →
-- выключить «Allow public access», чтобы в проекте работали только приватные каналы.

begin;

-- ---------- Идущий урок ----------
-- Одна строка на класс, пока урок идёт. Нужна, чтобы ученик, открывший сайт уже после начала,
-- увидел баннер «Идёт живой урок» — сообщения Broadcast не хранятся и до него бы не дошли.
create table if not exists public.live_sessions (
  class_id uuid primary key references public.classes (id) on delete cascade,
  lesson_id text not null check (lesson_id ~ '^[a-z0-9_-]{1,40}$'),
  started_at timestamptz not null default now(),
  started_by uuid not null default auth.uid() references auth.users (id) on delete cascade
);
alter table public.live_sessions enable row level security;

-- Время начала и автора задаёт база: иначе можно «продлить» забытый урок или выдать себя за учителя.
-- Новый урок начинается через delete + insert, поэтому update не нужен вовсе.
revoke all on public.live_sessions from anon, authenticated;
grant select, delete on public.live_sessions to authenticated;
grant insert (class_id, lesson_id) on public.live_sessions to authenticated;

drop policy if exists "teacher manages live session of own class" on public.live_sessions;
create policy "teacher manages live session of own class" on public.live_sessions
  for all to authenticated
  using (public.is_teacher_of(class_id))
  with check (public.is_teacher_of(class_id) and started_by = auth.uid());

drop policy if exists "student reads live session of own class" on public.live_sessions;
create policy "student reads live session of own class" on public.live_sessions
  for select to authenticated
  using (class_id = (select class_id from public.profiles where id = auth.uid()));

-- ---------- Кто есть кто в канале ----------
-- По имени канала 'live:<uuid>' возвращает роль текущего пользователя: 'teacher', 'student' или null.
-- Ученик входит только пока урок идёт и не старше 3 часов (как LIVE_MAX_AGE_MS в src/liveCore.js):
-- вне урока канал класса ему не нужен.
-- security definer — чтобы проверка не зависела от политик profiles/classes и не упиралась в них рекурсивно.
create or replace function public.live_role(p_topic text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_class uuid;
begin
  -- Разбираем имя сами: приведение чужой строки к uuid без проверки дало бы ошибку, а не отказ
  if p_topic is null or p_topic !~ '^live:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  v_class := substr(p_topic, 6)::uuid;
  if exists (select 1 from classes where id = v_class and teacher_id = auth.uid()) then
    return 'teacher';
  end if;
  if exists (
    select 1 from profiles p join live_sessions s on s.class_id = p.class_id
    where p.id = auth.uid() and p.role = 'student' and p.class_id = v_class
      and s.started_at > now() - interval '3 hours'
  ) then
    return 'student';
  end if;
  return null;
end;
$$;
revoke execute on function public.live_role(text) from public, anon;
grant execute on function public.live_role(text) to authenticated;

-- ---------- Политики Realtime ----------
-- Realtime проверяет их при входе в приватный канал (select — получать, insert — отправлять).
-- Политики касаются только каналов 'live:…': live_role() для остальных имён даёт null.
drop policy if exists "live: class members receive" on realtime.messages;
create policy "live: class members receive" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension in ('broadcast', 'presence')
    and public.live_role(realtime.topic()) is not null
  );

-- Ученик может только публиковать своё состояние (presence). Broadcast — подсказки,
-- начало и конец урока — разрешён одному учителю класса: подделать подсказку ученик не может.
drop policy if exists "live: students track, teacher broadcasts" on realtime.messages;
create policy "live: students track, teacher broadcasts" on realtime.messages
  for insert to authenticated
  with check (
    (realtime.messages.extension = 'presence' and public.live_role(realtime.topic()) is not null)
    or (realtime.messages.extension = 'broadcast' and public.live_role(realtime.topic()) = 'teacher')
  );

commit;
