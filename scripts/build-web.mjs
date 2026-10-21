// Web dosyalarını www/ klasörüne derler. Android uygulaması ve iPhone/web sürümü aynı çıktıyı kullanır.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, process.env.OUT_DIR || 'www');
const fake = process.argv.includes('--fake');
const cfg = {
  url: process.env.SUPABASE_URL || (fake ? 'https://fake.local' : ''),
  anon: process.env.SUPABASE_ANON_KEY || (fake ? 'fake' : ''),
  version: Number(process.env.APP_VERSION || 0),
  pagesUrl: process.env.PAGES_URL || '',
  fcm: process.env.HAS_FCM === '1',
};

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const plugins = fake ? [{
  name: 'fake-backend',
  setup(b) { b.onResolve({ filter: /^\.\/backend\.js$/ }, () => ({ path: path.join(root, 'test/fake-backend.js') })); },
}] : [];

await esbuild.build({
  entryPoints: [path.join(root, 'src/app.js')],
  bundle: true, format: 'esm', minify: !fake, target: ['es2020', 'safari15'],
  outfile: path.join(out, 'app.js'), loader: { '.json': 'json' },
  external: ['html2canvas', 'dompurify', 'canvg'], plugins, logLevel: 'warning', legalComments: 'none',
});

const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8').replace('__CONFIG__', JSON.stringify(cfg).replace(/</g, '\\u003c'));
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.copyFileSync(path.join(root, 'src/styles.css'), path.join(out, 'styles.css'));
fs.writeFileSync(path.join(out, 'sw.js'), fs.readFileSync(path.join(root, 'src/sw.js'), 'utf8').replace('__VERSION__', String(cfg.version || Date.now())));
for (const f of fs.readdirSync(path.join(root, 'assets/web'))) fs.copyFileSync(path.join(root, 'assets/web', f), path.join(out, f));
const kb = (f) => (fs.statSync(path.join(out, f)).size / 1024).toFixed(0) + ' KB';
console.log(`www hazır: app.js ${kb('app.js')}, sürüm ${cfg.version}, sunucu ${cfg.url ? 'var' : 'YOK'}, Android bildirim ${cfg.fcm ? 'açık' : 'kapalı'}`);
