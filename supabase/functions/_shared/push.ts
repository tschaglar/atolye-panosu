// Bildirim gönderimi: Android için Firebase Cloud Messaging (HTTP v1), iPhone/web için standart Web Push (RFC 8291 + VAPID).
// Yalnızca WebCrypto kullanır; Deno ve Node 20+ ile çalışır.

const te = new TextEncoder();
type Bytes = Uint8Array<ArrayBuffer>;

export type Msg = { title: string; body: string; data?: Record<string, unknown>; tag?: string };
export type ServiceAccount = { client_email: string; private_key: string; project_id: string; token_uri?: string };
export type Vapid = { publicKey: string; privateKey: string; subject: string };
export type WebSub = { endpoint: string; keys: { p256dh: string; auth: string } };
export type Result = 'ok' | 'gone' | 'error';

export function b64u(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64uDecode(s: string): Bytes {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts: Bytes[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
function pemToDer(pem: string): Bytes {
  const b = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- Firebase Cloud Messaging ---------- */
let gTok: { token: string; exp: number; email: string } | null = null;

export async function signGoogleJwt(sa: ServiceAccount, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = b64u(te.encode(JSON.stringify(header))) + '.' + b64u(te.encode(JSON.stringify(claim)));
  const key = await crypto.subtle.importKey('pkcs8', pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, te.encode(unsigned));
  return unsigned + '.' + b64u(sig);
}

async function googleToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (gTok && gTok.email === sa.client_email && gTok.exp > now + 120) return gTok.token;
  const jwt = await signGoogleJwt(sa, now);
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('Google erişim anahtarı alınamadı: ' + JSON.stringify(j));
  gTok = { token: j.access_token, exp: now + (Number(j.expires_in) || 3600), email: sa.client_email };
  return gTok.token;
}

export function fcmBody(token: string, m: Msg) {
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(m.data || {})) if (v != null) data[k] = String(v);
  return {
    message: {
      token,
      notification: { title: m.title, body: m.body },
      data,
      android: {
        priority: 'HIGH',
        notification: {
          channel_id: 'gorevler',
          sound: 'default',
          icon: 'ic_stat_notify',
          color: '#1D4ED0',
          ...(m.tag ? { tag: m.tag } : {}),
        },
      },
    },
  };
}

export async function sendFcm(sa: ServiceAccount, token: string, m: Msg): Promise<Result> {
  const access = await googleToken(sa);
  const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + access, 'content-type': 'application/json' },
    body: JSON.stringify(fcmBody(token, m)),
  });
  if (r.ok) return 'ok';
  const t = await r.text();
  if (r.status === 404 || /UNREGISTERED|registration token is not a valid/i.test(t)) return 'gone';
  console.error('FCM hata', r.status, t.slice(0, 400));
  return 'error';
}

/* ---------- Web Push ---------- */
async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** RFC 8291 aes128gcm: tek kayıt. */
export async function encryptPayload(sub: WebSub, plaintext: Bytes,
  opts: { salt?: Bytes; asKeys?: CryptoKeyPair } = {}): Promise<Bytes> {
  const uaPublic = b64uDecode(sub.keys.p256dh);
  const authSecret = b64uDecode(sub.keys.auth);
  const asKeys = opts.asKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(te.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = opts.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

const vapidKeyCache = new Map<string, CryptoKey>();
export async function vapidAuth(endpoint: string, v: Vapid, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  let key = vapidKeyCache.get(v.privateKey);
  if (!key) {
    const pub = b64uDecode(v.publicKey);
    key = await crypto.subtle.importKey('jwk', {
      kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true,
    }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    vapidKeyCache.set(v.privateKey, key);
  }
  const unsigned = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))) + '.' +
    b64u(te.encode(JSON.stringify({ aud, exp: now + 12 * 3600, sub: v.subject })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(unsigned));
  return `vapid t=${unsigned}.${b64u(sig)}, k=${v.publicKey}`;
}

export async function sendWebPush(v: Vapid, sub: WebSub, m: Msg): Promise<Result> {
  const body = await encryptPayload(sub, te.encode(JSON.stringify({ title: m.title, body: m.body, data: m.data || {}, tag: m.tag })));
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      authorization: await vapidAuth(sub.endpoint, v),
      'content-encoding': 'aes128gcm',
      'content-type': 'application/octet-stream',
      ttl: '86400',
      urgency: 'high',
    },
    body,
  });
  if (r.status >= 200 && r.status < 300) return 'ok';
  if (r.status === 404 || r.status === 410) return 'gone';
  console.error('Web push hata', r.status, (await r.text()).slice(0, 300));
  return 'error';
}
