import type {
  BattleState,
  BattleUnit,
  CampaignState,
  DungeonState,
  GamePhase,
  HamletState,
  HeroDiseaseState,
  HeroInstance,
  HeroLevel,
  HeroXpState,
  HeroTrinketState,
  NomadWagonState,
  QuestResultSummary,
  TrinketSide,
} from '../types';
import { nowIso } from './random';
import { createInitialStagecoach } from './stagecoach';
import { getQuirkById, normalizeQuirkId } from '../data/quirks';
import { getDiseaseById } from '../data/diseases';
import { QUIRK_CAP } from './quirks';
import { getTrinketById } from '../data/trinkets/trinket-registry';
import { createInitialNomadWagonState } from './trinkets/trinket-state';
import { getTrinketCapacity } from './trinkets/capacity';

// ---------------------------------------------------------------------------
// 存档格式（Phase 6 升级为 v3 SaveFile）
// ---------------------------------------------------------------------------

/** localStorage 键名（沿用 v1 键名以便旧存档可被发现并迁移）。 */
export const STORAGE_KEY = 'dd-web-prototype-save-v1';
/**
 * 当前存档格式版本。
 * v1 = SaveEnvelope（Phase 1-4），v2 = SaveFile（Phase 5），
 * v3 = Phase 6（死亡/Stagecoach），v4 = Phase 7（Stress/Resolve/Affliction/Virtue/Heart Attack），
 * v5 = Phase 8A（Quirk 引擎：真实 Quirk id / 上限 3 / pendingQuirkDecisions），
 * v6 = Phase 8B（Disease / Sanitarium 移除 / Curio / 战斗外 Bleed-Blight 累积），
 * v7 = Phase 8C + 8D（Trinket + Quest XP / Hero Level / Skill Level / Guild）。
 */
export const SAVE_VERSION = 7;

/**
 * v2 存档文件结构。
 * campaign 为唯一权威数据源；gamePhase/dungeon/battle/questResult/hamlet
 * 是顶层镜像（方便导出后的 JSON 可读与快速校验），恢复时以 campaign 为准。
 */
export interface SaveFile {
  version: number;
  savedAt: string;
  gamePhase: GamePhase;
  campaign: CampaignState;
  dungeon: DungeonState | null;
  battle: BattleState | null;
  questResult: QuestResultSummary | null;
  hamlet: HamletState;
}

/** v1 存档信封（Phase 1-4 使用）。 */
interface SaveEnvelopeV1 {
  saveVersion: number;
  savedAt: string;
  campaign: CampaignState;
}

/** 可被迁移到当前版本的历史存档版本号。 */
const LEGACY_SAVE_VERSIONS: number[] = [1, 2, 3, 4, 5, 6];

/** 读档结果：区分正常 / 无存档 / 损坏 / 版本不支持。 */
export type LoadStatus = 'ok' | 'empty' | 'corrupt' | 'unsupported';
export interface LoadResult {
  status: LoadStatus;
  campaign: CampaignState | null;
  error?: string;
}

const VALID_PHASES: GamePhase[] = [
  'home',
  'campaign-setup',
  'skill-loadout',
  'quest-select',
  'dungeon-explore',
  'battle',
  'quest-result',
  'hamlet',
  'replacement',
  'campaign-over',
];

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 快照 / 校验 / 迁移 / 修复
// ---------------------------------------------------------------------------

/** 从战役状态创建一份可序列化的存档快照。 */
export function createSaveSnapshot(campaign: CampaignState): SaveFile {
  return {
    version: SAVE_VERSION,
    savedAt: nowIso(),
    gamePhase: campaign.gamePhase,
    campaign,
    dungeon: campaign.dungeon,
    battle: campaign.battle,
    questResult: campaign.lastQuestResult,
    hamlet: campaign.hamlet,
  };
}

/**
 * 校验存档结构。只做结构与引用完整性检查，不修复。
 * 返回 null 表示合法，否则为第一条错误信息。
 */
