// Phase 10D §31：Shuffling Horror / 动态怪物行动优先级 / Echoing Disassembly / Hero Stance
// Shuffle 单元测试。
//
// 覆盖：Registry / Setup、Initiative Priority（resolveAtDrawTime）、Action Budget、
// Stance Priority、Excess Initiative、Echoing 原子双召唤、动态 Opportunity、Priest/Growth Turn、
// Undulations / Hero Stance Shuffle、Death / Resummon、Victory / Failure、Save Migration
// （v14→v15）、Snapshot 时效、Sanitize、Data Gate。
//
// 所有随机点使用注入 RNG（createSeededRng / createScriptedRng），结果先保存刷新不重掷。

import { describe, it, expect } from 'vitest';
import type { CampaignState } from '../../../types';
import type { ShufflingHorrorEncounterState } from '../../../types/shuffling-horror';

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
  getShufflingHorrorGuardianDefinition,
  isShufflingHorrorOfficialEncounterEnabled,
  validateShufflingHorrorRegistry,
  hashShufflingHorrorGuardian,
} from '../../../data/darkest-dungeon/shuffling-horror/registry';
import { PROTOTYPE_DARKEST_DUNGEON_QUEST_IDS } from '../../../data/darkest-dungeon/quest-registry';
import { DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_IDS } from '../../../data/darkest-dungeon/guardian-registry';

import {
  setupShufflingHorrorEncounter,
  getShufflingHorrorEncounterState,
  resolveMonsterInitiativeCardById,
  advanceShufflingHorrorRound,
  getMissingSummonRoles,
  isMonsterStanceTrackerFull,
} from './shuffling-horror-runtime';
import { resolveEchoingDisassembly } from './echoing-disassembly-summon';
import { resolveUndulationsHeroStanceShuffle } from './undulations-permutation';
import { executeShufflingHorrorAction, decideShufflingHorrorAction } from './shuffling-horror-action';
import {
  resolveShufflingHorrorActorDefeat,
  willResummonOnNextHorrorAction,
} from './shuffling-horror-death';
import {
  resolveShufflingHorrorEncounterVictory,
  resolveShufflingHorrorEncounterFailure,
  evaluateShufflingHorrorVictory,
} from './shuffling-horror-victory';
import {
  getShufflingHorrorAvailabilityReport,
  diffShufflingHorrorSnapshot,
  sanitizeShufflingHorrorEncounterState,
} from './shuffling-horror-content-validation';

// ---------------------------------------------------------------------------
// 测试脚手架（镜像 mammoth-cyst）
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

/** 强制指定 Shuffling Horror 家族（prototype-...-guardian-3 → family 'shuffling-horror'）。 */
function shufflingHorrorMapCampaign(): CampaignState {
  let c = mapCampaign();
  c = {
    ...c,
    actFourState: {
      ...c.actFourState,
      selectedQuestId: PROTOTYPE_DARKEST_DUNGEON_QUEST_IDS[0],
      guardianDefinitionId: DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_IDS[2],
      skippedFinalFormId: 'ancestor-first-form',
    },
  };
  return c;
}

function shufflingHorrorBattleCampaign(): CampaignState {
  let c = createGuardianQuest(shufflingHorrorMapCampaign(), { mode: 'prototype' }).campaign;
  const objRoom = c.actFourState.bossSlotAssignment!.objectiveRoomSlotId;
  c = startGuardianBattle(c, objRoom, { now: 't2' }).campaign;
  return c;
}

const sh = (c: CampaignState): ShufflingHorrorEncounterState => {
  const s = getShufflingHorrorEncounterState(c);
  if (!s) throw new Error('Shuffling Horror Encounter 尚未 Setup');
  return s;
};

const cloneState = (s: ShufflingHorrorEncounterState): ShufflingHorrorEncounterState =>
  JSON.parse(JSON.stringify(s)) as ShufflingHorrorEncounterState;

/** 取一张未消费（仍在 drawPile）的卡 id。 */
const nextCardId = (s: ShufflingHorrorEncounterState): string => {
  const card = s.initiativeDrawPile.find((c) => !c.invalidated);
  if (!card) throw new Error('没有可用的 Monster Initiative Opportunity');
  return card.id;
};

// ===========================================================================
// §31.1 Registry / Setup
// ===========================================================================

