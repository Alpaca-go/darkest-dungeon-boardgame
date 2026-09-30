// Reproduce the locked historical provenance input, never interpret TTS scripts
// as game rules. Only this exact historical path is redirected; all other I/O is
// untouched. Original verifier code, source manifests and hash checks remain.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { syncBuiltinESMExports } from 'node:module';
import { resolve } from 'node:path';

const key = Symbol.for('ddbg.c1c34.locked-legacy-transport');
if (!globalThis[key]) {
  const originalRead = fs.readFileSync;
  const manifest = JSON.parse(originalRead('docs/data/complete-edition/c1c24-boss-crop-manifest.json', 'utf8')).ttsSource;
  const archivePath = process.env.DDBG_LEGACY_TRANSPORT_ARCHIVE ?? resolve('docs/data/complete-edition/source-assets/c1c34/legacy-transport.json.gz');
  const bytes = gunzipSync(originalRead(archivePath));
  if (createHash('sha256').update(bytes).digest('hex') !== manifest.sha256) throw new Error('Locked historical transport archive mismatch');
  fs.readFileSync = function(path, options) {
    if (path !== manifest.path) return originalRead(path, options);
    const encoding = typeof options === 'string' ? options : options?.encoding;
    return encoding ? bytes.toString(encoding) : Buffer.from(bytes);
  };
  syncBuiltinESMExports();
  globalThis[key] = true;
}
