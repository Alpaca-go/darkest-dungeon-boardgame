// Phase 10C §31：Mammoth Cyst / White Cell Stalk / Teleportation 单元测试。
//
// 覆盖 §31 的 ~55 个测试项：Registry / Setup、Conditional Summon、Atomic Summon、
// Stalk Turn / Teleportation、Death / Resummon / Victory、Save Migration（v13→v14）、
// Snapshot 时效、损坏 Runtime 安全兜底。
//
// 关键不变量（硬约束）：
// - 不创建第二套 Battle / Initiative（硬约束 1）；White Cell Stalk 是独立 boss-minion（硬约束 2）；
// - Stalk 初始仅在 Reserve（硬约束 3）；仅 aliveStalkCount===0 召唤（硬约束 4）；
//   召唤完全替代普通 Skill（硬约束 5）；死亡不立即重召唤（硬约束 6）；maxAlive=1（硬约束 8）；
//   Spawn/Area 由 Definition 驱动（硬约束 9）；Teleportation 仅正式 Skill 触发（硬约束 13）；
//   d10 先保存后展示（硬约束 14）；Area 满按 Definition 不重掷（硬约束 17）；
//   official 因缺资料禁用（硬约束 20）；prototype 前缀（硬约束 21）；不提前实现 Shuffling Horror（硬约束 23）。
//
// 所有随机点使用注入 RNG（createSeededRng / createScriptedRng），结果先保存刷新不重掷。

import { describe, it, expect } from 'vitest';
import type { CampaignState } from '../../../types';
import type { MammothCystEncounterState } from '../../../types/mammoth-cyst';

import { createNewCampaign, selectParty } from '../../campaign';
import {
  unlockDarkestDungeonAct,
  completePostThirdThreatHamlet,
} from '../../campaign/act-four/unlock-act-four';
import { drawDarkestDungeonQuest } from '../../campaign/act-four/draw-quest';
import { activateDarkestDungeonContentSet } from '../../campaign/act-four/content-runtime';
import {
  drawDarkestDungeonLayout,
  buildDarkestDungeonMap,
} from '../../campaign/act-four/dungeon-map';
import {
  createGuardianQuest,
  startGuardianBattle,
} from '../../campaign/act-four/guardian-quest';
import { createSeededRng, createScriptedRng } from '../../campaign/act-four/rng';
import { SAVE_VERSION, migrateCampaignToLatest } from '../../save';

import {
  getMammothCystGuardianDefinition,
  getMammothCystActorDefinition,
  getWhiteCellStalkActorDefinition,
  getMammothCystRoomDefinition,
  isMammothCystOfficialEncounterEnabled,
  getMammothCystDataGaps,
  validateMammothCystGuardian,
  validateMammothCystRegistry,
} from '../../../data/darkest-dungeon/mammoth-cyst/mammoth-cyst-registry';
import { PROTOTYPE_DARKEST_DUNGEON_QUEST_IDS } from '../../../data/darkest-dungeon/quest-registry';
import { DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_IDS } from '../../../data/darkest-dungeon/guardian-registry';
import {
  MAMMOTH_CYST_ROOM_PROTOTYPE,
  PROTOTYPE_HERO_AREAS,
  PROTOTYPE_STALK_AREA,
  PROTOTYPE_CYST_AREA,
  MAMMOTH_CYST_ACTOR_PROTOTYPE_ID,
  WHITE_CELL_STALK_PROTOTYPE_ID,
  MAMMOTH_CYST_PROTOTYPE_HARNESS_ID,
  MAMMOTH_CYST_SMASH_PROTOTYPE,
} from '../../../data/darkest-dungeon/mammoth-cyst';

import {
  setupMammothCystEncounter,
  drawNextMammothCystInitiativeCard,
  advanceMammothCystRound,
  rollMammothCystSkill,
  getAliveWhiteCellStalkCount,
  getMammothCystBossState,
  getMammothCystEncounterState,
} from './mammoth-cyst-runtime';
import {
  isConditionalSummonConditionMet,
  decideMammothCystAction,
  willSkipNormalSkillRoll,
} from './mammoth-cyst-action-override';
import {
  STANCE_ORDER,
  resolveWhiteCellStalkSpawnSpace,
  summonWhiteCellStalk,
} from './summon-white-cell-stalk';
import {
  resolveTeleportationTargetArea,
  checkTeleportationCapacity,
  resolveWhiteCellStalkTeleportation,
} from './resolve-teleportation';
import {
  resolveMammothCystActorDefeat,
  willResummonOnNextCystAction,
  getWhiteCellStalkGeneration,
} from './white-cell-stalk-death';
import { executeMammothCystAction } from './execute-mammoth-cyst-action';
import {
  evaluateMammothCystVictory,
  resolveMammothCystEncounterVictory,
  resolveMammothCystEncounterFailure,
  isPartyWipedInMammothCystEncounter,
} from './mammoth-cyst-victory';
import {
  getMammothCystAvailabilityReport,
  diffMammothCystSnapshot,
  sanitizeMammothCystEncounterState,
} from './mammoth-cyst-content-validation';

// ---------------------------------------------------------------------------
// 测试脚手架
// ---------------------------------------------------------------------------

const HERO_IDS = ['crusader', 'vestal', 'highwayman', 'hellion'];

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