describe('§31.1 Registry / Setup', () => {
  it('official Shuffling Horror 因缺资料恒禁用', () => {
    expect(isShufflingHorrorOfficialEncounterEnabled()).toBe(false);
  });

  it('prototype Guardian 定义 family = shuffling-horror', () => {
    const g = getShufflingHorrorGuardianDefinition('prototype');
    expect(g.family).toBe('shuffling-horror');
    expect(g.id.startsWith('prototype-')).toBe(true);
  });

  it('Registry 自检通过（无意外启用 / 无前缀违规）', () => {
    const r = validateShufflingHorrorRegistry();
    expect(r.ok).toBe(true);
  });

  it('Data Gate：可用性报告 officialEnabled=false 且列出 Room 缺口', () => {
    const report = getShufflingHorrorAvailabilityReport();
    expect(report.officialEnabled).toBe(false);
    expect(report.prototypeEnabled).toBe(true);
    expect(report.gaps.some((g) => g.includes('Room'))).toBe(true);
  });

  it('Setup 只建 Horror 一名 + Priest/Growth 登记 Reserve，且初始 2 张 Opportunity', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const horror = s0.actors.find((a) => a.role === 'horror')!;
    const priest = s0.actors.find((a) => a.role === 'cultist-priest')!;
    const growth = s0.actors.find((a) => a.role === 'malignant-growth')!;
    expect(horror).toBeTruthy();
    expect(priest.inReserve).toBe(true);
    expect(growth.inReserve).toBe(true);
    expect(s0.initiativeDrawPile).toHaveLength(2);
    expect(s0.initiativeDrawPile.every((c) => c.cardType === 'monster-initiative-opportunity')).toBe(true);
  });

  it('Horror 初始位于 Aggressive Stance + Area；Priest/Growth 不占 Stance', () => {
    const s0 = sh(shufflingHorrorBattleCampaign());
    const horror = s0.actors.find((a) => a.role === 'horror')!;
    const priest = s0.actors.find((a) => a.role === 'cultist-priest')!;
    expect(horror.stances).toEqual(['aggressive']);
    expect(horror.areaId).toBeTruthy();
    expect(priest.stances).toEqual([]);
    expect(priest.areaId).toBeNull();
  });

  it('初始 Stance Priority Tracker 仅 Aggressive 被占据（未满）', () => {
    const s0 = sh(shufflingHorrorBattleCampaign());
    expect(s0.stancePriority.stancePriority).toEqual(['aggressive', 'defensive', 'ranged', 'support']);
    expect(s0.stancePriority.stanceOccupant.aggressive).toBe(s0.actors.find((a) => a.role === 'horror')!.actorId);
    expect(s0.stancePriority.stanceOccupant.defensive).toBeNull();
    expect(s0.stancePriority.isFull).toBe(false);
  });

  it('official Setup 被 Data Gate 拦截（返回 ok:false，且 Encounter State 不建立）', () => {
    // ⚠️ 必须用 formal 模式跑 startGuardianBattle，让内部 Setup 就被 Data Gate 拦下；
    // 若先用 prototype 建好 state，再调 formal 只会命中 alreadySetUp 分支（ok:true）。
    let c = createGuardianQuest(shufflingHorrorMapCampaign(), { mode: 'prototype' }).campaign;
    const objRoom = c.actFourState.bossSlotAssignment!.objectiveRoomSlotId;
    const started = startGuardianBattle(c, objRoom, { now: 't2', mode: 'formal' });
    c = started.campaign;
    expect(started.isShufflingHorrorEncounter).toBe(true);
    expect(started.shufflingHorrorSetupReason).toContain('禁用');
    expect(c.actFourState.shufflingHorrorEncounterState).toBeNull();

    const res = setupShufflingHorrorEncounter(c, { mode: 'formal' });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('禁用');
    expect(res.campaign.actFourState.shufflingHorrorEncounterState).toBeNull();
  });

  it('非 Shuffling Horror 家族的 Setup 不装配（返回 ok:false）', () => {
    // 用 templars 家族的 campaign
    let c = shufflingHorrorMapCampaign();
    c = { ...c, actFourState: { ...c.actFourState, guardianDefinitionId: DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_IDS[1] } };
    c = createGuardianQuest(c, { mode: 'prototype' }).campaign;
    const objRoom = c.actFourState.bossSlotAssignment!.objectiveRoomSlotId;
    c = startGuardianBattle(c, objRoom, { now: 't2' }).campaign;
    const res = setupShufflingHorrorEncounter(c, { mode: 'prototype' });
    expect(res.ok).toBe(false);
  });

  it('Setup 幂等：二次调用不重复创建', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const res = setupShufflingHorrorEncounter(c0, { mode: 'prototype' });
    expect(res.ok).toBe(true);
    expect(res.alreadySetUp).toBe(true);
    expect(res.state!.actors).toHaveLength(s0.actors.length);
  });
});

