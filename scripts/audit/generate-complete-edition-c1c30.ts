import { writeFileSync } from 'node:fs';
import { buildArtifacts, root } from './c1c30-contract';
for (const [name, artifact] of Object.entries(buildArtifacts())) writeFileSync(root + name, JSON.stringify(artifact, null, 2) + '\n');
console.log('C1C30 artifacts generated deterministically; promotion remains blocked.');
