// Bildirim kuyruğunu boşaltır. Veritabanı (yeni kayıtta ve dakikada bir) bu fonksiyonu çağırır.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendFcm, sendWebPush, type Msg, type ServiceAccount, type Vapid } from '../_shared/push.ts';

const env = (k: string) => Deno.env.get(k) || '';

function parseSA(): ServiceAccount | null {
  try {
    const sa = JSON.parse(env('FCM_SERVICE_ACCOUNT') || 'null');
    return sa && sa.private_key && sa.client_email && sa.project_id ? sa : null;
  } catch { return null; }
}

async function pool<T>(items: T[], limit: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const x = items[i++]; await fn(x); }
  });
  await Promise.all(workers);
}

Deno.serve(async (req) => {
  const secret = env('TICK_SECRET');
  if (!secret || req.headers.get('x-tick-secret') !== secret) return new Response('forbidden', { status: 403 });

  const db = createClient(env('SUPABASE_URL'), env('APP_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sa = parseSA();
  const vapid: Vapid | null = env('VAPID_PRIVATE_KEY') && env('VAPID_PUBLIC_KEY')
    ? { publicKey: env('VAPID_PUBLIC_KEY'), privateKey: env('VAPID_PRIVATE_KEY'), subject: env('VAPID_SUBJECT') || 'mailto:bildirim@example.org' }
    : null;

  let sent = 0, failed = 0;
  const gone: string[] = [];
  for (let round = 0; round < 5; round++) {
    const { data, error } = await db.rpc('claim_outbox', { p_limit: 200 });
    if (error) { console.error('claim_outbox', error); return Response.json({ error: error.message }, { status: 500 }); }
    if (!data || !data.length) break;
    await pool(data as any[], 8, async (row) => {
      const route = row.data?.route || '';
      const m: Msg = { title: row.title, body: row.body, data: row.data || {}, tag: route + '-' + (row.data?.id || row.outbox_id) };
      try {
        let r: string;
        if (row.kind === 'fcm') r = sa ? await sendFcm(sa, row.token, m) : 'error';
        else r = vapid ? await sendWebPush(vapid, { endpoint: row.token, keys: row.keys }, m) : 'error';
        if (r === 'ok') sent++; else if (r === 'gone') gone.push(row.token); else failed++;
      } catch (e) { failed++; console.error('gönderim', row.kind, String(e)); }
    });
  }
  if (gone.length) await db.rpc('drop_push_tokens', { p_tokens: gone });
  return Response.json({ sent, failed, removed: gone.length, fcm: !!sa, web: !!vapid });
});