export function validateSaveFile(data: unknown): string | null {
  if (!data || typeof data !== 'object') return '存档不是合法的 JSON 对象';
  const s = data as Partial<SaveFile>;
  if (typeof s.version !== 'number') return '缺少 version 字段';
  if (s.version !== SAVE_VERSION) return `不支持的存档版本：${s.version}（当前 v${SAVE_VERSION}）`;
  if (typeof s.savedAt !== 'string') return '缺少 savedAt 字段';
  if (!s.gamePhase || !VALID_PHASES.includes(s.gamePhase)) return `非法 gamePhase：${String(s.gamePhase)}`;

  const c = s.campaign as Partial<CampaignState> | undefined;
  if (!c || typeof c !== 'object') return '缺少 campaign 字段';
  if (!Array.isArray(c.heroes)) return 'campaign.heroes 缺失或不是数组';
  if (typeof c.gold !== 'number' || Number.isNaN(c.gold)) return 'campaign.gold 非法';
  if (!c.gamePhase || !VALID_PHASES.includes(c.gamePhase)) return 'campaign.gamePhase 非法';
  for (const h of c.heroes) {
    if (!h || typeof h.instanceId !== 'string' || typeof h.heroId !== 'string') {
      return '英雄数据缺少 instanceId/heroId';
    }
    // Phase 7：精神系统字段结构校验（迁移后必然存在）
    if (typeof h.stress !== 'number' || h.stress < 0 || h.stress > 10) {
      return `英雄 ${h.instanceId} 的 stress 超出 0-10 范围`;
    }
    if (h.resolveState !== 'normal' && h.resolveState !== 'virtuous' && h.resolveState !== 'afflicted') {
      return `英雄 ${h.instanceId} 的 resolveState 非法`;
    }
    if (h.resolveState === 'virtuous' && !h.virtueId) {
      return `英雄 ${h.instanceId} 处于 virtuous 但缺少 virtueId`;
    }
    if (h.resolveState === 'afflicted' && !h.afflictionId) {
      return `英雄 ${h.instanceId} 处于 afflicted 但缺少 afflictionId`;
    }
    // Phase 8A：Quirk 结构与上限校验（迁移后必然合法）
    if (!Array.isArray(h.positiveQuirkIds) || !Array.isArray(h.negativeQuirkIds)) {
      return `英雄 ${h.instanceId} 的 Quirk 字段不是数组`;
    }
    if (h.positiveQuirkIds.length + h.negativeQuirkIds.length > QUIRK_CAP) {
      return `英雄 ${h.instanceId} 的 Quirk 数量超过上限 ${QUIRK_CAP}`;
    }
    for (const qid of [...h.positiveQuirkIds, ...h.negativeQuirkIds]) {
      if (!getQuirkById(qid)) return `英雄 ${h.instanceId} 引用了未知 Quirk：${qid}`;
    }
    // Phase 8B：Disease 结构校验（每人最多 1 个，且必须引用已知 Disease）
    if (h.disease !== null && h.disease !== undefined) {
      if (typeof h.disease.diseaseId !== 'string' || typeof h.disease.instanceId !== 'string') {
        return `英雄 ${h.instanceId} 的 disease 结构非法`;
      }
      if (!getDiseaseById(h.disease.diseaseId)) {
        return `英雄 ${h.instanceId} 引用了未知 Disease：${h.disease.diseaseId}`;
      }
    }
    if (typeof h.pendingBleed !== 'number' || h.pendingBleed < 0) {
      return `英雄 ${h.instanceId} 的 pendingBleed 非法`;
    }
    if (typeof h.pendingBlight !== 'number' || h.pendingBlight < 0) {
      return `英雄 ${h.instanceId} 的 pendingBlight 非法`;
    }
    // Phase 8D：XP Ledger 与等级结构校验（迁移后必然合法）
    const xs = h.xpState;
    if (!xs || typeof xs !== 'object') return `英雄 ${h.instanceId} 缺少 xpState`;
    if (
      typeof xs.currentXp !== 'number' ||
      typeof xs.lifetimeXpEarned !== 'number' ||
      typeof xs.lifetimeXpSpent !== 'number' ||
      xs.currentXp < 0 ||
      xs.lifetimeXpEarned < 0 ||
      xs.lifetimeXpSpent < 0
    ) {
      return `英雄 ${h.instanceId} 的 xpState 数值非法`;
    }
    if (xs.currentXp !== xs.lifetimeXpEarned - xs.lifetimeXpSpent) {
      return `英雄 ${h.instanceId} 的 XP 台账不平（${xs.lifetimeXpEarned} - ${xs.lifetimeXpSpent} ≠ ${xs.currentXp}）`;
    }
    if (h.xp !== xs.currentXp) {
      return `英雄 ${h.instanceId} 的 xp 镜像与 xpState.currentXp 不一致`;
    }
    if (h.level !== 1 && h.level !== 2 && h.level !== 3) {
      return `英雄 ${h.instanceId} 的 level 超出 I-III 范围`;
    }
    for (const [sid, lv] of Object.entries(h.skillLevels ?? {})) {
      if (lv !== 1 && lv !== 2 && lv !== 3) {
        return `英雄 ${h.instanceId} 的技能 ${sid} 等级超出 I-III 范围`;
      }
    }
    // Phase 8C：Trinket 结构 / 容量 / 定义引用校验（迁移后必然合法）
    if (!Array.isArray(h.equippedTrinkets)) {
      return `英雄 ${h.instanceId} 的 equippedTrinkets 缺失或不是数组`;
    }
    if (h.equippedTrinkets.length > getTrinketCapacity(h)) {
      return `英雄 ${h.instanceId} 的 Trinket 数量（${h.equippedTrinkets.length}）超过容量（等级 ${h.level}）`;
    }
    const seenTrinketInstanceIds = new Set<string>();
    for (const t of h.equippedTrinkets) {
      if (!t || typeof t.instanceId !== 'string' || typeof t.trinketId !== 'string') {
        return `英雄 ${h.instanceId} 的 Trinket 结构非法`;
      }
      if (seenTrinketInstanceIds.has(t.instanceId)) {
        return `英雄 ${h.instanceId} 存在重复的 Trinket 实例：${t.instanceId}`;
      }
      seenTrinketInstanceIds.add(t.instanceId);
      if (!getTrinketById(t.trinketId)) {
        return `英雄 ${h.instanceId} 引用了未知 Trinket：${t.trinketId}`;
      }
      if (t.currentSide !== 'positive' && t.currentSide !== 'negative') {
        return `英雄 ${h.instanceId} 的 Trinket ${t.instanceId} 面向非法`;
      }
    }
  }
  // 同一 Trinket 实例不得同时被两名英雄持有（无公共仓库，实例唯一）
  const globalTrinketInstanceIds = new Set<string>();
  for (const h of c.heroes) {
    for (const t of h.equippedTrinkets ?? []) {
      if (globalTrinketInstanceIds.has(t.instanceId)) {
        return `Trinket 实例 ${t.instanceId} 被多名英雄同时持有`;
      }
      globalTrinketInstanceIds.add(t.instanceId);
    }
  }
  if (!Array.isArray(c.progressionTransactions)) return 'campaign.progressionTransactions 缺失或不是数组';
  if (!Array.isArray(c.temporarySkillFormOverrides)) {
    return 'campaign.temporarySkillFormOverrides 缺失或不是数组';
  }
  if (!Array.isArray(c.pendingQuirkDecisions)) return 'campaign.pendingQuirkDecisions 缺失或不是数组';
  if (!Array.isArray(c.diseaseAcquisitionRecords)) return 'campaign.diseaseAcquisitionRecords 缺失或不是数组';
  if (!Array.isArray(c.diseaseTreatmentRecords)) return 'campaign.diseaseTreatmentRecords 缺失或不是数组';
  if (!Array.isArray(c.processedDiseaseEventIds)) return 'campaign.processedDiseaseEventIds 缺失或不是数组';
  // Phase 8C
  if (!Array.isArray(c.pendingTrinketAllocations)) return 'campaign.pendingTrinketAllocations 缺失或不是数组';
  if (!Array.isArray(c.trinketAcquisitionRecords)) return 'campaign.trinketAcquisitionRecords 缺失或不是数组';
  if (!Array.isArray(c.processedTrinketEventIds)) return 'campaign.processedTrinketEventIds 缺失或不是数组';
  if (!Array.isArray(c.processedTrinketResetKeys)) return 'campaign.processedTrinketResetKeys 缺失或不是数组';
  if (!c.nomadWagon || typeof c.nomadWagon !== 'object') return 'campaign.nomadWagon 缺失';

  // 阶段相关引用完整性
  if (c.gamePhase === 'dungeon-explore' || c.gamePhase === 'battle') {
    const d = c.dungeon as DungeonState | null | undefined;
    if (!d || !Array.isArray(d.rooms)) return `${c.gamePhase} 阶段缺少合法的 dungeon`;
    if (!d.rooms.some((r) => r.id === d.currentRoomId)) return 'dungeon.currentRoomId 引用了不存在的房间';
  }
  if (c.gamePhase === 'battle') {
    const b = c.battle as BattleState | null | undefined;
    if (!b || !Array.isArray(b.heroes) || !Array.isArray(b.monsters)) return 'battle 阶段缺少合法的 BattleState';
    for (const u of b.heroes) {
      if (!c.heroes.some((h) => h.instanceId === u.sourceId)) {
        return `战斗单位 ${u.id} 引用了不存在的英雄`;
      }
    }
  }
  if (c.gamePhase === 'quest-result' && !c.lastQuestResult) return 'quest-result 阶段缺少 lastQuestResult';
  if (c.gamePhase === 'hamlet') {
    const h = c.hamlet as HamletState | undefined;
    if (!h || typeof h.preparationDays !== 'number') return 'hamlet 阶段缺少合法的 HamletState';
  }
  return null;
}

