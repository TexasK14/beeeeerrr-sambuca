// Render preview stills from several shots with a single bundle.
// Usage: node scripts/render-stills.mjs [frame ...]
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const frames = process.argv.slice(2).map(Number);
const list = frames.length
  ? frames
  : [45, 62, 100, 170, 214, 248, 262, 278, 291, 345, 425];
const outDir = path.join(root, 'out', 'stills');
fs.mkdirSync(outDir, {recursive: true});

const serveUrl = await bundle({entryPoint: path.join(root, 'src', 'index.ts'), publicDir: path.join(root, 'public')});
const browserExecutable = process.env.REMOTION_BROWSER ?? null;
const chromiumOptions = {gl: 'swangle'};
const composition = await selectComposition({serveUrl, id: 'BeerSambucaEdit', browserExecutable, chromiumOptions});
for (const frame of list) {
  const output = path.join(outDir, `frame-${String(frame).padStart(4, '0')}.jpg`);
  const t0 = Date.now();
  await renderStill({composition, serveUrl, frame, output, imageFormat: 'jpeg', jpegQuality: 92, browserExecutable, chromiumOptions});
  console.log(`${output}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
