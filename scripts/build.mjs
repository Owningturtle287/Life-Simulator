import { cp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { writeIcons } from './icons.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = path.join(root, 'dist');
await rm(out, { recursive: true, force: true }); await mkdir(out, { recursive: true });
for (const entry of ['index.html', 'preview.html', 'style.css', 'manifest.webmanifest', 'sw.js', 'src', 'assets']) await cp(path.join(root, entry), path.join(out, entry), { recursive: true });
await writeIcons(path.join(out, 'assets'));
// Content-derived cache version ensures any source change invalidates the app shell.
const sources = await Promise.all(['index.html','style.css','src/main.js','src/chemistry.js','src/engine.js','src/renderer.js','src/builder.js','src/worker.js','sw.js','manifest.webmanifest','assets/icon.svg'].map(f => readFile(path.join(root, f))));
const version = createHash('sha256').update(Buffer.concat(sources)).digest('hex').slice(0, 12);
const sw = (await readFile(path.join(out, 'sw.js'), 'utf8')).replace('life-simulator-v1.0.0', `life-simulator-${version}`);
await writeFile(path.join(out, 'sw.js'), sw); await writeFile(path.join(out, '.nojekyll'), '');
console.log(`Built Life Simulator to dist/ (cache ${version}). No third-party runtime dependencies.`);