/**
 * Phase 6 战役字段迁移（v1/v2 → v3）：
 * - 英雄补 dead=false / atDeathsDoor=false / deathblowRollCount=0 / skillLevels={} / partySlot；
 * - 旧存档 hp<=0（wounds>=maxLife）的存活英雄恢复为 1 HP —— 迁移绝不制造意外永久死亡；
 * - 补 stagecoach（waitingTokens=2, accumulatedXp=0）、deathRecords=[]、
 *   processedDamageEventIds=[]、stagecoachXpApplied=false、campaignOverReason=null。
 */
export function migrateCampaignToV3(campaign: CampaignState): CampaignState {
  const anyC = campaign as CampaignState & Record<string, unknown>;
  const heroes: HeroInstance[] = (campaign.heroes ?? []).map((h, i) => {
    const anyH = h as HeroInstance & Record<string, unknown>;
    const dead = typeof anyH.dead === 'boolean' ? anyH.dead : false;
    // 旧存档：wounds >= maxLife（hp<=0）但未死 → 恢复为 1 HP
    const wounds = !dead && h.wounds >= h.maxLife ? h.maxLife - 1 : h.wounds;
    return {
      ...h,
      wounds: Math.max(0, wounds),
      isAlive: !dead,
      partySlot: typeof anyH.partySlot === 'number' ? anyH.partySlot : i + 1,
      atDeathsDoor: typeof anyH.atDeathsDoor === 'boolean' ? anyH.atDeathsDoor : false,
      dead,
      deathblowRollCount:
        typeof anyH.deathblowRollCount === 'number' ? anyH.deathblowRollCount : 0,
      skillLevels:
        anyH.skillLevels && typeof anyH.skillLevels === 'object'
          ? (anyH.skillLevels as HeroInstance['skillLevels'])
          : {},
    };
  });
  return {
    ...campaign,
    saveVersion: SAVE_VERSION,
    heroes,
    stagecoach:
      anyC.stagecoach && typeof anyC.stagecoach === 'object'
        ? campaign.stagecoach
        : createInitialStagecoach(),
    deathRecords: Array.isArray(anyC.deathRecords) ? campaign.deathRecords : [],
    processedDamageEventIds: Array.isArray(anyC.processedDamageEventIds)
      ? campaign.processedDamageEventIds
      : [],
    stagecoachXpApplied:
      typeof anyC.stagecoachXpApplied === 'boolean' ? campaign.stagecoachXpApplied : false,
    campaignOverReason:
      typeof anyC.campaignOverReason === 'string' ? campaign.campaignOverReason : null,
  };
}

/** Stress 合法范围钳制（Phase 7：0-10）。 */
function clampStress(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(10, Math.round(n)));
}

/**
 * Phase 7 战役字段迁移（v3 → v4）：
 * - 英雄补精神系统字段：resolveTestedThisQuest=false / resolveState='normal' /
 *   virtueId=null / afflictionId=null / heartAttackCount=0 /
 *   positiveQuirkIds=[] / negativeQuirkIds=[] / lastResolveQuestId=null / lastMentalEventId=null；
 * - stress 钳制到 0-10（旧存档若超界不视为损坏，直接修正）；
 * - 进行中的战斗（campaign.battle）内的单位同步补 BattleUnit 精神字段
 *   （英雄单位从对应战役英雄同步，怪物全默认值）。
 */
