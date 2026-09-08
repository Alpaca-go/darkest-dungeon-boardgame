// Phase 11A — Golden Seed Matrix (spec §18) + Campaign Milestone 定义。
//
// 本文件是 Golden Seed 的**唯一权威来源**（纯 TS 常量，无文件系统依赖）。
// docs/data/core-campaign/golden-seeds.json 由 `npm run audit:content` 从这里导出，
// 而不是反过来读取 —— 避免"落盘产物被手改后与代码不一致"。

import type { ActFourStage } from '../../types/act-four';
import type { CampaignState } from '../../types';

export type GoldenCampaignMode =
  | 'normal'
  | 'save-resume'
  | 'hero-death'
  | 'stagecoach-exhaustion'
  | 'boss-failure'
  | 'guardian-failure'
  | 'final-failure'
  | 'guardian'
  | 'skipped-form';

export interface GoldenSeed {
  id: string;
  rngSeed: string;
  campaignMode: GoldenCampaignMode;
  setupOverrides: Record<string, unknown>;
  expectedMilestones: string[];
  expectedOutcome: 'campaign-victory' | 'campaign-over';
  guardianFamily?: string;
  skippedForm?: string;
  /** 该 seed 当前是否可在正式引擎路径上真正跑完（false 时必须给出 blockedReason）。 */
  runnable: boolean;
  blockedReason?: string;
}

/** 16 个战役里程碑（spec §18）。 */
export interface MilestoneDefinition {
  id: string;
  label: string;
  /** 到达该里程碑所依赖的引擎能力；用于诚实标注"当前不可达"。 */
  requires: string;
  /**
   * 判定该里程碑是否**真正**到达的状态谓词。
   *
   * ⚠️ 审计诚实性要求：里程碑**不得**由「已完成任务数」的下标硬映射推出。
   * 例如完成第 3 个 Standard Quest 不等于「Act I Boss Quest 胜利 → 进入 Act II」；
   * 后者必须由 `campaign.act >= 2` 这一真实状态证实。早期版本按下标映射，
   * 导致报告同时出现「M03 ✅ 到达」与「finalAct = 1 / 阻断于 M03」的自相矛盾。
   */
  verify: (c: CampaignState) => boolean;
}

/** Act IV stage 的线性顺序（用于「到达或越过某阶段」判定）。'campaign-over' 是失败分支，不参与排序。 */
const ACT_FOUR_STAGE_ORDER: ActFourStage[] = [
  'locked',
  'post-third-threat-hamlet',
  'guardian-quest-selection',
  'guardian-dungeon-active',
  'guardian-battle-active',
  'guardian-victory',
  'final-hamlet',
  'final-encounter-ready',
  'final-encounter-active',
  'campaign-victory',
];

function actFourStageAtLeast(c: CampaignState, stage: ActFourStage): boolean {
  const cur = c.actFourState?.stage;
  if (!cur) return false;
  const curIdx = ACT_FOUR_STAGE_ORDER.indexOf(cur);
  const wantIdx = ACT_FOUR_STAGE_ORDER.indexOf(stage);
  return curIdx >= 0 && wantIdx >= 0 && curIdx >= wantIdx;
}

