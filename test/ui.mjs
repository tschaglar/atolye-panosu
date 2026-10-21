import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const SHOT = process.env.SHOT_DIR;
const errors = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'tr-TR', timezoneId: 'Europe/Istanbul' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
const step = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (e) { console.log('FAIL', name, '-', e.message.split('\n')[0]); errors.push(name); } };
const shot = (n) => SHOT && page.screenshot({ path: `${SHOT}/${n}.png` });
const toastHas = (t) => page.waitForSelector(`.toast:has-text("${t}")`, { timeout: 4000 });

await page.goto('http://127.0.0.1:8765/index.html');
await step('giriş ekranı', async () => { await page.waitForSelector('form[data-form="login"]'); await shot('01-login'); });
await step('yanlış şifre hatası', async () => {
  await page.fill('#li-user', 'adem'); await page.fill('#li-pass', 'yanlis'); await page.click('form[data-form="login"] button[type=submit]');
  await page.waitForSelector('#li-err:not([hidden])'); });
await step('yönetici girişi -> Bugün', async () => {
  await page.fill('#li-user', 'caglar'); await page.fill('#li-pass', '123456'); await page.click('form[data-form="login"] button[type=submit]');
  await page.waitForSelector('.hero'); await page.waitForSelector('text=Kompresörü kapat'); await shot('02-today'); });
await step('bildirim afişi', async () => { await page.waitForSelector('[data-act="pushOn"], .banner:has-text("Bildirim")', { timeout: 3000 }); });
await step('görev ekle (Adem\'e, saatli)', async () => {
  await page.click('#fab'); await page.click('.big-choice:has-text("Görev")');
  await page.fill('#t-title', 'İskeleyi hazırla'); await page.selectOption('#t-assignee', { label: 'Adem' }); await page.fill('#t-time', '15:30');
  await shot('03-task-form');
  await page.click('form[data-form="task"] button[type=submit]'); await toastHas('Adem için görev eklendi'); });
await step('günlük görevi tamamla', async () => {
  await page.click('.task:has-text("Kompresörü kapat") .check'); await toastHas('Tamamlandı');
  await page.waitForSelector('.task.done:has-text("Kompresörü kapat")'); });
await step('firma -> araç işi + plaka', async () => {
  await page.click('#tab-firmalar'); await page.click('.firm:has-text("Şahin Oto")'); await page.waitForSelector('h1:has-text("Şahin Oto")');
  await page.click('[data-act="newJob"]'); await page.click('label.chip:has-text("Araç")'); await page.waitForSelector('#j-plate-wrap:not([hidden])');
  await page.fill('#j-plate', '31abc123'); await page.fill('#j-title', 'Kapı logosu'); await page.fill('#j-w', '120'); await page.fill('#j-h', '30');
  await page.click('form[data-form="job"] button[type=submit]'); await toastHas('İş kaydedildi');
  await page.waitForSelector('.job:has-text("Kapı logosu") .plate:has-text("31 ABC 123")'); await shot('04-firm'); });
await step('fiyatlandır', async () => {
  await page.click('.job:has-text("Logo") >> nth=0'); await page.click('[data-act="price"]');
  await page.fill('#p-unit', '1250'); await page.waitForFunction(() => document.querySelector('#p-total').value !== '');
  await page.click('form[data-form="price"] button[type=submit]'); await toastHas('Fiyat kaydedildi'); });
await step('PDF formu açılır', async () => {
  await page.click('[data-act="exportForm"]'); await page.waitForSelector('#x-sum b'); await shot('05-pdf');
  const dl = page.waitForEvent('download', { timeout: 8000 });
  await page.click('form[data-form="export"] button[type=submit]'); const d = await dl;
  if (!/hesap-dokumu/.test(d.suggestedFilename())) throw new Error('dosya adı ' + d.suggestedFilename()); });
await step('ekibe kişi ekle -> bilgiler', async () => {
  await page.click('#tab-ekip'); await page.click('[data-act="staffForm"] >> nth=0');
  await page.fill('#s-name', 'Şahin Abi'); const u = await page.inputValue('#s-user'); if (u !== 'sahinabi') throw new Error('kullanıcı adı önerisi: ' + u);
  await page.click('form[data-form="staff"] button[type=submit]'); await page.waitForSelector('#cred-txt'); await shot('06-cred');
  await page.click('[data-act="closeSheet"] >> nth=-1'); await page.waitForSelector('.person:has-text("Şahin Abi")'); });
await step('canlı bildirim: Adem iş girer -> yönetici toast', async () => {
  await page.evaluate(() => window.__fakeEmit('jobs', 'INSERT', 'j-live', { firm: 'f-1', type: 'Kutu harf', plate: '', title: 'Cephe harfleri', w: null, h: null, qty: 1, workDate: '2026-10-21', note: '', enteredBy: 'u-adem', status: 'bekliyor', price: null, unit: null, vat: 'haric', priceNote: '', pricedBy: null, pricedAt: null, createdAt: Date.now() }));
  await toastHas('Fiyat talebi'); });
await step('bildirim sekmesi', async () => { await page.click('#tab-bildirim'); await page.waitForSelector('text=Cephe harfleri'); await shot('07-inbox'); });
await step('ben menüsü + çıkış', async () => {
  await page.click('#meChip'); await page.waitForSelector('text=Ne zaman bildirim gelir?'); await shot('08-me');
  await page.click('[data-act="logout"]'); await page.waitForSelector('form[data-form="login"]'); });
await step('personel girişi: fiyat düğmesi yok, fiyat görünür', async () => {
  await page.fill('#li-user', 'adem'); await page.fill('#li-pass', '111111'); await page.click('form[data-form="login"] button[type=submit]');
  await page.waitForSelector('text=İskeleyi hazırla'); await page.click('#tab-firmalar'); await page.click('.firm:has-text("Şahin Oto")');
  await page.waitForSelector('.job-price'); if (await page.$('[data-act="exportForm"]')) throw new Error('personelde PDF düğmesi var');
  await page.click('.job:has-text("Logo") >> nth=0'); await page.waitForSelector('.pricebox .amt');
  if (await page.$('[data-act="price"]')) throw new Error('personelde fiyat düğmesi var'); await shot('09-staff-job'); });
await step('ilk kurulum ekranı', async () => {
  await page.evaluate(() => { window.__fakeDb.ready = false; }); await page.keyboard.press('Escape');
  await page.click('#meChip'); await page.click('[data-act="logout"]'); await page.waitForSelector('form[data-form="bootstrap"]');
  await page.fill('#bs-name', 'Çağlar Ş'); const u = await page.inputValue('#bs-user'); if (u !== 'caglars') throw new Error('öneri ' + u); await shot('10-setup'); });
await page.emulateMedia({ colorScheme: 'dark' });
await step('karanlık tema', async () => { await page.evaluate(() => { window.__fakeDb.ready = true; }); await page.reload(); await page.waitForSelector('form[data-form="login"]');
  await page.fill('#li-user', 'caglar'); await page.fill('#li-pass', '123456'); await page.click('form[data-form="login"] button[type=submit]'); await page.waitForSelector('#tabs:not([hidden])'); await page.click('#tab-bugun'); await page.waitForSelector('.hero'); await shot('11-dark'); });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log(overflow ? 'FAIL yatay taşma' : 'PASS yatay taşma yok');
console.log(errors.length ? 'HATALAR:\n' + errors.join('\n') : 'Konsol hatası yok');
await browser.close();
