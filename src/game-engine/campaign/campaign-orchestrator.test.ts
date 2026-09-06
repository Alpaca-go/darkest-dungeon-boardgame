// Phase 11A.1 — Campaign Orchestrator 单元测试。
//
// 覆盖 dev doc §24 测试组 A–F 全部断言：
//   A. Quest Gate（7 项）
//   B. Standard Completion（6 项）
//   C. Threat（7 项）
//   D. Boss Victory（8 项）
//   E. Act Advance（12 项）
//   F. Save（8 项）

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createNewCampaign } from '../campaign';
import { createSeededRandom, setRandomSource } from '../random';
import {
  advanceCampaignAfterBoss,
  engineChooseQuest,
  finalizeBossVictory,
  finalizeQuestProgress,
  initializeCampaignAct,
  syncCampaignProgressMirrors,
  validateQuestSelection,
} from './campaign-orchestrator';
import { drawThreatForCurrentAct } from './threat-selection';
import {
  REQUIRED_STANDARD_QUESTS_BEFORE_BOSS,
  THREATS_TO_UNLOCK_DARKEST_DUNGEON,
  canSelectBossQuest,
  canSelectStandardQuest,
} from './campaign-progress';
import { STANDARD_QUESTS, getQuestById, isStandardQuestId, isBossQuestId } from '../../data/quests';
import { FACE_THE_THREAT_QUEST_ID } from '../../data/quests/face-the-threat';
import {
  createSaveSnapshot,
  restoreSaveSnapshot,
  validateSaveFile,
  SAVE_VERSION,
} from '../save';

let savedRng: (() => number) | null = null;

beforeEach(() => {
  savedRng = null;
  setRandomSource(createSeededRandom(424242));
});

afterEach(() => {
  setRandomSource(savedRng);
});

// ---------------------------------------------------------------------------
// A. Quest Gate（§24.A 1–7）
// ---------------------------------------------------------------------------

