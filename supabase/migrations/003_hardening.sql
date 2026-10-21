-- Yardımcı fonksiyonları dışarıdan (giriş yapmamış) çağrılamaz hale getir.
revoke execute on function public.pname(uuid) from public, anon, authenticated;
revoke execute on function public.fmt_tl(numeric) from public, anon;
revoke execute on function public.day_label(date, date) from public, anon;
revoke execute on function public.task_when(public.tasks, date) from public, anon, authenticated;
revoke execute on function public.job_detail(public.jobs) from public, anon, authenticated;
revoke execute on function public.task_applies(public.tasks, date) from public, anon;
revoke execute on function public.task_done_on(public.tasks, date) from public, anon;
revoke execute on function public.tr_now() from public, anon;
revoke execute on function public.me_active() from public, anon;
revoke execute on function public.me_manager() from public, anon;
revoke execute on function public.register_push(text, text, jsonb) from public, anon;
revoke execute on function public.unregister_push(text) from public, anon;
grant execute on function public.me_active() to authenticated;
grant execute on function public.me_manager() to authenticated;
grant execute on function public.task_applies(public.tasks, date) to authenticated;
grant execute on function public.task_done_on(public.tasks, date) to authenticated;
