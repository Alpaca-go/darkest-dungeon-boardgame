import { writeFileSync } from 'node:fs';
import { buildContracts, verdict } from './c1c18-contract';
for (const [name, payload] of Object.entries(buildContracts())) writeFileSync('docs/data/complete-edition/' + name, JSON.stringify(payload, null, 2) + '\n');
console.log(verdict);