describe('A. Quest Gate', () => {
  it('A.1 Act I 初始可选 Standard', () => {
    const c = createNewCampaign();
    expect(canSelectStandardQuest(c.campaignProgress)).toBe(true);
  });

  it('A.2 0/2 时 Boss Quest 不可选', () => {
    let c = createNewCampaign();
    const init = initializeCampaignAct(c);
    c = init.campaign;
    expect(canSelectBossQuest(c.campaignProgress)).toBe(false);
    expect(validateQuestSelection(c, FACE_THE_THREAT_QUEST_ID)).toBe('boss-locked');
  });

  it('A.3 1/2 时 Boss Quest 不可选', () => {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    c = finalizeQuestProgress(c, {
      questId: STANDARD_QUESTS[0].id,
      questRunId: 'r1',
      questOutcome: 'completed',
    }).campaign;
    expect(canSelectBossQuest(c.campaignProgress)).toBe(false);
  });

  it('A.4 2/2 时 Standard 被锁', () => {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    for (let i = 0; i < REQUIRED_STANDARD_QUESTS_BEFORE_BOSS; i++) {
      const qid = STANDARD_QUESTS[i % STANDARD_QUESTS.length].id;
      c = finalizeQuestProgress(c, {
        questId: qid,
        questRunId: `r${i}`,
        questOutcome: 'completed',
      }).campaign;
    }
    expect(canSelectStandardQuest(c.campaignProgress)).toBe(false);
  });

  it('A.5 2/2 且 activeThreat 存在时 Face the Threat 可选', () => {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    for (let i = 0; i < REQUIRED_STANDARD_QUESTS_BEFORE_BOSS; i++) {
      const qid = STANDARD_QUESTS[i % STANDARD_QUESTS.length].id;
      c = finalizeQuestProgress(c, {
        questId: qid,
        questRunId: `r${i}`,
        questOutcome: 'completed',
      }).campaign;
    }
    // 此时 activeThreat 应已由 initializeCampaignAct 抽到
    expect(c.campaignProgress.activeThreatId).not.toBeNull();
    expect(canSelectBossQuest(c.campaignProgress)).toBe(true);
    expect(validateQuestSelection(c, FACE_THE_THREAT_QUEST_ID)).toBeNull();
  });

  it('A.6 无 activeThreat 时 Face the Threat 不可选', () => {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    // 强制清空 active threat
    c = { ...c, campaignProgress: { ...c.campaignProgress, activeThreatId: null } };
    for (let i = 0; i < REQUIRED_STANDARD_QUESTS_BEFORE_BOSS; i++) {
      const qid = STANDARD_QUESTS[i % STANDARD_QUESTS.length].id;
      c = finalizeQuestProgress(c, {
        questId: qid,
        questRunId: `r${i}`,
        questOutcome: 'completed',
      }).campaign;
    }
    expect(canSelectBossQuest(c.campaignProgress)).toBe(false);
    expect(validateQuestSelection(c, FACE_THE_THREAT_QUEST_ID)).toBe('no-active-threat');
  });

  it('A.7 直接调用 engine 也无法绕过 gate', () => {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    // 即便手动写 bossQuestUnlocked=true，canSelectBossQuest 仍需 activeThreat 存在；
    // 没有 activeThreat 时 validateQuestSelection 拒绝。
    const manual = {
      ...c,
      campaignProgress: {
        ...c.campaignProgress,
        completedStandardQuestsThisAct: 2,
        bossQuestRequired: true,
        bossQuestUnlocked: true,
        activeThreatId: null,
      },
    };
    expect(validateQuestSelection(manual, FACE_THE_THREAT_QUEST_ID)).toBe('no-active-threat');
    // 即使绕过，engineChooseQuest 也应回退到无操作
    const bypass = engineChooseQuest(manual, FACE_THE_THREAT_QUEST_ID);
    expect(bypass.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// B. Standard Completion（§24.B 8–13）
// ---------------------------------------------------------------------------

describe('B. Standard Completion', () => {
  function newC(): ReturnType<typeof createNewCampaign> {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    return c;
  }

  it('B.8 completed → +1', () => {
    const c0 = newC();
    const r = finalizeQuestProgress(c0, {
      questId: STANDARD_QUESTS[0].id,
      questRunId: 'r1',
      questOutcome: 'completed',
    });
    expect(r.ok).toBe(true);
    expect(r.campaign.campaignProgress.completedStandardQuestsThisAct).toBe(1);
  });

  it('B.9 incomplete → +0', () => {
    const c0 = newC();
    const r = finalizeQuestProgress(c0, {
      questId: STANDARD_QUESTS[0].id,
      questRunId: 'r1',
      questOutcome: 'incomplete',
    });
    expect(r.campaign.campaignProgress.completedStandardQuestsThisAct).toBe(0);
  });

  it('B.10 failed → +0', () => {
    const c0 = newC();
    const r = finalizeQuestProgress(c0, {
      questId: STANDARD_QUESTS[0].id,
      questRunId: 'r1',
      questOutcome: 'failed',
    });
    expect(r.campaign.campaignProgress.completedStandardQuestsThisAct).toBe(0);
  });

  it('B.11 同事务重复 → +0（幂等）', () => {
    const c0 = newC();
    const r1 = finalizeQuestProgress(c0, {
      questId: STANDARD_QUESTS[0].id,
      questRunId: 'r1',
      questOutcome: 'completed',
    });
    const r2 = finalizeQuestProgress(r1.campaign, {
      questId: STANDARD_QUESTS[0].id,
      questRunId: 'r1',
      questOutcome: 'completed',
    });
    expect(r2.alreadyApplied).toBe(true);
    expect(r2.campaign.campaignProgress.completedStandardQuestsThisAct).toBe(1);
  });

  it('B.12 第二个 completed → Boss Required', () => {
    let c = newC();
    c = finalizeQuestProgress(c, {
      questId: STANDARD_QUESTS[0].id,
      questRunId: 'r1',
      questOutcome: 'completed',
    }).campaign;
    c = finalizeQuestProgress(c, {
      questId: STANDARD_QUESTS[1].id,
      questRunId: 'r2',
      questOutcome: 'completed',
    }).campaign;
    expect(c.campaignProgress.completedStandardQuestsThisAct).toBe(2);
    expect(c.campaignProgress.bossQuestRequired).toBe(true);
  });

  it('B.13 Boss Required 后再次 Standard completion 不应累加到 3/2', () => {
    let c = newC();
    for (let i = 0; i < 2; i++) {
      c = finalizeQuestProgress(c, {
        questId: STANDARD_QUESTS[i].id,
        questRunId: `r${i}`,
        questOutcome: 'completed',
      }).campaign;
    }
    // 第三次 Standard（重复同 id，模拟玩家强行点）
    const r3 = finalizeQuestProgress(c, {
      questId: STANDARD_QUESTS[0].id,
      questRunId: 'r3',
      questOutcome: 'completed',
    });
    expect(r3.campaign.campaignProgress.completedStandardQuestsThisAct).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// C. Threat（§24.C 14–20）
// ---------------------------------------------------------------------------

describe('C. Threat', () => {
  it('C.14 Act I 抽一次', () => {
    const c = createNewCampaign();
    const init = initializeCampaignAct(c);
    expect(init.ok).toBe(true);
    expect(init.campaign.campaignProgress.activeThreatId).not.toBeNull();
    expect(init.campaign.activeThreatRuntime).not.toBeNull();
  });

  it('C.15 刷新后不重抽（alreadyDrawn 幂等）', () => {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    const r2 = drawThreatForCurrentAct(c);
    expect(r2.alreadyDrawn).toBe(true);
    expect(r2.campaign.campaignProgress.activeThreatId).toBe(c.campaignProgress.activeThreatId);
  });

  it('C.16 重复 transaction 不重抽', () => {
    const c = createNewCampaign();
    const txId = 'threat-draw:cmp_xxx:act-1';
    const r1 = drawThreatForCurrentAct(c, { transactionId: txId });
    expect(r1.ok).toBe(true);
    const r2 = drawThreatForCurrentAct(r1.campaign, { transactionId: txId });
    expect(r2.alreadyDrawn).toBe(true);
  });

  it('C.17 Act II 排除已击败 Family', () => {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    // 模拟已击败 prototype-summoner-family
    c = {
      ...c,
      campaignProgress: {
        ...c.campaignProgress,
        defeatedBossFamilyIds: ['prototype-summoner-family'],
      },
    };
    // 手动推 act=2
    c = { ...c, act: 2, campaignLevel: 2 };
    c = { ...c, campaignProgress: { ...c.campaignProgress, act: 2, pendingThreatInitialization: true, activeThreatId: null } };
    const r = drawThreatForCurrentAct(c);
    expect(r.ok).toBe(true);
    expect(r.threat?.bossFamilyId).not.toBe('prototype-summoner-family');
  });

  it('C.18 Act III 排除前两个 Family', () => {
    let c = createNewCampaign();
    c = { ...c, act: 3, campaignLevel: 3, campaignProgress: { ...c.campaignProgress, act: 3, pendingThreatInitialization: true, activeThreatId: null, defeatedBossFamilyIds: ['necromancer', 'prophet'] } };
    const r = drawThreatForCurrentAct(c);
    expect(r.ok).toBe(true);
    expect(r.threat?.bossFamilyId).toBe('collector');
  });

  it('C.19 空池显式错误', () => {
    let c = createNewCampaign();
    c = { ...c, act: 2, campaignLevel: 2, campaignProgress: { ...c.campaignProgress, act: 2, pendingThreatInitialization: true, activeThreatId: null, defeatedBossFamilyIds: ['necromancer', 'prophet', 'collector'] } };
    const r = drawThreatForCurrentAct(c);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('empty-pool');
  });

  it('C.20 不允许错 Level fallback（Act IV 拒绝）', () => {
    let c = createNewCampaign();
    c = { ...c, act: 4 as 4, campaignProgress: { ...c.campaignProgress, act: 4 as 4, pendingThreatInitialization: false, darkestDungeonUnlocked: true } };
    const r = drawThreatForCurrentAct(c);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid-act');
  });
});

// ---------------------------------------------------------------------------
// D. Boss Victory（§24.D 21–28）
// ---------------------------------------------------------------------------

describe('D. Boss Victory', () => {
  function preparedCampaign(): ReturnType<typeof createNewCampaign> {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    return c;
  }

  it('D.21 Boss Victory 写 defeatedThreatIds', () => {
    let c = preparedCampaign();
    const threatId = c.campaignProgress.activeThreatId!;
    const bossFamilyId = c.campaignProgress.activeBossFamilyId!;
    const r = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-1',
      threatId,
      bossFamilyId,
    });
    expect(r.ok).toBe(true);
    expect(r.campaign.campaignProgress.defeatedThreatIds).toContain(threatId);
  });

  it('D.22 Boss Victory 写 defeatedBossFamilyIds', () => {
    let c = preparedCampaign();
    const threatId = c.campaignProgress.activeThreatId!;
    const bossFamilyId = c.campaignProgress.activeBossFamilyId!;
    const r = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-1',
      threatId,
      bossFamilyId,
    });
    expect(r.campaign.campaignProgress.defeatedBossFamilyIds).toContain(bossFamilyId);
  });

  it('D.23 两数组唯一（重复调用同事务幂等）', () => {
    let c = preparedCampaign();
    const threatId = c.campaignProgress.activeThreatId!;
    const bossFamilyId = c.campaignProgress.activeBossFamilyId!;
    const r1 = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-1',
      threatId,
      bossFamilyId,
    });
    const r2 = finalizeBossVictory(r1.campaign, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-1',
      threatId,
      bossFamilyId,
    });
    expect(r2.alreadyApplied).toBe(true);
    expect(r2.campaign.campaignProgress.defeatedBossFamilyIds.filter((f) => f === bossFamilyId).length).toBe(1);
  });

  it('D.24 Active Threat 清除', () => {
    let c = preparedCampaign();
    const threatId = c.campaignProgress.activeThreatId!;
    const bossFamilyId = c.campaignProgress.activeBossFamilyId!;
    const r = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-1',
      threatId,
      bossFamilyId,
    });
    expect(r.campaign.campaignProgress.activeThreatId).toBeNull();
    expect(r.campaign.currentThreatId).toBeNull();
  });

  it('D.25 activeThreatRuntime deactivated', () => {
    let c = preparedCampaign();
    const threatId = c.campaignProgress.activeThreatId!;
    const bossFamilyId = c.campaignProgress.activeBossFamilyId!;
    const r = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-1',
      threatId,
      bossFamilyId,
    });
    expect(r.campaign.activeThreatRuntime?.active).toBe(false);
  });

  it('D.26 错 Boss Family 被拒绝', () => {
    let c = preparedCampaign();
    const threatId = c.campaignProgress.activeThreatId!;
    const r = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-1',
      threatId,
      bossFamilyId: 'wrong-family',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('boss-family-mismatch');
  });

  it('D.27 错 Threat 被拒绝', () => {
    let c = preparedCampaign();
    const bossFamilyId = c.campaignProgress.activeBossFamilyId!;
    const r = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-1',
      threatId: 'wrong-threat',
      bossFamilyId,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('threat-mismatch');
  });

  it('D.28 bossQuestCompletedThisAct 标记', () => {
    let c = preparedCampaign();
    const threatId = c.campaignProgress.activeThreatId!;
    const bossFamilyId = c.campaignProgress.activeBossFamilyId!;
    const r = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-1',
      threatId,
      bossFamilyId,
    });
    expect(r.campaign.campaignProgress.bossQuestCompletedThisAct).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// E. Act Advance（§24.E 29–40）
