import { readFileSync } from 'node:fs';
import { root, verifyAssets } from './c1c25-contract';
import { buildArtifacts, validateArtifacts, verifyBaselineAndScope, report } from './c1c28-contract';
verifyBaselineAndScope();
await verifyAssets();
const expected = buildArtifacts();
validateArtifacts(Object.fromEntries(Object.keys(expected).map(n => [n, JSON.parse(readFileSync(root + n, 'utf8'))])));
if (readFileSync('docs/reports/complete-edition/c1c28-necromancer-terminal-blocker-and-ruling-report.md', 'utf8').replace(/\r\n/g, '\n') !== report(expected)) throw new Error('C1C28 report drift');
console.log('C1C28 verified: frozen canonical/gameplay/source bytes; 9 categories / 75 usages project-terminal; official 0/9, executable 9/9; C1C29 foundation selected, Ready 0.');
