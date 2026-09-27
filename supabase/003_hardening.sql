-- Миграция 3: защита от подделки результатов и подбора кодов классов.
-- Выполнить один раз в Supabase: SQL Editor → New query → вставить → Run.
-- Существующие данные не меняются. Скрипт выполняется одной транзакцией: при любой ошибке
-- ничего не применится и его можно запустить заново.

begin;

-- ---------- Права по умолчанию ----------
-- Supabase выдаёт anon полный доступ к таблицам, и держит его только RLS. Убираем лишнее.
revoke all on public.classes, public.profiles, public.results, public.assignments from anon;
revoke truncate, references, trigger on public.classes, public.profiles, public.results, public.assignments from authenticated;
-- И для таблиц, которые появятся позже
alter default privileges in schema public revoke all on tables from anon;

-- ---------- Результаты ----------
-- Клиент не может задать время и владельца: completed_at = now(), user_id = auth.uid() по умолчанию.
-- Иначе можно «сдать в срок» задним числом и получить бонусы.
revoke insert on public.results from authenticated;
grant insert (lesson_id, hyp_ok, hyp_total, q_ok, q_total) on public.results to authenticated;

-- В работе не больше нескольких вопросов и гипотез; 20 — с запасом на новые работы.
alter table public.results
  add constraint results_bounds check (hyp_total <= 20 and q_total <= 20),
  add constraint results_lesson_fmt check (lesson_id ~ '^[a-z0-9_-]{1,40}$');

-- Работа занимает минуты — больше 5 сохранений в минуту бывает только при накрутке.
-- Заодно не даёт завалить журнал учителя тысячами строк.
create function public.results_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from results where user_id = new.user_id and completed_at > now() - interval '1 minute') >= 5 then
    raise exception 'rate limit';
  end if;
  return new;
end;
$$;
create index results_user_time_idx on public.results (user_id, completed_at);
create trigger results_rate_limit before insert on public.results
  for each row execute function public.results_rate_limit();

-- ---------- Смена кода класса ----------
-- Без неё убранный ученик сразу возвращается по тому же коду.
create function public.regenerate_class_code(p_class uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if not is_teacher_of(p_class) then
    raise exception 'not your class';
  end if;
  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from classes where code = v_code);
  end loop;
  update classes set code = v_code where id = p_class;
  return v_code;
end;
$$;
revoke execute on function public.regenerate_class_code(uuid) from public, anon;
grant execute on function public.regenerate_class_code(uuid) to authenticated;

-- ---------- Защита от подбора кода ----------
-- Кодов всего ~16 млн, поэтому ограничиваем неудачные попытки: 10 в час на ученика.
create table public.join_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now()
);
create index join_attempts_user_idx on public.join_attempts (user_id, at);
-- Таблицу пишет только join_class; политик нет — напрямую она недоступна.
alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from anon, authenticated;

create or replace function public.join_class(p_code text)
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
  delete from join_attempts where at < now() - interval '1 day';
  if (select count(*) from join_attempts where user_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    raise exception 'rate limit';
  end if;
  select * into v_class from classes where code = upper(trim(p_code));
  if not found then
    -- Не raise: исключение откатило бы и запись попытки. Пустой ответ клиент считает «класс не найден».
    insert into join_attempts (user_id) values (auth.uid());
    return;
  end if;
  update profiles set class_id = v_class.id where id = auth.uid();
  return query select v_class.name;
end;
$$;

commit;
