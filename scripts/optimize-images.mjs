import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve('dist');
async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(entries.filter(e => e.name !== '.git').map(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  return groups.flat();
}
const files = await walk(root);
const retained = new Set(['favicon.png', 'apple-touch-icon.png', 'og.png']);
const replacements = [];
let originalBytes = 0;
let optimizedBytes = 0;
for (const file of files) {
  if (!/\.(png|jpe?g)$/i.test(file) || retained.has(path.relative(root, file))) continue;
  const output = file.replace(/\.(png|jpe?g)$/i, '.webp');
  const icon = file.includes(`${path.sep}icons${path.sep}`);
  await sharp(file).webp(icon ? { lossless: true, effort: 6 } : { quality: 90, effort: 6 }).toFile(output);
  originalBytes += (await stat(file)).size;
  optimizedBytes += (await stat(output)).size;
  replacements.push([path.relative(root, file).split(path.sep).join('/'), path.relative(root, output).split(path.sep).join('/')]);
}
// Only replace paths for assets that actually exist; documentation examples stay intact.
for (const file of files) {
  if (!/\.(html|css|js|json)$/i.test(file) || path.basename(file) === 'WebEditor.js') continue;
  let content = await readFile(file, 'utf8');
  const original = content;
  for (const [from, to] of replacements) content = content.replaceAll(from, to);
  if (content !== original) await writeFile(file, content);
}
console.log(`WebP: ${replacements.length} images, ${(originalBytes / 1048576).toFixed(2)} MiB → ${(optimizedBytes / 1048576).toFixed(2)} MiB (${(100 * (1 - optimizedBytes / originalBytes)).toFixed(1)}% smaller).`);