export function migrateCampaignToV4(campaign: CampaignState): CampaignState {
  let changed = false;

  const heroes: HeroInstance[] = (campaign.heroes ?? []).map((h) => {
    const anyH = h as HeroInstance & Record<string, unknown>;
    const needs =
      typeof anyH.resolveTestedThisQuest !== 'boolean' ||
      typeof anyH.resolveState !== 'string' ||
      anyH.virtueId === undefined ||
      anyH.afflictionId === undefined ||
      typeof anyH.heartAttackCount !== 'number' ||
      !Array.isArray(anyH.positiveQuirkIds) ||
      !Array.isArray(anyH.negativeQuirkIds) ||
      anyH.lastResolveQuestId === undefined ||
      anyH.lastMentalEventId === undefined ||
      clampStress(anyH.stress) !== anyH.stress;
    if (!needs) return h;
    changed = true;
    return {
      ...h,
      stress: clampStress(anyH.stress),
      resolveTestedThisQuest:
        typeof anyH.resolveTestedThisQuest === 'boolean' ? anyH.resolveTestedThisQuest : false,
      resolveState:
        anyH.resolveState === 'virtuous' || anyH.resolveState === 'afflicted'
          ? anyH.resolveState
          : 'normal',
      virtueId: typeof anyH.virtueId === 'string' ? anyH.virtueId : null,
      afflictionId: typeof anyH.afflictionId === 'string' ? anyH.afflictionId : null,
      heartAttackCount: typeof anyH.heartAttackCount === 'number' ? anyH.heartAttackCount : 0,
      positiveQuirkIds: Array.isArray(anyH.positiveQuirkIds)
        ? (anyH.positiveQuirkIds as string[])
        : [],
      negativeQuirkIds: Array.isArray(anyH.negativeQuirkIds)
        ? (anyH.negativeQuirkIds as string[])
        : [],
      lastResolveQuestId:
        typeof anyH.lastResolveQuestId === 'string' ? anyH.lastResolveQuestId : null,
      lastMentalEventId:
        typeof anyH.lastMentalEventId === 'string' ? anyH.lastMentalEventId : null,
    };
  });

  let battle = campaign.battle;
  if (battle) {
    const migrateUnit = (u: BattleUnit): BattleUnit => {
      const anyU = u as BattleUnit & Record<string, unknown>;
      const needs =
        typeof anyU.resolveTestedThisQuest !== 'boolean' ||
        typeof anyU.resolveState !== 'string' ||
        anyU.virtueId === undefined ||
        anyU.afflictionId === undefined ||
        anyU.mentalEffectResolvedTurnId === undefined ||
        clampStress(anyU.stress) !== anyU.stress;
      if (!needs) return u;
      changed = true;
      // 英雄单位优先从战役英雄同步精神状态
      const src = u.side === 'hero' ? heroes.find((h) => h.instanceId === u.sourceId) : undefined;
      return {
        ...u,
        stress: clampStress(anyU.stress),
        resolveTestedThisQuest:
          typeof anyU.resolveTestedThisQuest === 'boolean'
            ? anyU.resolveTestedThisQuest
            : src?.resolveTestedThisQuest ?? false,
        resolveState:
          anyU.resolveState === 'virtuous' || anyU.resolveState === 'afflicted'
            ? anyU.resolveState
            : src?.resolveState ?? 'normal',
        virtueId: typeof anyU.virtueId === 'string' ? anyU.virtueId : src?.virtueId ?? null,
        afflictionId:
          typeof anyU.afflictionId === 'string' ? anyU.afflictionId : src?.afflictionId ?? null,
        mentalEffectResolvedTurnId:
          typeof anyU.mentalEffectResolvedTurnId === 'string'
            ? anyU.mentalEffectResolvedTurnId
            : null,
      };
    };
    const nextHeroUnits = battle.heroes.map(migrateUnit);
    const nextMonsterUnits = battle.monsters.map(migrateUnit);
    if (changed) battle = { ...battle, heroes: nextHeroUnits, monsters: nextMonsterUnits };
  }

  // 战役级 Phase 7 字段
  const anyC = campaign as CampaignState & Record<string, unknown>;
  const needsCampaignFields =
    !Array.isArray(anyC.mentalEvents) ||
    !Array.isArray(anyC.resolveConversionRecords) ||
    !Array.isArray(anyC.processedStressBatchIds);
  if (needsCampaignFields) changed = true;

  if (!changed && campaign.saveVersion === SAVE_VERSION) return campaign;
  return {
    ...campaign,
    saveVersion: SAVE_VERSION,
    heroes,
    battle,
    mentalEvents: Array.isArray(anyC.mentalEvents) ? campaign.mentalEvents : [],
    resolveConversionRecords: Array.isArray(anyC.resolveConversionRecords)
      ? campaign.resolveConversionRecords
      : [],
    processedStressBatchIds: Array.isArray(anyC.processedStressBatchIds)
      ? campaign.processedStressBatchIds
      : [],
  };
}

/**
 * Phase 8A 战役字段迁移（v4 → v5）：
 * - 英雄的 Quirk id 归一化（Phase 7 占位 id → 真实 Quirk id），未知 id 丢弃；
 * - 去重，并按「先正面后负面、超出部分丢弃」裁剪到上限 3（迁移绝不制造 Madness Death）；
 * - 补 campaign.pendingQuirkDecisions=[]；
 * - 进行中的战斗补 BattleUnit.quirkIds（英雄从战役英雄同步）与 battle.light。
 */
export function migrateCampaignToV5(campaign: CampaignState): CampaignState {
  let changed = false;

  const heroes: HeroInstance[] = (campaign.heroes ?? []).map((h) => {
    const rawPos = Array.isArray(h.positiveQuirkIds) ? h.positiveQuirkIds : [];
    const rawNeg = Array.isArray(h.negativeQuirkIds) ? h.negativeQuirkIds : [];
    const seen = new Set<string>();
    const norm = (ids: string[], polarity: 'positive' | 'negative'): string[] => {
      const out: string[] = [];
      for (const id of ids) {
        const nid = normalizeQuirkId(id);
        if (!nid || seen.has(nid)) continue;
        if (getQuirkById(nid)?.polarity !== polarity) continue;
        seen.add(nid);
        out.push(nid);
      }
      return out;
    };
    let pos = norm(rawPos, 'positive');
    let neg = norm(rawNeg, 'negative');
    // 裁剪到上限 3：优先保留正面，再补负面
    if (pos.length + neg.length > QUIRK_CAP) {
      pos = pos.slice(0, QUIRK_CAP);
      neg = neg.slice(0, Math.max(0, QUIRK_CAP - pos.length));
    }
    const same =
      pos.length === rawPos.length &&
      neg.length === rawNeg.length &&
      pos.every((id, i) => id === rawPos[i]) &&
      neg.every((id, i) => id === rawNeg[i]);
    if (same) return h;
    changed = true;
    return { ...h, positiveQuirkIds: pos, negativeQuirkIds: neg };
  });

  let battle = campaign.battle;
  if (battle) {
    const needsUnit = (u: BattleUnit) => !Array.isArray(u.quirkIds);
    if (battle.heroes.some(needsUnit) || battle.monsters.some(needsUnit) || battle.light === undefined) {
      changed = true;
      battle = {
        ...battle,
        light: typeof battle.light === 'number' ? battle.light : campaign.light,
        heroes: battle.heroes.map((u) => {
          if (Array.isArray(u.quirkIds)) return u;
          const src = heroes.find((h) => h.instanceId === u.sourceId);
          return {
            ...u,
            quirkIds: src ? [...src.positiveQuirkIds, ...src.negativeQuirkIds] : [],
          };
        }),
        monsters: battle.monsters.map((u) => (Array.isArray(u.quirkIds) ? u : { ...u, quirkIds: [] })),
      };
    }
  }

  const anyC = campaign as CampaignState & Record<string, unknown>;
  if (!Array.isArray(anyC.pendingQuirkDecisions)) changed = true;

  if (!changed && campaign.saveVersion === SAVE_VERSION) return campaign;
  return {
    ...campaign,
    saveVersion: SAVE_VERSION,
    heroes,
    battle,
    pendingQuirkDecisions: Array.isArray(anyC.pendingQuirkDecisions)
      ? campaign.pendingQuirkDecisions
      : [],
  };
}

/** 非负整数钳制（Phase 8B：pendingBleed / pendingBlight；Phase 8D：XP）。 */
function clampNonNegative(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(0, n);
}

/** 等级钳制到 I-III（Phase 8D：Hero Level / Skill Level 共用）。
 *  数值合法（1/2/3）保持原值；超出范围钳制到最近边界（如 5 → 3、0 → 1）；
 *  非数值（缺失/损坏）默认 1。 */
function clampLevel(value: unknown): HeroLevel {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.round(Math.max(1, Math.min(3, value))) as HeroLevel;
}

