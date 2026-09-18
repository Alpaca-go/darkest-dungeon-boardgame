import type { CampaignState } from '../../../types';
import { checkEnd } from '../../battle';
import { resolveTemplarDefeat } from '../../bosses/templars/templars-runtime';
import { resolveTemplarsEncounterVictory } from '../../bosses/templars/templars-victory';
import { resolveMammothCystActorDefeat } from '../../bosses/mammoth-cyst/white-cell-stalk-death';
import { resolveMammothCystEncounterVictory } from '../../bosses/mammoth-cyst/mammoth-cyst-victory';
import { resolveShufflingHorrorActorDefeat } from '../../bosses/shuffling-horror/shuffling-horror-death';
import { resolveShufflingHorrorEncounterVictory } from '../../bosses/shuffling-horror/shuffling-horror-victory';
import { resolveEchoingDisassembly } from '../../bosses/shuffling-horror/echoing-disassembly-summon';
import { getMissingSummonRoles } from '../../bosses/shuffling-horror/shuffling-horror-runtime';
import { returnCommunityPhysicalMonstersFromBattle } from './community-physical-monster-deck';
import { createSeededRng } from './rng';

export const isCommunityGuardianBattle = (campaign: CampaignState): boolean =>
  campaign.actFourState.contentRuntime?.runtimeProfileId === 'community-reference' &&
  !!campaign.actFourState.guardianQuestState?.guardianBattleId;

/**
 * Phase 11A.4R1 WP-1：把 Battle 级房间站位（communityRoomState）回写到
 * Campaign 级 Templars encounter state（heroPlacements + spikedPitRuntime 占用）。
 * 纯函数式投影：同一 battle 状态永远投影出同一 encounter 状态（save/replay 一致）。
 */
function synchronizeTemplarsRoomState(campaign: CampaignState): CampaignState {
  const battle = campaign.battle;
  const room = battle?.communityRoomState;
  const encounter = campaign.actFourState.templarsEncounterState;
  if (!battle || !room || room.family !== 'templars' || !encounter) return campaign;
  // Battle End 后（victoryResolved）不再回写：resolveTemplarsEncounterVictory 已按 §21
  // 清空 Pit 占据者并把 pitId 置 null；此处若再投影会把 Hero 写回 Pit，
  // 破坏「Save → 重放 Victory 提交」的幂等（重放时 battle 侧 pitId 仍在）。
  if (encounter.templarsBattleRuntime.victoryResolved) return campaign;
  const instanceIdByUnitId = new Map(battle.heroes.map((unit) => [unit.id, unit.sourceId] as const));
  const heroPlacements = encounter.heroPlacements.map((placement) => {
    const unitId = [...instanceIdByUnitId.entries()].find(([, instanceId]) => instanceId === placement.heroId)?.[0];
    const area = unitId ? room.heroAreas[unitId] : undefined;
    return area ? { ...placement, areaId: area.areaId, pitId: area.pitId } : placement;
  });
  const spikedPitRuntime = encounter.spikedPitRuntime.map((runtime) => ({
    ...runtime,
    occupantActorIds: Object.entries(room.heroAreas)
      .filter(([unitId, area]) => area.pitId === runtime.pitDefinitionId && battle.heroes.some((hero) => hero.id === unitId && hero.isAlive))
      .map(([unitId]) => instanceIdByUnitId.get(unitId)!)
      .filter(Boolean),
  }));
  const unchanged =
    JSON.stringify(encounter.heroPlacements) === JSON.stringify(heroPlacements) &&
    JSON.stringify(encounter.spikedPitRuntime.map((r) => r.occupantActorIds)) === JSON.stringify(spikedPitRuntime.map((r) => r.occupantActorIds));
  if (unchanged) return campaign;
  return {
    ...campaign,
    actFourState: {
      ...campaign.actFourState,
      templarsEncounterState: { ...encounter, heroPlacements, spikedPitRuntime },
    },
  };
}

/**
 * Phase 11A.4R1 WP-3：把 Battle 级 Echoing Disassembly 召唤（communityAttackEvents
 * 的 summonedRoles）同步进 Campaign 级 Shuffling Horror encounter state。
 * 幂等：encounter 中已在场（非 Reserve）的角色不会重复召唤。
 */
function synchronizeShufflingSummons(campaign: CampaignState): CampaignState {
  const battle = campaign.battle;
  const encounter = campaign.actFourState.shufflingHorrorEncounterState;
  if (!battle || !encounter) return campaign;
  const summoned = (battle.communityAttackEvents ?? []).flatMap((event) => event.summonedRoles ?? []);
  if (summoned.length === 0) return campaign;
  const missing = getMissingSummonRoles(encounter);
  if (!summoned.some((role) => missing.includes(role as never))) return campaign;
  const result = resolveEchoingDisassembly(encounter, `battle-sync:${battle.battleId}:${encounter.round}`);
  if (!result.ok) return campaign;
  return {
    ...campaign,
    actFourState: { ...campaign.actFourState, shufflingHorrorEncounterState: result.state },
  };
}

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
  next = synchronizeTemplarsRoomState(next);
  next = synchronizeShufflingSummons(next);
  return { ...next, battle: checkEnd(next.battle!) };
}

export function commitCommunityGuardianVictory(campaign: CampaignState): { ok: boolean; campaign: CampaignState; reason: string | null } {
  const next = synchronizeCommunityGuardianDeaths(campaign);
  const state = next.actFourState;
  const result = (() => {
    if (state.templarsEncounterState) return resolveTemplarsEncounterVictory(next);
    if (state.mammothCystEncounterState) return resolveMammothCystEncounterVictory(next);
    if (state.shufflingHorrorEncounterState) return resolveShufflingHorrorEncounterVictory(next);
    return { ok: false as const, campaign, reason: 'Missing Community Guardian encounter' };
  })();
  if (!result.ok) return { ok: false, campaign: result.campaign, reason: 'reason' in result ? String(result.reason ?? 'Community Guardian victory rejected') : 'Community Guardian victory rejected' };
  const battleId = next.actFourState.guardianQuestState?.guardianBattleId ?? next.battle?.battleId ?? next.id;
  return {
    ok: true,
    campaign: returnCommunityPhysicalMonstersFromBattle(result.campaign, createSeededRng(0x11a327), `dd-monster-return:${battleId}`),
    reason: null,
  };
}