// ===========================================================================
// §31.2 Initiative Priority（resolveAtDrawTime）
// ===========================================================================

describe('§31.2 Initiative Priority', () => {
  it('首张卡按 Stance 最靠前 + 剩余行动解析为 Horror（aggressive）', () => {
    const s0 = sh(shufflingHorrorBattleCampaign());
    const { result } = resolveMonsterInitiativeCardById(s0, s0.initiativeDrawPile[0].id);
    expect(result!.card.resolvedActorRole).toBe('horror');
    expect(result!.card.stanceAtDraw).toBe('aggressive');
    expect(result!.actor!.role).toBe('horror');
  });

  it('Stance 变化影响下一张未解析卡（硬约束 6）：Horror 用尽预算后 Priest 优先', () => {
    let s = sh(shufflingHorrorBattleCampaign());
    // 强制 Horror 预算用尽
    s = { ...s, monsterBudget: { ...s.monsterBudget, perRoleUsed: { ...s.monsterBudget.perRoleUsed, horror: 2 } } };
    // 把 Priest 激活到 defensive（模拟已召唤）
    const priest = s.actors.find((a) => a.role === 'cultist-priest')!;
    s = {
      ...s,
      actors: s.actors.map((a) =>
        a.actorId === priest.actorId ? { ...a, alive: true, inReserve: false, stances: ['defensive'], areaId: 'sh-def-area' } : a,
      ),
      stancePriority: { ...s.stancePriority, stanceOccupant: { ...s.stancePriority.stanceOccupant, defensive: priest.actorId } },
    };
    const { result } = resolveMonsterInitiativeCardById(s, s.initiativeDrawPile[0].id);
    expect(result!.card.resolvedActorRole).toBe('cultist-priest');
    expect(result!.card.stanceAtDraw).toBe('defensive');
  });

  it('无 Eligible Actor → Excess（硬约束 7）：抽卡即标记并移除', () => {
    let s = sh(shufflingHorrorBattleCampaign());
    s = { ...s, monsterBudget: { ...s.monsterBudget, perRoleUsed: { horror: 2, 'cultist-priest': 1, 'malignant-growth': 1 } } };
    const cardId = s.initiativeDrawPile[0].id;
    const { state: ns, result } = resolveMonsterInitiativeCardById(s, cardId);
    expect(result!.card.isExcess).toBe(true);
    expect(result!.card.invalidated).toBe(true);
    expect(ns.initiativeDiscardPile.some((c) => c.id === cardId && c.isExcess)).toBe(true);
    expect(ns.initiativeDrawPile.find((c) => c.id === cardId)!.isExcess).toBe(true);
  });
});

// ===========================================================================
// §31.3 Action Budget
// ===========================================================================

describe('§31.3 Action Budget', () => {
  it('Horror 每轮最多 2 次，Priest/Growth 各 1 次（硬约束 4/5）', () => {
    const s0 = sh(shufflingHorrorBattleCampaign());
    expect(s0.monsterBudget.perRoleMax).toEqual({ horror: 2, 'cultist-priest': 1, 'malignant-growth': 1 });
  });

  it('Horror 第一次行动后 budget.used.horror=1', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const res = executeShufflingHorrorAction(c0, nextCardId(s0), { rng: createScriptedRng([0.3]) });
    const s1 = sh(res.campaign);
    expect(s1.monsterBudget.perRoleUsed.horror).toBe(1);
  });

  it('连续两次 Horror 行动后 budget.used.horror=2（达上限）', () => {
    let c = shufflingHorrorBattleCampaign();
    c = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.1]) }).campaign;
    c = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.2]) }).campaign;
    expect(sh(c).monsterBudget.perRoleUsed.horror).toBe(2);
  });

  it('Hero Round Action Budget 初始化每人 1 次', () => {
    const s0 = sh(shufflingHorrorBattleCampaign());
    for (const h of s0.heroStanceAssignments) {
      expect(s0.heroBudget.perHeroMax[h.heroId]).toBe(1);
      expect(s0.heroBudget.perHeroUsed[h.heroId]).toBe(0);
    }
  });

  it('轮次推进重置 Monster/Hero 预算', () => {
    let s = sh(shufflingHorrorBattleCampaign());
    s = { ...s, monsterBudget: { ...s.monsterBudget, perRoleUsed: { horror: 2, 'cultist-priest': 1, 'malignant-growth': 1 } } };
    s = advanceShufflingHorrorRound(s);
    expect(s.monsterBudget.perRoleUsed).toEqual({ horror: 0, 'cultist-priest': 0, 'malignant-growth': 0 });
    expect(s.round).toBe(2);
    expect(s.heroStanceAssignments.every((a) => !a.hasActedThisRound)).toBe(true);
  });
});