export const CAMPAIGN_MILESTONES: MilestoneDefinition[] = [
  {
    id: 'M00',
    label: '新战役创建完成（4 英雄 + 默认技能）',
    requires: 'createNewCampaign / selectParty / applyDefaultLoadout',
    verify: (c) => c.heroes.length >= 4,
  },
  {
    id: 'M01',
    label: 'Act I · Standard Quest 1 结算完成',
    requires: 'selectQuest / finishQuest / startHamletPhase',
    verify: (c) => c.gamePhase === 'hamlet' && c.act === 1 && c.completedQuestCount >= 1,
  },
  {
    id: 'M02',
    label: 'Act I · Standard Quest 2 结算完成',
    requires: 'campaign-progress.withStandardQuestCompleted',
    verify: (c) => c.gamePhase === 'hamlet' && c.act === 1 && c.campaignProgress.completedStandardQuestsThisAct === 2,
  },
  {
    id: 'M03',
    label: 'Act I · Boss Quest 胜利 → 进入 Act II',
    requires: 'campaign-progress.withActStarted + Boss Quest 可选中',
    verify: (c) => c.act >= 2,
  },
  {
    id: 'M04',
    label: 'Act II · Standard Quest 1 结算完成',
    requires: 'Act 推进生效',
    verify: (c) => c.act >= 2 && c.completedQuestCount >= 4,
  },
  {
    id: 'M05',
    label: 'Act II · Standard Quest 2 结算完成',
    requires: 'Act 推进生效',
    verify: (c) => c.act >= 2 && c.completedQuestCount >= 5,
  },
  {
    id: 'M06',
    label: 'Act II · Boss Quest 胜利 → 进入 Act III',
    requires: 'Act 推进生效',
    verify: (c) => c.act >= 3,
  },
  {
    id: 'M07',
    label: 'Act III · Standard Quest 1 结算完成',
    requires: 'Act 推进生效',
    verify: (c) => c.act >= 3 && c.completedQuestCount >= 7,
  },
  {
    id: 'M08',
    label: 'Act III · Standard Quest 2 结算完成',
    requires: 'Act 推进生效',
    verify: (c) => c.act >= 3 && c.completedQuestCount >= 8,
  },
  {
    id: 'M09',
    label: 'Act III · Boss Quest 胜利 → 第三 Threat 后 Hamlet',
    requires: 'Act 推进生效',
    verify: (c) =>
      c.act >= 3 && c.completedQuestCount >= 9 && actFourStageAtLeast(c, 'post-third-threat-hamlet'),
  },
  {
    id: 'M10',
    label: 'Darkest Dungeon 解锁 + Guardian Quest 生成',
    requires: 'act-four unlock + createGuardianQuest',
    verify: (c) => (c.actFourState?.unlocked ?? false) && c.actFourState?.guardianQuestState != null,
  },
  {
    id: 'M11',
    label: 'Guardian 击败 → Final Hamlet',
    requires: 'resolveGuardianVictory（官方数据缺失，仅 prototype harness）',
    verify: (c) => actFourStageAtLeast(c, 'final-hamlet'),
  },
  {
    id: 'M12',
    label: 'Final Hamlet 4 天完成',
    requires: 'startFinalHamlet / advanceFinalHamletDay',
    verify: (c) => actFourStageAtLeast(c, 'final-encounter-ready'),
  },
  {
    id: 'M13',
    label: 'Final Encounter 开始（首个 Form 出场）',
    requires: 'prepareFinalEncounter / startFinalEncounter',
    verify: (c) => actFourStageAtLeast(c, 'final-encounter-active'),
  },
  {
    id: 'M14',
    label: '倒数第二个 Form 被击败',
    requires: 'defeatFinalForm / transitionToNextFinalForm',
    verify: (c) => {
      const fe = c.actFourState?.finalEncounterState;
      if (!fe) return false;
      return fe.defeatedFormIds.length >= Math.max(1, fe.orderedFormIds.length - 1);
    },
  },
  {
    id: 'M15',
    label: 'Heart of Darkness 击败 → Campaign Victory',
    requires: 'resolveCampaignVictory',
    verify: (c) => c.actFourState?.stage === 'campaign-victory',
  },
];

export const MILESTONE_IDS = CAMPAIGN_MILESTONES.map((m) => m.id);

/**
 * Golden Seed 矩阵。
 *
 * ⚠️ 诚实标注：`runnable: false` 的 seed 在 Phase 11A 无法在**正式引擎路径**上跑完，
 * 原因写在 blockedReason 里，会被 Issue Ledger 与 Release Gate 直接引用。
 */
