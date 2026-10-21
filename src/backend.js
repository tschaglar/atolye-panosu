// Supabase veri katmanı: giriş, veri yükleme, canlı güncelleme, yazma.
import { createClient } from '@supabase/supabase-js';

export const CFG = window.ATOLYE_CONFIG || {};
export const configured = !!(CFG.url && CFG.anon);

export const sb = configured ? createClient(CFG.url, CFG.anon, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'atolye-auth', detectSessionInUrl: false },
  realtime: { params: { eventsPerSecond: 10 } },
}) : null;

const ms = (s) => {
  if (!s) return null;
  if (typeof s === 'number') return s;
  const str = String(s);
  const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(str) ? str : str + 'Z');
  return Number.isFinite(t) ? t : null;
};
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const iso = (v) => (v ? new Date(v).toISOString() : null);

// Uygulama içi alan adları <-> veritabanı sütunları
export const T = {
  staff: {
    table: 'profiles',
    from: (r) => ({ name: r.name, username: r.username, role: r.role, active: r.active !== false, createdAt: ms(r.created_at) }),
  },
  firms: {
    table: 'firms',
    from: (r) => ({ name: r.name, contact: r.contact || '', phone: r.phone || '', note: r.note || '', createdBy: r.created_by, createdAt: ms(r.created_at) }),
    to: (o) => pick(o, { name: 'name', contact: 'contact', phone: 'phone', note: 'note' }),
  },
  tasks: {
    table: 'tasks',
    from: (r) => ({
      title: r.title, assignee: r.assignee, createdBy: r.created_by, due: r.due, time: r.at_time || '',
      repeat: r.repeat || 'none', firm: r.firm || '', urgent: !!r.urgent, note: r.note || '', status: r.status,
      doneAt: ms(r.done_at), doneBy: r.done_by, done: r.done || {}, createdAt: ms(r.created_at),
    }),
    to: (o) => {
      const r = pick(o, { title: 'title', assignee: 'assignee', due: 'due', repeat: 'repeat', urgent: 'urgent', note: 'note', status: 'status', done: 'done', imported: 'imported', createdBy: 'created_by', doneBy: 'done_by' });
      if ('time' in o) r.at_time = o.time || null;
      if ('firm' in o) r.firm = o.firm || null;
      if ('createdAt' in o && o.createdAt) r.created_at = iso(o.createdAt);
      return r;
    },
  },
  jobs: {
    table: 'jobs',
    from: (r) => ({
      firm: r.firm, type: r.type || '', plate: r.plate || '', title: r.title, w: num(r.w), h: num(r.h), qty: num(r.qty) || 1,
      workDate: r.work_date, note: r.note || '', enteredBy: r.entered_by, status: r.status, price: num(r.price), unit: num(r.unit),
      vat: r.vat || 'haric', priceNote: r.price_note || '', pricedBy: r.priced_by, pricedAt: ms(r.priced_at), createdAt: ms(r.created_at),
    }),
    to: (o) => {
      const r = pick(o, { firm: 'firm', type: 'type', plate: 'plate', title: 'title', w: 'w', h: 'h', qty: 'qty', workDate: 'work_date', note: 'note', status: 'status', price: 'price', unit: 'unit', vat: 'vat', priceNote: 'price_note', imported: 'imported', enteredBy: 'entered_by', pricedBy: 'priced_by' });
      if ('createdAt' in o && o.createdAt) r.created_at = iso(o.createdAt);
      if ('pricedAt' in o && o.pricedAt) r.priced_at = iso(o.pricedAt);
      return r;
    },
  },
  settings: {
    table: 'settings', key: 'key',
    from: (r) => r.value || {},
  },
};
function pick(o, map) {
  const r = {};
  for (const [k, col] of Object.entries(map)) if (k in o) r[col] = o[k];
  return r;
}

/* ---------- oturum ---------- */
export async function adminCall(action, body = {}) {
  const headers = { 'content-type': 'application/json', apikey: CFG.anon };
  const s = sb && (await sb.auth.getSession()).data.session;
  if (s) headers.authorization = 'Bearer ' + s.access_token;
  let r;
  try {
    r = await fetch(CFG.url + '/functions/v1/admin', { method: 'POST', headers, body: JSON.stringify({ action, ...body }) });
  } catch (e) {
    throw Object.assign(new Error('Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.'), { offline: true });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Sunucu hata verdi (' + r.status + ').'), { status: r.status });
  return j;
}
export async function session() {
  return sb ? (await sb.auth.getSession()).data.session : null;
}
export async function login(username, password) {
  const j = await adminCall('login', { username, password });
  const { error } = await sb.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token });
  if (error) throw error;
}
export async function logout() {
  try { await sb.auth.signOut(); } catch (e) { /* çevrimdışı olabilir */ }
}
export function onAuth(fn) {
  return sb.auth.onAuthStateChange((ev, s) => fn(ev, s));
}

