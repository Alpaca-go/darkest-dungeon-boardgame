import { writeFileSync } from 'node:fs';
import { buildArtifacts, root } from './c1c31-contract';
for (const [name, value] of Object.entries(buildArtifacts())) writeFileSync(root + name, JSON.stringify(value, null, 2) + '\n');
console.log('C1C31 offline artifacts generated; explicit Hero Dodge ruling review required, foundation NOT accepted.');
