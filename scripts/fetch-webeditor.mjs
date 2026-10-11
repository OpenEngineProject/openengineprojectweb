import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(join(root, 'webeditor-release.json'), 'utf8'));
const destination = join(root, 'public', 'webeditor-assets');
async function matches(path, entry) {
  try {
    const bytes = await readFile(path);
    return bytes.length === entry.size && createHash('sha256').update(bytes).digest('hex') === entry.sha256;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
const missing = [];
for (const entry of manifest.files) {
  if (basename(entry.name) !== entry.name || !/^WebEditor\.[\w.]+$/.test(entry.name))
    throw new Error(`Invalid release asset name: ${entry.name}`);
  if (!await matches(join(destination, entry.name), entry)) missing.push(entry);
}
if (missing.length) {
  // Hosted builds need only Node and a read-only token. Keep gh authentication
  // as a convenience for local development, without printing credentials.
  let token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    try {
      token = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      throw new Error('Set GH_TOKEN to a GitHub token with Contents: Read access to the release repository (in Cloudflare: Settings > Build > Variables and secrets), or authenticate gh locally.');
    }
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(manifest.repository))
    throw new Error('Invalid release repository.');
  const api = `https://api.github.com/repos/${manifest.repository}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'openengine-web-build' };
  const releaseResponse = await fetch(`${api}/releases/tags/${encodeURIComponent(manifest.tag)}`, { headers });
  if (!releaseResponse.ok)
    throw new Error(`Cannot read editor release (${releaseResponse.status}). Check GH_TOKEN has Contents: Read access to ${manifest.repository}.`);
  const release = await releaseResponse.json();
  const staging = await mkdtemp(join(tmpdir(), 'openengine-web-assets-'));
  try {
    for (const entry of missing) {
      const asset = release.assets.find(asset => asset.name === entry.name);
      if (!asset || !Number.isSafeInteger(asset.id))
        throw new Error(`Missing release asset: ${entry.name}`);
      const response = await fetch(`${api}/releases/assets/${asset.id}`, {
        headers: { ...headers, Accept: 'application/octet-stream' },
      });
      if (!response.ok) throw new Error(`Cannot download ${entry.name} (${response.status}).`);
      await writeFile(join(staging, entry.name), new Uint8Array(await response.arrayBuffer()));
      if (!await matches(join(staging, entry.name), entry))
        throw new Error(`Release asset checksum mismatch: ${entry.name}`);
    }
    await mkdir(destination, { recursive: true });
    for (const entry of missing) await rename(join(staging, entry.name), join(destination, entry.name));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
console.log(`Verified ${manifest.files.length} web editor release assets (${manifest.tag}).`);
