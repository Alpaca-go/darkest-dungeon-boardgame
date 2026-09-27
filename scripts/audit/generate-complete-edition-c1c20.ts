import { writeFileSync } from 'node:fs';
import { buildArtifacts, verdict } from './c1c20-contract';
for (const [name, artifact] of Object.entries(buildArtifacts())) writeFileSync(`docs/data/complete-edition/${name}`, JSON.stringify(artifact, null, 2) + '\n');
console.log(verdict);
