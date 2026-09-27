// Build the game into public/, ready to upload to any static web host.
//
//   npm run build            (or: node game/tools/build_public.mjs)
//
// What comes out:
//   public/index.html        the page, comments stripped, CSS minified, one <script> per file below
//   public/app.js            data.js + all game code in load order, in one IIFE, minified
//   public/three.min.js      the three.js bundle as it is (already minified)
//   public/cardimages.js     the card pictures (15 MB of data URIs), kept apart so the
//                            browser caches it separately from the code
//   public/favicon.svg
//
// The game code is plain scripts that share globals, so they are joined in the same order
// index.html loads them and wrapped in one function: names local to the game can then be
// shortened, and nothing leaks onto window except what the code puts there itself (window.AG).
import { build, transform } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GAME = path.join(ROOT, 'game');
const OUT = path.join(ROOT, 'public');

const html = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
const APART = { 'vendor/three.min.js': 'three.min.js', 'cardimages.js': 'cardimages.js' };

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// Scripts kept as their own files, in their place in the load order; the rest go into app.js.
const code = srcs.filter((s) => !APART[s]).map((s) => `// ${s}\n` + fs.readFileSync(path.join(GAME, s), 'utf8'));
const entry = path.join(OUT, '.app-entry.js');
fs.writeFileSync(entry, code.join('\n;\n'));
await build({
  entryPoints: [entry], outfile: path.join(OUT, 'app.js'), bundle: false, format: 'iife',
  minify: true, legalComments: 'none', target: 'es2020', charset: 'utf8', logLevel: 'warning',
});
fs.rmSync(entry);

for (const [src, dst] of Object.entries(APART)) fs.copyFileSync(path.join(GAME, src), path.join(OUT, dst));
fs.copyFileSync(path.join(GAME, 'favicon.svg'), path.join(OUT, 'favicon.svg'));

// The page: no comments, minified CSS, and the script list rewritten to the files above.
const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const minCss = (await transform(css, { loader: 'css', minify: true, legalComments: 'none' })).code.trim();
const tags = [];
let appDone = false;
for (const s of srcs) {
  if (APART[s]) tags.push(`<script src="${APART[s]}"></script>`);
  else if (!appDone) { tags.push('<script src="app.js"></script>'); appDone = true; }
}
// three.js and the pictures must load before the game code, so app.js goes last.
tags.sort((a, b) => (a.includes('app.js') ? 1 : 0) - (b.includes('app.js') ? 1 : 0));
let page = html
  .replace(/<style>[\s\S]*?<\/style>/, () => `<style>${minCss}</style>`)
  .replace(/(?:<script src="[^"]+"><\/script>\s*)+/, () => tags.join(''))
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\s*\n\s*/g, ' ')          // runs of whitespace to one space: layout stays the same
  .trim();
fs.writeFileSync(path.join(OUT, 'index.html'), page + '\n');

const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(0) + ' KB';
console.log('public/ built:');
for (const f of fs.readdirSync(OUT)) console.log('  ' + f.padEnd(16) + kb(f));
