// Giriş ve ekip hesapları. Kullanıcı adı + şifre ile giriş; hesapları yönetici açar.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) || '';
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const ok = (b: unknown) => Response.json(b, { headers: cors });
const fail = (msg: string, status = 400) => Response.json({ error: msg }, { status, headers: cors });

const svc = () => createClient(env('SUPABASE_URL'), env('APP_SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const pub = () => createClient(env('SUPABASE_URL'), env('APP_ANON_KEY') || env('SUPABASE_ANON_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const USER_RE = /^[a-z0-9._-]{3,24}$/;
const cleanName = (s: unknown) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);

async function loginEmail(db: ReturnType<typeof svc>, username: string): Promise<string> {
  const { data } = await db.from('server_config').select('value').eq('key', 'login_email').maybeSingle();
  const base = String(data?.value || '');
  const at = base.lastIndexOf('@');
  if (at < 1) throw new Error('Kurulum tamamlanmamış.');
  return base.slice(0, at).split('+')[0] + '+' + username + base.slice(at);
}

async function caller(req: Request, db: ReturnType<typeof svc>) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: p } = await db.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
  return p && p.active ? p : null;
}

async function activeManagers(db: ReturnType<typeof svc>) {
  const { data } = await db.from('profiles').select('id').eq('role', 'yonetici').eq('active', true);
  return (data || []).map((r: { id: string }) => r.id);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return fail('Yalnızca POST', 405);
  let b: Record<string, any>;
  try { b = await req.json(); } catch { return fail('Geçersiz istek'); }
  const db = svc();

  try {
    switch (b.action) {
      case 'status': {
        const { count } = await db.from('profiles').select('id', { count: 'exact', head: true });
        return ok({ ready: (count || 0) > 0 });
      }

      case 'bootstrap': {
        const { count } = await db.from('profiles').select('id', { count: 'exact', head: true });
        if ((count || 0) > 0) return fail('Kurulum zaten yapılmış. Kullanıcı adınla giriş yap.', 409);
        if (!env('SETUP_CODE') || String(b.code || '').trim().toUpperCase() !== env('SETUP_CODE')) return fail('Kurulum kodu hatalı.', 403);
        const name = cleanName(b.name), username = String(b.username || '').trim().toLowerCase();
        const email = String(b.email || '').trim().toLowerCase();
        if (!name) return fail('Adını yaz.');
        if (!USER_RE.test(username)) return fail('Kullanıcı adı 3-24 karakter olmalı; harf, rakam, nokta, tire.');
        if (!/^[^\s@+]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Geçerli bir e-posta adresi yaz.');
        if (String(b.password || '').length < 6) return fail('Şifre en az 6 karakter olmalı.');
        await db.from('server_config').upsert({ key: 'login_email', value: email });
        const { data: u, error } = await db.auth.admin.createUser({
          email: await loginEmail(db, username), password: b.password, email_confirm: true,
        });
        if (error || !u.user) return fail('Hesap açılamadı: ' + (error?.message || ''));
        const { error: e2 } = await db.from('profiles').insert({ id: u.user.id, name, username, role: 'yonetici' });
        if (e2) { await db.auth.admin.deleteUser(u.user.id); return fail('Hesap açılamadı: ' + e2.message); }
        return ok({ ok: true });
      }

      case 'login': {
        const username = String(b.username || '').trim().toLowerCase();
        if (!USER_RE.test(username) || !b.password) return fail('Kullanıcı adı ya da şifre hatalı.', 401);
        const { data: p } = await db.from('profiles').select('active').eq('username', username).maybeSingle();
        if (!p) return fail('Kullanıcı adı ya da şifre hatalı.', 401);
        if (!p.active) return fail('Bu hesap kapatılmış. Yöneticine sor.', 403);
        const { data, error } = await pub().auth.signInWithPassword({ email: await loginEmail(db, username), password: String(b.password) });
        if (error || !data.session) {
          const rl = /rate|too many/i.test(error?.message || '');
          return fail(rl ? 'Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.' : 'Kullanıcı adı ya da şifre hatalı.', rl ? 429 : 401);
        }
        return ok({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
      }

      case 'createUser': {
        const me = await caller(req, db);
        if (!me || me.role !== 'yonetici') return fail('Bunu yalnızca yönetici yapabilir.', 403);
        const name = cleanName(b.name), username = String(b.username || '').trim().toLowerCase();
        const role = b.role === 'yonetici' ? 'yonetici' : 'personel';
        if (!name) return fail('Adı yaz.');
        if (!USER_RE.test(username)) return fail('Kullanıcı adı 3-24 karakter olmalı; harf, rakam, nokta, tire. Türkçe karakter kullanma.');
        if (String(b.password || '').length < 6) return fail('Şifre en az 6 karakter olmalı.');
        const { data: dup } = await db.from('profiles').select('id').eq('username', username).maybeSingle();
        if (dup) return fail('Bu kullanıcı adı alınmış. Başka bir tane seç.', 409);
        const { data: u, error } = await db.auth.admin.createUser({
          email: await loginEmail(db, username), password: b.password, email_confirm: true,
        });
        if (error || !u.user) return fail('Hesap açılamadı: ' + (error?.message || ''));
        const { error: e2 } = await db.from('profiles').insert({ id: u.user.id, name, username, role });
        if (e2) { await db.auth.admin.deleteUser(u.user.id); return fail('Hesap açılamadı: ' + e2.message); }
        return ok({ id: u.user.id });
      }

      case 'updateUser': {
        const me = await caller(req, db);
        if (!me || me.role !== 'yonetici') return fail('Bunu yalnızca yönetici yapabilir.', 403);
        const { data: t } = await db.from('profiles').select('*').eq('id', b.id).maybeSingle();
        if (!t) return fail('Kişi bulunamadı.', 404);
        const patch: Record<string, unknown> = {};
        if (b.name !== undefined) { const n = cleanName(b.name); if (!n) return fail('Adı yaz.'); patch.name = n; }
        if (b.role !== undefined) patch.role = b.role === 'yonetici' ? 'yonetici' : 'personel';
        if (b.active !== undefined) patch.active = !!b.active;
        const mgrs = await activeManagers(db);
        const losesMgr = t.role === 'yonetici' && t.active && (patch.role === 'personel' || patch.active === false);
        if (losesMgr && mgrs.length <= 1) return fail('En az bir yönetici kalmalı.');
        if (t.id === me.id && patch.active === false) return fail('Kendi hesabını kapatamazsın.');
        if (b.password !== undefined) {
          if (String(b.password).length < 6) return fail('Şifre en az 6 karakter olmalı.');
          const { error } = await db.auth.admin.updateUserById(t.id, { password: String(b.password) });
          if (error) return fail('Şifre değiştirilemedi: ' + error.message);
        }
        if (patch.active !== undefined && patch.active !== t.active) {
          await db.auth.admin.updateUserById(t.id, { ban_duration: patch.active ? 'none' : '876000h' } as any);
          if (!patch.active) await db.from('push_subs').delete().eq('user_id', t.id);
        }
        if (Object.keys(patch).length) {
          const { error } = await db.from('profiles').update(patch).eq('id', t.id);
          if (error) return fail('Kaydedilemedi: ' + error.message);
        }
        return ok({ ok: true });
      }

      default:
        return fail('Bilinmeyen işlem');
    }
  } catch (e) {
    console.error('admin', b.action, String(e));
    return fail(String((e as Error)?.message || e), 500);
  }
});
