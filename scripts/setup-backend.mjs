// GitHub Actions içinde çalışır: Supabase projesini bulur, veritabanını kurar, sunucu anahtarlarını ayarlar.
// Gerekli: SUPABASE_ACCESS_TOKEN. İsteğe bağlı: FIREBASE_SERVICE_ACCOUNT, ANDROID_KEYSTORE_PASSWORD.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const API = 'https://api.supabase.com/v1';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const out = (k, v) => process.env.GITHUB_OUTPUT && fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);
const mask = (v) => v && console.log(`::add-mask::${v}`);
const die = (m) => { console.error(`::error::${m}`); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN) die("GitHub'da SUPABASE_ACCESS_TOKEN adlı secret bulunamadı. Kurulum adımlarındaki 2. bölüme bak.");
mask(TOKEN);

async function api(method, p, body, { allow404 = false } = {}) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(API + p, {
      method,
      headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    if (r.status === 404 && allow404) return null;
    if (r.status === 429 || r.status >= 500) { await sleep(3000 * (i + 1)); continue; }
    if (!r.ok) die(`Supabase API ${method} ${p} -> ${r.status}: ${text.slice(0, 400)}`);
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  }
  die(`Supabase API ${method} ${p} yanıt vermedi`);
}

// 1) Proje
const projects = await api('GET', '/projects');
let proj = projects.find((p) => /atolye/i.test(p.name)) || (projects.length === 1 ? projects[0] : null);
if (!proj) die(`Supabase'de 'atolye-panosu' adlı proje bulunamadı. Bulunanlar: ${projects.map((p) => p.name).join(', ') || 'yok'}`);
const ref = proj.ref || proj.id;
console.log(`Proje: ${proj.name} (${ref}) durum: ${proj.status}`);
for (let i = 0; i < 60 && proj.status !== 'ACTIVE_HEALTHY'; i++) {
  if (proj.status === 'INACTIVE') { console.log('Proje uyuyor, uyandırılıyor...'); await api('POST', `/projects/${ref}/restore`, {}); }
  await sleep(10000);
  proj = await api('GET', `/projects/${ref}`);
  console.log(`  durum: ${proj.status}`);
}
if (proj.status !== 'ACTIVE_HEALTHY') die('Supabase projesi hazır değil. Birkaç dakika sonra iş akışını yeniden çalıştır.');
const url = `https://${ref}.supabase.co`;

// 2) Anahtarlar
const keys = await api('GET', `/projects/${ref}/api-keys?reveal=true`);
const pick = (...preds) => { for (const f of preds) { const k = keys.find(f); if (k?.api_key) return k.api_key; } return ''; };
const anon = pick((k) => k.name === 'anon', (k) => k.type === 'publishable');
const service = pick((k) => k.name === 'service_role', (k) => k.type === 'secret');
if (!anon || !service) die('Supabase API anahtarları okunamadı.');
mask(service);

// Uygulama derlemesi için yalnızca adres ve herkese açık anahtar gerekir: aynı iş içinde ortam değişkeni olarak ver.
if (process.argv.includes('--keys-only')) {
  const [o, r] = (process.env.GITHUB_REPOSITORY || 'atolye/atolye-panosu').split('/');
  const lines = `SUPABASE_URL=https://${ref}.supabase.co\nSUPABASE_ANON_KEY=${anon}\nPAGES_URL=https://${o.toLowerCase()}.github.io/${r}/\n`;
  if (process.env.GITHUB_ENV) fs.appendFileSync(process.env.GITHUB_ENV, lines);
  console.log(`Sunucu adresi: https://${ref}.supabase.co`);
  process.exit(0);
}

// 3) Veritabanı
const sql = (query) => api('POST', `/projects/${ref}/database/query`, { query });
await sql('create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now()); revoke all on public._migrations from anon, authenticated;');
const applied = new Set((await sql('select name from public._migrations')).map((r) => r.name));
const dir = path.join(process.cwd(), 'supabase/migrations');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
  if (applied.has(f)) continue;
  console.log(`Veritabanı güncellemesi: ${f}`);
  await sql(fs.readFileSync(path.join(dir, f), 'utf8') + `\n;insert into public._migrations (name) values ('${f}');`);
}

