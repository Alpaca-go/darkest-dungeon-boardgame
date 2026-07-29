import type {
  BattleState,
  CampaignState,
  DungeonState,
  GamePhase,
  HamletState,
  QuestResultSummary,
} from '../types';
import { nowIso } from './random';

// ---------------------------------------------------------------------------
// 存档格式（Phase 5 升级为 v2 SaveFile）
// ---------------------------------------------------------------------------

/** localStorage 键名（沿用 v1 键名以便旧存档可被发现并迁移）。 */
export const STORAGE_KEY = 'dd-web-prototype-save-v1';
/** 当前存档格式版本。v1 = SaveEnvelope（Phase 1-4），v2 = SaveFile。 */
export const SAVE_VERSION = 2;

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
  }

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
 * 迁移旧版本存档到当前版本。无法迁移时返回 null。
 * v1（SaveEnvelope）→ v2（SaveFile）。
 */
export function migrateSaveFile(raw: unknown): SaveFile | null {
  if (!raw || typeof raw !== 'object') return null;
  const anyRaw = raw as Record<string, unknown>;

  // 已是 v2
  if (typeof anyRaw.version === 'number' && anyRaw.version === SAVE_VERSION) {
    return raw as SaveFile;
  }

  // v1：{ saveVersion: 1, savedAt, campaign }
  const v1 = raw as Partial<SaveEnvelopeV1>;
  if (v1.saveVersion === 1 && v1.campaign && typeof v1.campaign === 'object') {
    const snapshot = createSaveSnapshot(v1.campaign as CampaignState);
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
    if (typeof v === 'number' && v !== SAVE_VERSION && v !== 1) {
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
