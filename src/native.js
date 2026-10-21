// Telefon özellikleri: bildirim izni ve kaydı, geri tuşu, PDF paylaşma, sürüm kontrolü.
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { App } from '@capacitor/app';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { CFG } from './backend.js';

export const isNative = Capacitor.isNativePlatform();
export const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => !!(window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));

let hooks = {};
export function init(h) {
  hooks = h;
  if (isNative) {
    App.addListener('backButton', () => hooks.onBack && hooks.onBack());
    App.addListener('resume', () => hooks.onResume && hooks.onResume());
    if (CFG.fcm) addPushListeners();
  } else {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      navigator.serviceWorker.addEventListener('message', (ev) => {
        if (ev.data && ev.data.type === 'route') hooks.onRoute && hooks.onRoute(ev.data.data);
      });
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) hooks.onResume && hooks.onResume(); });
  }
}
function addPushListeners() {
  PushNotifications.addListener('pushNotificationActionPerformed', (a) => hooks.onRoute && hooks.onRoute(a.notification && a.notification.data));
  PushNotifications.addListener('pushNotificationReceived', (n) => hooks.onForegroundPush && hooks.onForegroundPush(n));
}
export function minimize() {
  if (isNative) App.minimizeApp().catch(() => {});
}

/* ---------- bildirimler ---------- */
export async function pushState() {
  if (isNative) {
    if (!CFG.fcm) return 'unsupported';
    try { const p = await PushNotifications.checkPermissions(); return p.receive === 'granted' ? 'granted' : p.receive === 'denied' ? 'denied' : 'prompt'; }
    catch (e) { return 'unsupported'; }
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS && !isStandalone() ? 'needs-install' : 'unsupported';
  }
  if (isIOS && !isStandalone()) return 'needs-install';
  return Notification.permission === 'granted' ? 'granted' : Notification.permission === 'denied' ? 'denied' : 'prompt';
}

let lastToken = null;
export const currentToken = () => lastToken;

/** İzin ister ve cihazı sunucuya kaydeder. register(kind, token, keys) çağrılır. */
export async function enablePush(register, vapidKey, ask = true) {
  if (isNative) {
    if (!CFG.fcm) return 'unsupported';
    let p = await PushNotifications.checkPermissions();
    if (p.receive !== 'granted' && ask) p = await PushNotifications.requestPermissions();
    if (p.receive !== 'granted') return p.receive === 'denied' ? 'denied' : 'prompt';
    await PushNotifications.createChannel({
      id: 'gorevler', name: 'Görevler ve fiyat talepleri', description: 'Görev, hatırlatma ve fiyat bildirimleri',
      importance: 5, visibility: 1, sound: 'default', vibration: true, lights: true, lightColor: '#1D4ED0',
    }).catch(() => {});
    await PushNotifications.removeAllListeners().catch(() => {});
    addPushListeners();
    const token = await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Bildirim kaydı zaman aşımına uğradı.')), 20000);
      PushNotifications.addListener('registration', (tok) => { clearTimeout(t); resolve(tok.value); });
      PushNotifications.addListener('registrationError', (err) => { clearTimeout(t); reject(new Error(err && err.error || 'Bildirim kaydı başarısız.')); });
      PushNotifications.register().catch(reject);
    });
    lastToken = token;
    await register('fcm', token, null);
    return 'granted';
  }
  const st = await pushState();
  if (st === 'unsupported' || st === 'needs-install') return st;
  if (!vapidKey) throw new Error('Sunucunun bildirim anahtarı bulunamadı.');
  let perm = Notification.permission;
  if (perm !== 'granted' && ask) perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'prompt';
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const want = b64uToBytes(vapidKey);
  if (sub && sub.options && sub.options.applicationServerKey) {
    const have = new Uint8Array(sub.options.applicationServerKey);
    if (have.length !== want.length || have.some((b, i) => b !== want[i])) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
  const j = sub.toJSON();
  lastToken = j.endpoint;
  await register('web', j.endpoint, j.keys);
  return 'granted';
}
function b64uToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/* ---------- PDF ---------- */
function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
/** 'shared' | 'saved' | 'cancelled' */
export async function savePdf(filename, buf) {
  if (isNative) {
    const r = await Filesystem.writeFile({ path: filename, data: bufToB64(buf), directory: Directory.Cache });
    try {
      await Share.share({ title: filename, files: [r.uri], dialogTitle: 'Hesap dökümünü paylaş ya da kaydet' });
      return 'shared';
    } catch (e) {
      if (/cancel/i.test(String(e && e.message))) return 'cancelled';
      throw e;
    }
  }
  const file = new File([buf], filename, { type: 'application/pdf' });
  if (isIOS && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 5000);
  return 'saved';
}

/* ---------- güncelleme ---------- */
export async function checkUpdate() {
  if (!isNative || !CFG.pagesUrl) return null;
  try {
    const r = await fetch(CFG.pagesUrl + 'version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return Number(j.version) > Number(CFG.version || 0) ? j : null;
  } catch (e) { return null; }
}
