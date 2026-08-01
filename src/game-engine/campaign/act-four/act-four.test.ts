// Phase 10A §29 Unit Tests — Darkest Dungeon (Act IV) generic framework.
//
// 覆盖文档 §29 的 82 个测试项（1–82），全部走「正式运行时入口」，
// 不做任何引擎源码改动。所有 happy-path 用 mode:'prototype'，formal 路径断言被 Data Gate 拒绝。
//
// 关键不变量：
// - ActFourState 是 CampaignState 上的字段，不新增 GamePhase（硬约束 1）；
// - 所有随机点可注入 RNG，结果先保存，刷新不重抽/不重掷（硬约束 4）；
// - Data Gate：official 数据缺失时 formal 模式一律 ok:false。

import { describe, it, expect } from 'vitest';
import type { CampaignState } from '../../../types';

import { createNewCampaign, selectParty } from '../../campaign';
import {
  THREATS_TO_UNLOCK_DARKEST_DUNGEON,
  campaignLevelForAct,
} from '../campaign-progress';
import {
  SAVE_VERSION,
  migrateCampaignToLatest,
  migrateSaveFile,
} from '../../save';

import {
  createInitialActFourState,
  createUnlockedActFourState,
  sanitizeActFourState,
  getMaskedBossSlotViews,
  isObjectiveRevealed,
  canDrawDarkestDungeonQuest,
  hasSkippedFinalForm,
  isActFourActive,
  allowsStandardQuest,
  allowsThreatDraw,
} from './act-four-state';
import {
  unlockDarkestDungeonAct,
  completePostThirdThreatHamlet,
  canUnlockDarkestDungeonAct,
  remainingBossesBeforeActFour,
} from './unlock-act-four';
import {
  drawDarkestDungeonQuest,
  getSavedSkippedFinalFormId,
  getSavedGuardianDefinitionId,
  isQuestDiscardedThisCampaign,
} from './draw-quest';
import {
  activateDarkestDungeonContentSet,
  isDarkestDungeonContentActive,
  getActiveMonsterPool,
  resolveMonsterLevel,
  resolveTrinketTier,
  resolveCurioDeckId,
  interpretEmptyToken,
  isPreservedDeck,
} from './content-runtime';
import {
  drawDarkestDungeonLayout,
  buildDarkestDungeonMap,
  revealDarkestDungeonRoom,
} from './dungeon-map';
import {
  resolveExcavationSiteRoom,
  allocateExcavationRestPoints,
  finishExcavationRest,
  hasPendingExcavationRest,
  getPendingExcavationRoomId,
  getExcavationProgress,
  EXCAVATION_PROVISION_DIE_FACES,
} from './excavation-site';
import {
  createGuardianQuest,
  startGuardianBattle,
  resolveGuardianVictory,
  resolveGuardianFailure,
  isGuardianQuestRetreatBlocked,
  isGuardianDefeated,
} from './guardian-quest';
import {
  startFinalHamlet,
  advanceFinalHamletDay,
  FINAL_HAMLET_TOTAL_DAYS,
  shouldDrawHamletEvent,
  getFinalHamletProgress,
  canPrepareFinalEncounter,
} from './final-hamlet';
import {
  prepareFinalEncounter,
  buildOrderedFinalFormIds,
} from './prepare-final-encounter';
import {
  startFinalEncounter,
  defeatFinalForm,
  failFinalEncounter,
  getActiveFinalFormId,
} from './final-form-sequence';
import {
  transitionToNextFinalForm,
  captureFormTransitionSnapshots,
  diffFormTransitionSnapshots,
  isRestBlockedDuringFinalEncounter,
  isStanceChangeBlockedBetweenForms,
} from './transition-final-form';
import {
  resolveCampaignVictory,
  isCampaignVictory,
  isCampaignDefeat,
  getCampaignOutcome,
  CAMPAIGN_VICTORY_REASON_PREFIX,
} from './resolve-campaign-victory';
import { createSeededRng } from './rng';

import {
  getDarkestDungeonQuestPool,
  DARKEST_DUNGEON_QUEST_ROOM_COUNT,
  DARKEST_DUNGEON_QUEST_XP_REWARD,
  isDarkestDungeonOfficialQuestPoolEnabled,
  PROTOTYPE_DARKEST_DUNGEON_QUEST_IDS,
} from '../../../data/darkest-dungeon/quest-registry';
import {
  getDarkestDungeonLayoutPool,
  getDarkestDungeonLayoutById,
  DARKEST_DUNGEON_ROOM_SLOT_COUNT,
  DARKEST_DUNGEON_BOSS_SLOT_COUNT,
  reachableSlots,
  isDarkestDungeonOfficialLayoutPoolEnabled,
  PROTOTYPE_DARKEST_DUNGEON_LAYOUT_IDS,
} from '../../../data/darkest-dungeon/layout-registry';
import {
  SKIPPABLE_FINAL_FORM_IDS,
  UNSKIPPABLE_FINAL_FORM_ID,
  getFinalFormPool,
  PROTOTYPE_FINAL_ENCOUNTER_ROOM_ID,
  isFinalEncounterOfficialEnabled,
} from '../../../data/darkest-dungeon/final-form-registry';
import {
  DARKEST_DUNGEON_CURIO_DECK_ID,
  DARKEST_DUNGEON_TRINKET_TIER,
  DARKEST_DUNGEON_DUNGEON_LEVEL,
  EXCAVATION_SITE_COUNT,
  EXCAVATION_RESTING_POINTS,
  PRESERVED_DECK_IDS,
  isDarkestDungeonOfficialContentEnabled,
  PROTOTYPE_DARKEST_DUNGEON_MONSTER_IDS,
  PROTOTYPE_DARKEST_DUNGEON_ROOM_CARD_IDS,
} from '../../../data/darkest-dungeon/room-registry';
import {
  isDarkestDungeonOfficialGuardianPoolEnabled,
  getDarkestDungeonGuardianById,
} from '../../../data/darkest-dungeon/guardian-registry';
import {
  buildDarkestDungeonRoomTokens,
  DARKEST_DUNGEON_OBJECTIVE_TOKEN_ID,
} from '../../../data/darkest-dungeon/prototype-act-four-content';
import {
  isFinalProvisionOfficialEnabled,
  getFinalProvisionPolicy,
} from '../../../data/darkest-dungeon/final-provision-policy';
import { DARKEST_DUNGEON_LOCATION_ID } from '../../../types/act-four';

// ---------------------------------------------------------------------------
// 测试脚手架
// ---------------------------------------------------------------------------

