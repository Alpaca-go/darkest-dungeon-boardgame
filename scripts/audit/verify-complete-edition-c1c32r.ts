import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { c1c32rRoomStorageProofs } from './c1c32r-room-storage-proof';
const root='docs/data/complete-edition/';
const read=(suffix:string)=>JSON.parse(readFileSync(root+'c1c32r-'+suffix+'.json','utf8'));
const requireCheck=(ok:boolean,message:string)=>{if(!ok)throw new Error(message);};
const decision=read('next-workstream-decision');
requireCheck(decision.foundationAccepted===false && decision.promoteC1C33===false && decision.productionReady===0,'Unsupported promotion');
const proofs=read('necromancer-room-storage-proof');
requireCheck(JSON.stringify(proofs.terminationAndReloadProofs)===JSON.stringify(c1c32rRoomStorageProofs()),'Storage proof replay changed');
for(const proof of proofs.terminationAndReloadProofs) {
  requireCheck(proof.productionAcceptance===false && proof.syntheticCombatDefinitionDependencies===0,'Scope mislabeled');
  for(const field of ['initialStateHash','preSaveHash','saveHash','reloadedHash','finalStateHash','eventSequenceHash'])
    requireCheck(/^[a-f0-9]{64}$/.test(proof[field]),'Missing actual storage hash: '+field);
}
const manifest=read('local-official-source-manifest');
for(const source of manifest.sources)requireCheck(createHash('sha256').update(readFileSync(source.filePath)).digest('hex')===source.sha256,'Local source changed: '+source.filePath);
const C=read('necromancer-reanimation-proof');
requireCheck(C.status==='NOT_PROVEN' && C.side==='THREAT' && C.initialStateHash===null,'Unsupported Scenario C claim');
console.log('C1C32R evidence integrity PASS; acceptance NOT_FINALIZED (ordinary Threat, Large contract, Graveyard still blocked).');
if(process.argv.includes('--require-accepted'))throw new Error('C1C32R acceptance gates not satisfied; C1C33 promotion rejected');
