import { writeFileSync } from 'node:fs';
import { buildArtifacts, root } from './c1c29-contract';
for (const [name, data] of Object.entries(buildArtifacts())) writeFileSync(root + name, JSON.stringify(data, null, 2) + '\n');
console.log('C1C29 evidence generated from contract-bound runtime traces; promotion remains gated.');
