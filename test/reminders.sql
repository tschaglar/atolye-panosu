\set ON_ERROR_STOP 1
delete from public.outbox; delete from public.reminder_log; delete from public.daily_log; delete from public.tasks;
-- test günü: 2026-10-21 (Çarşamba). Görevler bir gün önce oluşturulmuş gibi.
insert into public.tasks (id,title,assignee,created_by,due,at_time,repeat,created_at) values
 ('40000000-0000-0000-0000-000000000001','Vinç randevusu','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a','2026-10-21','10:00','none','2026-10-20 12:00+03'),
 ('40000000-0000-0000-0000-000000000002','Kompresörü kapat','00000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-00000000000a','2026-10-01','10:00','weekdays','2026-10-01 12:00+03'),
 ('40000000-0000-0000-0000-000000000003','Eski fatura','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a','2026-10-18',null,'none','2026-10-18 12:00+03'),
 ('40000000-0000-0000-0000-000000000004','Geç eklenen','00000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-00000000000a','2026-10-21','10:00','none','2026-10-21 10:30+03');
insert into public.jobs (firm,title,entered_by) values ('10000000-0000-0000-0000-000000000001','Bekleyen iş','00000000-0000-0000-0000-00000000000b');
delete from public.outbox;
select t, public.collect_reminders(t::timestamptz) n from unnest(array[
 '2026-10-21 08:00+03','2026-10-21 08:31+03','2026-10-21 08:32+03','2026-10-21 09:46+03','2026-10-21 09:50+03',
 '2026-10-21 10:00+03','2026-10-21 10:01+03','2026-10-21 10:59+03','2026-10-21 11:00+03','2026-10-21 11:30+03',
 '2026-10-21 17:30+03','2026-10-21 17:31+03']) t;
select o.id, (select string_agg(p.name, ',') from public.profiles p where p.id = any(o.recipients)) kime, o.title, o.body, o.data from public.outbox o order by o.id;
\echo '-- Sefa haftaiçi görevi bugün yaptıysa akşam ona yazılmamalı; Pazar günü haftaiçi görevi yok'
delete from public.outbox; delete from public.daily_log;
update public.tasks set done = '{"2026-10-25":{"by":"x","at":1}}' where id='40000000-0000-0000-0000-000000000002';
select public.collect_reminders('2026-10-25 10:05+03') pazar_n;
select title, body from public.outbox;
