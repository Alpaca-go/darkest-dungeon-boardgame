import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { baselineHead, buildArtifacts, git, report, root, verifyAssets } from './c1c23-contract';
const assert = (v: unknown, message: string) => {if (!v) throw new Error('C1C23: ' + message);};
git('merge-base', '--is-ancestor', baselineHead, 'HEAD');
const allowed = (p: string) => p === 'package.json'
  || /^scripts\/audit\/(c1c23-(?:contract|printed-source)|(?:generate|verify)-complete-edition-c1c23)\.ts$/.test(p)
  || p === 'scripts/audit/extract-c1c23-rulebook.py'
  || p === 'scripts/assets/import-complete-edition-c1c23.mjs'
  || p === 'src/audit/c1c23-hamlet-event-source-intake.test.ts'
  || /^docs\/(?:data|reports)\/complete-edition\/c1c23-/.test(p)
  || p.startsWith('docs/data/complete-edition/source-assets/c1c23/');
assert(git('diff', '--name-only', baselineHead).split(/\r?\n/).filter(Boolean).every(allowed), 'audit-only scope; preserve gameplay, Act IV and upstream freezes');
const pkg = JSON.parse(git('show', baselineHead + ':package.json'));
pkg.scripts['import:complete-edition-c1c23'] = 'node scripts/assets/import-complete-edition-c1c23.mjs';
pkg.scripts['audit:complete-edition-c1c23'] = 'vite-node scripts/audit/generate-complete-edition-c1c23.ts';
pkg.scripts['verify:complete-edition-c1c23'] = 'vite-node scripts/audit/verify-complete-edition-c1c23.ts';
assert(JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8'))) === JSON.stringify(pkg), 'only three package scripts added');
await verifyAssets();
for (const [name, value] of Object.entries(buildArtifacts())) assert(JSON.stringify(JSON.parse(readFileSync(root + name, 'utf8'))) === JSON.stringify(value), 'generated artifact drift: ' + name);
assert(readFileSync('docs/reports/complete-edition/c1c23-hamlet-event-source-intake-report.md', 'utf8').replace(/\r\n/g, '\n') === report(), 'report consistency');
execFileSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npx vitest run src/audit/c1c23-hamlet-event-source-intake.test.ts src/audit/c1c22-boss-encounter-live-inventory.test.ts src/audit/c1c21-standard-quest-live-rebaseline.test.ts src/audit/c1c20-core-terminal-blockers.test.ts'], {stdio: 'inherit'});
console.log('C1C23 source intake verified; historical C1C21 E2E failures remain open.');
