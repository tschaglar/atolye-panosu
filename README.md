# Atölye Panosu

Tabela atölyesi için ekip görev takibi, firma hesapları, iş girişleri ve fiyatlandırma.
Android uygulaması (APK) ve iPhone/tarayıcı sürümü aynı koddan derlenir.

## Nasıl çalışır

- **Veriler ve giriş:** Supabase (ücretsiz plan). Şema `supabase/migrations/` içinde.
- **Bildirimler:** Veritabanı her yeni görev, iş girişi ve fiyatlandırmada bildirim kuyruğuna yazar. Dakikada bir çalışan zamanlayıcı görev saatlerini ve sabah/akşam özetlerini ekler. `supabase/functions/tick` kuyruğu Android'e (Firebase Cloud Messaging) ve iPhone/web'e (Web Push) gönderir.
- **Derleme ve yayın:** `main` dalına her gönderimde GitHub Actions sunucuyu günceller, APK'yı derler ve siteyi GitHub Pages'e yayınlar.

## Gerekli GitHub secret'ları

| Ad | Nereden |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase > Proje ayarları > Hizmet hesapları > Yeni özel anahtar (dosyanın tüm içeriği) |
| `ANDROID_KEYSTORE_PASSWORD` | APK imza anahtarının şifresi (`android/app/release.p12`) |

Ayrıca Firebase'den indirilen `google-services.json` dosyası `android/app/` içine konur ve
deponun **Settings > Pages** bölümünde kaynak olarak **GitHub Actions** seçilir.

## Yerelde deneme

```
npm install
npm run build            # www/ klasörüne derler (sunucu adresi ortam değişkenlerinden)
node scripts/build-web.mjs --fake   # sahte sunucuyla deneme sürümü
```
