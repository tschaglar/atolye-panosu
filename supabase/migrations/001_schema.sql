-- Atölye Panosu: tablolar, güvenlik kuralları, bildirim kuyruğu ve hatırlatıcılar.
-- Saat dilimi: Europe/Istanbul. Bildirimler outbox tablosuna yazılır, "tick" fonksiyonu gönderir.

create extension if not exists pgcrypto;

-- ---------- tablolar ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  username text not null unique check (username ~ '^[a-z0-9._-]{3,24}$'),
  role text not null default 'personel' check (role in ('yonetici','personel')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.firms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  contact text not null default '',
  phone text not null default '',
  note text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists firms_name_uq on public.firms (lower(name));

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  assignee uuid not null references public.profiles(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  due date not null default ((now() at time zone 'Europe/Istanbul')::date),
  at_time text check (at_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  repeat text not null default 'none' check (repeat in ('none','daily','weekdays')),
  firm uuid references public.firms(id) on delete set null,
  urgent boolean not null default false,
  note text not null default '',
  status text not null default 'open' check (status in ('open','done')),
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null,
  done jsonb not null default '{}'::jsonb,
  imported boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists tasks_assignee_idx on public.tasks (assignee);
create index if not exists tasks_status_idx on public.tasks (status, done_at);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  firm uuid not null references public.firms(id) on delete restrict,
  type text not null default '',
  plate text not null default '',
  title text not null check (char_length(title) between 1 and 140),
  w numeric check (w is null or w >= 0),
  h numeric check (h is null or h >= 0),
  qty numeric not null default 1 check (qty > 0),
  work_date date not null default ((now() at time zone 'Europe/Istanbul')::date),
  note text not null default '',
  entered_by uuid references public.profiles(id) on delete set null,
  status text not null default 'bekliyor' check (status in ('bekliyor','fiyatlandi')),
  price numeric check (price is null or price >= 0),
  unit numeric check (unit is null or unit >= 0),
  vat text not null default 'haric' check (vat in ('haric','dahil')),
  price_note text not null default '',
  priced_by uuid references public.profiles(id) on delete set null,
  priced_at timestamptz,
  imported boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists jobs_firm_idx on public.jobs (firm, created_at desc);
create index if not exists jobs_status_idx on public.jobs (status);
create index if not exists jobs_created_idx on public.jobs (created_at desc);

create table if not exists public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_config (
  key text primary key,
  value text not null
);

create table if not exists public.server_config (
  key text primary key,
  value text not null
);

create table if not exists public.push_subs (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('fcm','web')),
  token text not null unique,
  keys jsonb,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subs (user_id);

create table if not exists public.outbox (
  id bigserial primary key,
  recipients uuid[] not null,
  title text not null,
  body text not null default '',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.reminder_log (
  task_id uuid not null references public.tasks(id) on delete cascade,
  day date not null,
  kind text not null,
  primary key (task_id, day, kind)
);

create table if not exists public.daily_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day date not null,
  kind text not null,
  primary key (user_id, day, kind)
);

-- ---------- yardımcılar ----------
create or replace function public.me_active() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active)
$$;

create or replace function public.me_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'yonetici')
$$;

create or replace function public.tr_now() returns timestamp
language sql stable as $$ select (now() at time zone 'Europe/Istanbul') $$;

create or replace function public.fmt_tl(n numeric) returns text
language sql immutable as $$
  select replace(replace(replace(to_char(round(coalesce(n,0),2), 'FM999,999,999,990.00'), ',', '#'), '.', ','), '#', '.') || ' TL'
$$;

create or replace function public.pname(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select name from public.profiles where id = uid), 'Biri')
$$;

create or replace function public.day_label(d date, today date) returns text
language sql immutable as $$
  select case when d = today then 'bugün' when d = today + 1 then 'yarın' else to_char(d, 'DD.MM') end
$$;

