-- Миграция 7: отзывы пользователей о сайте (форма «Обратная связь» в подвале).
-- Выполнить один раз в Supabase: SQL Editor → New query → вставить → Run.
--
-- Писать может любой посетитель, в том числе гость без аккаунта: иначе мы не услышим тех,
-- кто ещё не зарегистрировался. Читать через API не может никто — отзывы смотрим в панели Supabase
-- (Table Editor → feedback), там доступ у владельцев проекта.

create table public.feedback (
  id bigint generated always as identity primary key,
  -- Для гостя null. Значение ставит база, а политика не даёт подписаться чужим id.
  user_id uuid default auth.uid() references auth.users (id) on delete set null,
  kind text not null check (kind in ('idea', 'bug', 'other')),
  message text not null check (char_length(message) between 5 and 1000),
  screen text not null check (screen ~ '^[a-z]{1,20}$'),
  lang text not null check (lang in ('ru', 'kk')),
  created_at timestamptz not null default now()
);

create index feedback_time_idx on public.feedback (created_at);

alter table public.feedback enable row level security;

create policy "anyone sends feedback" on public.feedback
  for insert to anon, authenticated
  with check (user_id is not distinct from auth.uid());

-- Политик на чтение, изменение и удаление нет — эти действия через API запрещены.
revoke select, update, delete on public.feedback from anon, authenticated;

-- Форма открыта гостям, поэтому ограничение общее, а не на человека: ботом нельзя
-- залить таблицу тысячами строк. 30 отзывов в минуту живые люди не напишут.
create function public.feedback_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from feedback where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'rate limit';
  end if;
  if new.user_id is not null
     and (select count(*) from feedback where user_id = new.user_id and created_at > now() - interval '1 minute') >= 3 then
    raise exception 'rate limit';
  end if;
  return new;
end;
$$;
create trigger feedback_rate_limit before insert on public.feedback
  for each row execute function public.feedback_rate_limit();

-- Как в миграции 6: триггерную функцию нельзя вызвать напрямую через /rest/v1/rpc.
revoke execute on function public.feedback_rate_limit() from public, anon, authenticated;
