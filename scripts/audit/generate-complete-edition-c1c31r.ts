import { writeFileSync } from 'node:fs';
import { buildArtifacts, root } from './c1c31r-contract';
for (const [name, value] of Object.entries(buildArtifacts())) writeFileSync(root + name, JSON.stringify(value, null, 2) + '\n');
console.log('C1C31R exact impact comparison and frozen v2 Dodge artifacts generated offline.');