-- ---------- güvenlik kuralları (RLS) ----------
alter table public.profiles enable row level security;
alter table public.firms enable row level security;
alter table public.tasks enable row level security;
alter table public.jobs enable row level security;
alter table public.settings enable row level security;
alter table public.app_config enable row level security;
alter table public.server_config enable row level security;
alter table public.push_subs enable row level security;
alter table public.outbox enable row level security;
alter table public.reminder_log enable row level security;
alter table public.daily_log enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (public.me_active());

drop policy if exists firms_read on public.firms;
drop policy if exists firms_insert on public.firms;
drop policy if exists firms_update on public.firms;
drop policy if exists firms_delete on public.firms;
create policy firms_read on public.firms for select to authenticated using (public.me_active());
create policy firms_insert on public.firms for insert to authenticated with check (public.me_active());
create policy firms_update on public.firms for update to authenticated using (public.me_active()) with check (public.me_active());
create policy firms_delete on public.firms for delete to authenticated using (public.me_manager());

drop policy if exists tasks_read on public.tasks;
drop policy if exists tasks_insert on public.tasks;
drop policy if exists tasks_update on public.tasks;
drop policy if exists tasks_delete on public.tasks;
create policy tasks_read on public.tasks for select to authenticated using (public.me_active());
create policy tasks_insert on public.tasks for insert to authenticated with check (public.me_active());
create policy tasks_update on public.tasks for update to authenticated
  using (public.me_active() and (assignee = auth.uid() or created_by = auth.uid() or public.me_manager()))
  with check (public.me_active());
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.me_active() and (created_by = auth.uid() or public.me_manager()));

drop policy if exists jobs_read on public.jobs;
drop policy if exists jobs_insert on public.jobs;
drop policy if exists jobs_update on public.jobs;
drop policy if exists jobs_delete on public.jobs;
create policy jobs_read on public.jobs for select to authenticated using (public.me_active());
create policy jobs_insert on public.jobs for insert to authenticated with check (public.me_active());
create policy jobs_update on public.jobs for update to authenticated
  using (public.me_manager() or (public.me_active() and entered_by = auth.uid() and status = 'bekliyor'))
  with check (public.me_active());
create policy jobs_delete on public.jobs for delete to authenticated
  using (public.me_manager() or (public.me_active() and entered_by = auth.uid() and status = 'bekliyor'));

drop policy if exists settings_read on public.settings;
drop policy if exists settings_write on public.settings;
create policy settings_read on public.settings for select to authenticated using (public.me_active());
create policy settings_write on public.settings for all to authenticated using (public.me_manager()) with check (public.me_manager());

drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config for select to authenticated using (public.me_active());

drop policy if exists push_subs_own on public.push_subs;
create policy push_subs_own on public.push_subs for select to authenticated using (user_id = auth.uid());
drop policy if exists push_subs_own_delete on public.push_subs;
create policy push_subs_own_delete on public.push_subs for delete to authenticated using (user_id = auth.uid());

-- ---------- veri bütünlüğü tetikleyicileri ----------
create or replace function public.tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if uid is not null and not (new.imported and public.me_manager()) then
      new.created_by := uid;
      new.created_at := now();
      new.imported := false;
    end if;
    if new.status = 'done' and new.done_at is null then new.done_at := now(); end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.imported := old.imported;
    if new.status = 'done' and old.status <> 'done' then
      new.done_at := now();
      if uid is not null then new.done_by := uid; end if;
    elsif new.status = 'open' then
      new.done_at := null;
      new.done_by := null;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists tasks_guard on public.tasks;
create trigger tasks_guard before insert or update on public.tasks
  for each row execute function public.tasks_guard();

