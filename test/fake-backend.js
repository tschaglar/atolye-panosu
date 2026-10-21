// Tarayıcı testleri için bellekte çalışan sahte sunucu. backend.js ile aynı dışa aktarımlar.
export const CFG = window.ATOLYE_CONFIG || {};
export const configured = true;
export const sb = null;
export const T = {};
const uid = () => crypto.randomUUID();
const now = () => Date.now();
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

const M = 'u-mgr', A = 'u-adem', F1 = 'f-1';
const db = window.__fakeDb = {
  ready: true,
  session: null,
  users: { caglar: { id: M, pass: '123456' }, adem: { id: A, pass: '111111' } },
  staff: new Map([[M, { name: 'Çağlar', username: 'caglar', role: 'yonetici', active: true, createdAt: now() }],
                  [A, { name: 'Adem', username: 'adem', role: 'personel', active: true, createdAt: now() }]]),
  firms: new Map([[F1, { name: 'Şahin Oto', contact: 'Şahin Bey', phone: '0532 111 22 33', note: '', createdBy: M, createdAt: now() }]]),
  tasks: new Map([['t-1', { title: 'Kompresörü kapat', assignee: M, createdBy: M, due: today(), time: '08:00', repeat: 'daily', firm: '', urgent: false, note: '', status: 'open', doneAt: null, doneBy: null, done: {}, createdAt: now() - 864e5 }]]),
  jobs: new Map([['j-1', { firm: F1, type: 'Araç', plate: '31 ABC 03', title: 'Logo', w: 280, h: 120, qty: 1, workDate: today(), note: '', enteredBy: A, status: 'bekliyor', price: null, unit: null, vat: 'haric', priceNote: '', pricedBy: null, pricedAt: null, createdAt: now() - 3600e3 }]]),
  settings: new Map(),
  push: [],
  calls: [],
};
const pairs = (m) => [...m].map(([k, v]) => [k, structuredClone(v)]);

export async function adminCall(action, body = {}) {
  db.calls.push([action, body]);
  if (action === 'status') return { ready: db.ready };
  if (action === 'login') {
    const u = db.users[body.username];
    if (!u || u.pass !== body.password) throw Object.assign(new Error('Kullanıcı adı ya da şifre hatalı.'), { status: 401 });
    return { access_token: 'a', refresh_token: 'r', uid: u.id };
  }
  if (action === 'bootstrap') { db.ready = true; db.users[body.username] = { id: M, pass: body.password }; return { ok: true }; }
  if (action === 'createUser') {
    if (db.users[body.username]) throw Object.assign(new Error('Bu kullanıcı adı alınmış. Başka bir tane seç.'), { status: 409 });
    const id = uid(); db.users[body.username] = { id, pass: body.password };
    db.staff.set(id, { name: body.name, username: body.username, role: body.role, active: true, createdAt: now() });
    return { id };
  }
  if (action === 'updateUser') {
    const s = db.staff.get(body.id);
    if ('name' in body) s.name = body.name; if ('role' in body) s.role = body.role; if ('active' in body) s.active = body.active;
    return { ok: true };
  }
  throw new Error('?');
}
export async function session() { return db.session; }
export async function login(username, password) {
  const r = await adminCall('login', { username, password });
  db.session = { user: { id: r.uid } };
}
export async function logout() { db.session = null; }
export function onAuth() { return { data: { subscription: { unsubscribe() {} } } }; }
export async function loadAll() {
  return { staff: pairs(db.staff), firms: pairs(db.firms), tasks: pairs(db.tasks), jobs: pairs(db.jobs), settings: pairs(db.settings) };
}
export async function loadFirmJobs(firmId) { return pairs(db.jobs).filter(([, j]) => j.firm === firmId); }
export async function loadOne(key, id) { const v = db[key].get(id); return v ? [id, structuredClone(v)] : null; }
export async function vapidKey() { return 'BElmQ9n4m1F3D2h0d6L3k3i5mWgRk8G6m8S5h7r0j8P5c2b4q1d9u7n3z0x5c2v8b6n4m1k3j5h7g9f0d2s4a6'; }
let onChange = null;
export function subscribe(fn, onStatus) { onChange = fn; setTimeout(() => onStatus('SUBSCRIBED'), 10); }
export function unsubscribe() { onChange = null; }
window.__fakeEmit = (key, type, id, val) => { if (val) db[key].set(id, val); onChange && onChange(key, type, id, val); };

function applyGuards(key, row, old) {
  const me = db.session.user.id, mgr = db.staff.get(me).role === 'yonetici';
  if (key === 'jobs') {
    if (!old) { row.enteredBy = me; row.createdAt = now(); if (!mgr) { row.status = 'bekliyor'; row.price = null; } row.status = row.status || 'bekliyor'; row.vat = row.vat || 'haric'; row.priceNote = row.priceNote || ''; }
    else if (!mgr && (old.status === 'fiyatlandi' || 'price' in row && row.price !== old.price)) throw Object.assign(new Error('Fiyatı yalnızca yönetici girebilir'), { code: '42501' });
    if (row.status === 'fiyatlandi' && (!old || old.status !== 'fiyatlandi' || row.price !== old.price)) { row.pricedBy = me; row.pricedAt = now(); }
  }
  if (key === 'tasks') {
    if (!old) { row.createdBy = me; row.createdAt = now(); row.doneAt = null; row.doneBy = null; }
    if (old && row.status === 'done' && old.status !== 'done') { row.doneAt = now(); row.doneBy = me; }
    if (old && row.status === 'open') { row.doneAt = null; row.doneBy = null; }
  }
  if (key === 'firms' && !old) { row.createdBy = me; row.createdAt = now(); }
  return row;
}
export async function insert(key, obj) {
  await new Promise((r) => setTimeout(r, 30));
  const id = uid(); const row = applyGuards(key, { ...obj }, null);
  db[key].set(id, row); return [id, structuredClone(row)];
}
export async function update(key, id, patch) {
  const old = db[key].get(id); if (!old) throw Object.assign(new Error('denied'), { code: 'denied' });
  const row = applyGuards(key, { ...old, ...patch }, old); db[key].set(id, row); return [id, structuredClone(row)];
}
export async function remove(key, id) { db[key].delete(id); }
export async function setSetting(key, value) { db.settings.set(key, value); }
export async function registerPush(kind, token) { db.push.push([kind, token]); }
export async function unregisterPush() {}
export function explain(e) { return (e && e.message) || 'Hata'; }