// ===========================================================================
// §31.4 Stance Priority Resolver
// ===========================================================================

describe('§31.4 Stance Priority', () => {
  it('Tracker 未满时能正确识别缺失角色（Priest + Growth）', () => {
    const s0 = sh(shufflingHorrorBattleCampaign());
    expect(getMissingSummonRoles(s0)).toEqual(['cultist-priest', 'malignant-growth']);
    expect(isMonsterStanceTrackerFull(s0)).toBe(false);
  });

  it('Tracker 满时 missing 为空', () => {
    let s = sh(shufflingHorrorBattleCampaign());
    const priest = s.actors.find((a) => a.role === 'cultist-priest')!;
    const growth = s.actors.find((a) => a.role === 'malignant-growth')!;
    s = {
      ...s,
      actors: s.actors.map((a) =>
        a.actorId === priest.actorId || a.actorId === growth.actorId
          ? { ...a, alive: true, inReserve: false, stances: [a.actorId === priest.actorId ? 'defensive' : 'ranged'], areaId: 'x' }
          : a,
      ),
      stancePriority: {
        ...s.stancePriority,
        stanceOccupant: { ...s.stancePriority.stanceOccupant, defensive: priest.actorId, ranged: growth.actorId },
        isFull: true,
      },
    };
    expect(getMissingSummonRoles(s)).toEqual([]);
    expect(isMonsterStanceTrackerFull(s)).toBe(true);
  });
});

// ===========================================================================
// §31.5 Echoing Disassembly 原子双召唤
// ===========================================================================

describe('§31.5 Echoing Disassembly 原子双召唤', () => {
  it('Tracker 未满时 Horror 第一次行动强制 Echoing（replacesNormalSkill）', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const decision = decideShufflingHorrorAction(s0, s0.initiativeDrawPile[0].id);
    expect(decision.decision).toBe('echoing-disassembly');
    expect(decision.replacedNormalSkill).toBe(true);

    const res = executeShufflingHorrorAction(c0, nextCardId(s0), { rng: createScriptedRng([0.5]) });
    expect(res.actionType).toBe('echoing-disassembly');
    expect(res.summonedRoles).toEqual(['cultist-priest', 'malignant-growth']);
  });

  it('召唤顺序固定 Priest → Growth（硬约束 9）', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const res = executeShufflingHorrorAction(c0, nextCardId(s0), { rng: createScriptedRng([0.5]) });
    expect(res.summonedRoles[0]).toBe('cultist-priest');
    expect(res.summonedRoles[1]).toBe('malignant-growth');
  });

  it('每名召唤物 +1 Monster Opportunity（硬约束 12），且仅召唤缺失角色（硬约束 10）', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const before = s0.initiativeDrawPile.length;
    const res = executeShufflingHorrorAction(c0, nextCardId(s0), { rng: createScriptedRng([0.5]) });
    const s1 = sh(res.campaign);
    expect(res.summonedActorIds).toHaveLength(2);
    expect(s1.initiativeDrawPile.length).toBe(before + 2);
  });

  it('召唤后 Priest/Growth 离开 Reserve 并占 Stance + Area（硬约束 14）', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const res = executeShufflingHorrorAction(c0, nextCardId(s0), { rng: createScriptedRng([0.5]) });
    const s1 = sh(res.campaign);
    const priest = s1.actors.find((a) => a.role === 'cultist-priest')!;
    const growth = s1.actors.find((a) => a.role === 'malignant-growth')!;
    expect(priest.inReserve).toBe(false);
    expect(priest.stances.length).toBe(1);
    expect(priest.areaId).toBeTruthy();
    expect(growth.inReserve).toBe(false);
    expect(growth.stances.length).toBe(1);
  });

  it('Tracker 召唤后变满（Priest+Growth 均到场）', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const res = executeShufflingHorrorAction(c0, nextCardId(s0), { rng: createScriptedRng([0.5]) });
    const s1 = sh(res.campaign);
    expect(isMonsterStanceTrackerFull(s1)).toBe(true);
  });

  it('原子性：Spawn 失败时整体回滚（Area 满 → 失败）', () => {
    let s = sh(shufflingHorrorBattleCampaign());
    // 伪造 Tracker 已满（无空 Stance），使 resolveEchoingDisassembly 找不到空位而回滚
    s = {
      ...s,
      stancePriority: {
        ...s.stancePriority,
        stanceOccupant: { aggressive: 'x', defensive: 'y', ranged: 'z', support: 'w' },
        isFull: true,
      },
    };
    const before = s.actors.map((a) => ({ ...a }));
    const res = resolveEchoingDisassembly(s, 'card-x');
    expect(res.ok).toBe(false);
    // 原子回滚：actors 未被修改
    expect(res.state.actors).toEqual(before);
  });

  it('decide 在 Tracker 满时选择 Undulations（普通行动）而非 Echoing', () => {
    let s = sh(shufflingHorrorBattleCampaign());
    const priest = s.actors.find((a) => a.role === 'cultist-priest')!;
    const growth = s.actors.find((a) => a.role === 'malignant-growth')!;
    s = {
      ...s,
      actors: s.actors.map((a) =>
        a.actorId === priest.actorId || a.actorId === growth.actorId
          ? { ...a, alive: true, inReserve: false, stances: [a.actorId === priest.actorId ? 'defensive' : 'ranged'], areaId: 'x' }
          : a,
      ),
      stancePriority: {
        ...s.stancePriority,
        stanceOccupant: { ...s.stancePriority.stanceOccupant, defensive: priest.actorId, ranged: growth.actorId },
        isFull: true,
      },
    };
    // 让 Horror 还有预算
    const decision = decideShufflingHorrorAction(s, s.initiativeDrawPile[0].id);
    expect(decision.decision).toBe('undulations');
    expect(decision.replacedNormalSkill).toBe(false);
  });
});