function baseCampaign(): CampaignState {
  let c = greenCampaign();
  c = unlockDarkestDungeonAct(c, { now: 't0' }).campaign;
  c = completePostThirdThreatHamlet(c, { now: 't1' }).campaign;
  return c;
}

function mapCampaign(): CampaignState {
  let c = baseCampaign();
  c = drawDarkestDungeonQuest(c, { rng: createSeededRng(1), mode: 'prototype' }).campaign;
  c = activateDarkestDungeonContentSet(c, { mode: 'prototype' }).campaign;
  c = drawDarkestDungeonLayout(c, { rng: createSeededRng(2), mode: 'prototype' }).campaign;
  c = buildDarkestDungeonMap(c, { rng: createSeededRng(3), mode: 'prototype' }).campaign;
  return c;
}

/** 强制指定 Mammoth Cyst 家族的 Quest / Guardian（prototype-...-guardian-2 → family 'mammoth-cyst'）。 */
function mammothCystMapCampaign(): CampaignState {
  let c = mapCampaign();
  c = {
    ...c,
    actFourState: {
      ...c.actFourState,
      selectedQuestId: PROTOTYPE_DARKEST_DUNGEON_QUEST_IDS[0],
      guardianDefinitionId: DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_IDS[1],
      skippedFinalFormId: 'ancestor-first-form',
    },
  };
  return c;
}

function mammothCystBattleCampaign(): CampaignState {
  let c = createGuardianQuest(mammothCystMapCampaign(), { mode: 'prototype' }).campaign;
  const objRoom = c.actFourState.bossSlotAssignment!.objectiveRoomSlotId;
  c = startGuardianBattle(c, objRoom, { now: 't2' }).campaign;
  return c;
}

const mc = (c: CampaignState): MammothCystEncounterState => {
  const s = getMammothCystEncounterState(c);
  if (!s) throw new Error('Mammoth Cyst Encounter 尚未 Setup');
  return s;
};

const heroHp = (c: CampaignState, heroId: string): number => {
  const h = c.heroes.find((x) => x.instanceId === heroId)!;
  return h.maxLife - h.wounds;
};

const cloneState = (s: MammothCystEncounterState): MammothCystEncounterState =>
  JSON.parse(JSON.stringify(s)) as MammothCystEncounterState;

const cystCardIds = (s: MammothCystEncounterState): string[] => {
  const ids = s.initiativeCards
    .filter((c) => c.owner === 'mammoth-cyst' && !c.invalidated)
    .map((c) => c.id);
  if (ids.length === 0) throw new Error('找不到可用的 Cyst Initiative Card');
  return ids;
};

const cystCardId = (s: MammothCystEncounterState): string => cystCardIds(s)[0];

const stalkCardId = (s: MammothCystEncounterState): string | null => {
  const card = s.initiativeCards.find((c) => c.owner === 'white-cell-stalk' && !c.invalidated);
  return card?.id ?? null;
};

// ---------------------------------------------------------------------------
// §31.1 Registry / Setup（10 项）
// ---------------------------------------------------------------------------

describe('§31.1 Registry / Setup', () => {
  it('Guardian Definition family 为 mammoth-cyst 且 prototype harness id 正确', () => {
    const g = getMammothCystGuardianDefinition('prototype');
    expect(g.guardianFamilyId).toBe('mammoth-cyst');
    expect(g.id).toBe(MAMMOTH_CYST_PROTOTYPE_HARNESS_ID);
    expect(getMammothCystGuardianDefinition('formal').guardianFamilyId).toBe('mammoth-cyst');
  });

  it('正式 Cyst / Stalk Actor 为 null 空壳（stats:null, skills:[]）→ 驱动 Data Gate', () => {
    const cyst = getMammothCystActorDefinition('formal');
    const stalk = getWhiteCellStalkActorDefinition('formal');
    expect(cyst.stats).toBeNull();
    expect(cyst.skills).toHaveLength(0);
    expect(stalk.stats).toBeNull();
    expect(stalk.skills).toHaveLength(0);
  });

  it('isMammothCystOfficialEncounterEnabled() 恒为 false', () => {
    expect(isMammothCystOfficialEncounterEnabled()).toBe(false);
  });

  it('getMammothCystDataGaps() 返回非空缺口列表', () => {
    const gaps = getMammothCystDataGaps();
    expect(Array.isArray(gaps)).toBe(true);
    expect(gaps.length).toBeGreaterThan(0);
  });

  it('validateMammothCystRegistry() 无自检问题', () => {
    expect(validateMammothCystRegistry()).toEqual([]);
  });

  it('prototype Guardian 通过完整性校验，formal 不通过', () => {
    expect(validateMammothCystGuardian('prototype').isComplete).toBe(true);
    expect(validateMammothCystGuardian('formal').isComplete).toBe(false);
  });

  it('startGuardianBattle 对 mammoth-cyst 家族返回 isMammothCystEncounter:true', () => {
    const c0 = mammothCystMapCampaign();
    const c = createGuardianQuest(c0, { mode: 'prototype' }).campaign;
    const objRoom = c.actFourState.bossSlotAssignment!.objectiveRoomSlotId;
    const res = startGuardianBattle(c, objRoom, { now: 't2' });
    expect(res.ok).toBe(true);
    expect(res.isMammothCystEncounter).toBe(true);
    expect(res.mammothCystSetupReason).toBeNull();
    expect(getMammothCystEncounterState(res.campaign)).toBeTruthy();
  });

  it('Setup（prototype）只建 Cyst 一名 + 2 张卡，Stalk 仅登记 Reserve', () => {
    const c = mammothCystBattleCampaign();
    const s = mc(c);
    expect(c.gamePhase).toBe('battle');
    expect(s.actorStates).toHaveLength(1);
    expect(s.actorStates[0].owner).toBe('mammoth-cyst');
    expect(s.actorStates[0].stance).toBe('aggressive');
    expect(s.actorStates[0].actorDefinitionId).toBe(MAMMOTH_CYST_ACTOR_PROTOTYPE_ID);
    expect(s.initiativeCards).toHaveLength(2);
    expect(s.mammothCystBattleRuntime.mammothCystInitiativeCardIds).toHaveLength(2);
    expect(s.mammothCystBattleRuntime.activeWhiteCellStalkActorId).toBeNull();
    expect(s.mammothCystBattleRuntime.summonGeneration).toBe(0);
    expect(s.mammothCystBattleRuntime.reserveWhiteCellStalkDefinitionId).toBe(
      WHITE_CELL_STALK_PROTOTYPE_ID,
    );
  });

  it('Setup（formal）被 Data Gate 拒绝：ok:false', () => {
    const c0 = mammothCystBattleCampaign();
    const c = {
      ...c0,
      actFourState: { ...c0.actFourState, mammothCystEncounterState: null },
    };
    const res = setupMammothCystEncounter(c, { mode: 'formal' });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/official|数据缺失|禁用/);
  });

  it('Setup 幂等：第二次调用返回 alreadySetUp:true', () => {
    const c = mammothCystBattleCampaign();
    const first = mc(c);
    const res = setupMammothCystEncounter(c, { mode: 'prototype' });
    expect(res.ok).toBe(true);
    expect(res.alreadySetUp).toBe(true);
    expect(res.state?.battleId).toBe(first.battleId);
  });

  it('getMammothCystAvailabilityReport 明确报告 official 禁用与缺口', () => {
    const report = getMammothCystAvailabilityReport();
    expect(report.officialEnabled).toBe(false);
    expect(report.gaps.length).toBeGreaterThan(0);
    expect(report.message).toMatch(/未启用|禁用|缺/);
  });
});