create or replace function public.jobs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); mgr boolean := public.me_manager();
begin
  if tg_op = 'INSERT' then
    if uid is not null then
      if not mgr then
        new.entered_by := uid;
        new.status := 'bekliyor';
        new.price := null; new.unit := null; new.vat := 'haric'; new.price_note := '';
        new.priced_by := null; new.priced_at := null;
        new.imported := false;
        new.created_at := now();
      elsif not new.imported then
        new.entered_by := uid;
        new.created_at := now();
      end if;
    end if;
    if new.status = 'fiyatlandi' and new.priced_at is null then
      new.priced_at := now();
      new.priced_by := coalesce(new.priced_by, uid);
    end if;
  else
    new.entered_by := old.entered_by;
    new.created_at := old.created_at;
    new.imported := old.imported;
    if uid is not null and not mgr then
      if old.status = 'fiyatlandi' then
        raise exception 'Fiyatlandırılmış işi yalnızca yönetici değiştirebilir' using errcode = '42501';
      end if;
      if (new.status, new.price, new.unit, new.vat, new.price_note, new.priced_by, new.priced_at)
         is distinct from (old.status, old.price, old.unit, old.vat, old.price_note, old.priced_by, old.priced_at) then
        raise exception 'Fiyatı yalnızca yönetici girebilir' using errcode = '42501';
      end if;
    elsif uid is not null and mgr then
      if new.status = 'fiyatlandi' and (old.status <> 'fiyatlandi'
          or (new.price, new.unit, new.vat) is distinct from (old.price, old.unit, old.vat)) then
        new.priced_by := uid;
        new.priced_at := now();
      elsif new.status = 'bekliyor' then
        new.price := null; new.unit := null; new.priced_by := null; new.priced_at := null;
      end if;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists jobs_guard on public.jobs;
create trigger jobs_guard before insert or update on public.jobs
  for each row execute function public.jobs_guard();

-- ---------- bildirim kuyruğu ----------
-- 002_platform.sql bu fonksiyonu sunucuyu hemen uyandıran sürümüyle değiştirir.
create or replace function public.kick_tick() returns void language plpgsql as $$ begin return; end $$;

create or replace function public.outbox_kick() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.in_cron', true), '') <> '1' then
    perform public.kick_tick();
  end if;
  return null;
end $$;

drop trigger if exists outbox_kick on public.outbox;
create trigger outbox_kick after insert on public.outbox
  for each statement execute function public.outbox_kick();

