-- Миграция 2: задания от учителя, управление классами.
-- Выполнить один раз в Supabase: SQL Editor → New query → вставить → Run.
-- Только добавляет новое — существующие данные не меняются.

-- ---------- Задания ----------
-- Учитель назначает классу лабораторную работу со сроком. Выполненность считается по таблице results.
create table public.assignments (
  id bigint generated always as identity primary key,
  class_id uuid not null references public.classes (id) on delete cascade,
  lesson_id text not null check (char_length(lesson_id) between 1 and 40),
  due_date date,
  created_at timestamptz not null default now(),
  unique (class_id, lesson_id)
);
create index assignments_class_idx on public.assignments (class_id);
alter table public.assignments enable row level security;

create policy "teacher manages assignments of own class" on public.assignments
  for all using (public.is_teacher_of(class_id)) with check (public.is_teacher_of(class_id));
create policy "student reads assignments of own class" on public.assignments
  for select using (class_id = (select class_id from public.profiles where id = auth.uid()));

-- ---------- Классы ----------
-- Учитель может переименовать или удалить свой класс (ученики при удалении просто «выпадают» из класса).
create policy "teacher updates own class" on public.classes
  for update using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy "teacher deletes own class" on public.classes
  for delete using (teacher_id = auth.uid());
-- Менять можно только название: код класса и владелец остаются неизменными
revoke update on public.classes from authenticated;
grant update (name) on public.classes to authenticated;

-- Учитель убирает ученика из своего класса
create function public.remove_student(p_student uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set class_id = null
  where id = p_student and role = 'student' and class_id is not null and is_teacher_of(class_id);
  if not found then
    raise exception 'student not in your class';
  end if;
end;
$$;

-- Ученик выходит из класса сам
create function public.leave_class()
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set class_id = null where id = auth.uid() and role = 'student';
$$;

revoke execute on function public.remove_student(uuid) from public, anon;
revoke execute on function public.leave_class() from public, anon;
grant execute on function public.remove_student(uuid) to authenticated;
grant execute on function public.leave_class() to authenticated;
