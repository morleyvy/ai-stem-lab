-- Схема базы AI STEM Lab. Выполнить один раз в Supabase: SQL Editor → New query → вставить → Run.
--
-- Модель доступа:
--   * каждый видит свой профиль и свои результаты;
--   * учитель видит профили (без телефона) и результаты только тех учеников,
--     которые вступили в его класс по коду. Регистрацию «учителем» подделать можно,
--     но без кода класса чужие ученики ему не видны;
--   * телефон хранится только как логин в auth.users и в таблицы не попадает.

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 10),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  teacher_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('student', 'teacher')),
  full_name text not null check (char_length(full_name) between 2 and 80),
  grade text not null check (char_length(grade) between 1 and 10),
  class_id uuid references public.classes (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.results (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id text not null check (char_length(lesson_id) between 1 and 40),
  hyp_ok int not null check (hyp_ok >= 0),
  hyp_total int not null check (hyp_total >= 0 and hyp_ok <= hyp_total),
  q_ok int not null check (q_ok >= 0),
  q_total int not null check (q_total >= 0 and q_ok <= q_total),
  completed_at timestamptz not null default now()
);

create index results_user_idx on public.results (user_id);
create index profiles_class_idx on public.profiles (class_id);

alter table public.classes enable row level security;
alter table public.profiles enable row level security;
alter table public.results enable row level security;

-- security definer: проверка читает classes в обход RLS, иначе политики зациклятся друг на друга.
create function public.is_teacher_of(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from classes where id = p_class and teacher_id = auth.uid());
$$;

-- ---------- profiles ----------
create policy "read own profile" on public.profiles
  for select using (id = auth.uid());
create policy "teacher reads students of own class" on public.profiles
  for select using (class_id is not null and public.is_teacher_of(class_id));
-- Профиль создаётся сразу после регистрации; класс привязывается только через join_class().
create policy "create own profile" on public.profiles
  for insert with check (id = auth.uid() and class_id is null);
-- Политики update нет: профиль нельзя изменить напрямую (в т.ч. роль и класс).

-- ---------- classes ----------
create policy "teacher reads own classes" on public.classes
  for select using (teacher_id = auth.uid());
create policy "student reads joined class" on public.classes
  for select using (id = (select class_id from public.profiles where id = auth.uid()));
-- Прямой insert запрещён: класс создаётся только через create_teacher_class().

-- ---------- results ----------
create policy "save own results" on public.results
  for insert with check (user_id = auth.uid());
create policy "read own results" on public.results
  for select using (user_id = auth.uid());
create policy "teacher reads results of own class" on public.results
  for select using (exists (
    select 1 from public.profiles p
    where p.id = results.user_id and p.class_id is not null and public.is_teacher_of(p.class_id)
  ));

-- ---------- RPC ----------

-- Учитель создаёт класс; код генерируется на сервере, чтобы его нельзя было подобрать заранее.
create function public.create_teacher_class(p_name text)
returns public.classes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class classes;
  v_code text;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'teacher') then
    raise exception 'only teachers can create classes';
  end if;
  loop
    -- gen_random_uuid() встроен в Postgres (pgcrypto в Supabase лежит в другой схеме).
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from classes where code = v_code);
  end loop;
  insert into classes (name, code, teacher_id) values (trim(p_name), v_code, auth.uid())
  returning * into v_class;
  return v_class;
end;
$$;

-- Ученик вступает в класс по коду от учителя.
create function public.join_class(p_code text)
returns table (name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class classes;
begin
  if not exists (select 1 from profiles where id = auth.uid() and role = 'student') then
    raise exception 'only students can join classes';
  end if;
  select * into v_class from classes where code = upper(trim(p_code));
  if not found then
    raise exception 'class not found';
  end if;
  update profiles set class_id = v_class.id where id = auth.uid();
  return query select v_class.name;
end;
$$;

revoke execute on function public.create_teacher_class(text) from public, anon;
revoke execute on function public.join_class(text) from public, anon;
revoke execute on function public.is_teacher_of(uuid) from public, anon;
grant execute on function public.create_teacher_class(text) to authenticated;
grant execute on function public.join_class(text) to authenticated;
grant execute on function public.is_teacher_of(uuid) to authenticated;