/**
 * Phase 8B 战役字段迁移（v5 → v6）：
 * - 英雄补 disease=null / pendingBleed=0 / pendingBlight=0；已有 disease 若引用未知
 *   Disease id 则丢弃为 null（迁移绝不制造未知被动，也绝不制造 Madness Death）；
 * - 战役补 diseaseAcquisitionRecords / diseaseTreatmentRecords / processedDiseaseEventIds /
 *   pendingDiseaseTransaction=null / lastDiseaseAcquisition=null；
 * - 旧存档遗留的 pendingDiseaseTransaction 一律清空（旧事务在新会话中无法安全续做）；
 * - hamlet 补 visitId（Sanitarium 幂等键依赖）；
 * - dungeon 房间补 curioId=null / curioUsed=false（旧地牢不追加 Curio）；
 * - 进行中的战斗补 BattleUnit.diseaseId / diseaseInstanceId / heroLevel（英雄从战役英雄同步），
 *   并补 battle.pendingRuleEvents / pendingDiseaseInfections 为空队列。
 */
export function migrateCampaignToV6(campaign: CampaignState): CampaignState {
  let changed = false;

  const heroes: HeroInstance[] = (campaign.heroes ?? []).map((h) => {
    const anyH = h as HeroInstance & Record<string, unknown>;
    const rawDisease = anyH.disease as HeroDiseaseState | null | undefined;
    const disease: HeroDiseaseState | null =
      rawDisease && typeof rawDisease === 'object' && getDiseaseById(rawDisease.diseaseId)
        ? rawDisease
        : null;
    const pendingBleed = clampNonNegative(anyH.pendingBleed);
    const pendingBlight = clampNonNegative(anyH.pendingBlight);
    const needs =
      anyH.disease === undefined ||
      disease !== (rawDisease ?? null) ||
      anyH.pendingBleed !== pendingBleed ||
      anyH.pendingBlight !== pendingBlight;
    if (!needs) return h;
    changed = true;
    return { ...h, disease, pendingBleed, pendingBlight };
  });

  let battle = campaign.battle;
  if (battle) {
    const unitNeeds = (u: BattleUnit) =>
      (u as BattleUnit & Record<string, unknown>).diseaseId === undefined ||
      (u as BattleUnit & Record<string, unknown>).diseaseInstanceId === undefined;
    const anyB = battle as BattleState & Record<string, unknown>;
    if (
      battle.heroes.some(unitNeeds) ||
      battle.monsters.some(unitNeeds) ||
      !Array.isArray(anyB.pendingRuleEvents) ||
      !Array.isArray(anyB.pendingDiseaseInfections)
    ) {
      changed = true;
      battle = {
        ...battle,
        pendingRuleEvents: Array.isArray(anyB.pendingRuleEvents) ? battle.pendingRuleEvents : [],
        pendingDiseaseInfections: Array.isArray(anyB.pendingDiseaseInfections)
          ? battle.pendingDiseaseInfections
          : [],
        heroes: battle.heroes.map((u) => {
          if (!unitNeeds(u)) return u;
          const src = heroes.find((h) => h.instanceId === u.sourceId);
          return {
            ...u,
            diseaseId: src?.disease?.diseaseId ?? null,
            diseaseInstanceId: src?.disease?.instanceId ?? null,
            heroLevel: typeof u.heroLevel === 'number' ? u.heroLevel : src?.level ?? 1,
          };
        }),
        monsters: battle.monsters.map((u) =>
          unitNeeds(u) ? { ...u, diseaseId: null, diseaseInstanceId: null } : u,
        ),
      };
    }
  }

  let dungeon = campaign.dungeon;
  if (dungeon && dungeon.rooms.some((r) => r.curioId === undefined)) {
    changed = true;
    dungeon = {
      ...dungeon,
      rooms: dungeon.rooms.map((r) =>
        r.curioId === undefined ? { ...r, curioId: null, curioUsed: false } : r,
      ),
    };
  }

  const anyC = campaign as CampaignState & Record<string, unknown>;
  let hamlet = campaign.hamlet;
  if (hamlet && typeof (hamlet as HamletState).visitId !== 'string') {
    changed = true;
    hamlet = { ...hamlet, visitId: `hvisit-migrated-${campaign.id ?? 'save'}` };
  }

  const needsCampaignFields =
    !Array.isArray(anyC.diseaseAcquisitionRecords) ||
    !Array.isArray(anyC.diseaseTreatmentRecords) ||
    !Array.isArray(anyC.processedDiseaseEventIds) ||
    anyC.pendingDiseaseTransaction !== null ||
    anyC.lastDiseaseAcquisition === undefined;
  if (needsCampaignFields) changed = true;

  if (!changed && campaign.saveVersion === SAVE_VERSION) return campaign;
  return {
    ...campaign,
    saveVersion: SAVE_VERSION,
    heroes,
    battle,
    dungeon,
    hamlet,
    diseaseAcquisitionRecords: Array.isArray(anyC.diseaseAcquisitionRecords)
      ? campaign.diseaseAcquisitionRecords
      : [],
    diseaseTreatmentRecords: Array.isArray(anyC.diseaseTreatmentRecords)
      ? campaign.diseaseTreatmentRecords
      : [],
    processedDiseaseEventIds: Array.isArray(anyC.processedDiseaseEventIds)
      ? campaign.processedDiseaseEventIds
      : [],
    // 旧事务无法安全续做（Quirk 抽取结果未落盘）→ 一律丢弃，英雄保留已写入的 Disease
    pendingDiseaseTransaction: null,
    lastDiseaseAcquisition:
      anyC.lastDiseaseAcquisition === undefined ? null : campaign.lastDiseaseAcquisition,
  };
}

/**
 * Phase 8C + 8D 战役字段迁移（v6 → v7）：
 * - 英雄补 xpState（由旧 hero.xp 平移：currentXp = lifetimeXpEarned = 旧 xp，
 *   lifetimeXpSpent = 0）；xp 字段保留为 xpState.currentXp 的只读镜像；
 * - level 钳制到 1-3；skillLevels 中每个技能等级钳制到 1-3；
 * - 英雄补 equippedTrinkets=[]；已有数组则逐条净化（未知定义丢弃、
 *   非法 side 回退 positive、超容量截断）；
 * - 进行中的战斗补 BattleUnit.heroLevel（英雄从战役英雄同步）与
 *   equippedTrinketInstanceIds（英雄从战役英雄同步，怪物为空数组），并清空 pendingAction；
 * - 战役补 Phase 8D 字段（objectiveProgress / pendingQuestXp / questXpResults /
 *   progressionTransactions / guildVisitSession / replacementUpgradeSession /
 *   temporarySkillFormOverrides）；
 * - 战役补 Phase 8C 字段（pendingTrinketAllocations / trinketAcquisitionRecords /
 *   nomadWagon 等全部 Trinket 队列与记录集合）；
 * - 旧存档遗留的 guildVisitSession / replacementUpgradeSession / pendingTrinketUseTransaction
 *   一律清空（未提交的会话/事务在新会话中无法安全续做）。
 */
