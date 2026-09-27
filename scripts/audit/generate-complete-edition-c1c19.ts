import { writeFileSync } from 'node:fs';
import { buildContracts, verdict } from './c1c19-contract';
for (const [name, artifact] of Object.entries(buildContracts())) {
  writeFileSync('docs/data/complete-edition/' + name, JSON.stringify(artifact, null, 2) + '\n');
}
console.log(verdict);