/* ---------- okuma ---------- */
function check(res) {
  if (res.error) throw res.error;
  return res.data || [];
}
export async function loadAll() {
  const since = new Date(Date.now() - 35 * 864e5).toISOString();
  const jobsSince = new Date(Date.now() - 120 * 864e5).toISOString();
  const [p, f, t, j, s] = await Promise.all([
    sb.from('profiles').select('*'),
    sb.from('firms').select('*').order('name').limit(5000),
    sb.from('tasks').select('*').or(`status.eq.open,done_at.gte.${since}`).limit(5000),
    sb.from('jobs').select('*').or(`status.eq.bekliyor,created_at.gte.${jobsSince}`).order('created_at', { ascending: false }).limit(3000),
    sb.from('settings').select('*'),
  ]);
  return {
    staff: check(p).map((r) => [r.id, T.staff.from(r)]),
    firms: check(f).map((r) => [r.id, T.firms.from(r)]),
    tasks: check(t).map((r) => [r.id, T.tasks.from(r)]),
    jobs: check(j).map((r) => [r.id, T.jobs.from(r)]),
    settings: check(s).map((r) => [r.key, T.settings.from(r)]),
  };
}
export async function loadFirmJobs(firmId) {
  return check(await sb.from('jobs').select('*').eq('firm', firmId).order('created_at', { ascending: false }).limit(5000))
    .map((r) => [r.id, T.jobs.from(r)]);
}
export async function loadOne(key, id) {
  const r = check(await sb.from(T[key].table).select('*').eq('id', id).limit(1))[0];
  return r ? [r.id, T[key].from(r)] : null;
}
export async function vapidKey() {
  const r = check(await sb.from('app_config').select('value').eq('key', 'vapid_public').limit(1))[0];
  return r ? r.value : '';
}

/* ---------- canlı güncelleme ---------- */
let channel = null;
export function subscribe(onChange, onStatus) {
  if (channel) sb.removeChannel(channel);
  channel = sb.channel('atolye-' + Math.random().toString(36).slice(2, 8));
  for (const [key, def] of Object.entries(T)) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table: def.table }, (p) => {
      const row = p.eventType === 'DELETE' ? p.old : p.new;
      const id = row && (def.key ? row[def.key] : row.id);
      if (!id) return;
      onChange(key, p.eventType, id, p.eventType === 'DELETE' ? null : def.from(row));
    });
  }
  channel.subscribe((status) => onStatus(status));
  return channel;
}
export function unsubscribe() {
  if (channel) { sb.removeChannel(channel); channel = null; }
}

/* ---------- yazma ---------- */
export async function insert(key, obj) {
  const res = await sb.from(T[key].table).insert(T[key].to(obj)).select().single();
  if (res.error) throw res.error;
  return [res.data.id, T[key].from(res.data)];
}
export async function update(key, id, patch) {
  const res = await sb.from(T[key].table).update(T[key].to(patch)).eq('id', id).select().maybeSingle();
  if (res.error) throw res.error;
  if (!res.data) throw Object.assign(new Error('denied'), { code: 'denied' });
  return [id, T[key].from(res.data)];
}
export async function remove(key, id) {
  const res = await sb.from(T[key].table).delete({ count: 'exact' }).eq('id', id);
  if (res.error) throw res.error;
  if (res.count === 0) throw Object.assign(new Error('denied'), { code: 'denied' });
}
export async function setSetting(key, value) {
  const res = await sb.from('settings').upsert({ key, value, updated_at: new Date().toISOString() });
  if (res.error) throw res.error;
}
export async function registerPush(kind, token, keys) {
  const res = await sb.rpc('register_push', { p_kind: kind, p_token: token, p_keys: keys || null });
  if (res.error) throw res.error;
}
export async function unregisterPush(token) {
  try { await sb.rpc('unregister_push', { p_token: token }); } catch (e) { /* önemsiz */ }
}

/** Hata nesnesini kullanıcıya gösterilecek Türkçe cümleye çevirir. */
export function explain(e) {
  const m = String((e && (e.message || e.error_description)) || '');
  if (e && e.code === 'denied') return 'Bu kaydı değiştirme yetkin yok.';
  if (e && e.code === '42501') return m || 'Bunu yapma yetkin yok.';
  if (e && e.code === '23505') return 'Bu adla bir kayıt zaten var.';
  if (e && e.code === '23503') return 'Bu kayda bağlı başka kayıtlar var, önce onları sil.';
  if (/Failed to fetch|NetworkError|network|load failed/i.test(m)) return 'İnternet bağlantısı yok. Bağlantı gelince tekrar dene.';
  if (/JWT|token/i.test(m)) return 'Oturumun sona erdi. Çıkış yapıp tekrar gir.';
  return m ? 'Kaydedilemedi: ' + m : 'Kaydedilemedi. Tekrar dene.';
}