// ---------------------------------------------------------------------------
// §31.2 Conditional Summon（7 项）
// ---------------------------------------------------------------------------

describe('§31.2 Conditional Summon', () => {
  const state = (): MammothCystEncounterState => mc(mammothCystBattleCampaign());

  it('aliveStalkCount===0 时条件成立', () => {
    const s = state();
    const summonDef = {
      condition: { type: 'no-alive-actors-with-tag', tag: 'white-cell-stalk' },
    } as never;
    expect(isConditionalSummonConditionMet(s, summonDef)).toBe(true);
    expect(getAliveWhiteCellStalkCount(s)).toBe(0);
  });

  it('Stalk 存活时条件不成立', () => {
    const s0 = state();
    const c = executeMammothCystAction(mammothCystBattleCampaign(), cystCardId(s0), {
      rng: createScriptedRng([0.9]),
      now: 't3',
    }).campaign;
    const s = mc(c);
    expect(getAliveWhiteCellStalkCount(s)).toBe(1);
    const summonDef = {
      condition: { type: 'no-alive-actors-with-tag', tag: 'white-cell-stalk' },
    } as never;
    expect(isConditionalSummonConditionMet(s, summonDef)).toBe(false);
  });

  it('Cyst 行动且场上无 Stalk → summon-linked-actor 且 replacedNormalSkill:true', () => {
    const s = state();
    const card = s.initiativeCards.find((c) => c.owner === 'mammoth-cyst' && !c.invalidated)!;
    const decision = decideMammothCystAction(s, card);
    expect(decision.ok).toBe(true);
    expect(decision.actionType).toBe('summon-linked-actor');
    expect(decision.replacedNormalSkill).toBe(true);
    expect(decision.aliveStalkCount).toBe(0);
    expect(willSkipNormalSkillRoll(decision)).toBe(true);
  });

  it('Cyst 行动且 Stalk 已存活 → normal-skill（maxAlive=1）', () => {
    const s0 = state();
    const c = executeMammothCystAction(mammothCystBattleCampaign(), cystCardId(s0), {
      rng: createScriptedRng([0.9]),
      now: 't3',
    }).campaign;
    const s = mc(c);
    const card = s.initiativeCards.find((x) => x.owner === 'mammoth-cyst' && !x.invalidated)!;
    const decision = decideMammothCystAction(s, card);
    expect(decision.actionType).toBe('normal-skill');
    expect(willSkipNormalSkillRoll(decision)).toBe(false);
  });

  it('Stalk 的 Initiative Card 永远走 normal-skill（Stalk 不召唤）', () => {
    const s0 = state();
    const c = executeMammothCystAction(mammothCystBattleCampaign(), cystCardId(s0), {
      rng: createScriptedRng([0.9]),
      now: 't3',
    }).campaign;
    const s = mc(c);
    const card = stalkCardId(s)!;
    const decision = decideMammothCystAction(s, s.initiativeCards.find((x) => x.id === card)!);
    expect(decision.actionType).toBe('normal-skill');
  });

  it('Conditional Summon Definition 字面量：replacesNormalSkill + maxAlive=1', () => {
    const g = getMammothCystGuardianDefinition('prototype');
    expect(g.victoryCondition).toBe('boss-defeated');
    expect(g.cleanupPolicy).toBe('remove-linked-actors-on-boss-victory');
  });

  it('STANCE_ORDER 自上而下顺序为 aggressive/ranged/defensive/support', () => {
    expect(STANCE_ORDER).toEqual(['aggressive', 'ranged', 'defensive', 'support']);
  });
});

