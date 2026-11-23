import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';

const root = path.resolve(import.meta.dirname, '..');
const html = readFileSync(path.join(root, 'src/dashboard-template.html'), 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1];
if (!head) throw new Error('Dashboard template must contain a head element');
const page = `<!doctype html><html lang="en"><head>${head}</head><body><div id="root"></div><script defer src="app.js?v=20261123-live-node"></script></body></html>`;
writeFileSync(path.join(root, 'dist/index.html'), page);

await build({
  entryPoints: [path.join(root, 'src/main.jsx')],
  outfile: path.join(root, 'dist/app.js'),
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  loader: { '.html': 'text' },
});
console.log('Built React dashboard in dist/app.js');