const HERO_IDS = ['crusader', 'vestal', 'highwayman', 'hellion'];

/** 一个全新的、已选满 4 人队伍、且已击败 3 个 Boss Family 的战役。 */
function greenCampaign(): CampaignState {
  let c = createNewCampaign();
  c = selectParty(c, HERO_IDS);
  c = {
    ...c,
    campaignProgress: {
      ...c.campaignProgress,
      defeatedBossFamilyIds: ['necromancer', 'prophet', 'collector'],
    },
  };
  return c;
}

/** 解锁并走完「第三 Boss 后的 Hamlet」→ 进入 Quest 抽取阶段。 */
function baseCampaign(): CampaignState {
  let c = greenCampaign();
  c = unlockDarkestDungeonAct(c, { now: 't0' }).campaign;
  c = completePostThirdThreatHamlet(c, { now: 't1' }).campaign;
  return c;
}

function questCampaign(): CampaignState {
  return drawDarkestDungeonQuest(baseCampaign(), { rng: createSeededRng(1), mode: 'prototype' })
    .campaign;
}

function contentCampaign(): CampaignState {
  return activateDarkestDungeonContentSet(questCampaign(), { mode: 'prototype' }).campaign;
}

function mapCampaign(): CampaignState {
  let c = questCampaign();
  c = activateDarkestDungeonContentSet(c, { mode: 'prototype' }).campaign;
  c = drawDarkestDungeonLayout(c, { rng: createSeededRng(2), mode: 'prototype' }).campaign;
  c = buildDarkestDungeonMap(c, { rng: createSeededRng(3), mode: 'prototype' }).campaign;
  return c;
}

function guardianCampaign(): CampaignState {
  return createGuardianQuest(mapCampaign(), { mode: 'prototype' }).campaign;
}

function guardianBattleCampaign(): CampaignState {
  let c = guardianCampaign();
  const objRoom = c.actFourState.bossSlotAssignment!.objectiveRoomSlotId;
  c = startGuardianBattle(c, objRoom, { now: 't2' }).campaign;
  return c;
}

function guardianVictoryCampaign(): CampaignState {
  return resolveGuardianVictory(guardianBattleCampaign(), { now: 't3' }).campaign;
}

function finalHamletReadyCampaign(): CampaignState {
  let c = guardianVictoryCampaign();
  c = startFinalHamlet(c, { seed: 1 }).campaign;
  for (let i = 0; i < 4; i += 1) {
    c = advanceFinalHamletDay(c, { seed: i + 1 }).campaign;
  }
  return c;
}

/** 走到 Final Encounter 已「准备就绪」（4 天 Hamlet 完成）。 */
function finalEncounterReadyCampaign(): CampaignState {
  return finalHamletReadyCampaign();
}

function prepareCampaign(): CampaignState {
  return prepareFinalEncounter(finalEncounterReadyCampaign(), { mode: 'prototype', seed: 1 })
    .campaign;
}

/** 揭示第一个未揭示的 Excavation Site，返回（roomId, campaign）。 */
function revealFirstExcavation(c: CampaignState): { roomId: string; campaign: CampaignState } {
  const roomId = c.actFourState.excavationSiteStates[0]?.roomId;
  expect(roomId).toBeDefined();
  return { roomId: roomId!, campaign: revealDarkestDungeonRoom(c, roomId!).campaign };
}

function totalHeroXp(c: CampaignState): number {
  return c.heroes.reduce((sum, h) => sum + (h.xpState?.currentXp ?? h.xp), 0);
}

const PROVISION_KEYS: (keyof CampaignState['provisions'])[] = [
  'food',
  'bandage',
  'potion',
  'torch',
  'tool',
];

// ---------------------------------------------------------------------------
// Act IV 解锁（§29 项 1–6）
// ---------------------------------------------------------------------------

