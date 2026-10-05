import { createHash } from 'node:crypto';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../../src/game-engine/campaign';
import { commitQuestSelection, commitQuestFailureFromDefeat } from '../../src/game-engine/commands/quest';
import { enterProductionBossRoom } from '../../src/game-engine/commands/boss-foundation';
import { explicitlyMigrateHeroDodgeToV2 } from '../../src/game-engine/rules/hero-dodge-versioning';
import { seededRuntimeSources, withRuntimeSources } from '../../src/game-engine/runtime-sources';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../../src/game-engine/save';
import type { CampaignState } from '../../src/types';

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function c1c32rRoomStorageProofs() {
  return ([1,2,3] as const).map(level => withRuntimeSources(seededRuntimeSources(3232 + level), () => {
    let c = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), ['crusader','highwayman','vestal','hellion']));
    c.gamePhase='quest-select';
    Object.assign(c.campaignProgress, { campaignLevel:level, act:level, activeBossFamilyId:'necromancer',
      activeThreatId:`necromancer-threat-level-${level}`, pendingThreatInitialization:false,
      completedStandardQuestsThisAct:2, bossQuestRequired:true });
    c=explicitlyMigrateHeroDodgeToV2(c,'C1C32R-room-proof');
    const result=commitQuestSelection(c,'face-the-threat');
    if (!result.ok) throw new Error(result.error!);
    const initial=result.campaign;
    const reservedSave=createSaveSnapshot(initial);
    if (validateSaveFile(reservedSave)) throw new Error(validateSaveFile(reservedSave)!);
    const preSave=enterProductionBossRoom(initial,initial.bossRoomStorage!.roomId);
    const save=createSaveSnapshot(preSave);
    if (validateSaveFile(save)) throw new Error(validateSaveFile(save)!);
    const reloaded=restoreSaveSnapshot(JSON.parse(JSON.stringify(save)));
    if (hash(preSave)!==hash(reloaded)) throw new Error('IN_PLAY reload differs');
    const finish=(state:CampaignState) => {
      // Explicit terminal fault, scoped to physical return; never a gameplay acceptance result.
      const failed=commitQuestFailureFromDefeat({...state,battle:{...state.battle!,status:'defeat'}});
      if (!failed.ok) throw new Error(failed.error!);
      return failed.campaign;
    };
    const final=finish(preSave), resumed=finish(reloaded);
    if (hash(final)!==hash(resumed)) throw new Error('Failure continuation differs');
    const finalSave=createSaveSnapshot(final);
    if (validateSaveFile(finalSave) || hash(restoreSaveSnapshot(JSON.parse(JSON.stringify(finalSave))))!==hash(final))
      throw new Error('RETURNED reload invalid');
    return { level, status:'PASS', classification:'ROOM_TERMINATION_COMMAND_ISOLATION', productionAcceptance:false,
      explicitControls:['pre-Boss campaign progression','defeat status injection at termination boundary'],
      syntheticCombatDefinitionDependencies:0, reservedSaveHash:hash(reservedSave),
      initialStateHash:hash(initial),preSaveHash:hash(preSave),saveHash:hash(save),reloadedHash:hash(reloaded),
      finalStateHash:hash(final),eventSequenceHash:hash(final.bossRoomReturnHistory!.at(-1)!.encounter.events),
      ruleSetVersion:preSave.battle!.bossEncounter!.ruleSetVersion,postCleanupSaveHash:hash(finalSave),
      encounterId:final.bossRoomStorage!.encounterId,lifecycles:['RESERVED','IN_PLAY','RETURNED'],
      finalPhase:final.gamePhase,campaignLevelUnchanged:final.campaignProgress.campaignLevel===level };
  }));
}
