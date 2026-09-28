import { readFileSync } from 'node:fs';
import { baselineHead, buildArtifacts, git, report, root, validateArtifacts, verifyAssets } from './c1c24-contract';
git('merge-base','--is-ancestor',baselineHead,'HEAD');
const allowed = (p: string) => p === 'package.json'
  || /^scripts\/audit\/(?:c1c24-(?:contract|printed-source)|(?:generate|verify)-complete-edition-c1c24)\.ts$/.test(p)
  || /^scripts\/audit\/(?:extract|review)-c1c24-(?:ocr\.ps1|crops\.mjs)$/.test(p)
  || p === 'scripts/assets/import-complete-edition-c1c24.mjs'
  || p === 'src/audit/c1c24-boss-source-intake.test.ts'
  || /^docs\/(?:data|reports)\/complete-edition\/c1c24-/.test(p)
  || p.startsWith(root+'source-assets/c1c24/');
if (!git('diff','--name-only',baselineHead).split(/\r?\n/).filter(Boolean).every(allowed)) throw new Error('C1C24 audit-only scope violated; upstream/runtime freeze');
const pkg = JSON.parse(git('show',baselineHead+':package.json'));
pkg.scripts['import:complete-edition-c1c24'] = 'node scripts/assets/import-complete-edition-c1c24.mjs';
pkg.scripts['audit:complete-edition-c1c24'] = 'vite-node scripts/audit/generate-complete-edition-c1c24.ts';
pkg.scripts['verify:complete-edition-c1c24'] = 'vite-node scripts/audit/verify-complete-edition-c1c24.ts';
if (JSON.stringify(JSON.parse(readFileSync('package.json','utf8'))) !== JSON.stringify(pkg)) throw new Error('Only three C1C24 package scripts allowed');
await verifyAssets();
const artifacts = buildArtifacts();
for (const name of Object.keys(artifacts) as Array<keyof typeof artifacts>) artifacts[name] = JSON.parse(readFileSync(root+name,'utf8'));
validateArtifacts(artifacts);
if (readFileSync('docs/reports/complete-edition/c1c24-boss-source-intake-report.md','utf8').replace(/\r\n/g,'\n') !== report()) throw new Error('C1C24 report drift');
console.log('C1C24 verified: 231 physical cards, 34 original sheets, 462 byte-rebuilt crops; upstream/runtime frozen; Ready gain 0.');
