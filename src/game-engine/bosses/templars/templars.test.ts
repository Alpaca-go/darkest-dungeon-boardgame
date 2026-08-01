// Phase 10B §30：The Templars / Dual Boss / Spiked Pit 单元测试。
//
// 覆盖 §30 的 ~82 个测试项，全部走 prototype harness（happy-path），
// formal 路径断言被 Data Gate 拒绝。所有随机点用注入 RNG（createSeededRng /
// createScriptedRng），结果先保存刷新不重掷。
//
// 关键不变量：
// - 不创建第二套 Battle / Initiative（硬约束 1）；两名 Templar 是独立 Boss Actor（硬约束 2）；
// - 四张 Initiative Card 各自绑定具体 Actor（硬约束 3）；每名 Templar 独立 d10 Skill Table（硬约束 4）；
// - 只有 Body Slam 命中 Hero 才触发 Pit Toss（硬约束 6）；Miss 不掷 d10（硬约束 7）；
// - d10 → Pit 映射只来自 Room Definition 且不均分（硬约束 9）；Pit Toss 原子事务（硬约束 11）；
// - 单名死亡只失效自己卡（硬约束 12）；Victory Rule 缺失不推测（硬约束 10）；
// - official 永久禁用（§3 / §6）；未实现 Phase 10C。

import { describe, it, expect } from 'vitest';
import type { CampaignState } from '../../../types';
import type { TemplarsEncounterState } from '../../../types/templars';

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
import { SAVE_VERSION, validateSaveFile, migrateCampaignToLatest } from '../../save';

import {
  getTemplarsGuardianDefinition,
  getTemplarsVictoryRule,
  isTemplarsOfficialEncounterEnabled,
  getTemplarsDataGaps,
  validateTemplarsGuardian,
  validateTemplarsRegistry,
} from '../../../data/darkest-dungeon/templars/templars-registry';
import { PROTOTYPE_DARKEST_DUNGEON_QUEST_IDS } from '../../../data/darkest-dungeon/quest-registry';
import { DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_IDS } from '../../../data/darkest-dungeon/guardian-registry';
import { PROTOTYPE_PIT_A_ID, PROTOTYPE_PIT_B_ID, PROTOTYPE_PIT_C_ID } from '../../../data/darkest-dungeon/templars/templars-room';
import {
  TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
  TEMPLAR_IMPALER_PROTOTYPE_ID,
  TEMPLAR_WARLORD_PROTOTYPE_ID,
} from '../../../data/darkest-dungeon/templars/ids';

import {
  setupTemplarsEncounter,
  drawNextTemplarInitiativeCard,
  advanceTemplarsRound,
  rollTemplarSkill,
  getTemplarSkillTable,
  selectTemplarSkillByRoll,
  resolveTemplarDefeat,
  getTemplarsEncounterState,
  getTemplarActorState,
  getTemplarActorStateByRole,
  getAliveTemplarActorIds,
  isTemplarAlive,
  getTemplarsHeroPlacement,
  getRemainingInitiativeCardCount,
  TEMPLAR_IMPALER_BATTLE_POSITION,
  TEMPLAR_WARLORD_BATTLE_POSITION,
} from './templars-runtime';
import {
  evaluateBodySlamHook,
  skillTriggersPitToss,
} from './body-slam-hook';
import { resolvePitToss, getLastPitTossForHero, getPitTossD10Map } from './resolve-pit-toss';
import {
  evaluateDualBossVictory,
  evaluateTemplarsVictory,
  resolveTemplarsEncounterVictory,
  resolveTemplarsEncounterFailure,
  isPartyWipedInTemplarsEncounter,
} from './templars-victory';
import {
  buildDualBossEncounterState,
  checkDualBossStructure,
  areAllDualBossMembersDefeated,
} from './dual-boss-encounter';
import {
  getTemplarsAvailabilityReport,
  diffTemplarsSnapshot,
  sanitizeTemplarsEncounterState,
} from './templars-content-validation';
import {
  resolveTemplarsEndTurnPitEffects,
  isHeroInAnyPit,
  getPitOccupants,
  getHazardEventsByTrigger,
  SPIKED_PIT_IS_BATTLE_ACTOR,
} from './templars-pit-triggers';

// ---------------------------------------------------------------------------
// 测试脚手架（复用 act-four.test.ts 的模式，强制指定 Templars 家族）
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

/** 强制指定 Templars 家族的 Quest / Guardian，使 startGuardianBattle 触发双 Boss Setup。 */
function templarsMapCampaign(): CampaignState {
  let c = mapCampaign();
  c = {
    ...c,
    actFourState: {
      ...c.actFourState,
      selectedQuestId: PROTOTYPE_DARKEST_DUNGEON_QUEST_IDS[0],
      guardianDefinitionId: DARKEST_DUNGEON_PROTOTYPE_GUARDIAN_IDS[0],
      skippedFinalFormId: 'ancestor-first-form',
    },
  };
  return c;
}

function templarsBattleCampaign(): CampaignState {
  let c = createGuardianQuest(templarsMapCampaign(), { mode: 'prototype' }).campaign;
  const objRoom = c.actFourState.bossSlotAssignment!.objectiveRoomSlotId;
  c = startGuardianBattle(c, objRoom, { now: 't2' }).campaign;
  return c;
}

const ts = (c: CampaignState): TemplarsEncounterState => {
  const s = getTemplarsEncounterState(c);
  if (!s) throw new Error('Templars Encounter 尚未 Setup');
  return s;
};

const heroHp = (c: CampaignState, heroId: string): number => {
  const h = c.heroes.find((x) => x.instanceId === heroId)!;
  return h.maxLife - h.wounds;
};
const heroStress = (c: CampaignState, heroId: string): number =>
  c.heroes.find((x) => x.instanceId === heroId)!.stress;
const totalHeroXp = (c: CampaignState): number =>
  c.heroes.reduce((s, h) => s + (h.xpState?.currentXp ?? h.xp), 0);

// ---------------------------------------------------------------------------
// §30.1 Setup & Data Gate
// ---------------------------------------------------------------------------

