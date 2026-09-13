import type { CampaignState } from '../../../types';
import { checkEnd } from '../../battle';
import { resolveTemplarDefeat } from '../../bosses/templars/templars-runtime';
import { resolveTemplarsEncounterVictory } from '../../bosses/templars/templars-victory';
import { resolveMammothCystActorDefeat } from '../../bosses/mammoth-cyst/white-cell-stalk-death';
import { resolveMammothCystEncounterVictory } from '../../bosses/mammoth-cyst/mammoth-cyst-victory';
import { resolveShufflingHorrorActorDefeat } from '../../bosses/shuffling-horror/shuffling-horror-death';
import { resolveShufflingHorrorEncounterVictory } from '../../bosses/shuffling-horror/shuffling-horror-victory';

export const isCommunityGuardianBattle = (campaign: CampaignState): boolean =>
  campaign.actFourState.contentRuntime?.runtimeProfileId === 'community-reference' &&
  !!campaign.actFourState.guardianQuestState?.guardianBattleId;

/** Connect real BattleUnit deaths to the existing family transactions. Never invent a defeat. */
export function synchronizeCommunityGuardianDeaths(campaign: CampaignState): CampaignState {
  if (!isCommunityGuardianBattle(campaign) || !campaign.battle) return campaign;
  let next = campaign;
  for (const unit of campaign.battle.monsters.filter(unit => !unit.isAlive && unit.hp === 0)) {
    const state = next.actFourState;
    const result = state.templarsEncounterState?.actorStates.some(actor => actor.actorId === unit.id)
      ? resolveTemplarDefeat(next, unit.id)
      : state.mammothCystEncounterState?.actorStates.some(actor => actor.actorId === unit.id)
        ? resolveMammothCystActorDefeat(next, unit.id)
        : state.shufflingHorrorEncounterState?.actors.some(actor => actor.actorId === unit.id)
          ? resolveShufflingHorrorActorDefeat(next, unit.id) : null;
    if (!result?.ok) throw new Error(result?.reason ?? `Unbound Community Guardian death: ${unit.id}`);
    next = result.campaign;
  }
  return { ...next, battle: checkEnd(next.battle!) };
}

export function commitCommunityGuardianVictory(campaign: CampaignState): { ok: boolean; campaign: CampaignState; reason: string | null } {
  const next = synchronizeCommunityGuardianDeaths(campaign);
  const state = next.actFourState;
  if (state.templarsEncounterState) return resolveTemplarsEncounterVictory(next);
  if (state.mammothCystEncounterState) return resolveMammothCystEncounterVictory(next);
  if (state.shufflingHorrorEncounterState) return resolveShufflingHorrorEncounterVictory(next);
  return { ok: false, campaign, reason: 'Missing Community Guardian encounter' };
}