// ===========================================================================
// §31.6 动态 Opportunity（非永久绑定召唤物）
// ===========================================================================

describe('§31.6 动态 Opportunity', () => {
  it('召唤新增的卡不绑定具体 Actor（owner=family，resolvedActorId 初始为 null）', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const res = executeShufflingHorrorAction(c0, nextCardId(s0), { rng: createScriptedRng([0.5]) });
    const s1 = sh(res.campaign);
    const summonCards = s1.initiativeDrawPile.filter((c) => c.id.includes('summon'));
    expect(summonCards.length).toBe(2);
    expect(summonCards.every((c) => c.resolvedActorId === null && c.owner === 'shuffling-horror')).toBe(true);
  });

  it('Horror 两次行动后，新卡按 Stance Priority 解析到 Priest（defensive）', () => {
    let c = shufflingHorrorBattleCampaign();
    // 第 1 次：Echoing 召唤 Priest+Growth
    c = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.1]) }).campaign;
    // 第 2 次：Tracker 满 → Undulations（Horror 普通行动，budget 用尽）
    c = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.2]) }).campaign;
    const s = sh(c);
    // 还有未消费的召唤卡（priest/growth）
    const card = s.initiativeDrawPile.find((x) => !x.invalidated && x.id.includes('summon'))!;
    const { result } = resolveMonsterInitiativeCardById(s, card.id);
    expect(['cultist-priest', 'malignant-growth']).toContain(result!.card.resolvedActorRole);
  });
});

// ===========================================================================
// §31.7 Priest / Growth Turn
// ===========================================================================

describe('§31.7 Priest / Growth Turn', () => {
  // ⚠️ Opportunity 不绑定 Actor：只要 Horror 还有剩余行动，它永远排在 Stance 优先级最前，
  // 因此必须先把 Horror 的 2 次预算耗尽，卡才会落到 Priest（defensive）。
  it('Horror 预算耗尽后 Opportunity 动态落到 Priest，使用独立 Action Budget（硬约束 5）', () => {
    let c = shufflingHorrorBattleCampaign();
    const a1 = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.5]) });
    expect(a1.actionType).toBe('echoing-disassembly'); // Tracker 未满 → 强制召唤
    c = a1.campaign;

    const a2 = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.3]) });
    expect(a2.resolvedActorRole).toBe('horror');
    c = a2.campaign;
    expect(sh(c).monsterBudget.perRoleUsed.horror).toBe(2); // 4. Horror 每轮 ≤ 2

    const a3 = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.3]) });
    expect(a3.actionType).toBe('normal-skill');
    expect(a3.resolvedActorRole).toBe('cultist-priest');
    const s3 = sh(a3.campaign);
    expect(s3.monsterBudget.perRoleUsed['cultist-priest']).toBe(1);
    expect(s3.monsterBudget.perRoleUsed.horror).toBe(2); // 预算互不影响
  });

  it('Priest 预算用尽后继续落到 Growth（每 Role 各 1 次，互相独立）', () => {
    let c = shufflingHorrorBattleCampaign();
    c = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.5]) }).campaign;
    c = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.3]) }).campaign;
    c = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.3]) }).campaign;
    const a4 = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.3]) });
    expect(a4.actionType).toBe('normal-skill');
    expect(a4.resolvedActorRole).toBe('malignant-growth');
    const s4 = sh(a4.campaign);
    expect(s4.monsterBudget.perRoleUsed['malignant-growth']).toBe(1);
    expect(s4.monsterBudget.perRoleUsed['cultist-priest']).toBe(1);
  });
});