// 4) Kalıcı sırlar (vault) ve bildirim anahtarları
const vault = async (name) => (await sql(`select decrypted_secret v from vault.decrypted_secrets where name = '${name}'`))[0]?.v || '';
const vaultSet = (name, value) => sql(`select vault.create_secret('${value}', '${name}')`);
if (!(await vault('atolye_project_url'))) await vaultSet('atolye_project_url', url);
let tick = await vault('atolye_tick_secret');
if (!tick) { tick = crypto.randomBytes(24).toString('hex'); await vaultSet('atolye_tick_secret', tick); }
mask(tick);
let vPriv = await vault('atolye_vapid_private');
let vPub = (await sql(`select value from public.app_config where key = 'vapid_public'`))[0]?.value || '';
if (!vPriv || !vPub) {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const j = privateKey.export({ format: 'jwk' });
  vPriv = j.d;
  vPub = Buffer.concat([Buffer.from([4]), Buffer.from(j.x, 'base64url'), Buffer.from(j.y, 'base64url')]).toString('base64url');
  if (await vault('atolye_vapid_private')) await sql(`select vault.update_secret((select id from vault.secrets where name = 'atolye_vapid_private'), '${vPriv}')`);
  else await vaultSet('atolye_vapid_private', vPriv);
  await sql(`insert into public.app_config (key, value) values ('vapid_public', '${vPub}') on conflict (key) do update set value = excluded.value`);
  console.log('Web bildirim anahtarları oluşturuldu.');
}
mask(vPriv);

// 5) Fonksiyon ortam değişkenleri
const [owner, repo] = (process.env.GITHUB_REPOSITORY || 'atolye/atolye-panosu').split('/');
const pagesUrl = `https://${owner.toLowerCase()}.github.io/${repo}/`;
const secrets = [
  { name: 'APP_SERVICE_KEY', value: service },
  { name: 'APP_ANON_KEY', value: anon },
  { name: 'TICK_SECRET', value: tick },
  { name: 'VAPID_PUBLIC_KEY', value: vPub },
  { name: 'VAPID_PRIVATE_KEY', value: vPriv },
  { name: 'VAPID_SUBJECT', value: pagesUrl },
];
const fsa = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
if (fsa) {
  let sa;
  try { sa = JSON.parse(fsa); } catch { die('FIREBASE_SERVICE_ACCOUNT geçerli bir JSON değil. Dosyanın tüm içeriğini kopyalayıp yapıştırdığından emin ol.'); }
  if (!sa.private_key || !sa.client_email) die('FIREBASE_SERVICE_ACCOUNT bir hizmet hesabı anahtarı değil (private_key yok).');
  secrets.push({ name: 'FCM_SERVICE_ACCOUNT', value: JSON.stringify(sa) });
} else console.log('::warning::FIREBASE_SERVICE_ACCOUNT yok: Android bildirimleri gönderilemez.');
const kp = process.env.ANDROID_KEYSTORE_PASSWORD || '';
if (kp) secrets.push({ name: 'SETUP_CODE', value: setupCode(kp) });
await api('POST', `/projects/${ref}/secrets`, secrets);

// 6) Giriş ayarları: dışarıdan kayıt kapalı, hesapları yönetici açar
await api('PATCH', `/projects/${ref}/config/auth`, {
  disable_signup: true,
  site_url: pagesUrl,
  password_min_length: 6,
});

out('supabase_url', url);
out('project_ref', ref);
out('pages_url', pagesUrl);
console.log('Sunucu hazır.');

function setupCode(pw) {
  const h = crypto.createHash('sha256').update('atolye-kurulum:' + pw).digest();
  const abc = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += abc[h[i] % abc.length];
  return s;
}
