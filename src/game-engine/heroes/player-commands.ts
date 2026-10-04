import type {CampaignState,BattleUnit} from '../../types';
import type {HeroRuntimeInput} from '../../types/hero-runtime';
import {resolveProductionHeroSkill} from '../../data/heroes/runtime-registry';
import {beginProductionHeroSession,applyProductionHeroInput,previewProductionHeroTargets,productionLegalTargetSelection} from './production-runtime';
import {validateHeroRuntime} from './save-contract';
import {random} from '../random';
import {checkEnd} from '../battle';
import {settleBattleState} from '../commands/battle';
export function pendingProductionAction(c:CampaignState) {const p=c.heroProductionSession?.pendingAction;return p&&p.phase!=='COMPLETE'?p:null;}
/** Persist receipts in existing v23 fields; start a fresh segment only at a committed boundary. */
export function rebaseProductionCheckpoint(c:CampaignState):CampaignState {
 const s=c.heroProductionSession;if(!s||pendingProductionAction(c))return c;
 const origin=structuredClone(c);delete origin.heroProductionSession;
 return {...c,heroProductionSession:{...s,origin,seed:s.rngCursor,rngCalls:0,clockCursor:0,idCursor:0,inputs:[],pendingAction:null}};
}
export function productionActionAvailable(c:CampaignState,actor:BattleUnit,skillId:string,face:'front'|'back'='front'):boolean {
 if(pendingProductionAction(c))return false;
 try {return productionLegalTargetSelection(previewProductionHeroTargets(rebaseProductionCheckpoint(c),{type:'START',actorId:actor.id,skillId,face}))!==null;} catch {return false;}
}
export function commitProductionHeroInput(c:CampaignState,input:HeroRuntimeInput):CampaignState {
 let next=c;
 if(input.type==='START') {
   if(pendingProductionAction(c))throw new Error('Finish the pending Hero action first');
   next=rebaseProductionCheckpoint(c);
   if(!next.heroProductionSession) next=beginProductionHeroSession(next,Math.floor(random()*0xffffffff));
 }
 next=applyProductionHeroInput(next,input);
 if(input.type==='START') {next=applyProductionHeroInput(next,{type:'ADVANCE'});next=applyProductionHeroInput(next,{type:'ADVANCE'});}
 if(next.heroProductionSession!.pendingAction?.phase==='COMPLETE') {
   validateHeroRuntime(next);
   next={...next,battle:checkEnd(next.battle!)};
   next=settleBattleState(next).campaign;
   next=rebaseProductionCheckpoint(next);
 }
 return next;
}
export function productionSkillForActor(actor:BattleUnit,id:string) {return resolveProductionHeroSkill(actor.productionIdentity!.heroId,id,actor.skillLevels![id]);}
