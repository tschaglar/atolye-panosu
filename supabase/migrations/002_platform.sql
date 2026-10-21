-- Supabase'e özgü parçalar: zamanlayıcı, sunucuyu uyandırma, canlı güncelleme.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.kick_tick() returns void
language plpgsql security definer set search_path = public as $$
declare u text; s text;
begin
  select decrypted_secret into u from vault.decrypted_secrets where name = 'atolye_project_url';
  select decrypted_secret into s from vault.decrypted_secrets where name = 'atolye_tick_secret';
  if u is null or s is null then return; end if;
  perform net.http_post(
    url := u || '/functions/v1/tick',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-tick-secret', s),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000);
end $$;
revoke execute on function public.kick_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'atolye-dakika') then
    perform cron.unschedule('atolye-dakika');
  end if;
  perform cron.schedule('atolye-dakika', '* * * * *', 'select public.app_cron()');
end $$;

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['profiles','firms','tasks','jobs','settings'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