export function migrateCampaignToV7(campaign: CampaignState): CampaignState {
  let changed = false;

  const heroes: HeroInstance[] = (campaign.heroes ?? []).map((h) => {
    const anyH = h as HeroInstance & Record<string, unknown>;
    // ---- Phase 8D：XP / Level / Skill Level 迁移 ----
    const rawState = anyH.xpState as HeroXpState | undefined;
    const legacyXp = clampNonNegative(anyH.xp);
    const xpState: HeroXpState =
      rawState &&
      typeof rawState === 'object' &&
      typeof rawState.currentXp === 'number' &&
      typeof rawState.lifetimeXpEarned === 'number' &&
      typeof rawState.lifetimeXpSpent === 'number'
        ? {
            currentXp: clampNonNegative(rawState.currentXp),
            lifetimeXpEarned: clampNonNegative(rawState.lifetimeXpEarned),
            lifetimeXpSpent: clampNonNegative(rawState.lifetimeXpSpent),
          }
        : { currentXp: legacyXp, lifetimeXpEarned: legacyXp, lifetimeXpSpent: 0 };
    // 不变式修复：currentXp 必须等于 earned - spent
    if (xpState.currentXp !== xpState.lifetimeXpEarned - xpState.lifetimeXpSpent) {
      xpState.lifetimeXpEarned = xpState.currentXp + xpState.lifetimeXpSpent;
    }

    const level = clampLevel(anyH.level);
    const rawSkillLevels = (anyH.skillLevels ?? {}) as Record<string, unknown>;
    const skillLevels: HeroInstance['skillLevels'] = {};
    let skillLevelsChanged = false;
    for (const [sid, lv] of Object.entries(rawSkillLevels)) {
      const clamped = clampLevel(lv);
      skillLevels[sid] = clamped;
      if (clamped !== lv) skillLevelsChanged = true;
    }

    // ---- Phase 8C：Trinket 净化迁移 ----
    const rawTrinkets = anyH.equippedTrinkets;
    let trinketChanged = false;
    let equippedTrinkets: HeroTrinketState[] = [];
    if (rawTrinkets === undefined || !Array.isArray(rawTrinkets)) {
      trinketChanged = true;
      equippedTrinkets = [];
    } else {
      const capacity = getTrinketCapacity(h);
      const sanitized: HeroTrinketState[] = [];
      for (const t of rawTrinkets as HeroTrinketState[]) {
        if (!t || typeof t !== 'object' || typeof t.instanceId !== 'string' || typeof t.trinketId !== 'string') {
          trinketChanged = true; continue;
        }
        if (!getTrinketById(t.trinketId)) { trinketChanged = true; continue; }
        if (sanitized.length >= capacity) { trinketChanged = true; continue; }
        const side: TrinketSide = t.currentSide === 'negative' ? 'negative' : 'positive';
        const fixed: HeroTrinketState = {
          instanceId: t.instanceId, trinketId: t.trinketId, currentSide: side,
          usedTurnId: typeof t.usedTurnId === 'string' ? t.usedTurnId : null,
          lastUsedEventId: typeof t.lastUsedEventId === 'string' ? t.lastUsedEventId : null,
          acquiredAt: typeof t.acquiredAt === 'string' ? t.acquiredAt : nowIso(),
          acquiredQuestId: typeof t.acquiredQuestId === 'string' ? t.acquiredQuestId : null,
          source: t.source ?? 'migration',
          sourceEventId: typeof t.sourceEventId === 'string' ? t.sourceEventId : `migrated-${t.instanceId}`,
        };
        if (fixed.currentSide !== t.currentSide || fixed.usedTurnId !== (t.usedTurnId ?? null) ||
            fixed.lastUsedEventId !== (t.lastUsedEventId ?? null) || fixed.source !== t.source) {
          trinketChanged = true;
        }
        sanitized.push(fixed);
      }
      if (!trinketChanged && sanitized.length === rawTrinkets.length) equippedTrinkets = rawTrinkets as HeroTrinketState[];
      else equippedTrinkets = sanitized;
    }

    const needs =
      rawState === undefined ||
      xpState.currentXp !== h.xp ||
      level !== anyH.level ||
      skillLevelsChanged ||
      trinketChanged;
    if (!needs) return h;
    changed = true;
    return { ...h, xp: xpState.currentXp, xpState, level, skillLevels, equippedTrinkets };
  });

  // ---- Battle 迁移：8D（heroLevel）+ 8C（equippedTrinketInstanceIds + pendingAction） ----
  let battle = campaign.battle;
  if (battle) {
    const anyB = battle as BattleState & Record<string, unknown>;
    const needsHeroLevel = (u: BattleUnit) => typeof u.heroLevel !== 'number';
    const needsTrinketIds = (u: BattleUnit) =>
      !Array.isArray((u as BattleUnit & Record<string, unknown>).equippedTrinketInstanceIds);
    const needsBattleUpdate =
      battle.heroes.some((u) => needsHeroLevel(u) || needsTrinketIds(u)) ||
      battle.monsters.some(needsTrinketIds) ||
      !Array.isArray(anyB.pendingRuleEvents) ||
      !Array.isArray(anyB.pendingDiseaseInfections) ||
      anyB.pendingAction !== null;
    if (needsBattleUpdate) {
      changed = true;
      battle = {
        ...battle,
        pendingAction: null,
        pendingRuleEvents: Array.isArray(anyB.pendingRuleEvents) ? battle.pendingRuleEvents : [],
        pendingDiseaseInfections: Array.isArray(anyB.pendingDiseaseInfections)
          ? battle.pendingDiseaseInfections
          : [],
        heroes: battle.heroes.map((u) => {
          const d = needsHeroLevel(u);
          const c = needsTrinketIds(u);
          if (!d && !c) return u;
          const src = heroes.find((h) => h.instanceId === u.sourceId);
          return {
            ...u,
            ...(d ? { heroLevel: src?.level ?? 1 } : {}),
            ...(c ? { equippedTrinketInstanceIds: (src?.equippedTrinkets ?? []).map((t) => t.instanceId) } : {}),
          };
        }),
        monsters: battle.monsters.map((u) =>
          needsTrinketIds(u) ? { ...u, equippedTrinketInstanceIds: [] } : u
        ),
      };
    }
  }

  const anyC = campaign as CampaignState & Record<string, unknown>;
  const needsCampaignFields =
    // ---- Phase 8D 字段 ----
    !Array.isArray(anyC.objectiveProgress) ||
    anyC.pendingQuestXp === undefined ||
    !Array.isArray(anyC.questXpResults) ||
    !Array.isArray(anyC.progressionTransactions) ||
    anyC.guildVisitSession !== null ||
    anyC.replacementUpgradeSession !== null ||
    !Array.isArray(anyC.temporarySkillFormOverrides) ||
    // ---- Phase 8C 字段 ----
    !Array.isArray(anyC.pendingTrinketAllocations) ||
    !Array.isArray(anyC.pendingTrinketUseOpportunities) ||
    (anyC.pendingTrinketUseOpportunities as unknown[]).length > 0 ||
    anyC.pendingTrinketUseTransaction !== null ||
    !Array.isArray(anyC.trinketAcquisitionRecords) ||
    !Array.isArray(anyC.trinketUseRecords) ||
    !Array.isArray(anyC.trinketTransferRecords) ||
    !Array.isArray(anyC.processedTrinketEventIds) ||
    !Array.isArray(anyC.processedTrinketResetKeys) ||
    !anyC.nomadWagon ||
    typeof anyC.nomadWagon !== 'object';
  if (needsCampaignFields) changed = true;

  if (!changed && campaign.saveVersion === SAVE_VERSION) return campaign;

  // Phase 8C：Nomad Wagon 净化
  const rawWagon = anyC.nomadWagon as NomadWagonState | undefined;
  const nomadWagon: NomadWagonState =
    rawWagon && typeof rawWagon === 'object'
      ? {
          ...createInitialNomadWagonState(),
          ...rawWagon,
          buildingLevel: 1,
          offeredTrinketIds: Array.isArray(rawWagon.offeredTrinketIds)
            ? rawWagon.offeredTrinketIds.filter((id) => !!getTrinketById(id))
            : [],
        }
      : createInitialNomadWagonState();
  return {
    ...campaign,
    saveVersion: SAVE_VERSION,
    heroes,
    battle,
    // ---- Phase 8D 字段 ----
    objectiveProgress: Array.isArray(anyC.objectiveProgress) ? campaign.objectiveProgress : [],
    pendingQuestXp: anyC.pendingQuestXp === undefined ? null : campaign.pendingQuestXp,
    questXpResults: Array.isArray(anyC.questXpResults) ? campaign.questXpResults : [],
    progressionTransactions: Array.isArray(anyC.progressionTransactions)
      ? campaign.progressionTransactions
      : [],
    guildVisitSession: null,
    replacementUpgradeSession: null,
    temporarySkillFormOverrides: Array.isArray(anyC.temporarySkillFormOverrides)
      ? campaign.temporarySkillFormOverrides
      : [],
    // ---- Phase 8C 字段 ----
    pendingTrinketAllocations: Array.isArray(anyC.pendingTrinketAllocations)
      ? (campaign.pendingTrinketAllocations ?? []).filter((a) => !!getTrinketById(a.trinketId))
      : [],
    pendingTrinketUseOpportunities: [],
    pendingTrinketUseTransaction: null,
    trinketAcquisitionRecords: Array.isArray(anyC.trinketAcquisitionRecords)
      ? campaign.trinketAcquisitionRecords
      : [],
    trinketUseRecords: Array.isArray(anyC.trinketUseRecords) ? campaign.trinketUseRecords : [],
    trinketTransferRecords: Array.isArray(anyC.trinketTransferRecords)
      ? campaign.trinketTransferRecords
      : [],
    processedTrinketEventIds: Array.isArray(anyC.processedTrinketEventIds)
      ? campaign.processedTrinketEventIds
      : [],
    processedTrinketResetKeys: Array.isArray(anyC.processedTrinketResetKeys)
      ? campaign.processedTrinketResetKeys
      : [],
    nomadWagon,
  };
}