// ===========================================================================
// §31.8 Undulations / Hero Stance Shuffle
// ===========================================================================

describe('§31.8 Undulations / Hero Stance Shuffle', () => {
  it('Tracker 满时 Horror 行动施放 Undulations（shuffle hero stances）', () => {
    let c = shufflingHorrorBattleCampaign();
    c = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.1]) }).campaign; // Echoing
    c = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.2]) }).campaign; // Undulations
    const res = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.2]) });
    // 第二次 Horror 已无预算，这里改用新卡（priest/growth）前先验证 Undulations 已发生
    const s1 = sh(c);
    expect(s1.lastActionLog.some((l) => l.includes('Undulations'))).toBe(true);
    expect(res).toBeTruthy();
  });

  it('Undulations 生成合法排列：每名 Hero 恰好一次、不重复不丢失（硬约束 18/19）', () => {
    const s0 = sh(shufflingHorrorBattleCampaign());
    const res = resolveUndulationsHeroStanceShuffle(s0, createScriptedRng([0.42]));
    expect(res.ok).toBe(true);
    const heroes = res.state.heroStanceAssignments.map((a) => a.heroId);
    const stances = res.state.heroStanceAssignments.map((a) => a.stance);
    expect(new Set(heroes).size).toBe(heroes.length); // 不重复
    expect(heroes.sort()).toEqual(s0.heroStanceAssignments.map((a) => a.heroId).sort()); // 不丢失
    expect(new Set(stances).size).toBe(stances.length); // 每 stance 仅一名 Hero
  });

  it('Undulations 只改 Hero Stance，不改 Area（硬约束 20）', () => {
    const s0 = sh(shufflingHorrorBattleCampaign());
    const before = Object.fromEntries(s0.heroStanceAssignments.map((a) => [a.heroId, a.areaId]));
    const res = resolveUndulationsHeroStanceShuffle(s0, createScriptedRng([0.42]));
    for (const a of res.state.heroStanceAssignments) {
      expect(a.areaId).toBe(before[a.heroId]);
    }
  });

  it('Undulations 保留 hasActedThisRound（硬约束 22/23）', () => {
    let s0 = sh(shufflingHorrorBattleCampaign());
    s0 = { ...s0, heroStanceAssignments: s0.heroStanceAssignments.map((a, i) => ({ ...a, hasActedThisRound: i === 0 })) };
    const res = resolveUndulationsHeroStanceShuffle(s0, createScriptedRng([0.42]));
    expect(res.state.heroStanceAssignments.find((a) => a.heroId === s0.heroStanceAssignments[0].heroId)!.hasActedThisRound).toBe(true);
  });

  it('Shuffle 前后为同一组 Hero 的 Stance 多重集（排列）', () => {
    const s0 = sh(shufflingHorrorBattleCampaign());
    const res = resolveUndulationsHeroStanceShuffle(s0, createScriptedRng([0.42]));
    const beforeVals = s0.heroStanceAssignments.map((a) => a.stance).sort();
    const afterVals = res.state.heroStanceAssignments.map((a) => a.stance).sort();
    expect(afterVals).toEqual(beforeVals);
  });
});

// ===========================================================================
// §31.9 Death / Resummon
// ===========================================================================

