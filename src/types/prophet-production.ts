import type {BattleState,Stance} from './index';
import type {BossRuntimeInput} from './boss-runtime';
export interface ProphetPewInstance {
  physicalCopyId:string; ordinal:1|2|3|4; areaId:string|null; placementRoll:number|null; placementRound:number|null;
  lifecycle:'STORED'|'PLACED'|'RESOLVING'|'RESOLVED';
}
export interface ProphetAttackTransaction {
  transactionId:string; physicalCopyId:string|null; physicalOrdinal:1|2|3|4|null; areaId:string;
  skillNumber:number; targetActorIds:string[]; attackRoll:number; phase:'ROLL_COMMITTED'|'RESOLVING_TARGET'|'COMPLETE';
  currentTargetIndex:number; resolvedTargetIds:string[]; parentEventId:string;
}
export interface ProphetProductionState {
  schemaVersion:1; ruleSetVersion:string; d10MapVersion:string; areaCapacityRuleVersion:string; rubbleTargetRuleVersion:string;
  actionOrdinal:1|2|3; pews:ProphetPewInstance[]; rubbleCursor:0|1|2|3|4;
  entryBindings:Record<string,{stance:Stance;areaId:string}>;
  placementTransactions:Array<{actionKey:string;round:number;copies:Array<{physicalCopyId:string;physicalOrdinal:number;roll:number;areaId:string;rngBefore:number;rngAfter:number}>}>;
  skillSelection?:{actionKey:string;round:number;ordinal:2;skillRoll:number;selectedSkill:number;parentEventId:string};
  crowdedChoice?:{choiceId:string;actionKey:string;round:number;ordinal:2;ruleSetVersion:string;candidateAreaIds:string[];candidateHeroIds:string[];occupancySnapshot:Record<string,string[]>;selectedAreaId:string|null};
  pendingPewAttack:ProphetAttackTransaction|null; attacks:ProphetAttackTransaction[];
  playerAttack?:{heroId:string;skillId:string;targetId:string;attackRoll:number;prepared?:import('../game-engine/battle').PreparedHeroAttackResolution};
  resolvedActionKeys:string[]; returnedPewIds:string[];
  campaignFinalizationReceipt?:{transactionId:string;before:{rngState:number;clockCursor:number;idCursor:number};after:{rngState:number;clockCursor:number;idCursor:number}};
  /** Replay evidence uses the shared BattleState and shared RNG, never another save format/engine. */
  replayOrigin:BattleState|null; commands:BossRuntimeInput[];
  /** Bound shared campaign inputs for deterministic Stress, Resolve, death and condition settlement. */
  campaignContext?:Omit<import('./index').CampaignState,'battle'>;
}