describe('§30.1 Setup & Data Gate', () => {
  it('setupTemplarsEncounter（prototype）返回 ok:true 并建立双 Boss 状态', () => {
    const c = templarsBattleCampaign();
    const s = ts(c);
    expect(s).toBeTruthy();
    expect(c.gamePhase).toBe('battle');
    expect(c.battle?.monsters.length).toBe(2);
  });

  it('startGuardianBattle 对 templars 家族返回 isTemplarsEncounter:true', () => {
    const c0 = templarsMapCampaign();
    const c = createGuardianQuest(c0, { mode: 'prototype' }).campaign;
    const objRoom = c.actFourState.bossSlotAssignment!.objectiveRoomSlotId;
    const res = startGuardianBattle(c, objRoom, { now: 't2' });
    expect(res.ok).toBe(true);
    expect(res.isTemplarsEncounter).toBe(true);
    expect(res.templarsSetupReason).toBeNull();
    expect(getTemplarsEncounterState(res.campaign)).toBeTruthy();
  });

  it('setupTemplarsEncounter（formal）被 Data Gate 拒绝：ok:false', () => {
    const c0 = templarsBattleCampaign();
    // 模拟「尚未 Setup」：清空 templarsEncounterState，保留 guardianBattleId 以通过前置检查
    const c = {
      ...c0,
      actFourState: { ...c0.actFourState, templarsEncounterState: null },
    };
    const res = setupTemplarsEncounter(c, { mode: 'formal' });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/official|数据缺失|禁用/);
  });

  it('Setup 幂等：第二次调用返回 alreadySetUp:true', () => {
    const c = templarsBattleCampaign();
    const first = ts(c);
    const res = setupTemplarsEncounter(c, { mode: 'prototype' });
    expect(res.ok).toBe(true);
    expect(res.alreadySetUp).toBe(true);
    expect(res.state?.battleId).toBe(first.battleId);
  });

  it('缺少 guardianQuestState 时 Setup 失败', () => {
    const c = baseCampaign();
    const res = setupTemplarsEncounter(c, { mode: 'prototype' });
    expect(res.ok).toBe(false);
  });

  it('Guardian Battle 未开始时 Setup 失败', () => {
    const c = createGuardianQuest(templarsMapCampaign(), { mode: 'prototype' }).campaign;
    const res = setupTemplarsEncounter(c, { mode: 'prototype' });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/Guardian Battle/);
  });

  it('两名 Templar 是独立 Boss Actor（无 Group Actor，单位数=2）', () => {
    const s = ts(templarsBattleCampaign());
    expect(s.actorStates.length).toBe(2);
    expect(s.actorStates.map((a) => a.role).sort()).toEqual(['impaler', 'warlord']);
    expect(s.templarsBattleRuntime.impalerActorId).not.toBe(s.templarsBattleRuntime.warlordActorId);
  });

  it('Impaler / Warlord 固定 Stance 与 Battle Position（规则书 verified）', () => {
    const s = ts(templarsBattleCampaign());
    const imp = getTemplarActorStateByRole(s, 'impaler')!;
    const war = getTemplarActorStateByRole(s, 'warlord')!;
    expect(imp.stance).toBe('aggressive');
    expect(war.stance).toBe('ranged');
    expect(s.templarsBattleRuntime.impalerActorId).toBe(`u_${TEMPLAR_IMPALER_PROTOTYPE_ID}`);
    expect(s.templarsBattleRuntime.warlordActorId).toBe(`u_${TEMPLAR_WARLORD_PROTOTYPE_ID}`);
    expect(TEMPLAR_IMPALER_BATTLE_POSITION).toBe(1);
    expect(TEMPLAR_WARLORD_BATTLE_POSITION).toBe(2);
  });

  it('isTemplarsOfficialEncounterEnabled() 恒为 false（Data Gate 门槛）', () => {
    expect(isTemplarsOfficialEncounterEnabled()).toBe(false);
  });

  it('validateTemplarsGuardian(formal).isComplete === false，prototype 为 true', () => {
    expect(validateTemplarsGuardian('formal').isComplete).toBe(false);
    expect(validateTemplarsGuardian('prototype').isComplete).toBe(true);
  });

  it('getTemplarsDataGaps() 非空（报告禁用根因）', () => {
    expect(getTemplarsDataGaps().length).toBeGreaterThan(0);
  });

  it('getTemplarsAvailabilityReport().officialEnabled === false', () => {
    const r = getTemplarsAvailabilityReport();
    expect(r.officialEnabled).toBe(false);
    expect(r.message).toMatch(/未启用|prototype/);
  });

  it('validateTemplarsRegistry() 不产生 issue（official 禁用 + prototype 自洽）', () => {
    expect(validateTemplarsRegistry()).toEqual([]);
  });

  it('buildDualBossEncounterState 装配 prototype Victory Rule', () => {
    const def = getTemplarsGuardianDefinition('prototype');
    const st = buildDualBossEncounterState(def, getTemplarsVictoryRule('prototype'), ['a', 'b']);
    expect(st.victoryRule).not.toBeNull();
    expect(st.victoryRule?.type).toBe('all-listed-boss-actors-defeated');
  });

  it('checkDualBossStructure 对 prototype Encounter ok:true；单成员 ok:false', () => {
    const def = getTemplarsGuardianDefinition('prototype');
    expect(checkDualBossStructure(def).ok).toBe(true);
    const bad = {
      ...def,
      bossMembers: [def.bossMembers[0]],
    } as unknown as Parameters<typeof checkDualBossStructure>[0];
    expect(checkDualBossStructure(bad).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §30.2 2 + 2 Initiative
// ---------------------------------------------------------------------------

describe('§30.2 2 + 2 Initiative', () => {
  it('恰好 4 张 Initiative Card', () => {
    const s = ts(templarsBattleCampaign());
    expect(s.initiativeCards.length).toBe(4);
  });

  it('2 张绑定 Impaler、2 张绑定 Warlord，role 正确', () => {
    const s = ts(templarsBattleCampaign());
    const impCards = s.initiativeCards.filter((c) => c.role === 'impaler');
    const warCards = s.initiativeCards.filter((c) => c.role === 'warlord');
    expect(impCards.length).toBe(2);
    expect(warCards.length).toBe(2);
    expect(impCards.every((c) => c.actorId === s.templarsBattleRuntime.impalerActorId)).toBe(true);
    expect(warCards.every((c) => c.actorId === s.templarsBattleRuntime.warlordActorId)).toBe(true);
  });

  it('每张卡 index 为 0 或 1', () => {
    const s = ts(templarsBattleCampaign());
    for (const c of s.initiativeCards) {
      expect(c.index === 0 || c.index === 1).toBe(true);
    }
  });

  it('初始每张 Actor 各有 2 张可用卡（getRemainingInitiativeCardCount）', () => {
    const s = ts(templarsBattleCampaign());
    expect(getRemainingInitiativeCardCount(s, s.templarsBattleRuntime.impalerActorId)).toBe(2);
    expect(getRemainingInitiativeCardCount(s, s.templarsBattleRuntime.warlordActorId)).toBe(2);
  });

  it('连续抽 4 张后 exhausted:true，且每次抽到合法未失效卡', () => {
    const s0 = ts(templarsBattleCampaign());
    let s = s0;
    let draws = 0;
    let lastExhausted = false;
    for (let i = 0; i < 4; i += 1) {
      const r = drawNextTemplarInitiativeCard(s);
      expect(r.ok).toBe(true);
      expect(r.card).not.toBeNull();
      expect(r.card!.invalidated).toBe(false);
      lastExhausted = r.exhausted;
      s = r.state;
      draws += 1;
    }
    expect(draws).toBe(4);
    expect(lastExhausted).toBe(true);
  });

  it('抽卡不重洗剩余牌堆（刷新用同一 state 重放顺序一致）', () => {
    const s0 = ts(templarsBattleCampaign());
    const r1 = drawNextTemplarInitiativeCard(s0);
    // 模拟刷新：持久化后再抽，应从持久化的牌堆取同一张（未被重洗）
    const persisted = JSON.parse(JSON.stringify(r1.state)) as TemplarsEncounterState;
    const a = drawNextTemplarInitiativeCard(persisted);
    const b = drawNextTemplarInitiativeCard(persisted);
    expect(a.card?.id).toBe(b.card?.id);
  });

  it('advanceTemplarsRound 重发存活 Actor 的卡（死亡 Actor 不发卡）', () => {
    let c = templarsBattleCampaign();
    const impId = ts(c).templarsBattleRuntime.impalerActorId;
    c = resolveTemplarDefeat(c, impId, { now: 'd1' }).campaign;
    let s = advanceTemplarsRound(ts(c), createSeededRng(7));
    expect(s.initiativeCards.filter((cc) => cc.actorId === impId).every((cc) => cc.invalidated)).toBe(true);
    const warId = s.templarsBattleRuntime.warlordActorId;
    expect(getRemainingInitiativeCardCount(s, warId)).toBe(2);
    expect(getRemainingInitiativeCardCount(s, impId)).toBe(0);
  });

  it('drawNextTemplarInitiativeCard 跳过已失效卡', () => {
    let c = templarsBattleCampaign();
    const impId = ts(c).templarsBattleRuntime.impalerActorId;
    c = resolveTemplarDefeat(c, impId, { now: 'd1' }).campaign;
    let s = advanceTemplarsRound(ts(c), createSeededRng(7));
    const r = drawNextTemplarInitiativeCard(s);
    expect(r.card?.actorId).toBe(s.templarsBattleRuntime.warlordActorId);
  });
});

// ---------------------------------------------------------------------------
// §30.3 单名死亡只失效自己卡
// ---------------------------------------------------------------------------

describe('§30.3 单名死亡只失效自己卡（硬约束 12）', () => {
  it('击败 Impaler 后只失效其 2 张卡，Warlord 卡保留', () => {
    let c = templarsBattleCampaign();
    const s0 = ts(c);
    const impId = s0.templarsBattleRuntime.impalerActorId;
    const warId = s0.templarsBattleRuntime.warlordActorId;
    const res = resolveTemplarDefeat(c, impId, { now: 'd1' });
    expect(res.ok).toBe(true);
    expect(res.invalidatedCardIds.length).toBe(2);
    expect(res.otherTemplarAlive).toBe(true);
    const s = ts(res.campaign);
    const impCards = s.initiativeCards.filter((cc) => cc.actorId === impId);
    const warCards = s.initiativeCards.filter((cc) => cc.actorId === warId);
    expect(impCards.every((cc) => cc.invalidated)).toBe(true);
    expect(warCards.every((cc) => !cc.invalidated)).toBe(true);
  });

  it('被击败 Actor 的 isAlive=false、hp=0、defeatedAt 写入', () => {
    let c = templarsBattleCampaign();
    const impId = ts(c).templarsBattleRuntime.impalerActorId;
    c = resolveTemplarDefeat(c, impId, { now: 'd1' }).campaign;
    const a = getTemplarActorState(ts(c), impId)!;
    expect(a.isAlive).toBe(false);
    expect(a.hp).toBe(0);
    expect(a.defeatedAt).not.toBeNull();
  });

  it('另一名 Templar 继续行动：单名死亡不结束战斗', () => {
    let c = templarsBattleCampaign();
    const impId = ts(c).templarsBattleRuntime.impalerActorId;
    c = resolveTemplarDefeat(c, impId, { now: 'd1' }).campaign;
    const s = ts(c);
    expect(getAliveTemplarActorIds(s)).toContain(s.templarsBattleRuntime.warlordActorId);
    expect(isTemplarAlive(s, s.templarsBattleRuntime.warlordActorId)).toBe(true);
  });

  it('Battle 单位同步：被击败的 monster 移出 initiativeOrder', () => {
    let c = templarsBattleCampaign();
    const impId = ts(c).templarsBattleRuntime.impalerActorId;
    c = resolveTemplarDefeat(c, impId, { now: 'd1' }).campaign;
    expect(c.battle?.monsters.find((m) => m.id === impId)?.isAlive).toBe(false);
    expect(c.battle?.initiativeOrder.includes(impId)).toBe(false);
  });

  it('resolveTemplarDefeat 幂等：重复调用 alreadyResolved:true', () => {
    let c = templarsBattleCampaign();
    const impId = ts(c).templarsBattleRuntime.impalerActorId;
    const r1 = resolveTemplarDefeat(c, impId, { now: 'd1' });
    const r2 = resolveTemplarDefeat(r1.campaign, impId, { now: 'd2' });
    expect(r1.alreadyResolved).toBe(false);
    expect(r2.alreadyResolved).toBe(true);
    expect(r2.invalidatedCardIds.length).toBe(0);
  });

  it('两名均死亡：otherTemplarAlive:false 且 areAllDualBossMembersDefeated:true', () => {
    let c = templarsBattleCampaign();
    const s0 = ts(c);
    c = resolveTemplarDefeat(c, s0.templarsBattleRuntime.impalerActorId, { now: 'd1' }).campaign;
    c = resolveTemplarDefeat(c, s0.templarsBattleRuntime.warlordActorId, { now: 'd2' }).campaign;
    const r = resolveTemplarDefeat(c, s0.templarsBattleRuntime.impalerActorId, { now: 'd3' });
    expect(r.otherTemplarAlive).toBe(false);
    expect(areAllDualBossMembersDefeated(ts(c))).toBe(true);
  });

  it('Victory 评估：仅一名死亡 → false；两名均死亡（prototype 规则）→ true', () => {
    let c = templarsBattleCampaign();
    const s0 = ts(c);
    expect(evaluateTemplarsVictory(ts(c)).satisfied).toBe(false);
    c = resolveTemplarDefeat(c, s0.templarsBattleRuntime.impalerActorId, { now: 'd1' }).campaign;
    c = resolveTemplarDefeat(c, s0.templarsBattleRuntime.warlordActorId, { now: 'd2' }).campaign;
    expect(evaluateTemplarsVictory(ts(c)).satisfied).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §30.4 独立 d10 Skill Table + 先保存后展示
// ---------------------------------------------------------------------------

describe('§30.4 独立 d10 Skill Table + 先保存后展示（硬约束 4 / 14）', () => {
  it('Impaler 与 Warlord 各自持有独立 Skill Table', () => {
    const s = ts(templarsBattleCampaign());
    const imp = getTemplarSkillTable(s, s.templarsBattleRuntime.impalerActorId);
    const war = getTemplarSkillTable(s, s.templarsBattleRuntime.warlordActorId);
    expect(imp.length).toBe(2);
    expect(war.length).toBe(2);
    expect(imp.map((k) => k.id)).not.toEqual(war.map((k) => k.id));
  });

  it('selectTemplarSkillByRoll 按 Definition 的 d10 区间映射（不靠数组下标）', () => {
    const s = ts(templarsBattleCampaign());
    const imp = getTemplarSkillTable(s, s.templarsBattleRuntime.impalerActorId);
    const war = getTemplarSkillTable(s, s.templarsBattleRuntime.warlordActorId);
    expect(selectTemplarSkillByRoll(imp, 1)?.id).toBe(TEMPLAR_BODY_SLAM_PROTOTYPE_ID);
    expect(selectTemplarSkillByRoll(imp, 8)?.id).toBe('prototype-impaler-jab');
    expect(selectTemplarSkillByRoll(war, 3)?.id).toBe('prototype-warlord-volley');
    expect(selectTemplarSkillByRoll(war, 9)?.id).toBe('prototype-warlord-roar');
  });

  it('rollTemplarSkill 掷骰并保存 record（先保存后展示）', () => {
    const s0 = ts(templarsBattleCampaign());
    const card = s0.initiativeCards.find((c) => c.role === 'impaler')!;
    const r = rollTemplarSkill(s0, card.id, createScriptedRng([0.05])); // d10=1
    expect(r.ok).toBe(true);
    expect(r.record?.roll).toBe(1);
    expect(r.record?.selectedSkillId).toBe(TEMPLAR_BODY_SLAM_PROTOTYPE_ID);
    expect(r.state.skillRolls.length).toBe(1);
  });

  it('rollTemplarSkill 幂等：重复调用返回 alreadyRolled:true 且同一 roll', () => {
    const s0 = ts(templarsBattleCampaign());
    const card = s0.initiativeCards.find((c) => c.role === 'impaler')!;
    const r1 = rollTemplarSkill(s0, card.id, createScriptedRng([0.05]));
    const r2 = rollTemplarSkill(r1.state, card.id, createScriptedRng([0.99]));
    expect(r2.alreadyRolled).toBe(true);
    expect(r2.record?.roll).toBe(r1.record?.roll);
    expect(r2.record?.selectedSkillId).toBe(r1.record?.selectedSkillId);
  });

  it('rollTemplarSkill 对死亡 Actor 返回 ok:false', () => {
    let c = templarsBattleCampaign();
    const s0 = ts(c);
    const impId = s0.templarsBattleRuntime.impalerActorId;
    c = resolveTemplarDefeat(c, impId, { now: 'd1' }).campaign;
    const card = ts(c).initiativeCards.find((cc) => cc.actorId === impId)!;
    const r = rollTemplarSkill(ts(c), card.id, createScriptedRng([0.05]));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/已被击败|不行动/);
  });

  it('rollTemplarSkill 对未知卡返回 ok:false', () => {
    const s0 = ts(templarsBattleCampaign());
    const r = rollTemplarSkill(s0, 'nope', createScriptedRng([0.05]));
    expect(r.ok).toBe(false);
  });

  it('selectTemplarSkillByRoll 对越界骰点返回 null', () => {
    const s = ts(templarsBattleCampaign());
    const imp = getTemplarSkillTable(s, s.templarsBattleRuntime.impalerActorId);
    expect(selectTemplarSkillByRoll(imp, 11 as never)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §30.5 Body Slam Hook 四条件 + Miss
// ---------------------------------------------------------------------------

describe('§30.5 Body Slam Hook 四条件 + Miss（硬约束 6 / 7）', () => {
  it('Impaler + Body Slam + Hero + 命中 → shouldTriggerPitToss:true', () => {
    const c = templarsBattleCampaign();
    const s = ts(c);
    const impId = s.templarsBattleRuntime.impalerActorId;
    const heroId = s.heroPlacements[0].heroId;
    const r = evaluateBodySlamHook({
      state: s,
      sourceActorId: impId,
      skillId: TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
      targetActorId: heroId,
      targetIsHero: true,
      hit: true,
      skillEventId: 'hook-1',
    });
    expect(r.shouldTriggerPitToss).toBe(true);
    expect(r.event).not.toBeNull();
    expect(r.event?.hit).toBe(true);
  });

  it('Impaler + Body Slam + Hero + Miss → shouldTriggerPitToss:false（且不掷 d10）', () => {
    const c = templarsBattleCampaign();
    const s = ts(c);
    const impId = s.templarsBattleRuntime.impalerActorId;
    const heroId = s.heroPlacements[0].heroId;
    const r = evaluateBodySlamHook({
      state: s,
      sourceActorId: impId,
      skillId: TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
      targetActorId: heroId,
      targetIsHero: true,
      hit: false,
      skillEventId: 'hook-2',
    });
    expect(r.shouldTriggerPitToss).toBe(false);
    expect(r.reason).toMatch(/未命中|不触发/);
  });

  it('Warlord + Body Slam + Hero + 命中 → false（只有 Impaler 触发）', () => {
    const c = templarsBattleCampaign();
    const s = ts(c);
    const warId = s.templarsBattleRuntime.warlordActorId;
    const heroId = s.heroPlacements[0].heroId;
    const r = evaluateBodySlamHook({
      state: s,
      sourceActorId: warId,
      skillId: 'prototype-warlord-volley',
      targetActorId: heroId,
      targetIsHero: true,
      hit: true,
      skillEventId: 'hook-3',
    });
    expect(r.shouldTriggerPitToss).toBe(false);
    expect(r.reason).toMatch(/不是 Impaler|Impaler/);
  });

  it('Impaler + 非 trigger-pit-toss 技能（突刺）+ Hero + 命中 → false', () => {
    const c = templarsBattleCampaign();
    const s = ts(c);
    const impId = s.templarsBattleRuntime.impalerActorId;
    const heroId = s.heroPlacements[0].heroId;
    const r = evaluateBodySlamHook({
      state: s,
      sourceActorId: impId,
      skillId: 'prototype-impaler-jab',
      targetActorId: heroId,
      targetIsHero: true,
      hit: true,
      skillEventId: 'hook-4',
    });
    expect(r.shouldTriggerPitToss).toBe(false);
  });

  it('Impaler + Body Slam + 怪物（非 Hero）+ 命中 → false', () => {
    const c = templarsBattleCampaign();
    const s = ts(c);
    const impId = s.templarsBattleRuntime.impalerActorId;
    const r = evaluateBodySlamHook({
      state: s,
      sourceActorId: impId,
      skillId: TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
      targetActorId: s.templarsBattleRuntime.warlordActorId,
      targetIsHero: false,
      hit: true,
      skillEventId: 'hook-5',
    });
    expect(r.shouldTriggerPitToss).toBe(false);
  });

  it('skillTriggersPitToss：Body Slam true、突刺 false', () => {
    const s = ts(templarsBattleCampaign());
    const imp = getTemplarSkillTable(s, s.templarsBattleRuntime.impalerActorId);
    const body = imp.find((k) => k.id === TEMPLAR_BODY_SLAM_PROTOTYPE_ID)!;
    const jab = imp.find((k) => k.id === 'prototype-impaler-jab')!;
    expect(skillTriggersPitToss(body)).toBe(true);
    expect(skillTriggersPitToss(jab)).toBe(false);
  });

  it('evaluateBodySlamHook 幂等：同 skillEventId 返回已记录事件', () => {
    const c = templarsBattleCampaign();
    const s = ts(c);
    const impId = s.templarsBattleRuntime.impalerActorId;
    const heroId = s.heroPlacements[0].heroId;
    const r1 = evaluateBodySlamHook({
      state: s,
      sourceActorId: impId,
      skillId: TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
      targetActorId: heroId,
      targetIsHero: true,
      hit: true,
      skillEventId: 'hook-6',
    });
    const r2 = evaluateBodySlamHook({
      state: r1.state,
      sourceActorId: impId,
      skillId: TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
      targetActorId: heroId,
      targetIsHero: true,
      hit: true,
      skillEventId: 'hook-6',
    });
    expect(r2.alreadyRecorded).toBe(true);
    expect(r2.event?.id).toBe(r1.event?.id);
  });

  it('钩子写入 BodySlamHitEvent 到 bodySlamHitEvents', () => {
    const c = templarsBattleCampaign();
    const s = ts(c);
    const impId = s.templarsBattleRuntime.impalerActorId;
    const heroId = s.heroPlacements[0].heroId;
    const r = evaluateBodySlamHook({
      state: s,
      sourceActorId: impId,
      skillId: TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
      targetActorId: heroId,
      targetIsHero: true,
      hit: true,
      skillEventId: 'hook-7',
    });
    expect(r.state.bodySlamHitEvents.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// §30.6 Pit Toss 事务 + d10 → Pit（4/3/3）
// ---------------------------------------------------------------------------

describe('§30.6 Pit Toss 事务 + d10 → Pit 映射（硬约束 9 / 11 / 14）', () => {
  function hookAndToss(c: CampaignState, rngValue: number) {
    const s = ts(c);
    const impId = s.templarsBattleRuntime.impalerActorId;
    const heroId = s.heroPlacements[0].heroId;
    const hook = evaluateBodySlamHook({
      state: s,
      sourceActorId: impId,
      skillId: TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
      targetActorId: heroId,
      targetIsHero: true,
      hit: true,
      skillEventId: `pt-${rngValue}`,
    });
    const c1 = { ...c, actFourState: { ...c.actFourState, templarsEncounterState: hook.state } };
    const toss = resolvePitToss({ campaign: c1, hitEventId: hook.event!.id, rng: createScriptedRng([rngValue]) });
    return { c1, toss, heroId };
  }

  it('d10=1 → Pit A（4/3/3 不均匀分配，只来自 Room Definition）', () => {
    const { toss } = hookAndToss(templarsBattleCampaign(), 0.05); // floor(0.5)+1=1
    expect(toss.ok).toBe(true);
    expect(toss.record?.targetPitId).toBe(PROTOTYPE_PIT_A_ID);
  });

  it('d10=3 → Pit B', () => {
    const { toss } = hookAndToss(templarsBattleCampaign(), 0.25); // floor(2.5)+1=3
    expect(toss.record?.targetPitId).toBe(PROTOTYPE_PIT_B_ID);
  });

  it('d10=5 → Pit C', () => {
    const { toss } = hookAndToss(templarsBattleCampaign(), 0.45); // floor(4.5)+1=5
    expect(toss.record?.targetPitId).toBe(PROTOTYPE_PIT_C_ID);
  });

  it('d10=10 → Pit C（证明映射不是按 Pit 数平均）', () => {
    const { toss } = hookAndToss(templarsBattleCampaign(), 0.95); // floor(9.5)+1=10
    expect(toss.record?.targetPitId).toBe(PROTOTYPE_PIT_C_ID);
  });

  it('Pit Toss 原子移动 Hero 入 Pit（heroPlacements 更新）', () => {
    const c = templarsBattleCampaign();
    const heroId = ts(c).heroPlacements[0].heroId;
    const { toss } = hookAndToss(c, 0.05);
    const s = ts(toss.campaign);
    const placement = getTemplarsHeroPlacement(s, heroId)!;
    expect(placement.pitId).toBe(PROTOTYPE_PIT_A_ID);
    expect(isHeroInAnyPit(s, heroId)).toBe(true);
    expect(getPitOccupants(s, PROTOTYPE_PIT_A_ID)).toContain(heroId);
  });

  it('Pit Toss 复用 Damage/Stress 管线（entry 伤害 3、压力 2）', () => {
    const c = templarsBattleCampaign();
    const heroId = ts(c).heroPlacements[0].heroId;
    const beforeHp = heroHp(c, heroId);
    const beforeStress = heroStress(c, heroId);
    const { toss } = hookAndToss(c, 0.05);
    expect(heroHp(toss.campaign, heroId)).toBe(beforeHp - 3);
    expect(heroStress(toss.campaign, heroId)).toBe(beforeStress + 2);
    const s = ts(toss.campaign);
    expect(getHazardEventsByTrigger(s, 'on-forced-entry').length).toBeGreaterThanOrEqual(1);
  });

  it('Pit Toss 幂等：重复调用返回 alreadyResolved:true 且同一 d10 记录', () => {
    const { toss } = hookAndToss(templarsBattleCampaign(), 0.05);
    const hitEventId = ts(toss.campaign).bodySlamHitEvents[0].id;
    const toss2 = resolvePitToss({ campaign: toss.campaign, hitEventId, rng: createScriptedRng([0.99]) });
    expect(toss2.alreadyResolved).toBe(true);
    expect(toss2.record?.roll).toBe(toss.record?.roll);
  });

  it('resolvePitToss 对 Miss 事件失败（ok:false）', () => {
    const c = templarsBattleCampaign();
    const s = ts(c);
    const impId = s.templarsBattleRuntime.impalerActorId;
    const heroId = s.heroPlacements[0].heroId;
    const hook = evaluateBodySlamHook({
      state: s,
      sourceActorId: impId,
      skillId: TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
      targetActorId: heroId,
      targetIsHero: true,
      hit: false,
      skillEventId: 'miss-evt',
    });
    const c1 = { ...c, actFourState: { ...c.actFourState, templarsEncounterState: hook.state } };
    const toss = resolvePitToss({ campaign: c1, hitEventId: hook.event!.id, rng: createScriptedRng([0.05]) });
    expect(toss.ok).toBe(false);
  });

  it('resolvePitToss 对非 Hero 目标失败（ok:false）', () => {
    const c = templarsBattleCampaign();
    const s = ts(c);
    const impId = s.templarsBattleRuntime.impalerActorId;
    const warId = s.templarsBattleRuntime.warlordActorId;
    // 直接注入一条 targetIsHero:false 的命中事件（钩子对非 Hero 不创建事件）
    const fakeEvent = {
      id: 'monster-evt',
      battleId: s.battleId,
      skillEventId: 'se',
      sourceActorId: impId,
      skillId: TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
      targetActorId: warId,
      targetIsHero: false,
      hit: true,
      transactionId: 'tx',
      createdAt: '',
    };
    const c1 = {
      ...c,
      actFourState: {
        ...c.actFourState,
        templarsEncounterState: { ...s, bodySlamHitEvents: [...s.bodySlamHitEvents, fakeEvent] },
      },
    };
    const toss = resolvePitToss({ campaign: c1, hitEventId: 'monster-evt', rng: createScriptedRng([0.05]) });
    expect(toss.ok).toBe(false);
  });

  it('getLastPitTossForHero 返回最近一次记录', () => {
    const c = templarsBattleCampaign();
    const heroId = ts(c).heroPlacements[0].heroId;
    const { toss } = hookAndToss(c, 0.05);
    expect(getLastPitTossForHero(ts(toss.campaign), heroId)?.targetHeroId).toBe(heroId);
  });

  it('getPitTossD10Map 返回 Room Definition 的映射（来源恒为 Definition）', () => {
    const s = ts(templarsBattleCampaign());
    const map = getPitTossD10Map(s);
    expect(map[1]).toBe(PROTOTYPE_PIT_A_ID);
    expect(map[3]).toBe(PROTOTYPE_PIT_B_ID);
    expect(map[5]).toBe(PROTOTYPE_PIT_C_ID);
  });

  it('d10 映射缺失 → 整体回滚（rolledBack:true，不留下半状态）', () => {
    const c = templarsBattleCampaign();
    const s = ts(c);
    const impId = s.templarsBattleRuntime.impalerActorId;
    const heroId = s.heroPlacements[0].heroId;
    const hook = evaluateBodySlamHook({
      state: s,
      sourceActorId: impId,
      skillId: TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
      targetActorId: heroId,
      targetIsHero: true,
      hit: true,
      skillEventId: 'rb-evt',
    });
    const badState = {
      ...hook.state,
      snapshot: {
        ...hook.state.snapshot,
        room: {
          ...hook.state.snapshot.room,
          pitTossD10Map: { ...hook.state.snapshot.room.pitTossD10Map, 3: '' },
        },
      },
    };
    const c1 = { ...c, actFourState: { ...c.actFourState, templarsEncounterState: badState } };
    const toss = resolvePitToss({ campaign: c1, hitEventId: hook.event!.id, rng: createScriptedRng([0.25]) });
    expect(toss.ok).toBe(false);
    expect(toss.rolledBack).toBe(true);
    expect(getTemplarsHeroPlacement(ts(toss.campaign), heroId)?.pitId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §30.7 Spiked Pit Hazard（Entry / End-Turn）复用 Damage/Stress 管线
// ---------------------------------------------------------------------------

describe('§30.7 Spiked Pit Hazard 复用正式管线（硬约束 8 / 9 / 11）', () => {
  it('SPIKED_PIT_IS_BATTLE_ACTOR 恒为 false（Pit 不是战斗单位）', () => {
    expect(SPIKED_PIT_IS_BATTLE_ACTOR).toBe(false);
  });

  it('End-Turn 触发对仍在 Pit 的 Hero 施加伤害（复用管线）', () => {
    const c0 = templarsBattleCampaign();
    const heroId = ts(c0).heroPlacements[0].heroId;
    const hook = evaluateBodySlamHook({
      state: ts(c0),
      sourceActorId: ts(c0).templarsBattleRuntime.impalerActorId,
      skillId: TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
      targetActorId: heroId,
      targetIsHero: true,
      hit: true,
      skillEventId: 'et-1',
    });
    const c1 = { ...c0, actFourState: { ...c0.actFourState, templarsEncounterState: hook.state } };
    const toss = resolvePitToss({ campaign: c1, hitEventId: hook.event!.id, rng: createScriptedRng([0.05]) });
    const hpAfterEntry = heroHp(toss.campaign, heroId);
    const end = resolveTemplarsEndTurnPitEffects(toss.campaign, { now: 'e1' });
    expect(heroHp(end.campaign, heroId)).toBe(hpAfterEntry - 1);
    expect(getHazardEventsByTrigger(ts(end.campaign), 'on-end-turn').length).toBeGreaterThanOrEqual(1);
  });

  it('End-Turn 触发幂等：同一 round 重复调用不再二次结算', () => {
    const c0 = templarsBattleCampaign();
    const heroId = ts(c0).heroPlacements[0].heroId;
    const hook = evaluateBodySlamHook({
      state: ts(c0),
      sourceActorId: ts(c0).templarsBattleRuntime.impalerActorId,
      skillId: TEMPLAR_BODY_SLAM_PROTOTYPE_ID,
      targetActorId: heroId,
      targetIsHero: true,
      hit: true,
      skillEventId: 'et-2',
    });
    const c1 = { ...c0, actFourState: { ...c0.actFourState, templarsEncounterState: hook.state } };
    const toss = resolvePitToss({ campaign: c1, hitEventId: hook.event!.id, rng: createScriptedRng([0.05]) });
    const end1 = resolveTemplarsEndTurnPitEffects(toss.campaign, { now: 'e1' });
    const hp1 = heroHp(end1.campaign, heroId);
    const end2 = resolveTemplarsEndTurnPitEffects(end1.campaign, { now: 'e2' });
    expect(end2.alreadyResolved).toBe(true);
    expect(heroHp(end2.campaign, heroId)).toBe(hp1);
  });

  it('无 Pit 占据者时 End-Turn 触发为空操作（不报错）', () => {
    const c = templarsBattleCampaign();
    const end = resolveTemplarsEndTurnPitEffects(c, { now: 'e1' });
    expect(end.ok).toBe(true);
    expect(end.events.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §30.8 Dual Boss Victory / Guardian Victory / Failure
// ---------------------------------------------------------------------------

describe('§30.8 Dual Boss Victory / Guardian Victory / Failure', () => {
  it('evaluateDualBossVictory（rule=null）→ satisfied:false 且给出缺失原因（硬约束 10）', () => {
    const s = ts(templarsBattleCampaign());
    const r = evaluateDualBossVictory({ rule: null, actorStates: s.actorStates });
    expect(r.satisfied).toBe(false);
    expect(r.reason).toMatch(/Victory Rule|缺失/);
  });

  it('evaluateDualBossVictory（all-defeated）：两名死亡→true，一名存活→false', () => {
    let c = templarsBattleCampaign();
    const s0 = ts(c);
    const rule = getTemplarsVictoryRule('prototype')!;
    expect(evaluateDualBossVictory({ rule, actorStates: s0.actorStates }).satisfied).toBe(false);
    c = resolveTemplarDefeat(c, s0.templarsBattleRuntime.impalerActorId, { now: 'd1' }).campaign;
    c = resolveTemplarDefeat(c, s0.templarsBattleRuntime.warlordActorId, { now: 'd2' }).campaign;
    expect(evaluateDualBossVictory({ rule, actorStates: ts(c).actorStates }).satisfied).toBe(true);
  });

  it('Guardian Victory：两名均死亡 → ok:true、xpAwarded=3、复用 Final Hamlet 链路', () => {
    let c = templarsBattleCampaign();
    const s0 = ts(c);
    c = resolveTemplarDefeat(c, s0.templarsBattleRuntime.impalerActorId, { now: 'd1' }).campaign;
    c = resolveTemplarDefeat(c, s0.templarsBattleRuntime.warlordActorId, { now: 'd2' }).campaign;
    const beforeXp = totalHeroXp(c);
    const eligible = c.heroes.filter((h) => !h.dead).length;
    const res = resolveTemplarsEncounterVictory(c, { now: 'v1' });
    expect(res.ok).toBe(true);
    expect(res.xpAwarded).toBe(3);
    expect(totalHeroXp(res.campaign) - beforeXp).toBe(3 * eligible);
    expect(ts(res.campaign).templarsBattleRuntime.victoryResolved).toBe(true);
  });

  it('Guardian Victory 仅在满足条件时成功：仅一名死亡 → ok:false', () => {
    let c = templarsBattleCampaign();
    const s0 = ts(c);
    c = resolveTemplarDefeat(c, s0.templarsBattleRuntime.impalerActorId, { now: 'd1' }).campaign;
    const res = resolveTemplarsEncounterVictory(c, { now: 'v1' });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/存活|Templar/);
  });

  it('Guardian Victory 幂等：重复调用 alreadyResolved:true、xpAwarded=0', () => {
    let c = templarsBattleCampaign();
    const s0 = ts(c);
    c = resolveTemplarDefeat(c, s0.templarsBattleRuntime.impalerActorId, { now: 'd1' }).campaign;
    c = resolveTemplarDefeat(c, s0.templarsBattleRuntime.warlordActorId, { now: 'd2' }).campaign;
    const r1 = resolveTemplarsEncounterVictory(c, { now: 'v1' });
    const r2 = resolveTemplarsEncounterVictory(r1.campaign, { now: 'v2' });
    expect(r1.alreadyResolved).toBe(false);
    expect(r2.alreadyResolved).toBe(true);
    expect(r2.xpAwarded).toBe(0);
  });

  it('Guardian Failure → Campaign Over（硬约束 13，复用 resolveGuardianFailure）', () => {
    const c0 = templarsBattleCampaign();
    const res = resolveTemplarsEncounterFailure(c0, '队伍全灭', { now: 'f1' });
    expect(res.campaign.actFourState.stage).toBe('campaign-over');
    expect(res.campaign.gamePhase).toBe('campaign-over');
  });

  it('isPartyWipedInTemplarsEncounter：全灭→true，否则 false', () => {
    const c0 = templarsBattleCampaign();
    expect(isPartyWipedInTemplarsEncounter(c0)).toBe(false);
    const wiped = { ...c0, heroes: c0.heroes.map((h) => ({ ...h, dead: true })) };
    expect(isPartyWipedInTemplarsEncounter(wiped)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §30.9 Save Migration & sanitize
// ---------------------------------------------------------------------------

describe('§30.9 Save Migration & sanitize（§28 / SAVE_VERSION）', () => {
  it('SAVE_VERSION === 13（Phase 10B）', () => {
    expect(SAVE_VERSION).toBe(13);
  });

  it('完整 Templars 战役 migrateCampaignToLatest 后 templarsEncounterState 存活且 validateSaveFile 通过', () => {
    const c = templarsBattleCampaign();
    const migrated = migrateCampaignToLatest(c);
    expect(migrated.saveVersion).toBe(SAVE_VERSION);
    expect(migrated.actFourState.templarsEncounterState).not.toBeNull();
    expect(
      validateSaveFile({ version: SAVE_VERSION, savedAt: '2026-08-01T00:00:00.000Z', gamePhase: migrated.gamePhase, campaign: migrated }),
    ).toBeNull();
  });

  it('旧存档（缺 templarsEncounterState 字段）→ migrate 后补 null，validateSaveFile 通过', () => {
    const c = templarsBattleCampaign();
    const stripped = {
      ...c,
      saveVersion: 12,
      actFourState: { ...c.actFourState } as Record<string, unknown>,
    };
    delete (stripped.actFourState as Record<string, unknown>).templarsEncounterState;
    const migrated = migrateCampaignToLatest(stripped as unknown as CampaignState);
    expect(migrated.actFourState.templarsEncounterState).toBeNull();
    expect(
      validateSaveFile({ version: SAVE_VERSION, savedAt: '2026-08-01T00:00:00.000Z', gamePhase: migrated.gamePhase, campaign: migrated }),
    ).toBeNull();
  });

  it('validateSaveFile：缺少 templarsEncounterState 字段 → 报错', () => {
    const c = templarsBattleCampaign();
    const bad = {
      ...c,
      actFourState: { ...c.actFourState } as Record<string, unknown>,
    };
    delete (bad.actFourState as Record<string, unknown>).templarsEncounterState;
    expect(
      typeof validateSaveFile({ version: SAVE_VERSION, savedAt: '2026-08-01T00:00:00.000Z', gamePhase: bad.gamePhase, campaign: bad }),
    ).toBe('string');
  });

  it('validateSaveFile：actorStates 非 2 个 → 报错', () => {
    const c = templarsBattleCampaign();
    const s = ts(c);
    const bad = {
      ...c,
      actFourState: {
        ...c.actFourState,
        templarsEncounterState: {
          ...s,
          actorStates: [...s.actorStates, s.actorStates[0]],
        },
      },
    };
    expect(
      typeof validateSaveFile({ version: SAVE_VERSION, savedAt: '2026-08-01T00:00:00.000Z', gamePhase: bad.gamePhase, campaign: bad }),
    ).toBe('string');
  });

  it('sanitizeTemplarsEncounterState：null/空 → null（不白屏）', () => {
    expect(sanitizeTemplarsEncounterState(null)).toBeNull();
    expect(sanitizeTemplarsEncounterState({})).toBeNull();
    expect(sanitizeTemplarsEncounterState({ battleId: 'x', roomId: 'y' })).toBeNull();
  });

  it('sanitizeTemplarsEncounterState：损坏数组回退为空数组且不重掷随机数', () => {
    const s = ts(templarsBattleCampaign());
    const raw = JSON.parse(JSON.stringify(s));
    raw.heroPlacements = 'oops';
    raw.skillRolls = 'oops';
    const out = sanitizeTemplarsEncounterState(raw);
    expect(out).not.toBeNull();
    expect(Array.isArray(out!.heroPlacements)).toBe(true);
    expect(Array.isArray(out!.skillRolls)).toBe(true);
    expect(out!.pitTossHistory.length).toBe(s.pitTossHistory.length);
  });

  it('diffTemplarsSnapshot：新鲜 Setup 的 Snapshot 未过期（stale:false）', () => {
    const s = ts(templarsBattleCampaign());
    const d = diffTemplarsSnapshot(s, 'prototype');
    expect(d.stale).toBe(false);
    expect(d.savedContentVersion).toBe(d.currentContentVersion);
  });
});
