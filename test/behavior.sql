\set ON_ERROR_STOP 0
-- kullanıcılar
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','m@x'),('00000000-0000-0000-0000-00000000000b','a@x'),('00000000-0000-0000-0000-00000000000c','b@x'),('00000000-0000-0000-0000-00000000000d','x@x');
insert into public.profiles (id,name,username,role) values
 ('00000000-0000-0000-0000-00000000000a','Çağlar','caglar','yonetici'),
 ('00000000-0000-0000-0000-00000000000b','Adem','adem','personel'),
 ('00000000-0000-0000-0000-00000000000c','Sefa','sefa','personel');
insert into public.profiles (id,name,username,role,active) values ('00000000-0000-0000-0000-00000000000d','Eski','eski','personel',false);

create or replace function pg_temp.as_user(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false) $$;

\echo '== 1. personel firma + iş girer (fiyat göndermeye çalışır)'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into public.firms (id,name) values ('10000000-0000-0000-0000-000000000001','Akdeniz Yapı');
insert into public.jobs (id,firm,type,plate,title,w,h,qty,status,price,entered_by)
  values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Araç','31 ABC 123','Kapı logosu',120,30,2,'fiyatlandi',999,'00000000-0000-0000-0000-00000000000a');
select status, price, entered_by = '00000000-0000-0000-0000-00000000000b' as entered_by_ok from public.jobs;
reset role;
select recipients, title, body from public.outbox order by id;

\echo '== 2. personel fiyat girmeye çalışır (hata beklenir)'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.jobs set price = 5 where id = '20000000-0000-0000-0000-000000000001';
update public.jobs set note = 'gece montajı' where id = '20000000-0000-0000-0000-000000000001';
select note, price from public.jobs;

\echo '== 3. yönetici fiyatlandırır -> girene bildirim'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.jobs set status='fiyatlandi', price=4200.5, unit=1250, vat='haric' where id = '20000000-0000-0000-0000-000000000001';
select status, price, priced_by = '00000000-0000-0000-0000-00000000000a' as priced_by_ok, priced_at is not null as priced_at_ok from public.jobs;
reset role;
select recipients, title, body from public.outbox order by id desc limit 1;

\echo '== 4. personel fiyatlanmış işi değiştiremez/silemez'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.jobs set note = 'x' where id = '20000000-0000-0000-0000-000000000001';
delete from public.jobs where id = '20000000-0000-0000-0000-000000000001';
select count(*) as jobs_still from public.jobs;

\echo '== 5. pasif kullanıcı hiçbir şey göremez'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select count(*) as firms_seen_by_inactive from public.firms;
insert into public.firms (name) values ('Hack');

\echo '== 6. yönetici Adem''e görev verir -> Adem''e bildirim; Adem bitirir -> yöneticiye bildirim'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.tasks (id,title,assignee,at_time,created_by) values ('30000000-0000-0000-0000-000000000001','İskeleyi hazırla','00000000-0000-0000-0000-00000000000b','09:00','00000000-0000-0000-0000-00000000000c');
select created_by = '00000000-0000-0000-0000-00000000000a' as created_by_forced from public.tasks;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
update public.tasks set status = 'done' where id = '30000000-0000-0000-0000-000000000001';
select status, done_by = '00000000-0000-0000-0000-00000000000b' as done_by_ok, done_at is not null as done_at_ok from public.tasks;
reset role;
select recipients, title, body from public.outbox order by id desc limit 2;

\echo '== 7. Sefa, Adem''in görevini düzenleyemez/silemez'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
update public.tasks set title = 'x' where id = '30000000-0000-0000-0000-000000000001';
delete from public.tasks where id = '30000000-0000-0000-0000-000000000001';
select title from public.tasks;

\echo '== 8. tekrar eden görev: bugün yapıldı işareti -> verene bildirim'
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.tasks (id,title,assignee,repeat,at_time,due) values ('30000000-0000-0000-0000-000000000002','Atölyeyi kilitle','00000000-0000-0000-0000-00000000000c','daily','18:00', current_date - 3);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
update public.tasks set done = jsonb_build_object((now() at time zone 'Europe/Istanbul')::date::text, jsonb_build_object('by','00000000-0000-0000-0000-00000000000c','at',1)) where id = '30000000-0000-0000-0000-000000000002';
reset role;
select recipients, title, body from public.outbox order by id desc limit 1;

\echo '== 9. push kaydı: başka kullanıcının tokenı devralınır, outbox claim token döndürür'
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.register_push('fcm','tok-1',null);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.register_push('fcm','tok-1',null);
select count(*) as my_tokens from public.push_subs;
select public.claim_outbox(10);
reset role;
select user_id = '00000000-0000-0000-0000-00000000000c' as moved_to_sefa from public.push_subs;
set role service_role;
select title, token from public.claim_outbox(100) order by outbox_id;
reset role;
select count(*) as outbox_left from public.outbox;

\echo '== 10. anon hiçbir şey okuyamaz'
set role anon;
select count(*) from public.jobs;
reset role;