/** 将战役迁移到当前最新版本（v3→v4→v5→v6→v7 = 8C+8D）。 */
export function migrateCampaignToLatest(campaign: CampaignState): CampaignState {
  return migrateCampaignToV7(
    migrateCampaignToV6(migrateCampaignToV5(migrateCampaignToV4(migrateCampaignToV3(campaign)))),
  );
}

/**
 * 迁移旧版本存档到当前版本。无法迁移时返回 null。
 * v1（SaveEnvelope）→ v2（SaveFile）→ v3（Phase 6）→ v4（Phase 7）→ v5（Phase 8A Quirk）
 * → v6（Phase 8B Disease）→ v7（Phase 8C Trinket）。
 */
export function migrateSaveFile(raw: unknown): SaveFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const anyRaw = raw as Record<string, unknown>;

  // 已是 v7（当前版本）
  if (typeof anyRaw.version === 'number' && anyRaw.version === SAVE_VERSION) {
    const file = raw as SaveFile;
    // campaign 缺失或非对象 → 无法迁移（调用方回退为「无法识别的存档结构」）
    if (!file.campaign || typeof file.campaign !== 'object') return null;
    // 保险：即使 version=7 也补齐缺失字段（防手工编辑的存档）
    const campaign = migrateCampaignToLatest(file.campaign);
    return campaign === file.campaign ? file : { ...createSaveSnapshot(campaign), savedAt: file.savedAt };
  }

  // v2 / v3 / v4 / v5 / v6：{ version: 2|3|4|5|6, savedAt, campaign, ... }
  if (
    typeof anyRaw.version === 'number' &&
    LEGACY_SAVE_VERSIONS.includes(anyRaw.version) &&
    anyRaw.version !== 1 &&
    anyRaw.campaign &&
    typeof anyRaw.campaign === 'object'
  ) {
    const file = raw as SaveFile;
    const campaign = migrateCampaignToLatest(file.campaign);
    return { ...createSaveSnapshot(campaign), savedAt: file.savedAt ?? nowIso() };
  }

  // v1：{ saveVersion: 1, savedAt, campaign }
  const v1 = raw as Partial<SaveEnvelopeV1>;
  if (v1.saveVersion === 1 && v1.campaign && typeof v1.campaign === 'object') {
    const campaign = migrateCampaignToLatest(v1.campaign as CampaignState);
    const snapshot = createSaveSnapshot(campaign);
    return { ...snapshot, savedAt: v1.savedAt ?? snapshot.savedAt };
  }
  return null;
}