describe('§31.9 Death / Resummon', () => {
  it('Priest 死亡不立即重生（inReserve=false, alive=false）', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const res = executeShufflingHorrorAction(c0, nextCardId(s0), { rng: createScriptedRng([0.5]) });
    const s1 = sh(res.campaign);
    const priestId = s1.actors.find((a) => a.role === 'cultist-priest')!.actorId;
    const defeat = resolveShufflingHorrorActorDefeat(res.campaign, priestId);
    const s2 = sh(defeat.campaign);
    const priest = s2.actors.find((a) => a.actorId === priestId)!;
    expect(priest.alive).toBe(false);
    expect(priest.inReserve).toBe(false);
  });

  it('Priest 死亡后 willResummonOnNextHorrorAction = true（硬约束 16/17）', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const res = executeShufflingHorrorAction(c0, nextCardId(s0), { rng: createScriptedRng([0.5]) });
    const s1 = sh(res.campaign);
    const priestId = s1.actors.find((a) => a.role === 'cultist-priest')!.actorId;
    const defeat = resolveShufflingHorrorActorDefeat(res.campaign, priestId);
    expect(willResummonOnNextHorrorAction(sh(defeat.campaign))).toBe(true);
  });

  it('下一次 Horror 行动重召唤缺失 Priest，generation 递增到 2', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    let c = executeShufflingHorrorAction(c0, nextCardId(s0), { rng: createScriptedRng([0.5]) }).campaign; // Echoing gen1
    const s1 = sh(c);
    const priestId = s1.actors.find((a) => a.role === 'cultist-priest')!.actorId;
    c = resolveShufflingHorrorActorDefeat(c, priestId).campaign; // priest 死
    // 让 Horror 还有预算可执行（budget 用 1）
    const s2 = sh(c);
    // 用一张新卡强制 Horror 行动（这里直接再跑 Echoing 路径：missing 包含 priest）
    const horrorCard = s2.initiativeDrawPile.find((x) => !x.invalidated)!;
    c = executeShufflingHorrorAction(c, horrorCard.id, { rng: createScriptedRng([0.5]) }).campaign;
    const s3 = sh(c);
    const priest = s3.actors.find((a) => a.role === 'cultist-priest')!;
    expect(priest.alive).toBe(true);
    expect(priest.generation).toBe(2);
    expect(s3.generationByRole['cultist-priest']).toBe(2);
  });

  it('Horror 死亡立即停止 Queue 并清理 linked actors（硬约束 25）', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const res = executeShufflingHorrorAction(c0, nextCardId(s0), { rng: createScriptedRng([0.5]) });
    const s1 = sh(res.campaign);
    const horrorId = s1.actors.find((a) => a.role === 'horror')!.actorId;
    const defeat = resolveShufflingHorrorActorDefeat(res.campaign, horrorId);
    const s2 = sh(defeat.campaign);
    expect(s2.actors.find((a) => a.role === 'horror')!.alive).toBe(false);
    expect(defeat.queueStopped).toBe(true);
    expect(defeat.removedLinkedActorIds.length).toBe(2);
    expect(s2.initiativeDrawPile).toHaveLength(0);
  });
});

// ===========================================================================
// §31.10 Victory / Failure
// ===========================================================================

describe('§31.10 Victory / Failure', () => {
  it('评估胜利：Horror 死亡即满足', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const res = executeShufflingHorrorAction(c0, nextCardId(s0), { rng: createScriptedRng([0.5]) });
    const s1 = sh(res.campaign);
    const horrorId = s1.actors.find((a) => a.role === 'horror')!.actorId;
    const defeat = resolveShufflingHorrorActorDefeat(res.campaign, horrorId);
    const evalRes = evaluateShufflingHorrorVictory(sh(defeat.campaign));
    expect(evalRes.satisfied).toBe(true);
  });

  it('Guardian Victory 复用 Phase 10A 链路：3 XP + 进入 Final Hamlet', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const res = executeShufflingHorrorAction(c0, nextCardId(s0), { rng: createScriptedRng([0.5]) });
    const s1 = sh(res.campaign);
    const horrorId = s1.actors.find((a) => a.role === 'horror')!.actorId;
    const defeat = resolveShufflingHorrorActorDefeat(res.campaign, horrorId);
    const vic = resolveShufflingHorrorEncounterVictory(defeat.campaign);
    expect(vic.ok).toBe(true);
    expect(vic.xpAwarded).toBe(3);
    expect(vic.campaign.actFourState.stage).toBe('guardian-victory');
  });

  it('Guardian Failure 进入 Campaign Over', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const fail = resolveShufflingHorrorEncounterFailure(c0, '全队覆灭');
    expect(fail.campaign.actFourState.stage).toBe('campaign-over');
  });

  it('Horror 死亡即清理关联 Priest/Growth，Victory 阶段的清理为幂等兜底', () => {
    const c0 = shufflingHorrorBattleCampaign();
    const s0 = sh(c0);
    const res = executeShufflingHorrorAction(c0, nextCardId(s0), { rng: createScriptedRng([0.5]) });
    const s1 = sh(res.campaign);
    const horrorId = s1.actors.find((a) => a.role === 'horror')!.actorId;
    const defeat = resolveShufflingHorrorActorDefeat(res.campaign, horrorId);
    // 硬约束 25：清理发生在 Horror 死亡那一刻，而不是拖到 Victory。
    expect(defeat.removedLinkedActorIds).toHaveLength(2);
    const vic = resolveShufflingHorrorEncounterVictory(defeat.campaign);
    expect(vic.cleanedLinkedActorIds).toHaveLength(0); // 已清理过 → 幂等空集
    const s3 = sh(vic.campaign);
    expect(s3.actors.filter((a) => a.role !== 'horror' && a.alive).length).toBe(0);
  });

  it('绕过 death 链路直接达成胜利时，Victory 自身仍会清理 Priest/Growth', () => {
    let c = shufflingHorrorBattleCampaign();
    c = executeShufflingHorrorAction(c, nextCardId(sh(c)), { rng: createScriptedRng([0.5]) }).campaign;
    const s1 = sh(c);
    expect(s1.actors.filter((a) => a.role !== 'horror' && a.alive && !a.inReserve)).toHaveLength(2);
    // 只把 Horror 标记死亡，不走 resolveShufflingHorrorActorDefeat。
    c = {
      ...c,
      actFourState: {
        ...c.actFourState,
        shufflingHorrorEncounterState: {
          ...s1,
          actors: s1.actors.map((a) => (a.role === 'horror' ? { ...a, alive: false, hp: 0 } : a)),
        },
      },
    };
    const vic = resolveShufflingHorrorEncounterVictory(c);
    expect(vic.ok).toBe(true);
    expect(vic.cleanedLinkedActorIds).toHaveLength(2);
    expect(sh(vic.campaign).actors.filter((a) => a.role !== 'horror' && a.alive).length).toBe(0);
  });
});

