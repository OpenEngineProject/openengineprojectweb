#!/usr/bin/env bash
# Sync a WebEditor wasm build into public/webeditor-assets/.
#
# The wasm and data payloads ship gzipped and split when needed: static assets cap files
# at 25 MiB, and /webeditor.html inflates them client-side with
# DecompressionStream before handing them to the emscripten runtime.
#
# Also stamps public/webeditor.html's kAssetRev from the payload bytes so a
# deploy cannot share a URL with the previous wasm (the HTML itself is
# Cache-Control: no-store).
#
#   scripts/sync-webeditor.sh ~/GitHub/GameEngine/build/wasm-release/bin
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:?usage: sync-webeditor.sh <wasm build bin dir containing WebEditor.js/.wasm/.data>}"
DST="$ROOT/public/webeditor-assets"
HTML="$ROOT/public/webeditor.html"

for f in WebEditor.js WebEditor.wasm WebEditor.data; do
  [[ -s "$SRC/$f" ]] || { echo "missing or empty: $SRC/$f" >&2; exit 1; }
done

mkdir -p "$DST"
cp "$SRC/WebEditor.js" "$DST/WebEditor.js"
gzip -9 -c "$SRC/WebEditor.wasm" > "$DST/WebEditor.wasm.gz"
gzip -9 -c "$SRC/WebEditor.data" > "$DST/WebEditor.data.gz"

# Split compressed streams at 24 MiB; the loader joins them before inflating.
python3 - "$DST" "$HTML" <<'PYCHUNKS'
import json, pathlib, re, sys
root, html = map(pathlib.Path, sys.argv[1:])
files = {}
for key in ("wasm", "data"):
    name = f"WebEditor.{key}.gz"
    payload = root / name
    for old in root.glob(name + ".part*"):
        old.unlink()
    size = 24 * 1024 * 1024
    if payload.stat().st_size <= size:
        files[key] = [name]
        continue
    contents = payload.read_bytes()
    files[key] = []
    for index, offset in enumerate(range(0, len(contents), size)):
        part = name + f".part{index:02d}"
        (root / part).write_bytes(contents[offset:offset + size])
        files[key].append(part)
    payload.unlink()
text = html.read_text()
text, count = re.subn(r"const kAssetFiles = .*?;", "const kAssetFiles = " + json.dumps(files) + ";", text, count=1)
if count != 1:
    raise SystemExit("missing kAssetFiles in web editor loader")
html.write_text(text)
PYCHUNKS

kMax=$((25 * 1024 * 1024))
for f in "$DST"/*; do
  size=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f")
  name=$(basename "$f")
  echo "$name: $size bytes"
  if (( size > kMax )); then
    echo "ERROR: $name exceeds Cloudflare's 25 MiB static-asset limit" >&2
    exit 1
  fi
done

rev="$(cat "$DST/WebEditor.js" "$DST"/WebEditor.wasm.gz* "$DST"/WebEditor.data.gz* \
  | shasum -a 256 | awk '{print substr($1,1,12)}')"
python3 - "$HTML" "$rev" "$DST" "$SRC" "$ROOT" <<'PY'
import datetime, hashlib, json, pathlib, re, subprocess, sys
html, rev = pathlib.Path(sys.argv[1]), sys.argv[2]
text = html.read_text()
updated, n = re.subn(r'const kAssetRev = "[^"]*"', f'const kAssetRev = "{rev}"', text, count=1)
if n != 1:
    raise SystemExit(f"{html}: expected one kAssetRev assignment to stamp")
html.write_text(updated)
print(f"webeditor.html kAssetRev={rev}")
assets, source, root = map(pathlib.Path, sys.argv[3:])
files = [assets / "WebEditor.js", *sorted(assets.glob("WebEditor.wasm.gz*")), *sorted(assets.glob("WebEditor.data.gz*"))]
commit = subprocess.check_output(["git", "-C", str(source), "rev-parse", "HEAD"], text=True).strip()
manifest = {
    "repository": "Lunarsong/openengine-web",
    "tag": f"web-editor-{datetime.datetime.now(datetime.timezone.utc):%Y-%m-%d}-{rev}",
    "sourceCommit": commit,
    "files": [{"name": f.name, "size": f.stat().st_size, "sha256": hashlib.sha256(f.read_bytes()).hexdigest()} for f in files],
}
(root / "webeditor-release.json").write_text(json.dumps(manifest, indent=2) + "\n")
print("Release payload manifest: " + manifest["tag"])
PY