create or replace function public.notify(recips uuid[], t text, b text, d jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r uuid[];
begin
  select array_agg(distinct x) into r
  from unnest(recips) x join public.profiles p on p.id = x and p.active
  where x is not null;
  if r is null or array_length(r, 1) is null then return; end if;
  insert into public.outbox (recipients, title, body, data) values (r, t, coalesce(b, ''), coalesce(d, '{}'::jsonb));
end $$;

create or replace function public.task_when(t public.tasks, today date) returns text
language sql stable as $$
  select concat_ws(' · ',
    case t.repeat when 'daily' then 'Her gün' when 'weekdays' then 'Hafta içi' else public.day_label(t.due, today) end,
    t.at_time)
$$;

create or replace function public.tasks_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare today date := public.tr_now()::date; actor uuid; who uuid; dk text := today::text;
begin
  if new.imported then return null; end if;
  if tg_op = 'INSERT' then
    if new.created_by is not null and new.assignee <> new.created_by then
      perform public.notify(array[new.assignee],
        public.pname(new.created_by) || ' sana görev verdi',
        (case when new.urgent then 'ACİL · ' else '' end) || new.title || ' · ' || public.task_when(new, today),
        jsonb_build_object('route', 'task', 'id', new.id));
    end if;
    return null;
  end if;

  actor := coalesce(auth.uid(), new.created_by);
  if new.assignee <> old.assignee and new.assignee <> actor then
    perform public.notify(array[new.assignee],
      public.pname(actor) || ' sana görev verdi',
      (case when new.urgent then 'ACİL · ' else '' end) || new.title || ' · ' || public.task_when(new, today),
      jsonb_build_object('route', 'task', 'id', new.id));
  end if;

  if new.repeat = 'none' then
    if old.status = 'open' and new.status = 'done' and new.created_by is not null
       and new.created_by <> coalesce(new.done_by, new.assignee) then
      perform public.notify(array[new.created_by],
        public.pname(coalesce(new.done_by, new.assignee)) || ' görevi tamamladı',
        new.title, jsonb_build_object('route', 'task', 'id', new.id));
    end if;
  else
    if jsonb_typeof(new.done -> dk) = 'object' and coalesce(jsonb_typeof(old.done -> dk), 'null') <> 'object' then
      who := nullif(new.done -> dk ->> 'by', '')::uuid;
      if new.created_by is not null and new.created_by <> coalesce(who, new.assignee) then
        perform public.notify(array[new.created_by],
          public.pname(coalesce(who, new.assignee)) || ' görevi tamamladı',
          new.title, jsonb_build_object('route', 'task', 'id', new.id));
      end if;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists tasks_notify on public.tasks;
create trigger tasks_notify after insert or update on public.tasks
  for each row execute function public.tasks_notify();

create or replace function public.job_detail(j public.jobs) returns text
language sql stable as $$
  select concat_ws(' · ', nullif(j.plate, ''),
    case when j.w is not null and j.h is not null and j.w > 0 and j.h > 0
      then replace(round(j.w * j.h * j.qty / 10000, 2)::text, '.', ',') || ' m²' end)
$$;

create or replace function public.jobs_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare fname text; mgrs uuid[]; det text;
begin
  if new.imported then return null; end if;
  select name into fname from public.firms where id = new.firm;
  if tg_op = 'INSERT' then
    select array_agg(id) into mgrs from public.profiles
      where active and role = 'yonetici' and id is distinct from new.entered_by;
    if new.status = 'bekliyor' and mgrs is not null then
      det := public.job_detail(new);
      perform public.notify(mgrs,
        'Fiyat talebi · ' || coalesce(fname, 'Firma'),
        public.pname(new.entered_by) || ': ' || new.title || case when det <> '' then ' · ' || det else '' end,
        jsonb_build_object('route', 'job', 'id', new.id));
    end if;
  elsif old.status <> 'fiyatlandi' and new.status = 'fiyatlandi'
        and new.entered_by is not null and new.entered_by is distinct from new.priced_by then
    perform public.notify(array[new.entered_by],
      'İşin fiyatlandırıldı · ' || coalesce(fname, 'Firma'),
      new.title || ' · ' || public.fmt_tl(new.price) || case when new.vat = 'dahil' then ' (KDV dahil)' else ' + KDV' end,
      jsonb_build_object('route', 'job', 'id', new.id));
  end if;
  return null;
end $$;

drop trigger if exists jobs_notify on public.jobs;
create trigger jobs_notify after insert or update on public.jobs
  for each row execute function public.jobs_notify();

-- ---------- hatırlatıcılar (dakikada bir) ----------
create or replace function public.task_applies(t public.tasks, d date) returns boolean
language sql immutable as $$
  select case t.repeat
    when 'none' then t.status = 'open' and t.due = d
    when 'daily' then t.due <= d
    when 'weekdays' then t.due <= d and extract(isodow from d) between 1 and 5
  end
$$;

create or replace function public.task_done_on(t public.tasks, d date) returns boolean
language sql immutable as $$
  select case when t.repeat = 'none' then t.status = 'done'
              else coalesce(jsonb_typeof(t.done -> d::text) = 'object', false) end
$$;

create or replace function public.collect_reminders(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare
  tr timestamp := p_now at time zone 'Europe/Istanbul';
  d date := (p_now at time zone 'Europe/Istanbul')::date;
  r record; u record; m timestamp; cl timestamp; n int := 0; c int;
  late_list text; pend int; team text;
begin
  -- görev saatine bağlı uyarılar
  for r in
    select t.* from public.tasks t join public.profiles p on p.id = t.assignee and p.active
    where t.at_time is not null and public.task_applies(t, d) and not public.task_done_on(t, d)
  loop
    m := d + r.at_time::time;
    cl := r.created_at at time zone 'Europe/Istanbul';
    if tr >= m - interval '15 minutes' and tr < m and cl <= m - interval '13 minutes' then
      insert into public.reminder_log values (r.id, d, 'once') on conflict do nothing;
      if found then
        perform public.notify(array[r.assignee], '15 dakika sonra: ' || r.title,
          'Saat ' || r.at_time || (case when r.urgent then ' · ACİL' else '' end),
          jsonb_build_object('route', 'task', 'id', r.id, 'rem', 1)); n := n + 1;
      end if;
    elsif tr >= m and tr < m + interval '60 minutes' and cl <= m + interval '2 minutes' then
      insert into public.reminder_log values (r.id, d, 'saat') on conflict do nothing;
      if found then
        perform public.notify(array[r.assignee], 'Görevin saati geldi', r.title || ' · ' || r.at_time,
          jsonb_build_object('route', 'task', 'id', r.id, 'rem', 1)); n := n + 1;
      end if;
    elsif tr >= m + interval '60 minutes' and cl <= m + interval '62 minutes' then
      insert into public.reminder_log values (r.id, d, 'gecikti') on conflict do nothing;
      if found then
        perform public.notify(array[r.assignee], 'Görev hâlâ yapılmadı',
          r.title || ' · saat ' || r.at_time || ' idi', jsonb_build_object('route', 'task', 'id', r.id, 'rem', 1));
        if r.created_by is not null and r.created_by <> r.assignee then
          perform public.notify(array[r.created_by], public.pname(r.assignee) || ' görevi henüz yapmadı',
            r.title || ' · saat ' || r.at_time || ' idi', jsonb_build_object('route', 'task', 'id', r.id, 'rem', 1));
        end if;
        n := n + 1;
      end if;
    end if;
  end loop;

  -- sabah özeti 08:30
  if tr::time >= time '08:30' and tr::time < time '11:00' then
    for u in
      select p.id,
        count(t.id) filter (where public.task_applies(t, d) and not public.task_done_on(t, d)) as today_n,
        count(t.id) filter (where t.repeat = 'none' and t.status = 'open' and t.due < d) as late_n
      from public.profiles p left join public.tasks t on t.assignee = p.id
      where p.active group by p.id
    loop
      if u.today_n + u.late_n > 0 then
        insert into public.daily_log values (u.id, d, 'sabah') on conflict do nothing;
        if found then
          perform public.notify(array[u.id], 'Günaydın',
            'Bugün ' || (u.today_n + u.late_n) || ' görevin var' ||
            case when u.late_n > 0 then ', ' || u.late_n || ' tanesi gecikmiş' else '' end || '.',
            jsonb_build_object('route', 'today', 'rem', 1)); n := n + 1;
        end if;
      end if;
    end loop;
  end if;

  -- akşam özeti 17:30
  if tr::time >= time '17:30' and tr::time < time '21:00' then
    for u in select p.id, p.role from public.profiles p where p.active loop
      select count(*), string_agg(x.title, ', ' order by x.title) filter (where x.rn <= 3)
        into c, late_list
      from (select t.title, row_number() over (order by t.urgent desc, t.created_at) rn
            from public.tasks t
            where t.assignee = u.id and (
              (public.task_applies(t, d) and not public.task_done_on(t, d))
              or (t.repeat = 'none' and t.status = 'open' and t.due < d))) x;
      if c > 0 then
        insert into public.daily_log values (u.id, d, 'aksam') on conflict do nothing;
        if found then
          perform public.notify(array[u.id], 'Yapılmayan ' || c || ' görevin var',
            late_list || case when c > 3 then ' ve ' || (c - 3) || ' görev daha' else '' end,
            jsonb_build_object('route', 'today', 'rem', 1)); n := n + 1;
        end if;
      end if;
      if u.role = 'yonetici' then
        select count(*) into pend from public.jobs where status = 'bekliyor';
        select string_agg(s.name || ' ' || s.k, ', ' order by s.k desc, s.name) into team from (
          select p2.name, count(*) k from public.tasks t join public.profiles p2 on p2.id = t.assignee and p2.active
          where t.assignee <> u.id and (
            (public.task_applies(t, d) and not public.task_done_on(t, d))
            or (t.repeat = 'none' and t.status = 'open' and t.due < d))
          group by p2.name) s;
        if pend > 0 or team is not null then
          insert into public.daily_log values (u.id, d, 'yonetici') on conflict do nothing;
          if found then
            perform public.notify(array[u.id], 'Gün sonu durumu',
              concat_ws(' · ',
                case when pend > 0 then pend || ' iş fiyat bekliyor' end,
                case when team is not null then 'Yapılmayan görevler: ' || team end),
              jsonb_build_object('route', case when pend > 0 then 'inbox' else 'team' end, 'rem', 1)); n := n + 1;
          end if;
        end if;
      end if;
    end loop;
  end if;

  if extract(minute from tr) = 7 and extract(hour from tr) = 3 then
    delete from public.reminder_log where day < d - 30;
    delete from public.daily_log where day < d - 30;
    delete from public.outbox where created_at < now() - interval '2 days';
  end if;
  return n;
end $$;

create or replace function public.app_cron() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.in_cron', '1', true);
  perform public.collect_reminders(now());
  perform set_config('app.in_cron', '', true);
  if exists (select 1 from public.outbox) then perform public.kick_tick(); end if;
end $$;

-- ---------- tick fonksiyonunun kullandığı uçlar (yalnızca sunucu) ----------
create or replace function public.claim_outbox(p_limit int default 200)
returns table (outbox_id bigint, title text, body text, data jsonb, kind text, token text, keys jsonb)
language sql security definer set search_path = public as $$
  with claimed as (
    delete from public.outbox where id in (
      select id from public.outbox order by id limit p_limit for update skip locked)
    returning *)
  select c.id, c.title, c.body, c.data, s.kind, s.token, s.keys
  from claimed c join public.push_subs s on s.user_id = any (c.recipients)
$$;

create or replace function public.drop_push_tokens(p_tokens text[]) returns void
language sql security definer set search_path = public as $$
  delete from public.push_subs where token = any (p_tokens)
$$;

create or replace function public.register_push(p_kind text, p_token text, p_keys jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.me_active() then raise exception 'Hesap etkin değil' using errcode = '42501'; end if;
  if p_kind not in ('fcm','web') or coalesce(p_token, '') = '' then raise exception 'Geçersiz kayıt'; end if;
  delete from public.push_subs where token = p_token;
  insert into public.push_subs (user_id, kind, token, keys) values (auth.uid(), p_kind, p_token, p_keys);
end $$;

create or replace function public.unregister_push(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from public.push_subs where token = p_token and user_id = auth.uid()
$$;

-- ---------- yetkiler ----------
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.firms, public.tasks, public.jobs, public.settings to authenticated;
grant select on public.app_config, public.push_subs to authenticated;
grant delete on public.push_subs to authenticated;
revoke all on public.outbox, public.reminder_log, public.daily_log, public.server_config from anon, authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
revoke all on public.firms, public.tasks, public.jobs, public.settings, public.profiles, public.app_config, public.push_subs from anon;

revoke execute on function public.claim_outbox(int) from public, anon, authenticated;
revoke execute on function public.drop_push_tokens(text[]) from public, anon, authenticated;
revoke execute on function public.collect_reminders(timestamptz) from public, anon, authenticated;
revoke execute on function public.app_cron() from public, anon, authenticated;
revoke execute on function public.notify(uuid[], text, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_outbox(int) to service_role;
grant execute on function public.drop_push_tokens(text[]) to service_role;
grant execute on function public.register_push(text, text, jsonb) to authenticated;
grant execute on function public.unregister_push(text) to authenticated;