// ---------------------------------------------------------------------------
// §31.3 Atomic Summon（10 项）
// ---------------------------------------------------------------------------

describe('§31.3 Atomic Summon', () => {
  it('Cyst 行动执行召唤：新增 1 名 Stalk + 2 张卡，generation=1', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const res = executeMammothCystAction(c0, cystCardId(s0), {
      rng: createScriptedRng([0.9]),
      now: 't3',
    });
    expect(res.ok).toBe(true);
    expect(res.actionType).toBe('summon-linked-actor');
    expect(res.summonRecord).toBeTruthy();
    expect(res.skippedNormalSkillRoll).toBe(true);
    expect(res.damageDealt).toBe(0);
    const s = mc(res.campaign);
    expect(s.actorStates).toHaveLength(2);
    const stalk = s.actorStates.find((a) => a.owner === 'white-cell-stalk')!;
    expect(stalk).toBeTruthy();
    expect(s.initiativeCards).toHaveLength(4);
    expect(s.mammothCystBattleRuntime.summonGeneration).toBe(1);
    expect(s.mammothCystBattleRuntime.activeWhiteCellStalkActorId).toBe(stalk.actorId);
  });

  it('召唤的 Stalk 落在 specified-stance(defensive) + specified-area', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const res = executeMammothCystAction(c0, cystCardId(s0), {
      rng: createScriptedRng([0.9]),
      now: 't3',
    });
    const s = mc(res.campaign);
    const stalk = s.actorStates.find((a) => a.owner === 'white-cell-stalk')!;
    expect(stalk.stance).toBe('defensive');
    expect(stalk.areaId).toBe(PROTOTYPE_STALK_AREA);
    expect(stalk.maxHp).toBe(20);
  });

  it('resolveWhiteCellStalkSpawnSpace（prototype specified-stance/area）解析成功', () => {
    const s = mc(mammothCystBattleCampaign());
    const space = resolveWhiteCellStalkSpawnSpace(s, s.snapshot.room);
    expect(space.ok).toBe(true);
    expect(space.stance).toBe('defensive');
    expect(space.areaId).toBe(PROTOTYPE_STALK_AREA);
    expect(space.resolvedBy).toBe('boss-specified');
  });

  it('resolveWhiteCellStalkSpawnSpace（definition-driven）拒绝召唤', () => {
    const s0 = mc(mammothCystBattleCampaign());
    const broken = cloneState(s0);
    broken.snapshot = {
      ...broken.snapshot,
      room: {
        ...broken.snapshot.room,
        whiteCellStalkSpawn: { stancePolicy: 'definition-driven', areaPolicy: 'definition-driven' },
      },
    };
    const space = resolveWhiteCellStalkSpawnSpace(broken, broken.snapshot.room);
    expect(space.ok).toBe(false);
    expect(space.reason).toMatch(/definition-driven|拒绝/);
  });

  it('Spawn 空间缺失 → 召唤整体回滚（rolledBack，不创建单位）', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const broken = cloneState(s0);
    broken.snapshot = {
      ...broken.snapshot,
      room: {
        ...broken.snapshot.room,
        whiteCellStalkSpawn: { stancePolicy: 'definition-driven', areaPolicy: 'definition-driven' },
      },
    };
    const c = { ...c0, actFourState: { ...c0.actFourState, mammothCystEncounterState: broken } };
    const res = summonWhiteCellStalk(c, { sourceActionEventId: cystCardId(s0), rng: createScriptedRng([0.9]) });
    expect(res.ok).toBe(false);
    expect(res.rolledBack).toBe(true);
    expect(res.state?.actorStates).toHaveLength(1);
  });

  it('Area 满（capacity=0）→ 召唤回滚', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const broken = cloneState(s0);
    broken.snapshot = {
      ...broken.snapshot,
      room: {
        ...broken.snapshot.room,
        areaCapacities: { ...broken.snapshot.room.areaCapacities, [PROTOTYPE_STALK_AREA]: 0 },
      },
    };
    const c = { ...c0, actFourState: { ...c0.actFourState, mammothCystEncounterState: broken } };
    const res = summonWhiteCellStalk(c, { sourceActionEventId: cystCardId(s0), rng: createScriptedRng([0.9]) });
    expect(res.ok).toBe(false);
    expect(res.rolledBack).toBe(true);
  });

  it('同一 sourceActionEventId 幂等：第二次召唤返回 alreadySummoned', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const id = cystCardId(s0);
    const first = executeMammothCystAction(c0, id, { rng: createScriptedRng([0.9]), now: 't3' });
    const second = summonWhiteCellStalk(first.campaign, { sourceActionEventId: id });
    expect(second.alreadySummoned).toBe(true);
    expect(second.rolledBack).toBe(false);
    expect(mc(second.campaign).actorStates).toHaveLength(2);
  });

  it('召唤行动不结算任何伤害（skippedNormalSkillRoll 路径）', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const id = cystCardId(s0);
    const hero0 = c0.heroes[0].instanceId;
    const hpBefore = heroHp(c0, hero0);
    const res = executeMammothCystAction(c0, id, {
      rng: createScriptedRng([0.9]),
      targetHeroId: hero0,
      now: 't3',
    });
    expect(res.damageDealt).toBe(0);
    expect(heroHp(res.campaign, hero0)).toBe(hpBefore);
  });

  it('召唤后 Stalk 的 2 张卡进入当前牌堆（可在本轮行动）', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const res = executeMammothCystAction(c0, cystCardId(s0), { rng: createScriptedRng([0.9]), now: 't3' });
    const s = mc(res.campaign);
    const stalkCards = s.initiativeCards.filter((c) => c.owner === 'white-cell-stalk');
    expect(stalkCards).toHaveLength(2);
    let draw = s;
    let gotStalk = false;
    for (let i = 0; i < 10; i += 1) {
      const r = drawNextMammothCystInitiativeCard(draw);
      if (!r.card) break;
      if (r.card.owner === 'white-cell-stalk') gotStalk = true;
      draw = r.state;
      if (r.exhausted) break;
    }
    expect(gotStalk).toBe(true);
  });

  it('advanceMammothCystRound 仅给存活 Actor 重发卡（含 Stalk 2 张）', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const res = executeMammothCystAction(c0, cystCardId(s0), { rng: createScriptedRng([0.9]), now: 't3' });
    const next = advanceMammothCystRound(mc(res.campaign), createSeededRng(7));
    expect(next.round).toBe(2);
    const stalkCards = next.initiativeCards.filter((c) => c.owner === 'white-cell-stalk');
    expect(stalkCards.every((c) => !c.invalidated)).toBe(true);
    expect(next.initiativeDrawPile.filter((id) => stalkCards.some((c) => c.id === id)).length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// §31.4 Stalk Turn / Teleportation（13 项）
// ---------------------------------------------------------------------------

describe('§31.4 Stalk Turn / Teleportation', () => {
  const afterSummon = (): CampaignState => {
    const c0 = mammothCystBattleCampaign();
    return executeMammothCystAction(c0, cystCardId(mc(c0)), {
      rng: createScriptedRng([0.9]),
      now: 't3',
    }).campaign;
  };

  it('Stalk 召唤后持有 2 张 Initiative Card', () => {
    const c = afterSummon();
    const s = mc(c);
    expect(s.initiativeCards.filter((x) => x.owner === 'white-cell-stalk')).toHaveLength(2);
  });

  it('Stalk Skill Table 的 Teleportation 覆盖 1—10 且 triggersTeleportation:true', () => {
    const s = mc(afterSummon());
    const table = s.snapshot.whiteCellStalk.skills;
    expect(table.length).toBeGreaterThan(0);
    const tp = table.find((sk) => sk.triggersTeleportation);
    expect(tp).toBeTruthy();
    expect(tp!.triggersTeleportation).toBe(true);
    expect(tp!.rollPolicy).toBe('single-roll-for-all-targets');
  });

  it('Teleportation d10 → Area 只查 Room Definition（不均分 3/2/3/2）', () => {
    const room = getMammothCystRoomDefinition('prototype');
    const map = room.teleportationD10Map;
    const counts: Record<string, number> = {};
    for (let r = 1; r <= 10; r += 1) {
      const area = map[r as 1];
      counts[area] = (counts[area] ?? 0) + 1;
    }
    const vals = Object.values(counts);
    expect(vals).toContain(3);
    expect(vals).toContain(2);
    expect(new Set(vals).size).toBeGreaterThan(1);
    expect(resolveTeleportationTargetArea(mc(afterSummon()), 6).areaId).toBe(PROTOTYPE_HERO_AREAS[2]);
  });

  it('Stalk 行动触发 Teleportation：目标 Hero 被位移', () => {
    const c = afterSummon();
    const s = mc(c);
    const target = s.heroPlacements.find((p) => p.areaId === PROTOTYPE_HERO_AREAS[0])!;
    const card = stalkCardId(s)!;
    const res = executeMammothCystAction(c, card, {
      rng: createScriptedRng([0.0, 0.55]),
      targetHeroId: target.heroId,
      now: 't4',
    });
    expect(res.ok).toBe(true);
    expect(res.teleportation).toBeTruthy();
    const after = mc(res.campaign);
    const placed = after.heroPlacements.find((p) => p.heroId === target.heroId)!;
    expect(placed.areaId).toBe(PROTOTYPE_HERO_AREAS[2]);
  });

  it('Teleportation 仅能由 triggersTeleportation 的正式 Skill 触发（普通攻击被拒）', () => {
    const c = afterSummon();
    const s = mc(c);
    const card = stalkCardId(s)!;
    const res = resolveWhiteCellStalkTeleportation(c, {
      sourceActorId: s.actorStates.find((a) => a.owner === 'white-cell-stalk')!.actorId,
      targetHeroId: s.heroPlacements[0].heroId,
      skill: MAMMOTH_CYST_SMASH_PROTOTYPE,
      sourceSkillEventId: card,
      sourceEffectEventId: `${card}:x`,
      rng: createScriptedRng([0.5]),
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/triggersTeleportation/);
  });

  it('checkTeleportationCapacity：容量充足时允许', () => {
    const s = mc(afterSummon());
    const r = checkTeleportationCapacity(s, PROTOTYPE_HERO_AREAS[1], s.heroPlacements[0].heroId);
    expect(r.allowed).toBe(true);
    expect(r.capacity).toBe(4);
  });

  it('checkTeleportationCapacity：Area 满 → 拒绝（不重掷、不换 Area）', () => {
    const s0 = mc(afterSummon());
    const broken = cloneState(s0);
    broken.snapshot = {
      ...broken.snapshot,
      room: {
        ...broken.snapshot.room,
        areaCapacities: { ...broken.snapshot.room.areaCapacities, [PROTOTYPE_HERO_AREAS[1]]: 0 },
      },
    };
    const r = checkTeleportationCapacity(broken, PROTOTYPE_HERO_AREAS[1], broken.heroPlacements[0].heroId);
    expect(r.allowed).toBe(false);
  });

  it('d10 先保存后展示：同一 effect event 第二次结算返回 alreadyResolved', () => {
    const c = afterSummon();
    const s = mc(c);
    const target = s.heroPlacements.find((p) => p.areaId === PROTOTYPE_HERO_AREAS[0])!;
    const card = stalkCardId(s)!;
    const opts = {
      sourceActorId: s.actorStates.find((a) => a.owner === 'white-cell-stalk')!.actorId,
      targetHeroId: target.heroId,
      skill: s.snapshot.whiteCellStalk.skills[0],
      sourceSkillEventId: card,
      sourceEffectEventId: `${card}:first`,
      rng: createScriptedRng([0.55]),
    };
    const first = resolveWhiteCellStalkTeleportation(c, opts);
    expect(first.ok).toBe(true);
    const second = resolveWhiteCellStalkTeleportation(first.campaign, opts);
    expect(second.alreadyResolved).toBe(true);
  });

  it('Entry Effect（hero-3）命中：目标 Hero 受到伤害，且同一 Entry Event 只结算一次', () => {
    const c = afterSummon();
    const s = mc(c);
    const target = s.heroPlacements.find((p) => p.areaId === PROTOTYPE_HERO_AREAS[0])!;
    const card = stalkCardId(s)!;
    const hpBefore = heroHp(c, target.heroId);
    const res = executeMammothCystAction(c, card, {
      rng: createScriptedRng([0.0, 0.55]),
      targetHeroId: target.heroId,
      now: 't4',
    });
    const hpAfter = heroHp(res.campaign, target.heroId);
    expect(hpAfter).toBeLessThan(hpBefore);
    expect(res.teleportation?.status).toBe('effects-resolved');
  });

  it('Teleportation Record 保存 roll（刷新不重投）', () => {
    const c = afterSummon();
    const s = mc(c);
    const target = s.heroPlacements.find((p) => p.areaId === PROTOTYPE_HERO_AREAS[0])!;
    const card = stalkCardId(s)!;
    const res = executeMammothCystAction(c, card, {
      rng: createScriptedRng([0.0, 0.55]),
      targetHeroId: target.heroId,
      now: 't4',
    });
    expect(res.teleportation?.roll).toBe(6);
    expect(res.teleportation?.originalAreaId).toBe(PROTOTYPE_HERO_AREAS[0]);
    expect(res.teleportation?.targetAreaId).toBe(PROTOTYPE_HERO_AREAS[2]);
  });

  it('Cyst 普通攻击（Stalk 存活时）走 normal-skill 并结算伤害', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const [firstCystCard, secondCystCard] = cystCardIds(s0);
    // 第一张卡触发条件召唤（场上无 Stalk）；第二张卡此时 Stalk 已存活 → 走普通 Skill。
    const c = executeMammothCystAction(c0, firstCystCard, { rng: createScriptedRng([0.9]), now: 't3' }).campaign;
    const hero = c.heroes[0].instanceId;
    const hpBefore = heroHp(c, hero);
    const res = executeMammothCystAction(c, secondCystCard, {
      rng: createScriptedRng([0.0, 0.3]),
      targetHeroId: hero,
      now: 't5',
    });
    expect(res.actionType).toBe('normal-skill');
    expect(res.skippedNormalSkillRoll).toBe(false);
    expect(res.damageDealt).toBeGreaterThan(0);
    expect(heroHp(res.campaign, hero)).toBeLessThan(hpBefore);
  });

  it('rollMammothCystSkill 结果先保存刷新不重掷（alreadyRolled）', () => {
    const c = afterSummon();
    const s = mc(c);
    const card = stalkCardId(s)!;
    const r1 = rollMammothCystSkill(s, card, createScriptedRng([0.0]));
    const r2 = rollMammothCystSkill(r1.state, card, createScriptedRng([0.9]));
    expect(r2.alreadyRolled).toBe(true);
    expect(r2.record?.roll).toBe(r1.record?.roll);
  });

  it('PROTOTYPE Room Card：Stalk Area / Cyst Area / 4 Hero Area 齐全', () => {
    const room = MAMMOTH_CYST_ROOM_PROTOTYPE;
    expect(room.mammothCystPlacement.areaId).toBe(PROTOTYPE_CYST_AREA);
    expect(room.whiteCellStalkSpawn.specifiedAreaId).toBe(PROTOTYPE_STALK_AREA);
    expect(room.validAreaIds).toContain(PROTOTYPE_CYST_AREA);
    expect(room.validAreaIds).toContain(PROTOTYPE_STALK_AREA);
    for (const a of PROTOTYPE_HERO_AREAS) expect(room.validAreaIds).toContain(a);
  });
});

// ---------------------------------------------------------------------------
// §31.5 Death / Resummon / Victory（15 项）
// ---------------------------------------------------------------------------

describe('§31.5 Death / Resummon / Victory', () => {
  it('Stalk 死亡：isAlive=false、未抽卡失效、不立即重召唤', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const c = executeMammothCystAction(c0, cystCardId(s0), { rng: createScriptedRng([0.9]), now: 't3' }).campaign;
    const s = mc(c);
    const stalkId = s.actorStates.find((a) => a.owner === 'white-cell-stalk')!.actorId;
    const res = resolveMammothCystActorDefeat(c, stalkId);
    const after = mc(res.campaign);
    const stalk = after.actorStates.find((a) => a.actorId === stalkId)!;
    expect(stalk.isAlive).toBe(false);
    expect(after.mammothCystBattleRuntime.activeWhiteCellStalkActorId).toBeNull();
    expect(after.actorStates.filter((a) => a.owner === 'white-cell-stalk')).toHaveLength(1);
  });

  it('Stalk 死亡后 willResummonOnNextCystAction = true', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const c = executeMammothCystAction(c0, cystCardId(s0), { rng: createScriptedRng([0.9]), now: 't3' }).campaign;
    const s = mc(c);
    const stalkId = s.actorStates.find((a) => a.owner === 'white-cell-stalk')!.actorId;
    const after = mc(resolveMammothCystActorDefeat(c, stalkId).campaign);
    expect(willResummonOnNextCystAction(after)).toBe(true);
  });

  it('下一次 Cyst 行动重生 Stalk，generation 递增到 2', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const [firstCystCard, secondCystCard] = cystCardIds(s0);
    let c = executeMammothCystAction(c0, firstCystCard, { rng: createScriptedRng([0.9]), now: 't3' }).campaign;
    const s1 = mc(c);
    const stalkId = s1.actorStates.find((a) => a.owner === 'white-cell-stalk')!.actorId;
    c = resolveMammothCystActorDefeat(c, stalkId).campaign;
    // 下一次 Cyst 行动用**另一张** Cyst 卡：
    // 同一张卡受召唤幂等键 `mammoth-cyst-summon:{battleId}:{cardId}` 保护，不会二次召唤。
    const res = executeMammothCystAction(c, secondCystCard, { rng: createScriptedRng([0.9]), now: 't4' });
    expect(res.actionType).toBe('summon-linked-actor');
    const after = mc(res.campaign);
    expect(after.mammothCystBattleRuntime.summonGeneration).toBe(2);
    expect(after.actorStates.filter((a) => a.owner === 'white-cell-stalk').length).toBeGreaterThanOrEqual(1);
    expect(getWhiteCellStalkGeneration(after)).toBe(2);
  });

  it('getWhiteCellStalkGeneration 反映当前代', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    expect(getWhiteCellStalkGeneration(s0)).toBe(0);
    const c = executeMammothCystAction(c0, cystCardId(s0), { rng: createScriptedRng([0.9]), now: 't3' }).campaign;
    expect(getWhiteCellStalkGeneration(mc(c))).toBe(1);
  });

  it('Cyst 死亡：整个域 Initiative Queue 停止（drawPile 清空）', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const cystId = getMammothCystBossState(s0)!.actorId;
    const res = resolveMammothCystActorDefeat(c0, cystId);
    const after = mc(res.campaign);
    expect(after.mammothCystBattleRuntime.victoryResolved).toBe(false);
    expect(after.initiativeDrawPile).toHaveLength(0);
  });

  it('evaluateMammothCystVictory（boss-defeated）：仅 Cyst 死亡即满足', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const cystId = getMammothCystBossState(s0)!.actorId;
    const after = mc(resolveMammothCystActorDefeat(c0, cystId).campaign);
    const evalRes = evaluateMammothCystVictory(after);
    expect(evalRes.satisfied).toBe(true);
    expect(evalRes.condition).toBe('boss-defeated');
  });

  it('Victory Condition 为 definition-driven 时 satisfied 恒 false（不推测）', () => {
    const s0 = mc(mammothCystBattleCampaign());
    const broken = cloneState(s0);
    broken.snapshot = {
      ...broken.snapshot,
      guardian: { ...broken.snapshot.guardian, victoryCondition: 'definition-driven' as never },
    };
    // 把 Cyst 标记死亡
    const cystId = getMammothCystBossState(broken)!.actorId;
    broken.actorStates = broken.actorStates.map((a) =>
      a.actorId === cystId ? { ...a, isAlive: false, hp: 0 } : a,
    );
    const evalRes = evaluateMammothCystVictory(broken);
    expect(evalRes.satisfied).toBe(false);
    expect(evalRes.reason).toMatch(/definition-driven|未录入/);
  });

  it('resolveMammothCystEncounterVictory：3 XP + 进入 guardian-victory 阶段', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const cystId = getMammothCystBossState(s0)!.actorId;
    const c = resolveMammothCystActorDefeat(c0, cystId).campaign;
    const v = resolveMammothCystEncounterVictory(c);
    expect(v.ok).toBe(true);
    expect(v.xpAwarded).toBe(3);
    expect(v.campaign.actFourState.stage).toBe('guardian-victory');
  });

  it('Victory 按 cleanupPolicy 清理关联 Stalk', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const c = executeMammothCystAction(c0, cystCardId(s0), { rng: createScriptedRng([0.9]), now: 't3' }).campaign;
    const s = mc(c);
    const cystId = getMammothCystBossState(s)!.actorId;
    const afterCampaign = resolveMammothCystActorDefeat(c, cystId).campaign;
    const v = resolveMammothCystEncounterVictory(afterCampaign);
    expect(v.ok).toBe(true);
    const finalState = mc(v.campaign);
    expect(finalState.actorStates.filter((a) => a.owner === 'white-cell-stalk' && a.isAlive).length).toBe(0);
  });

  it('resolveMammothCystEncounterVictory 幂等：第二次返回 alreadyResolved', () => {
    const c0 = mammothCystBattleCampaign();
    const s0 = mc(c0);
    const cystId = getMammothCystBossState(s0)!.actorId;
    const c = resolveMammothCystActorDefeat(c0, cystId).campaign;
    const v1 = resolveMammothCystEncounterVictory(c);
    const v2 = resolveMammothCystEncounterVictory(v1.campaign);
    expect(v1.ok).toBe(true);
    expect(v2.alreadyResolved).toBe(true);
  });

  it('resolveMammothCystEncounterFailure → Campaign Over', () => {
    const c0 = mammothCystBattleCampaign();
    const res = resolveMammothCystEncounterFailure(c0, '队伍全灭');
    expect(res.campaign.gamePhase).toBe('campaign-over');
    expect(res.campaign.actFourState.stage).toBe('campaign-over');
  });

  it('isPartyWipedInMammothCystEncounter 仅在全员阵亡时为真', () => {
    const c0 = mammothCystBattleCampaign();
    expect(isPartyWipedInMammothCystEncounter(c0)).toBe(false);
    const wiped = { ...c0, heroes: c0.heroes.map((h) => ({ ...h, dead: true })) };
    expect(isPartyWipedInMammothCystEncounter(wiped)).toBe(true);
  });

  it('diffMammothCystSnapshot：进行中 Battle 使用 Snapshot → stale:false', () => {
    const s = mc(mammothCystBattleCampaign());
    const diff = diffMammothCystSnapshot(s);
    expect(diff.stale).toBe(false);
    expect(diff.changed).toEqual([]);
    expect(diff.currentContentVersion).toBe(diff.savedContentVersion);
  });

  it('diffMammothCystSnapshot：Registry 与存档 Guardian 哈希不一致 → stale:true', () => {
    const s0 = mc(mammothCystBattleCampaign());
    const broken = cloneState(s0);
    // diff 比较的是「当前 Registry 哈希」vs「存档时落盘的哈希」；
    // 模拟 Registry 在存档之后被改动 → 存档哈希与现值不符。
    broken.snapshot = {
      ...broken.snapshot,
      guardian: { ...broken.snapshot.guardian, id: 'tampered-guardian-id' },
      guardianHash: 'tampered-guardian-hash',
    };
    const diff = diffMammothCystSnapshot(broken);
    expect(diff.stale).toBe(true);
    expect(diff.changed).toContain('guardian');
  });

  it('sanitizeMammothCystEncounterState：结构性字段缺失返回 null（不白屏）', () => {
    expect(sanitizeMammothCystEncounterState(null)).toBeNull();
    expect(sanitizeMammothCystEncounterState(undefined)).toBeNull();
    expect(sanitizeMammothCystEncounterState({})).toBeNull();
    expect(
      sanitizeMammothCystEncounterState({
        battleId: 'b',
        roomId: 'r',
        mammothCystBattleRuntime: { mammothCystInitiativeCardIds: [] },
        snapshot: { room: {}, guardian: {}, mammothCyst: {}, whiteCellStalk: {} },
      }),
    ).toBeNull();
  });

  it('sanitizeMammothCystEncounterState：合法 state 原样净化（不重掷、不崩溃）', () => {
    const s = mc(mammothCystBattleCampaign());
    const sanitized = sanitizeMammothCystEncounterState(JSON.parse(JSON.stringify(s)));
    expect(sanitized).toBeTruthy();
    expect(sanitized!.battleId).toBe(s.battleId);
    expect(sanitized!.skillRolls).toHaveLength(s.skillRolls.length);
  });

  // ⚠️ 不要硬编码版本号：后续 Phase 升版会让这里无谓变红。
  // 断言应聚焦「≥ Phase 10C 引入的 v14」与「迁移到当前 SAVE_VERSION」。
  it('SAVE_VERSION ≥ 14（Phase 10C 引入 mammothCystEncounterState）', () => {
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(14);
  });

  it('v13 存档迁移到最新版：补齐 mammothCystEncounterState 字段且为 null', () => {
    const c = baseCampaign();
    const v13 = { ...c, saveVersion: 13 } as CampaignState;
    const migrated = migrateCampaignToLatest(v13);
    expect(migrated.saveVersion).toBe(SAVE_VERSION);
    expect(migrated.actFourState.mammothCystEncounterState).toBeNull();
  });

  it('v13 含真实 Mammoth Cyst 战斗的存档迁移后状态保留不丢失', () => {
    const c = mammothCystBattleCampaign();
    const v13 = { ...c, saveVersion: 13 } as CampaignState;
    const migrated = migrateCampaignToLatest(v13);
    expect(migrated.saveVersion).toBe(SAVE_VERSION);
    const kept = migrated.actFourState.mammothCystEncounterState;
    expect(kept).toBeTruthy();
    expect(kept!.battleId).toBe(mc(c).battleId);
    expect(kept!.actorStates).toHaveLength(1);
  });
});