/**
 * 修复可恢复的问题（不静默创建错误状态，只回退到最近的合法阶段）：
 * - gamePhase 与 campaign.gamePhase 不一致 → 以 campaign 为准；
 * - battle 阶段但 BattleState 缺失 → 回退 dungeon-explore（有地牢）或 quest-select；
 * - dungeon 阶段但 DungeonState 缺失 → 回退 quest-select；
 * - quest-result 阶段但摘要缺失 → 回退 quest-select；
 * - gold 为负 → 归零。
 */
export function sanitizeSaveFile(save: SaveFile): SaveFile {
  let c = save.campaign;
  if (c.gold < 0) c = { ...c, gold: 0 };

  if (c.gamePhase === 'battle' && !c.battle) {
    c = { ...c, gamePhase: c.dungeon ? 'dungeon-explore' : 'quest-select' };
  }
  if (c.gamePhase === 'dungeon-explore' && !c.dungeon) {
    c = { ...c, gamePhase: 'quest-select', currentQuestId: null, battle: null };
  }
  if (c.gamePhase === 'quest-result' && !c.lastQuestResult) {
    c = { ...c, gamePhase: 'quest-select' };
  }
  // Phase 6：replacement 阶段但没有待处理替补 → 回退
  if (
    c.gamePhase === 'replacement' &&
    (!c.stagecoach?.pendingReplacement || c.stagecoach.pendingReplacement.slots.length === 0)
  ) {
    c = { ...c, gamePhase: c.dungeon ? 'dungeon-explore' : 'quest-select' };
  }

  if (c !== save.campaign || save.gamePhase !== c.gamePhase) {
    return { ...createSaveSnapshot(c), savedAt: save.savedAt };
  }
  return save;
}

/** 从快照恢复战役状态（先修复再取 campaign）。 */
export function restoreSaveSnapshot(save: SaveFile): CampaignState {
  return sanitizeSaveFile(save).campaign;
}

// ---------------------------------------------------------------------------
// localStorage 读写
// ---------------------------------------------------------------------------

/** 写入完整战役到 localStorage（v2 SaveFile）。 */
export function saveCampaign(campaign: CampaignState): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  const snapshot = createSaveSnapshot({ ...campaign, updatedAt: nowIso() });
  ls.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}

/**
 * 详细读档：解析 → 迁移 → 校验 → 修复。
 * 任何一步失败都不会抛异常，返回明确的状态与错误信息。
 */
export function loadSaveDetailed(): LoadResult {
  const ls = safeLocalStorage();
  if (!ls) return { status: 'empty', campaign: null };
  const raw = ls.getItem(STORAGE_KEY);
  if (!raw) return { status: 'empty', campaign: null };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt', campaign: null, error: '存档 JSON 解析失败' };
  }

  const migrated = migrateSaveFile(parsed);
  if (!migrated) {
    const v = (parsed as Record<string, unknown> | null)?.version ?? (parsed as Record<string, unknown> | null)?.saveVersion;
    if (typeof v === 'number' && v !== SAVE_VERSION && !LEGACY_SAVE_VERSIONS.includes(v)) {
      return { status: 'unsupported', campaign: null, error: `不支持的存档版本：${v}` };
    }
    return { status: 'corrupt', campaign: null, error: '存档结构无法识别' };
  }

  const err = validateSaveFile(migrated);
  if (err) {
    // 尝试修复后再校验一次；仍失败则视为损坏。
    const fixed = sanitizeSaveFile(migrated);
    if (validateSaveFile(fixed) === null) {
      return { status: 'ok', campaign: fixed.campaign };
    }
    return { status: 'corrupt', campaign: null, error: err };
  }
  return { status: 'ok', campaign: restoreSaveSnapshot(migrated) };
}

/** 从 localStorage 读取战役；不存在或不可恢复返回 null（兼容旧调用方）。 */
export function loadCampaign(): CampaignState | null {
  return loadSaveDetailed().campaign;
}

/** 是否存在存档（不论是否损坏）。 */
export function hasSavedCampaign(): boolean {
  const ls = safeLocalStorage();
  return !!ls && ls.getItem(STORAGE_KEY) != null;
}

/** 读取存档写入时间（用于首页摘要）。损坏时返回 null。 */
export function readSavedAt(): string | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  const raw = ls.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SaveFile & SaveEnvelopeV1>;
    return parsed.savedAt ?? null;
  } catch {
    return null;
  }
}

/** 存档是否损坏（存在但无法恢复为合法战役）。 */
export function isCorrupt(): boolean {
  if (!hasSavedCampaign()) return false;
  const r = loadSaveDetailed();
  return r.status === 'corrupt' || r.status === 'unsupported';
}

/** 清除本地存档。 */
export function clearCampaign(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  ls.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// 导入 / 导出
// ---------------------------------------------------------------------------

/** 导出当前存档为 JSON 字符串（无存档返回 null）。 */
export function exportSaveString(): string | null {
  const ls = safeLocalStorage();
  const raw = ls?.getItem(STORAGE_KEY);
  if (!raw) return null;
  // 导出前确保是合法 v2 结构（旧 v1 存档先迁移再导出）。
  const r = loadSaveDetailed();
  if (r.status !== 'ok' || !r.campaign) return null;
  return JSON.stringify(createSaveSnapshot(r.campaign), null, 2);
}

/**
 * 导入存档 JSON 字符串：
 * 解析 → 迁移 → 校验全部通过后才覆盖现有存档；任何失败都保持原存档不变。
 * 返回 null 表示成功，否则为错误信息。
 */
export function importSaveString(json: string): { error: string | null; campaign: CampaignState | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { error: '导入失败：不是合法的 JSON 文件', campaign: null };
  }
  const migrated = migrateSaveFile(parsed);
  if (!migrated) {
    const v = (parsed as Record<string, unknown> | null)?.version;
    if (typeof v === 'number') return { error: `导入失败：不支持的存档版本 ${v}`, campaign: null };
    return { error: '导入失败：无法识别的存档结构', campaign: null };
  }
  const err = validateSaveFile(migrated);
  if (err) return { error: `导入失败：${err}`, campaign: null };

  const campaign = restoreSaveSnapshot(migrated);
  // 校验成功后才写入（覆盖）本地存档。
  saveCampaign(campaign);
  return { error: null, campaign };
}