describe('Act IV 解锁', () => {
  it('1. 第三个 Threat 后解锁', () => {
    const c = greenCampaign();
    expect(canUnlockDarkestDungeonAct(c.campaignProgress)).toBe(true);
    const r = unlockDarkestDungeonAct(c, { now: 't0' });
    expect(r.ok).toBe(true);
    expect(r.alreadyUnlocked).toBe(false);
    expect(r.campaign.actFourState.unlocked).toBe(true);
  });

  it('1b. 未满足 3 个 Boss 时不能解锁', () => {
    let c = createNewCampaign();
    c = selectParty(c, HERO_IDS);
    c = { ...c, campaignProgress: { ...c.campaignProgress, defeatedBossFamilyIds: ['necromancer'] } };
    const r = unlockDarkestDungeonAct(c);
    expect(r.ok).toBe(false);
    expect(canUnlockDarkestDungeonAct(c.campaignProgress)).toBe(false);
    expect(remainingBossesBeforeActFour(c.campaignProgress)).toBe(2);
  });

  it('2. Campaign Level 保持 3', () => {
    expect(campaignLevelForAct(4)).toBe(3);
    expect(THREATS_TO_UNLOCK_DARKEST_DUNGEON).toBe(3);
    const c = baseCampaign();
    expect(c.campaignLevel).toBe(3);
    expect(c.actFourState.campaignLevel).toBe(3);
  });

  it('3. 不再抽 Threat', () => {
    const c = baseCampaign();
    expect(c.campaignProgress.activeThreatId).toBeNull();
    expect(c.campaignProgress.pendingThreatInitialization).toBe(false);
    expect(c.activeThreatRuntime).toBeNull();
    expect(c.currentThreatId).toBeNull();
    expect(allowsThreatDraw(c.actFourState)).toBe(false);
  });

  it('4. 不再提供 Standard Quest', () => {
    const c = baseCampaign();
    expect(allowsStandardQuest(c.actFourState)).toBe(false);
    expect(c.campaignProgress.bossQuestUnlocked).toBe(false);
  });

  it('5. 第三个 Boss 后可进入正常 Hamlet（解锁阶段）', () => {
    const c = greenCampaign();
    const unlocked = unlockDarkestDungeonAct(c, { now: 't0' });
    expect(unlocked.campaign.actFourState.stage).toBe('post-third-threat-hamlet');
    const r = completePostThirdThreatHamlet(unlocked.campaign);
    expect(r.ok).toBe(true);
    expect(r.campaign.actFourState.stage).toBe('guardian-quest-selection');
    // 前置未解锁则失败
    const locked = completePostThirdThreatHamlet(createNewCampaign());
    expect(locked.ok).toBe(false);
  });

  it('6. Unlock 幂等', () => {
    const c = greenCampaign();
    const first = unlockDarkestDungeonAct(c, { now: 't0' });
    const second = unlockDarkestDungeonAct(first.campaign, { now: 't0' });
    expect(second.ok).toBe(true);
    expect(second.alreadyUnlocked).toBe(true);
    expect(second.campaign.actFourState.stage).toBe('post-third-threat-hamlet');
    expect(second.campaign.actFourState.unlocked).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Quest / Content（§29 项 7–21）
// ---------------------------------------------------------------------------

describe('Quest / Content', () => {
  it('7. 从三张 Quest 中抽一张', () => {
    const r = drawDarkestDungeonQuest(baseCampaign(), { rng: createSeededRng(1), mode: 'prototype' });
    expect(r.ok).toBe(true);
    expect(r.quest).not.toBeNull();
    expect(PROTOTYPE_DARKEST_DUNGEON_QUEST_IDS).toContain(r.quest!.id);
    expect(r.campaign.actFourState.selectedQuestId).toBe(r.quest!.id);
  });

  it('8. 使用可注入 RNG（确定性）', () => {
    const a = drawDarkestDungeonQuest(baseCampaign(), { rng: createSeededRng(42), mode: 'prototype' });
    const b = drawDarkestDungeonQuest(baseCampaign(), { rng: createSeededRng(42), mode: 'prototype' });
    expect(a.campaign.actFourState.selectedQuestId).toBe(b.campaign.actFourState.selectedQuestId);
  });

  it('9. 刷新不重抽', () => {
    const first = drawDarkestDungeonQuest(baseCampaign(), { rng: createSeededRng(1), mode: 'prototype' });
    const second = drawDarkestDungeonQuest(first.campaign, {
      rng: createSeededRng(999),
      mode: 'prototype',
    });
    expect(second.alreadyDrawn).toBe(true);
    expect(second.campaign.actFourState.selectedQuestId).toBe(first.campaign.actFourState.selectedQuestId);
    expect(second.quest!.id).toBe(first.quest!.id);
  });

  it('10. Quest 固定 16 Rooms', () => {
    const r = drawDarkestDungeonQuest(baseCampaign(), { rng: createSeededRng(1), mode: 'prototype' });
    expect(r.quest!.roomCount).toBe(DARKEST_DUNGEON_QUEST_ROOM_COUNT);
    expect(r.quest!.roomCount).toBe(16);
  });

  it('11. Quest 固定 3 XP', () => {
    const r = drawDarkestDungeonQuest(baseCampaign(), { rng: createSeededRng(1), mode: 'prototype' });
    expect(r.quest!.xpReward).toBe(DARKEST_DUNGEON_QUEST_XP_REWARD);
    expect(r.quest!.xpReward).toBe(3);
  });

  it('12. Quest 保存 Guardian', () => {
    const r = drawDarkestDungeonQuest(baseCampaign(), { rng: createSeededRng(1), mode: 'prototype' });
    expect(r.campaign.actFourState.guardianDefinitionId).toBe(r.quest!.guardianDefinitionId);
    expect(getSavedGuardianDefinitionId(r.campaign.actFourState)).toBe(r.quest!.guardianDefinitionId);
  });

  it('13. Quest 保存 skipped Form', () => {
    const r = drawDarkestDungeonQuest(baseCampaign(), { rng: createSeededRng(1), mode: 'prototype' });
    expect(r.campaign.actFourState.skippedFinalFormId).toBe(r.quest!.skippedFinalFormId);
    expect(hasSkippedFinalForm(r.campaign.actFourState)).toBe(true);
  });

  it('14. skipped Form 只能是前三 Form', () => {
    const r = drawDarkestDungeonQuest(baseCampaign(), { rng: createSeededRng(1), mode: 'prototype' });
    const skipped = r.campaign.actFourState.skippedFinalFormId;
    expect(SKIPPABLE_FINAL_FORM_IDS).toContain(skipped);
    expect(getSavedSkippedFinalFormId(r.campaign.actFourState)).toBe(skipped);
    expect(isQuestDiscardedThisCampaign(r.campaign.actFourState, r.quest!.id)).toBe(false);
    expect(r.record!.discardedQuestIds).toHaveLength(2);
  });

  it('15. official 数据缺失时禁用（Data Gate）', () => {
    expect(isDarkestDungeonOfficialQuestPoolEnabled()).toBe(false);
    expect(isDarkestDungeonOfficialLayoutPoolEnabled()).toBe(false);
    expect(isDarkestDungeonOfficialGuardianPoolEnabled()).toBe(false);
    expect(isDarkestDungeonOfficialContentEnabled()).toBe(false);
    expect(isFinalEncounterOfficialEnabled()).toBe(false);
    expect(isFinalProvisionOfficialEnabled()).toBe(false);
    const formal = drawDarkestDungeonQuest(baseCampaign(), { rng: createSeededRng(1), mode: 'formal' });
    expect(formal.ok).toBe(false);
    const formalContent = activateDarkestDungeonContentSet(questCampaign(), { mode: 'formal' });
    expect(formalContent.ok).toBe(false);
    const formalLayout = drawDarkestDungeonLayout(questCampaign(), { rng: createSeededRng(2), mode: 'formal' });
    expect(formalLayout.ok).toBe(false);
  });

  it('16. Monster Deck 切为 Darkest Dungeon 专属', () => {
    const c = contentCampaign();
    expect(isDarkestDungeonContentActive(c.actFourState)).toBe(true);
    expect(getActiveMonsterPool(c.actFourState)).toEqual(PROTOTYPE_DARKEST_DUNGEON_MONSTER_IDS);
  });

  it('17. 所有 Monster Level = 3', () => {
    const c = contentCampaign();
    expect(resolveMonsterLevel(c.actFourState, 1)).toBe(3);
    expect(c.actFourState.contentRuntime!.dungeonLevel).toBe(DARKEST_DUNGEON_DUNGEON_LEVEL);
  });

  it('18. Room Deck 切换', () => {
    const c = contentCampaign();
    expect(c.actFourState.contentRuntime!.roomCardDefinitionIds).toEqual(
      PROTOTYPE_DARKEST_DUNGEON_ROOM_CARD_IDS,
    );
  });

  it('19. Curio 使用 Ruins', () => {
    const c = contentCampaign();
    expect(c.actFourState.contentRuntime!.curioDeckId).toBe(DARKEST_DUNGEON_CURIO_DECK_ID);
    expect(resolveCurioDeckId(c.actFourState, 'fallback')).toBe(DARKEST_DUNGEON_CURIO_DECK_ID);
  });

  it('20. Trinket Tier = 3', () => {
    const c = contentCampaign();
    expect(resolveTrinketTier(c.actFourState, 1)).toBe(3);
    expect(c.actFourState.contentRuntime!.trinketTier).toBe(DARKEST_DUNGEON_TRINKET_TIER);
  });

  it('21. Quirk/Disease 等 Deck 保持', () => {
    const c = contentCampaign();
    for (const id of PRESERVED_DECK_IDS) {
      expect(isPreservedDeck(c.actFourState, id)).toBe(true);
    }
    expect(c.actFourState.contentRuntime!.preservedDeckIds).toEqual(PRESERVED_DECK_IDS);
  });
});

// ---------------------------------------------------------------------------
// Layout / Boss Slots（§29 项 22–31）
// ---------------------------------------------------------------------------

describe('Layout / Boss Slots', () => {
  it('22. 从两张 Layout 抽一张', () => {
    const c = questCampaign();
    const r = drawDarkestDungeonLayout(c, { rng: createSeededRng(2), mode: 'prototype' });
    expect(r.ok).toBe(true);
    expect(PROTOTYPE_DARKEST_DUNGEON_LAYOUT_IDS).toContain(r.layout!.id);
  });

  it('23. Layout 恰好 16 Slots', () => {
    const c = questCampaign();
    const r = drawDarkestDungeonLayout(c, { rng: createSeededRng(2), mode: 'prototype' });
    expect(r.layout!.roomSlotIds.length).toBe(DARKEST_DUNGEON_ROOM_SLOT_COUNT);
    expect(r.layout!.roomSlotIds.length).toBe(16);
  });

  it('24. Layout 恰好 3 Boss Slots', () => {
    const r = drawDarkestDungeonLayout(questCampaign(), { rng: createSeededRng(2), mode: 'prototype' });
    expect(r.layout!.bossSlotIds.length).toBe(DARKEST_DUNGEON_BOSS_SLOT_COUNT);
    expect(r.layout!.bossSlotIds.length).toBe(3);
  });

  it('25. Graph 连通', () => {
    const r = drawDarkestDungeonLayout(questCampaign(), { rng: createSeededRng(2), mode: 'prototype' });
    expect(reachableSlots(r.layout!).size).toBe(r.layout!.roomSlotIds.length);
  });

  it('26. Objective + 2 Non-Objective 混洗', () => {
    const c = mapCampaign();
    const a = c.actFourState.bossSlotAssignment!;
    expect(a.assignedTokenIds).toHaveLength(3);
    expect(a.assignedTokenIds).toContain(DARKEST_DUNGEON_OBJECTIVE_TOKEN_ID);
    const nonObjective = a.assignedTokenIds.filter((id) => id !== DARKEST_DUNGEON_OBJECTIVE_TOKEN_ID);
    expect(nonObjective).toHaveLength(2);
    // 恰好 3 个 Excavation Site（规则 18）
    expect(c.actFourState.excavationSiteStates).toHaveLength(EXCAVATION_SITE_COUNT);
    expect(c.actFourState.excavationSiteStates).toHaveLength(3);
  });

  it('27. Objective 只出现一次', () => {
    const c = mapCampaign();
    const map = c.actFourState.mapState!;
    const objectives = Object.values(map.slotTokens).filter((t) => t.kind === 'objective');
    expect(objectives).toHaveLength(1);
  });

  it('28. Objective 位于 Boss Slot', () => {
    const c = mapCampaign();
    const a = c.actFourState.bossSlotAssignment!;
    expect(a.bossSlotIds).toContain(a.objectiveRoomSlotId);
    expect(c.actFourState.mapState!.slotTokens[a.objectiveRoomSlotId].kind).toBe('objective');
  });

  it('29. 不使用 Edge Room 规则', () => {
    const c = mapCampaign();
    const a = c.actFourState.bossSlotAssignment!;
    const layout = getDarkestDungeonLayoutById(a.layoutId)!;
    // Boss Slot 直接来自 Layout 固定字段，而非边房算法
    expect(a.bossSlotIds).toEqual(layout.bossSlotIds);
  });

  it('30. 刷新不重新分配', () => {
    const first = mapCampaign();
    const firstObj = first.actFourState.bossSlotAssignment!.objectiveRoomSlotId;
    const second = buildDarkestDungeonMap(first, { rng: createSeededRng(777), mode: 'prototype' });
    expect(second.alreadyBuilt).toBe(true);
    expect(second.campaign.actFourState.bossSlotAssignment!.objectiveRoomSlotId).toBe(firstObj);
  });

  it('31. UI 不泄露 Objective', () => {
    const c = mapCampaign();
    const a = c.actFourState.bossSlotAssignment!;
    expect(isObjectiveRevealed(c.actFourState)).toBe(false);
    const views = getMaskedBossSlotViews(c.actFourState);
    const objView = views.find((v) => v.slotId === a.objectiveRoomSlotId)!;
    expect(objView.revealed).toBe(false);
    expect(objView.kind).toBeNull();
    // 揭示后 UI 才能读到 Objective 真相
    const revealed = revealDarkestDungeonRoom(c, a.objectiveRoomSlotId).campaign;
    expect(isObjectiveRevealed(revealed.actFourState)).toBe(true);
    const revealedView = getMaskedBossSlotViews(revealed.actFourState).find(
      (v) => v.slotId === a.objectiveRoomSlotId,
    )!;
    expect(revealedView.kind).toBe('objective');
  });
});

// ---------------------------------------------------------------------------
// Excavation Site（§29 项 32–42）
// ---------------------------------------------------------------------------

describe('Excavation Site', () => {
  it('32. Empty 解释为 Excavation', () => {
    const c = contentCampaign();
    expect(interpretEmptyToken(c.actFourState)).toBe('excavation-site');
  });

  it('33. 每名 Hero 掷 1 个 Provision Die', () => {
    const { roomId, campaign: c } = revealFirstExcavation(mapCampaign());
    const r = resolveExcavationSiteRoom(c, roomId, { rng: createSeededRng(5), mode: 'prototype' });
    expect(r.ok).toBe(true);
    expect(Object.keys(r.rolls)).toHaveLength(4);
    for (const v of Object.values(r.rolls)) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(EXCAVATION_PROVISION_DIE_FACES);
    }
  });

  it('34. dead Hero 不掷', () => {
    const { roomId, campaign: base } = revealFirstExcavation(mapCampaign());
    const c = {
      ...base,
      heroes: base.heroes.map((h, i) => (i === 0 ? { ...h, dead: true, isAlive: false } : h)),
    };
    const r = resolveExcavationSiteRoom(c, roomId, { rng: createSeededRng(7) });
    expect(Object.keys(r.rolls)).toHaveLength(3);
    expect(r.rolls[c.heroes[0].instanceId]).toBeUndefined();
  });

  it('35. 结果先保存', () => {
    const { roomId, campaign: c } = revealFirstExcavation(mapCampaign());
    const r = resolveExcavationSiteRoom(c, roomId, { rng: createSeededRng(5), mode: 'prototype' });
    const site = r.campaign.actFourState.excavationSiteStates.find((s) => s.roomId === roomId)!;
    expect(site.provisionRollTransactionId).not.toBeNull();
    expect(site.provisionRolls).toEqual(r.rolls);
  });

  it('36. Provision 加入 Pool', () => {
    const { roomId, campaign: c } = revealFirstExcavation(mapCampaign());
    const before = c.provisions;
    const r = resolveExcavationSiteRoom(c, roomId, { rng: createSeededRng(5), mode: 'prototype' });
    const after = r.campaign.provisions;
    for (const key of PROVISION_KEYS) {
      if (r.gained[key] !== undefined && r.gained[key]! > 0) {
        expect(after[key]).toBe(before[key] + r.gained[key]!);
      } else {
        expect(after[key]).toBe(before[key]);
      }
    }
  });

  it('37. 开始 8 Point Rest', () => {
    const { roomId, campaign: c } = revealFirstExcavation(mapCampaign());
    const r = resolveExcavationSiteRoom(c, roomId, { rng: createSeededRng(5), mode: 'prototype' });
    expect(r.site!.restSession!.restingPoints).toBe(EXCAVATION_RESTING_POINTS);
    expect(r.site!.restSession!.restingPoints).toBe(8);
    expect(r.site!.restSession!.status).toBe('pending');
  });

  it('38. 不消耗 Firewood', () => {
    const { roomId, campaign: c } = revealFirstExcavation(mapCampaign());
    const r = resolveExcavationSiteRoom(c, roomId, { rng: createSeededRng(5), mode: 'prototype' });
    expect(r.site!.restSession!.consumeFirewood).toBe(false);
  });

  it('39. Pending Rest 阻止继续探索', () => {
    const { roomId, campaign: c } = revealFirstExcavation(mapCampaign());
    const r = resolveExcavationSiteRoom(c, roomId, { rng: createSeededRng(5), mode: 'prototype' });
    expect(hasPendingExcavationRest(r.campaign.actFourState)).toBe(true);
    expect(getPendingExcavationRoomId(r.campaign.actFourState)).toBe(roomId);
  });

  it('40. 刷新不重掷', () => {
    const { roomId, campaign: c } = revealFirstExcavation(mapCampaign());
    const first = resolveExcavationSiteRoom(c, roomId, { rng: createSeededRng(5), mode: 'prototype' });
    const second = resolveExcavationSiteRoom(first.campaign, roomId, {
      rng: createSeededRng(999),
      mode: 'prototype',
    });
    expect(second.alreadyResolved).toBe(true);
    expect(second.rolls).toEqual(first.rolls);
    expect(second.campaign.provisions).toEqual(first.campaign.provisions);
  });

  it('41. 完成后 Room cleared', () => {
    const { roomId, campaign: base } = revealFirstExcavation(mapCampaign());
    let c = resolveExcavationSiteRoom(base, roomId, { rng: createSeededRng(5), mode: 'prototype' })
      .campaign;
    const h0 = c.heroes[0].instanceId;
    const h1 = c.heroes[1].instanceId;
    c = allocateExcavationRestPoints(c, roomId, { heroId: h0, kind: 'heal', points: 4 }).campaign;
    c = allocateExcavationRestPoints(c, roomId, { heroId: h1, kind: 'stress-relief', points: 4 })
      .campaign;
    const site = c.actFourState.excavationSiteStates.find((s) => s.roomId === roomId)!;
    expect(site.status).toBe('cleared');
    expect(getExcavationProgress(c.actFourState).cleared).toBe(1);
  });

  it('42. 同 Room 不重复结算', () => {
    const { roomId, campaign: base } = revealFirstExcavation(mapCampaign());
    const first = resolveExcavationSiteRoom(base, roomId, { rng: createSeededRng(5), mode: 'prototype' });
    const cleared = finishExcavationRest(first.campaign, roomId).campaign;
    const again = resolveExcavationSiteRoom(cleared, roomId, { rng: createSeededRng(111) });
    expect(again.alreadyResolved).toBe(true);
    expect(again.rolls).toEqual(first.rolls);
  });
});

// ---------------------------------------------------------------------------
// Guardian（§29 项 43–48）
// ---------------------------------------------------------------------------

describe('Guardian', () => {
  it('43. Guardian Quest 不可撤退', () => {
    const c = guardianCampaign();
    expect(c.actFourState.guardianQuestState!.canRetreat).toBe(false);
    expect(isGuardianQuestRetreatBlocked(c.actFourState)).toBe(true);
  });

  it('44. Failure → Campaign Over', () => {
    const c = guardianCampaign();
    const r = resolveGuardianFailure(c, '测试失败');
    expect(r.campaign.gamePhase).toBe('campaign-over');
    expect(isCampaignDefeat(r.campaign)).toBe(true);
  });

  it('45. Victory 固定 3 XP', () => {
    const c = guardianBattleCampaign();
    const before = totalHeroXp(c);
    const r = resolveGuardianVictory(c, { now: 't3' });
    expect(r.ok).toBe(true);
    expect(r.xpAwarded).toBe(DARKEST_DUNGEON_QUEST_XP_REWARD);
    expect(r.xpAwarded).toBe(3);
    expect(totalHeroXp(r.campaign) - before).toBeGreaterThan(0);
  });

  it('46. skipped Form 保留', () => {
    const c = guardianCampaign();
    expect(c.actFourState.guardianQuestState!.skippedFinalFormId).toBe(
      c.actFourState.skippedFinalFormId,
    );
  });

  it('47. Prototype Guardian 不进 official', () => {
    const c = guardianCampaign();
    const gid = c.actFourState.guardianDefinitionId!;
    expect(isDarkestDungeonOfficialGuardianPoolEnabled()).toBe(false);
    expect(getDarkestDungeonGuardianById(gid)!.enabledInOfficialPool).toBe(false);
  });

  it('48. Victory 后进入 Final Hamlet', () => {
    const c = guardianVictoryCampaign();
    expect(isGuardianDefeated(c.actFourState)).toBe(true);
    expect(c.actFourState.stage).toBe('guardian-victory');
    const hamlet = startFinalHamlet(c, { seed: 1 });
    expect(hamlet.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Final Hamlet（§29 项 49–53）
// ---------------------------------------------------------------------------

describe('Final Hamlet', () => {
  it('49. 恰好 4 Days', () => {
    expect(FINAL_HAMLET_TOTAL_DAYS).toBe(4);
    const c = guardianVictoryCampaign();
    const started = startFinalHamlet(c, { seed: 1 }).campaign;
    expect(started.actFourState.finalHamletState!.totalDays).toBe(4);
    let cur = started;
    for (let i = 0; i < 4; i += 1) {
      cur = advanceFinalHamletDay(cur, { seed: i + 1 }).campaign;
    }
    expect(cur.actFourState.finalHamletState!.status).toBe('completed');
    expect(getFinalHamletProgress(cur.actFourState).day).toBe(4);
  });

  it('50. 不抽 Hamlet Event', () => {
    const c = guardianVictoryCampaign();
    const started = startFinalHamlet(c, { seed: 1 }).campaign;
    expect(started.actFourState.finalHamletState!.drawHamletEvent).toBe(false);
    expect(shouldDrawHamletEvent(started.actFourState)).toBe(false);
  });

  it('51. Day 刷新可恢复', () => {
    const c = guardianVictoryCampaign();
    const started = startFinalHamlet(c, { seed: 1 }).campaign;
    const d1 = advanceFinalHamletDay(started, { seed: 1 });
    expect(d1.currentDay).toBe(2);
    expect(d1.campaign.actFourState.finalHamletState!.completedDayTransactionIds).toHaveLength(1);

    // 模拟刷新：currentDay 仍显示 1，但 day-1 事务已落盘 → 不重复推进
    const reloaded = {
      ...d1.campaign,
      actFourState: {
        ...d1.campaign.actFourState,
        finalHamletState: { ...d1.campaign.actFourState.finalHamletState!, currentDay: 1 },
      },
    } as CampaignState;
    const replay = advanceFinalHamletDay(reloaded, { seed: 1 });
    expect(replay.alreadyProcessed).toBe(true);
    expect(replay.currentDay).toBe(1);

    // 顺序推进 4 天完整收敛到 final-encounter-ready
    let cur = started;
    cur = advanceFinalHamletDay(cur, { seed: 1 }).campaign; // 1→2
    cur = advanceFinalHamletDay(cur, { seed: 2 }).campaign; // 2→3
    cur = advanceFinalHamletDay(cur, { seed: 3 }).campaign; // 3→4
    cur = advanceFinalHamletDay(cur, { seed: 4 }).campaign; // 4→completed
    expect(cur.actFourState.finalHamletState!.status).toBe('completed');
    expect(cur.actFourState.finalHamletState!.completedDayTransactionIds).toHaveLength(4);
    expect(cur.actFourState.stage).toBe('final-encounter-ready');
  });

  it('52. 第 4 Day 后 Final Ready', () => {
    const c = finalHamletReadyCampaign();
    expect(c.actFourState.finalHamletState!.status).toBe('completed');
    expect(c.actFourState.stage).toBe('final-encounter-ready');
    expect(canPrepareFinalEncounter(c.actFourState)).toBe(true);
  });

  it('53. 不进入普通 Quest Select', () => {
    const c = finalHamletReadyCampaign();
    // 复用既有顶层阶段 hamlet，而非回到 quest-select
    expect(c.gamePhase).toBe('hamlet');
    expect(c.actFourState.stage).toBe('final-encounter-ready');
  });
});

// ---------------------------------------------------------------------------
// Final Encounter（§29 项 54–71）
// ---------------------------------------------------------------------------

describe('Final Encounter', () => {
  it('54. 不生成 Dungeon Exploration', () => {
    const prepared = prepareCampaign();
    expect(prepared.dungeon).toBeNull();
    const started = startFinalEncounter(prepared, { mode: 'prototype', seed: 1 });
    expect(started.campaign.dungeon).toBeNull();
    expect(started.campaign.gamePhase).toBe('battle');
  });

  it('55. 开始前 Roll Provisions', () => {
    const prepared = prepareCampaign();
    const rec = prepared.actFourState.finalEncounterState!.provisionRecord!;
    expect(rec).not.toBeNull();
    expect(Object.keys(rec.rolls).length).toBeGreaterThan(0);
    const policy = getFinalProvisionPolicy('prototype');
    for (const key of Object.keys(rec.rolls)) {
      expect(policy.provisionTypes).toContain(key as (typeof policy.provisionTypes)[number]);
    }
    // 每个骰点都至少 +1
    for (const key of PROVISION_KEYS) {
      expect(prepared.provisions[key]).toBeGreaterThan(createNewCampaign().provisions[key]);
    }
  });

  it('56. Provision 刷新不重掷', () => {
    const first = prepareCampaign();
    const second = prepareFinalEncounter(first, {
      mode: 'prototype',
      seed: 1,
    });
    expect(second.alreadyPrepared).toBe(true);
    expect(second.provisionRecord).toEqual(first.actFourState.finalEncounterState!.provisionRecord);
    expect(second.campaign.provisions).toEqual(first.provisions);
  });

  it('57. Form 顺序固定', () => {
    const ids = buildOrderedFinalFormIds('ancestor-first-form');
    expect(ids).toEqual(['ancestor-second-form', 'gestating-heart', 'heart-of-darkness']);
    expect(ids[2]).toBe(UNSKIPPABLE_FINAL_FORM_ID);
  });

  it('58. 跳过指定前三 Form', () => {
    for (const skipped of SKIPPABLE_FINAL_FORM_IDS) {
      const ids = buildOrderedFinalFormIds(skipped);
      expect(ids).toHaveLength(3);
      expect(ids).not.toContain(skipped);
      expect(ids[2]).toBe('heart-of-darkness');
    }
  });

  it('59. Heart of Darkness 不能被跳过', () => {
    const c = finalEncounterReadyCampaign();
    const broken = { ...c.actFourState, skippedFinalFormId: 'heart-of-darkness' as const };
    const pe = prepareFinalEncounter({ ...c, actFourState: broken }, { mode: 'prototype', seed: 1 });
    expect(pe.ok).toBe(false);
  });

  it('60. 首个有效 Form 正确', () => {
    const started = startFinalEncounter(prepareCampaign(), { mode: 'prototype', seed: 1 });
    const enc = started.campaign.actFourState.finalEncounterState!;
    expect(started.formId).toBe(enc.orderedFormIds[0]);
    expect(started.formIndex).toBe(0);
    expect(getActiveFinalFormId(started.campaign.actFourState)).toBe(enc.orderedFormIds[0]);
  });

  it('61. Form 死亡触发 Transition', () => {
    const started = startFinalEncounter(prepareCampaign(), { mode: 'prototype', seed: 1 });
    const active = started.campaign.actFourState.finalEncounterState!.activeFormId!;
    const df = defeatFinalForm(started.campaign, active);
    expect(df.ok).toBe(true);
    expect(df.hasNextForm).toBe(true);
    expect(df.allFormsDefeated).toBe(false);
    const enc = df.campaign.actFourState.finalEncounterState!;
    expect(enc.status).toBe('transitioning');
    expect(enc.transitionState).not.toBeNull();
  });

  it('62/63. 不恢复 Life / Stress', () => {
    let c = startFinalEncounter(prepareCampaign(), { mode: 'prototype', seed: 1 }).campaign;
    const active = c.actFourState.finalEncounterState!.activeFormId!;
    c = defeatFinalForm(c, active).campaign;
    const before = captureFormTransitionSnapshots(c);
    const tr = transitionToNextFinalForm(c, { mode: 'prototype', seed: 1 });
    expect(tr.ok).toBe(true);
    const after = captureFormTransitionSnapshots(tr.campaign);
    const violations = diffFormTransitionSnapshots(before, after);
    expect(violations).toEqual([]);
    expect(tr.violations).toEqual([]);
    // 逐字段确认 wounds / stress 不变
    for (const b of before) {
      const a = after.find((s) => s.heroId === b.heroId)!;
      expect(a.wounds).toBe(b.wounds);
      expect(a.stress).toBe(b.stress);
    }
  });

  it('64. 不允许 Rest', () => {
    const started = startFinalEncounter(prepareCampaign(), { mode: 'prototype', seed: 1 });
    expect(isRestBlockedDuringFinalEncounter(started.campaign.actFourState)).toBe(true);
  });

  it('65. 不允许 Change Stance', () => {
    const started = startFinalEncounter(prepareCampaign(), { mode: 'prototype', seed: 1 });
    expect(isStanceChangeBlockedBetweenForms(started.campaign.actFourState)).toBe(true);
    expect(started.campaign.actFourState.finalEncounterState!.noStanceChangeBetweenForms).toBe(true);
  });

  it('66. 使用同一 Room', () => {
    let c = startFinalEncounter(prepareCampaign(), { mode: 'prototype', seed: 1 }).campaign;
    const roomBefore = c.battle!.sourceRoomId;
    expect(roomBefore).toBe(PROTOTYPE_FINAL_ENCOUNTER_ROOM_ID);
    const active = c.actFourState.finalEncounterState!.activeFormId!;
    c = defeatFinalForm(c, active).campaign;
    const tr = transitionToNextFinalForm(c, { mode: 'prototype', seed: 1 });
    expect(tr.fromFormId).not.toBeNull();
    expect(tr.toFormId).not.toBeNull();
    expect(tr.campaign.battle!.sourceRoomId).toBe(roomBefore);
    expect(tr.campaign.battle!.sourceRoomId).toBe(PROTOTYPE_FINAL_ENCOUNTER_ROOM_ID);
  });

  it('67. Initiative 重建', () => {
    let c = startFinalEncounter(prepareCampaign(), { mode: 'prototype', seed: 1 }).campaign;
    const active = c.actFourState.finalEncounterState!.activeFormId!;
    c = defeatFinalForm(c, active).campaign;
    const tr = transitionToNextFinalForm(c, { mode: 'prototype', seed: 1 });
    expect(tr.initiativeRebuilt).toBe(true);
    // 4 名存活 Hero + 1 个 Form 单位
    expect(tr.campaign.battle!.initiativeOrder.length).toBe(5);
    expect(tr.campaign.battle!.initiativeOrder.some((id) => id.startsWith('u_'))).toBe(true);
  });

  it('68. Round 重置', () => {
    let c = startFinalEncounter(prepareCampaign(), { mode: 'prototype', seed: 1 }).campaign;
    const active = c.actFourState.finalEncounterState!.activeFormId!;
    c = defeatFinalForm(c, active).campaign;
    const tr = transitionToNextFinalForm(c, { mode: 'prototype', seed: 1 });
    expect(tr.round).toBe(1);
    expect(tr.campaign.battle!.round).toBe(1);
  });

  it('69. 不发 Form 级 XP', () => {
    let c = startFinalEncounter(prepareCampaign(), { mode: 'prototype', seed: 1 }).campaign;
    const before = totalHeroXp(c);
    const active = c.actFourState.finalEncounterState!.activeFormId!;
    c = defeatFinalForm(c, active).campaign;
    c = transitionToNextFinalForm(c, { mode: 'prototype', seed: 1 }).campaign;
    expect(totalHeroXp(c)).toBe(before);
  });

  it('70. Final Failure → Campaign Over', () => {
    const started = startFinalEncounter(prepareCampaign(), { mode: 'prototype', seed: 1 });
    const r = failFinalEncounter(started.campaign, '测试失败');
    expect(r.campaign.gamePhase).toBe('campaign-over');
    expect(isCampaignDefeat(r.campaign)).toBe(true);
  });

  it('71. 最后 Form 死亡 → Campaign Victory', () => {
    let c = finalEncounterReadyCampaign();
    c = prepareFinalEncounter(c, { mode: 'prototype', seed: 1 }).campaign;
    c = startFinalEncounter(c, { mode: 'prototype', seed: 1 }).campaign;
    let guard = 0;
    while (guard < 10) {
      const enc = c.actFourState.finalEncounterState!;
      if (!enc.activeFormId) break;
      const df = defeatFinalForm(c, enc.activeFormId);
      if (!df.ok) break;
      c = df.campaign;
      if (df.allFormsDefeated) break;
      const tr = transitionToNextFinalForm(c, { mode: 'prototype', seed: guard + 1 });
      if (!tr.ok) break;
      c = tr.campaign;
      guard += 1;
    }
    const rv = resolveCampaignVictory(c);
    expect(rv.ok).toBe(true);
    expect(isCampaignVictory(rv.campaign)).toBe(true);
    expect(rv.campaign.campaignOverReason?.startsWith(CAMPAIGN_VICTORY_REASON_PREFIX)).toBe(true);
    expect(getCampaignOutcome(rv.campaign)).toBe('victory');
  });
});

// ---------------------------------------------------------------------------
// Save / Migration（§29 项 72–82）
// ---------------------------------------------------------------------------

describe('Save / Migration', () => {
  it('72. Phase9E 存档可迁移（无 actFourState 的旧档）', () => {
    const pre = createNewCampaign();
    const preAny: any = { ...pre };
    delete preAny.actFourState;
    const migrated = migrateCampaignToLatest(preAny as CampaignState);
    expect(migrated.actFourState).toBeDefined();
    expect(migrated.actFourState.stage).toBe('locked');
    expect(migrated.actFourState.unlocked).toBe(false);
    expect(migrated.saveVersion).toBe(SAVE_VERSION);

    // 经 migrateSaveFile 的 v11 信封路径
    const raw = { version: 11, savedAt: '2024', campaign: preAny };
    const file = migrateSaveFile(raw);
    expect(file).not.toBeNull();
    expect(file!.campaign.actFourState.stage).toBe('locked');
    expect(file!.campaign.saveVersion).toBe(SAVE_VERSION);
  });

  it('73–79. 各阶段运行时可恢复', () => {
    // 走到 Final Encounter 已开始、并完成一次 Form 切换，使全部运行时字段齐备
    let c = finalEncounterReadyCampaign();
    c = prepareFinalEncounter(c, { mode: 'prototype', seed: 1 }).campaign;
    c = startFinalEncounter(c, { mode: 'prototype', seed: 1 }).campaign;
    const active = c.actFourState.finalEncounterState!.activeFormId!;
    c = defeatFinalForm(c, active).campaign;
    c = transitionToNextFinalForm(c, { mode: 'prototype', seed: 1 }).campaign;

    const old = { ...c, saveVersion: 11 } as CampaignState;
    const migrated = migrateCampaignToLatest(old);
    const a4 = migrated.actFourState;
    const src = c.actFourState;

    // 73 Quest 可恢复
    expect(a4.questDrawRecord?.selectedQuestId).toBe(src.questDrawRecord?.selectedQuestId);
    // 74 Layout 可恢复
    expect(a4.layoutDrawRecord?.selectedLayoutId).toBe(src.layoutDrawRecord?.selectedLayoutId);
    // 75 Boss Slot 可恢复
    expect(a4.bossSlotAssignment?.objectiveRoomSlotId).toBe(src.bossSlotAssignment?.objectiveRoomSlotId);
    // 76 Excavation Rest 可恢复
    expect(a4.excavationSiteStates.length).toBe(src.excavationSiteStates.length);
    expect(a4.excavationSiteStates.length).toBeGreaterThan(0);
    // 77 Final Hamlet 可恢复
    expect(a4.finalHamletState?.status).toBe(src.finalHamletState?.status);
    // 78 Active Form 可恢复
    expect(a4.finalEncounterState?.activeFormId).toBe(src.finalEncounterState?.activeFormId);
    // 79 Transition 可恢复
    expect(a4.formTransitionHistory.length).toBe(src.formTransitionHistory.length);
    expect(a4.formTransitionHistory.length).toBeGreaterThan(0);
    // 80 Hash 变化使用 Snapshot（contentHash 保留）
    expect(a4.contentRuntime?.contentHash).toBe(src.contentRuntime?.contentHash);
  });

  it('81. Victory 刷新不重复', () => {
    let c = finalEncounterReadyCampaign();
    c = prepareFinalEncounter(c, { mode: 'prototype', seed: 1 }).campaign;
    c = startFinalEncounter(c, { mode: 'prototype', seed: 1 }).campaign;
    let guard = 0;
    while (guard < 10) {
      const enc = c.actFourState.finalEncounterState!;
      if (!enc.activeFormId) break;
      const df = defeatFinalForm(c, enc.activeFormId);
      if (!df.ok) break;
      c = df.campaign;
      if (df.allFormsDefeated) break;
      const tr = transitionToNextFinalForm(c, { mode: 'prototype', seed: guard + 1 });
      if (!tr.ok) break;
      c = tr.campaign;
      guard += 1;
    }
    const r1 = resolveCampaignVictory(c);
    const r2 = resolveCampaignVictory(r1.campaign);
    expect(r1.ok).toBe(true);
    expect(r2.alreadyResolved).toBe(true);
    expect(isCampaignVictory(r2.campaign)).toBe(true);
  });

  it('82. 损坏 ActFourState 不白屏', () => {
    expect(() => sanitizeActFourState(null)).not.toThrow();
    expect(() => sanitizeActFourState(undefined)).not.toThrow();
    expect(() => sanitizeActFourState({})).not.toThrow();
    expect(() => sanitizeActFourState('garbage')).not.toThrow();

    const nullCase = sanitizeActFourState(null);
    expect(nullCase.unlocked).toBe(false);
    expect(nullCase.stage).toBe('locked');

    // 非法 stage 回退到 locked
    const badStage = sanitizeActFourState({ stage: 'bogus-stage' });
    expect(badStage.stage).toBe('locked');

    // unlocked 与 stage 冲突：unlocked=false 强制 locked
    const conflict = sanitizeActFourState({ unlocked: false, stage: 'guardian-victory' });
    expect(conflict.stage).toBe('locked');

    // unlocked=true 但 stage=locked → 保守为 post-third-threat-hamlet
    const unlockedLocked = sanitizeActFourState({ unlocked: true, stage: 'locked' });
    expect(unlockedLocked.unlocked).toBe(true);
    expect(unlockedLocked.stage).toBe('post-third-threat-hamlet');

    // Heart of Darkness 作为 skipped 被丢弃
    const heartSkip = sanitizeActFourState({ skippedFinalFormId: 'heart-of-darkness' });
    expect(heartSkip.skippedFinalFormId).toBeNull();

    // 非法数组字段回退为空数组
    const badArray = sanitizeActFourState({ excavationSiteStates: 'x', processedTransactionIds: 5 });
    expect(Array.isArray(badArray.excavationSiteStates)).toBe(true);
    expect(Array.isArray(badArray.processedTransactionIds)).toBe(true);

    // 初始状态仍是合法、可继续驱动的状态
    expect(createInitialActFourState().stage).toBe('locked');
    expect(createUnlockedActFourState().unlocked).toBe(true);
    expect(DARKEST_DUNGEON_LOCATION_ID).toBe('darkest-dungeon');
    expect(getDarkestDungeonQuestPool('prototype')).toHaveLength(3);
    expect(getDarkestDungeonLayoutPool('prototype')).toHaveLength(2);
    expect(getFinalFormPool('prototype')).toHaveLength(4);
    expect(buildDarkestDungeonRoomTokens().length).toBe(15);
    expect(canDrawDarkestDungeonQuest(createInitialActFourState())).toBe(false);
    expect(isActFourActive(createInitialActFourState())).toBe(false);
  });
});