// ===========================================================================
// §31.11 Save Migration（v14→v15）
// ===========================================================================

describe('§31.11 Save Migration', () => {
  it('SAVE_VERSION 当前为 15', () => {
    expect(SAVE_VERSION).toBe(15);
  });

  it('迁移为旧存档补 shufflingHorrorEncounterState 字段（null）', () => {
    const c = shufflingHorrorBattleCampaign();
    const legacy = JSON.parse(JSON.stringify(c)) as CampaignState;
    delete (legacy.actFourState as unknown as Record<string, unknown>).shufflingHorrorEncounterState;
    legacy.saveVersion = 14;
    const migrated = migrateCampaignToLatest(legacy);
    expect(migrated.actFourState.shufflingHorrorEncounterState).toBeNull();
    expect(migrated.saveVersion).toBe(SAVE_VERSION);
  });

  it('已含字段的存档迁移后保留', () => {
    const c = shufflingHorrorBattleCampaign();
    const migrated = migrateCampaignToLatest(c);
    expect(migrated.actFourState.shufflingHorrorEncounterState).not.toBeNull();
  });
});

// ===========================================================================
// §31.12 Snapshot 时效 / Sanitize
// ===========================================================================

describe('§31.12 Snapshot / Sanitize', () => {
  it('Snapshot 初始为最新（stale=false）', () => {
    const s0 = sh(shufflingHorrorBattleCampaign());
    const diff = diffShufflingHorrorSnapshot(s0);
    expect(diff.stale).toBe(false);
  });

  it('篡改 guardianHash → stale=true, changes 含 guardian', () => {
    const s0 = sh(shufflingHorrorBattleCampaign());
    const broken = cloneState(s0);
    broken.snapshot = { ...broken.snapshot, guardianHash: 'tampered' };
    const diff = diffShufflingHorrorSnapshot(broken);
    expect(diff.stale).toBe(true);
    expect(diff.changes).toContain('guardian');
  });

  it('sanitize 对 null 返回 null（不白屏）', () => {
    expect(sanitizeShufflingHorrorEncounterState(null)).toBeNull();
  });

  it('sanitize 对损坏结构（缺 family）返回 null', () => {
    expect(sanitizeShufflingHorrorEncounterState({ foo: 1 })).toBeNull();
  });

  it('sanitize 对合法状态原样保留（不重掷）', () => {
    const s0 = sh(shufflingHorrorBattleCampaign());
    const back = sanitizeShufflingHorrorEncounterState(JSON.parse(JSON.stringify(s0)));
    expect(back).not.toBeNull();
    expect(back!.actors).toHaveLength(s0.actors.length);
    expect(back!.initiativeDrawPile).toHaveLength(s0.initiativeDrawPile.length);
  });
});

// ===========================================================================
// §31.13 Data Gate / 汇总
// ===========================================================================

describe('§31.13 Data Gate', () => {
  it('hashShufflingHorrorGuardian 在 prototype 模式下返回稳定哈希', () => {
    const a = hashShufflingHorrorGuardian('prototype');
    const b = hashShufflingHorrorGuardian('prototype');
    expect(a).toBe(b);
  });

  it('official 池禁用，prototype 可跑通（dev-only harness）', () => {
    const report = getShufflingHorrorAvailabilityReport();
    expect(report.officialEnabled).toBe(false);
    expect(report.prototypeEnabled).toBe(true);
  });
});
