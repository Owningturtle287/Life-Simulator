import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));

test('the actual simulation worker accepts pause, step, save, and load messages', async t => {
  const worker = new Worker(new URL('./fixtures/worker-host.mjs', import.meta.url));
  t.after(() => worker.terminate());
  const messages = [], listeners = [];
  worker.on('message', message => { messages.push(message); listeners.splice(0).forEach(fn => fn()); });
  async function next(type, request) {
    const deadline = Date.now() + 4000;
    for (;;) {
      const i = messages.findIndex(m => m.type === type && (request === undefined || m.request === request));
      if (i >= 0) return messages.splice(i, 1)[0];
      if (Date.now() > deadline) throw new Error(`No worker response: ${type}`);
      await new Promise(resolve => { const timeout = setTimeout(resolve, 100); listeners.push(() => { clearTimeout(timeout); resolve(); }); });
    }
  }
  await next('ready'); worker.postMessage({ type: 'run', running: false });
  worker.postMessage({ type: 'init', config: { initialParticles: 120, seed: 'WORKER' } });
  const first = await next('snapshot'); assert.equal(first.running, false); assert.equal(first.snapshot.time, 0);
  worker.postMessage({ type: 'step' }); worker.postMessage({ type: 'save', request: 1 });
  const saved = (await next('saved', 1)).data; assert.equal(saved.tick, 1);
  worker.postMessage({ type: 'step' }); worker.postMessage({ type: 'load', data: saved });
  await next('loaded'); worker.postMessage({ type: 'save', request: 2 });
  assert.deepEqual((await next('saved', 2)).data, saved);
  worker.postMessage({ type: 'load', data: { format: 'bad' } });
  assert.match((await next('error')).message, /supported/);
  worker.postMessage({ type: 'save', request: 3 }); assert.equal((await next('saved', 3)).data.tick, 1);
});

test('the production build contains the complete offline app at a repository subpath', async () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root });
  const dist = path.join(root, 'dist'); const sw = await readFile(path.join(dist, 'sw.js'), 'utf8');
  assert.match(sw, /life-simulator-[0-9a-f]{12}/);
  const assets = [...sw.match(/const ASSETS = \[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const prefix = 'https://example.com/Life-Simulator/';
  for (const asset of assets) {
    assert.ok(new URL(asset, prefix).href.startsWith(prefix));
    assert.ok((await stat(path.resolve(dist, asset === './' ? 'index.html' : asset))).isFile());
  }
  const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.webmanifest')));
  assert.equal(manifest.display, 'standalone'); assert.ok(new URL(manifest.start_url, prefix).href.startsWith(prefix));
  for (const icon of manifest.icons) {
    const data = await readFile(path.join(dist, icon.src));
    if (icon.type === 'image/png') {
      assert.equal(data.subarray(1, 4).toString(), 'PNG');
      const size = Number(icon.sizes.split('x')[0]); assert.equal(data.readUInt32BE(16), size); assert.equal(data.readUInt32BE(20), size);
    }
  }
  const html = await readFile(path.join(dist, 'index.html'), 'utf8');
  assert.match(html, /viewport-fit=cover/); assert.match(html, /apple-touch-icon/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]); assert.equal(new Set(ids).size, ids.length);
  for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) await stat(path.join(dist, match[1]));
  for (const file of ['main', 'chemistry', 'engine', 'renderer', 'builder', 'worker']) {
    const source = await readFile(path.join(dist, 'src', `${file}.js`), 'utf8');
    for (const m of source.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g)) await stat(path.resolve(dist, 'src', m[1]));
  }
});