// ---------------------------------------------------------------------------

describe('E. Act Advance', () => {
  function preparedCampaignWithBossDefeated(): ReturnType<typeof createNewCampaign> {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    const threatId = c.campaignProgress.activeThreatId!;
    const bossFamilyId = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-1',
      threatId,
      bossFamilyId,
    }).campaign;
    return c;
  }

  it('E.29 Act I Boss → Act II', () => {
    const c = preparedCampaignWithBossDefeated();
    const r = advanceCampaignAfterBoss(c);
    expect(r.ok).toBe(true);
    expect(r.campaign.campaignProgress.act).toBe(2);
  });

  it('E.30 Act II Level = 2', () => {
    const c = preparedCampaignWithBossDefeated();
    const r = advanceCampaignAfterBoss(c);
    expect(r.campaign.campaignLevel).toBe(2);
  });

  it('E.31 Standard Count 重置', () => {
    const c = preparedCampaignWithBossDefeated();
    const r = advanceCampaignAfterBoss(c);
    expect(r.campaign.campaignProgress.completedStandardQuestsThisAct).toBe(0);
  });

  it('E.32 Boss Required 重置', () => {
    const c = preparedCampaignWithBossDefeated();
    const r = advanceCampaignAfterBoss(c);
    expect(r.campaign.campaignProgress.bossQuestRequired).toBe(false);
    expect(r.campaign.campaignProgress.bossQuestCompletedThisAct).toBe(false);
  });

  it('E.33 Act II 新 Threat 抽取', () => {
    const c = preparedCampaignWithBossDefeated();
    const r = advanceCampaignAfterBoss(c);
    expect(r.campaign.campaignProgress.activeThreatId).not.toBeNull();
    expect(r.campaign.activeThreatRuntime).not.toBeNull();
  });

  it('E.34 Act II Boss → Act III', () => {
    let c = preparedCampaignWithBossDefeated();
    c = advanceCampaignAfterBoss(c).campaign;
    const threatId = c.campaignProgress.activeThreatId!;
    const bossFamilyId = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-2',
      threatId,
      bossFamilyId,
    }).campaign;
    c = advanceCampaignAfterBoss(c).campaign;
    expect(c.campaignProgress.act).toBe(3);
  });

  it('E.35 Act III Level = 3', () => {
    let c = preparedCampaignWithBossDefeated();
    c = advanceCampaignAfterBoss(c).campaign; // → Act II
    const t2 = c.campaignProgress.activeThreatId!;
    const f2 = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-2',
      threatId: t2,
      bossFamilyId: f2,
    }).campaign;
    c = advanceCampaignAfterBoss(c).campaign; // → Act III
    expect(c.campaignLevel).toBe(3);
  });

  it('E.36 Act III 新 Threat 抽取', () => {
    let c = preparedCampaignWithBossDefeated();
    c = advanceCampaignAfterBoss(c).campaign;
    const t2 = c.campaignProgress.activeThreatId!;
    const f2 = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-2',
      threatId: t2,
      bossFamilyId: f2,
    }).campaign;
    c = advanceCampaignAfterBoss(c).campaign;
    expect(c.campaignProgress.activeThreatId).not.toBeNull();
  });

  it('E.37 第三个 Boss → Act IV', () => {
    let c = preparedCampaignWithBossDefeated();
    c = advanceCampaignAfterBoss(c).campaign; // → Act II
    let t = c.campaignProgress.activeThreatId!;
    let f = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-2',
      threatId: t,
      bossFamilyId: f,
    }).campaign;
    c = advanceCampaignAfterBoss(c).campaign; // → Act III
    t = c.campaignProgress.activeThreatId!;
    f = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-3',
      threatId: t,
      bossFamilyId: f,
    }).campaign;
    c = advanceCampaignAfterBoss(c).campaign;
    expect(c.campaignProgress.act).toBe(4);
  });

  it('E.38 Act IV Level 仍 = 3', () => {
    let c = preparedCampaignWithBossDefeated();
    c = advanceCampaignAfterBoss(c).campaign;
    let t = c.campaignProgress.activeThreatId!;
    let f = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-2',
      threatId: t,
      bossFamilyId: f,
    }).campaign;
    c = advanceCampaignAfterBoss(c).campaign;
    t = c.campaignProgress.activeThreatId!;
    f = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-3',
      threatId: t,
      bossFamilyId: f,
    }).campaign;
    c = advanceCampaignAfterBoss(c).campaign;
    expect(c.campaignLevel).toBe(3);
  });

  it('E.39 Darkest Dungeon unlock', () => {
    let c = preparedCampaignWithBossDefeated();
    c = advanceCampaignAfterBoss(c).campaign;
    let t = c.campaignProgress.activeThreatId!;
    let f = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-2',
      threatId: t,
      bossFamilyId: f,
    }).campaign;
    c = advanceCampaignAfterBoss(c).campaign;
    t = c.campaignProgress.activeThreatId!;
    f = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-3',
      threatId: t,
      bossFamilyId: f,
    }).campaign;
    c = advanceCampaignAfterBoss(c).campaign;
    expect(c.campaignProgress.darkestDungeonUnlocked).toBe(true);
  });

  it('E.40 非三个 Family 不得提前 unlock', () => {
    const c = preparedCampaignWithBossDefeated();
    expect(c.campaignProgress.defeatedBossFamilyIds.length).toBeLessThan(THREATS_TO_UNLOCK_DARKEST_DUNGEON);
    expect(c.campaignProgress.darkestDungeonUnlocked).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// F. Save（§24.F 41–48）
// ---------------------------------------------------------------------------

describe('F. Save / Resume', () => {
  it('F.41 1/2 保存恢复', () => {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    c = finalizeQuestProgress(c, {
      questId: STANDARD_QUESTS[0].id,
      questRunId: 'r1',
      questOutcome: 'completed',
    }).campaign;
    const snap = createSaveSnapshot(c);
    const restored = restoreSaveSnapshot(snap);
    expect(restored.campaignProgress.completedStandardQuestsThisAct).toBe(1);
  });

  it('F.42 2/2 保存恢复', () => {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    for (let i = 0; i < 2; i++) {
      c = finalizeQuestProgress(c, {
        questId: STANDARD_QUESTS[i].id,
        questRunId: `r${i}`,
        questOutcome: 'completed',
      }).campaign;
    }
    const snap = createSaveSnapshot(c);
    const restored = restoreSaveSnapshot(snap);
    expect(restored.campaignProgress.completedStandardQuestsThisAct).toBe(2);
    expect(restored.campaignProgress.bossQuestRequired).toBe(true);
  });

  it('F.43 Boss Required 保存恢复', () => {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    for (let i = 0; i < 2; i++) {
      c = finalizeQuestProgress(c, {
        questId: STANDARD_QUESTS[i].id,
        questRunId: `r${i}`,
        questOutcome: 'completed',
      }).campaign;
    }
    const snap = createSaveSnapshot(c);
    const restored = restoreSaveSnapshot(snap);
    expect(restored.campaignProgress.bossQuestRequired).toBe(true);
  });

  it('F.44 Boss Victory 后保存恢复', () => {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    const threatId = c.campaignProgress.activeThreatId!;
    const bossFamilyId = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-1',
      threatId,
      bossFamilyId,
    }).campaign;
    c = advanceCampaignAfterBoss(c).campaign;
    const snap = createSaveSnapshot(c);
    const restored = restoreSaveSnapshot(snap);
    expect(restored.campaignProgress.act).toBe(2);
    expect(restored.campaignProgress.defeatedBossFamilyIds).toContain(bossFamilyId);
  });

  it('F.45 Act II Threat 保存恢复', () => {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    const t1 = c.campaignProgress.activeThreatId!;
    const f1 = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'boss-run-1',
      threatId: t1,
      bossFamilyId: f1,
    }).campaign;
    c = advanceCampaignAfterBoss(c).campaign;
    const t2 = c.campaignProgress.activeThreatId!;
    const snap = createSaveSnapshot(c);
    const restored = restoreSaveSnapshot(snap);
    expect(restored.campaignProgress.activeThreatId).toBe(t2);
  });

  it('F.46 Act IV unlock 保存恢复', () => {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    let t = c.campaignProgress.activeThreatId!;
    let f = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'b1',
      threatId: t,
      bossFamilyId: f,
    }).campaign;
    c = advanceCampaignAfterBoss(c).campaign;
    t = c.campaignProgress.activeThreatId!;
    f = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'b2',
      threatId: t,
      bossFamilyId: f,
    }).campaign;
    c = advanceCampaignAfterBoss(c).campaign;
    t = c.campaignProgress.activeThreatId!;
    f = c.campaignProgress.activeBossFamilyId!;
    c = finalizeBossVictory(c, {
      bossQuestId: FACE_THE_THREAT_QUEST_ID,
      questRunId: 'b3',
      threatId: t,
      bossFamilyId: f,
    }).campaign;
    c = advanceCampaignAfterBoss(c).campaign;
    const snap = createSaveSnapshot(c);
    const restored = restoreSaveSnapshot(snap);
    expect(restored.campaignProgress.darkestDungeonUnlocked).toBe(true);
    expect(restored.campaignProgress.act).toBe(4);
  });

  it('F.47 processedCampaignTransactionIds 写入恢复', () => {
    let c = createNewCampaign();
    c = initializeCampaignAct(c).campaign;
    c = finalizeQuestProgress(c, {
      questId: STANDARD_QUESTS[0].id,
      questRunId: 'r1',
      questOutcome: 'completed',
    }).campaign;
    const snap = createSaveSnapshot(c);
    const restored = restoreSaveSnapshot(snap);
    expect(Array.isArray(restored.processedCampaignTransactionIds)).toBe(true);
    expect(restored.processedCampaignTransactionIds.length).toBeGreaterThan(0);
  });

  it('F.48 Validate Save File（v17 + 顶层字段完整）', () => {
    const c = createNewCampaign();
    const snap = createSaveSnapshot(c);
    expect(snap.version).toBe(SAVE_VERSION);
    const validationError = validateSaveFile(JSON.parse(JSON.stringify(snap)));
    expect(validationError).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 辅助：syncCampaignProgressMirrors 顶层镜像
// ---------------------------------------------------------------------------

describe('syncCampaignProgressMirrors', () => {
  it('act / campaignLevel / currentThreatId 与 campaignProgress 同步', () => {
    const c = createNewCampaign();
    const drifted = {
      ...c,
      act: 1 as const,
      campaignLevel: 1 as const,
      currentThreatId: 'stale-threat',
      campaignProgress: {
        ...c.campaignProgress,
        act: 2 as const,
        campaignLevel: 2 as const,
        activeThreatId: 'fresh-threat',
      },
    };
    const synced = syncCampaignProgressMirrors(drifted);
    expect(synced.act).toBe(2);
    expect(synced.campaignLevel).toBe(2);
    expect(synced.currentThreatId).toBe('fresh-threat');
  });
});

// ---------------------------------------------------------------------------
// 辅助：Standard / Boss Quest 判定
// ---------------------------------------------------------------------------

describe('Quest 分类 helper', () => {
  it('isStandardQuestId / isBossQuestId 正确分类', () => {
    expect(isStandardQuestId('scout-ahead')).toBe(true);
    expect(isStandardQuestId('recover-relic')).toBe(true);
    expect(isStandardQuestId(FACE_THE_THREAT_QUEST_ID)).toBe(false);
    expect(isBossQuestId(FACE_THE_THREAT_QUEST_ID)).toBe(true);
    expect(isBossQuestId('scout-ahead')).toBe(false);
    expect(getQuestById(FACE_THE_THREAT_QUEST_ID)).toBeDefined();
  });
});