export const GOLDEN_SEEDS: GoldenSeed[] = [
  {
    id: 'golden-normal-success-01',
    rngSeed: '20260802',
    campaignMode: 'normal',
    setupOverrides: {},
    expectedMilestones: MILESTONE_IDS,
    expectedOutcome: 'campaign-victory',
    runnable: false,
    blockedReason: 'ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked',
  },
  {
    id: 'golden-save-resume-01',
    rngSeed: 'sr-01',
    campaignMode: 'save-resume',
    setupOverrides: {},
    expectedMilestones: MILESTONE_IDS,
    expectedOutcome: 'campaign-victory',
    runnable: false,
    blockedReason: 'ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked',
  },
  {
    id: 'golden-hero-death-replacement-01',
    rngSeed: 'hd-01',
    campaignMode: 'hero-death',
    setupOverrides: {},
    expectedMilestones: MILESTONE_IDS,
    expectedOutcome: 'campaign-victory',
    runnable: false,
    blockedReason: 'ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked',
  },
  {
    id: 'golden-stagecoach-exhaustion-01',
    rngSeed: 'se-01',
    campaignMode: 'stagecoach-exhaustion',
    setupOverrides: {},
    expectedMilestones: ['M00'],
    expectedOutcome: 'campaign-over',
    runnable: true,
  },
  {
    id: 'golden-boss-failure-01',
    rngSeed: 'bf-01',
    campaignMode: 'boss-failure',
    setupOverrides: {},
    expectedMilestones: ['M00'],
    expectedOutcome: 'campaign-over',
    runnable: true,
  },
  {
    id: 'golden-guardian-failure-01',
    rngSeed: 'gf-01',
    campaignMode: 'guardian-failure',
    setupOverrides: {},
    expectedMilestones: ['M00', 'M10'],
    expectedOutcome: 'campaign-over',
    runnable: false,
    blockedReason: 'ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked',
  },
  {
    id: 'golden-final-failure-01',
    rngSeed: 'ff-01',
    campaignMode: 'final-failure',
    setupOverrides: {},
    expectedMilestones: ['M00', 'M10', 'M11', 'M12', 'M13'],
    expectedOutcome: 'campaign-over',
    runnable: false,
    blockedReason: 'ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked',
  },
  {
    id: 'golden-templars-guardian',
    rngSeed: 'tmpl',
    campaignMode: 'guardian',
    setupOverrides: {},
    expectedMilestones: ['M10', 'M11'],
    expectedOutcome: 'campaign-victory',
    guardianFamily: 'templars',
    runnable: false,
    blockedReason: 'ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked',
  },
  {
    id: 'golden-mammoth-cyst-guardian',
    rngSeed: 'mmth',
    campaignMode: 'guardian',
    setupOverrides: {},
    expectedMilestones: ['M10', 'M11'],
    expectedOutcome: 'campaign-victory',
    guardianFamily: 'mammoth-cyst',
    runnable: false,
    blockedReason: 'ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked',
  },
  {
    id: 'golden-shuffling-horror-guardian',
    rngSeed: 'shuf',
    campaignMode: 'guardian',
    setupOverrides: {},
    expectedMilestones: ['M10', 'M11'],
    expectedOutcome: 'campaign-victory',
    guardianFamily: 'shuffling-horror',
    runnable: false,
    blockedReason: 'ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked',
  },
  {
    id: 'golden-skip-ancestor-first',
    rngSeed: 'sk1',
    campaignMode: 'skipped-form',
    setupOverrides: {},
    expectedMilestones: ['M12', 'M13', 'M14', 'M15'],
    expectedOutcome: 'campaign-victory',
    skippedForm: 'ancestor-first-form',
    runnable: false,
    blockedReason: 'ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked',
  },
  {
    id: 'golden-skip-ancestor-second',
    rngSeed: 'sk2',
    campaignMode: 'skipped-form',
    setupOverrides: {},
    expectedMilestones: ['M12', 'M13', 'M14', 'M15'],
    expectedOutcome: 'campaign-victory',
    skippedForm: 'ancestor-second-form',
    runnable: false,
    blockedReason: 'ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked',
  },
  {
    id: 'golden-skip-gestating-heart',
    rngSeed: 'sk3',
    campaignMode: 'skipped-form',
    setupOverrides: {},
    expectedMilestones: ['M12', 'M13', 'M14', 'M15'],
    expectedOutcome: 'campaign-victory',
    skippedForm: 'gestating-heart',
    runnable: false,
    blockedReason: 'ISSUE-P0-002: Official Guardian / Final Encounter data unavailable; full official campaign remains blocked',
  },
];

export function loadGoldenSeeds(): GoldenSeed[] {
  return GOLDEN_SEEDS;
}

export function getGoldenSeed(id: string): GoldenSeed | undefined {
  return GOLDEN_SEEDS.find((s) => s.id === id);
}

export function runnableGoldenSeeds(): GoldenSeed[] {
  return GOLDEN_SEEDS.filter((s) => s.runnable);
}

export function blockedGoldenSeeds(): GoldenSeed[] {
  return GOLDEN_SEEDS.filter((s) => !s.runnable);
}
