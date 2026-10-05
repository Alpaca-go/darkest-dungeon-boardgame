import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Supply Git evidence only; never change the frozen checkout or its verifier. */
export function supplyProphetHistoricalObjects(checkout: string) {
  const manifest = JSON.parse(readFileSync(resolve('scripts/audit/c1c35r2br1-object-closure.json'), 'utf8'));
  const commits: string[] = Object.keys(manifest.commits);
  if (manifest.schemaVersion !== 1 || !commits.length || commits.some(sha => !/^[0-9a-f]{40}$/.test(sha)))
    throw new Error('Invalid historical object closure manifest');
  const git = (args: string[], input?: string) => execFileSync('git', args, { cwd: checkout, input, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
  const objects = git(['cat-file', '--batch-check=%(objectname) %(objecttype)'], commits.join('\n') + '\n').trim().split(/\r?\n/);
  let missing = commits.filter((sha, index) => objects[index] !== `${sha} commit`);
  const present = commits.filter((sha, index) => objects[index] === `${sha} commit`);
  const shallow = git(['rev-parse', '--is-shallow-repository']).trim() === 'true';
  if (shallow) missing = commits;
  if (!shallow && present.length) {
    try { git(['rev-list', '--objects', '--missing=error', ...present]); }
    catch { missing = commits; } // Repair incomplete trees/blobs/ancestry too.
  }
  if (missing.length) {
    // The local shared clone's origin is the Actions checkout, which may lack
    // historical objects. Fetch exact SHAs from its upstream, without merging.
    const upstream = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    const commonDir = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
    // Refetch prevents existing refs/alternates from claiming unavailable
    // ancestors or trees as already supplied during fetch negotiation. Include
    // checkout config for Actions credentials, only for this fetch invocation.
    git(['-c', `include.path=${resolve(commonDir, 'config')}`, 'fetch', '--refetch', '--no-tags', '--no-write-fetch-head', ...(shallow ? ['--unshallow'] : []), upstream,
      ...missing.map(sha => `${sha}:refs/historical-object-closure/${sha}`)]);
  }
  const types = git(['cat-file', '--batch-check=%(objecttype)'],
    commits.flatMap(sha => [`${sha}^{commit}`, `${sha}^{tree}`]).join('\n') + '\n').trim().split(/\r?\n/);
  if (types.some((type, index) => type !== (index % 2 ? 'tree' : 'commit')))
    throw new Error('Historical commit/tree object closure is incomplete');
  git(['rev-list', '--objects', '--missing=error', ...commits]);
  git(['rev-parse', '--verify', `${manifest.baseline}^{commit}`]);
  git(['ls-tree', manifest.baseline]);
  git(['show', '--no-patch', '--format=%H', ...commits]);
  // Retain evidence objects for the lifetime of this disposable repository.
  git(['update-ref', '--stdin'], commits.map(sha => `update refs/historical-object-closure/${sha} ${sha}`).join('\n') + '\n');
  for (const sha of manifest.scanRoots)
    git(['merge-base', '--is-ancestor', sha, manifest.baseline]);
  console.log(`Historical Git object closure: ${commits.length} commits verified; ${missing.length} fetched`);
}
