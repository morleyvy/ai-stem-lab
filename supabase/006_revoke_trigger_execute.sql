-- Миграция 6: закрыть прямой вызов триггерной функции через /rest/v1/rpc.
-- Триггер срабатывает независимо от права EXECUTE, так что на работу он не влияет.
-- Выполнить один раз в Supabase: SQL Editor → New query → вставить → Run. Можно повторять.

revoke execute on function public.results_rate_limit() from public, anon, authenticated;
