import type { CampaignState } from '../types';
import { nowIso } from './random';

// 本地存档工具。键名与版本号遵循开发文档第 13 节。
export const STORAGE_KEY = 'dd-web-prototype-save-v1';
export const SAVE_VERSION = 1;

interface SaveEnvelope {
  saveVersion: number;
  savedAt: string;
  campaign: CampaignState;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** 写入完整战役到 localStorage。 */
export function saveCampaign(campaign: CampaignState): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  const envelope: SaveEnvelope = {
    saveVersion: SAVE_VERSION,
    savedAt: nowIso(),
    campaign: { ...campaign, updatedAt: nowIso() },
  };
  ls.setItem(STORAGE_KEY, JSON.stringify(envelope));
}

/** 从 localStorage 读取战役；不存在或解析失败返回 null。 */
export function loadCampaign(): CampaignState | null {
  const ls = safeLocalStorage();
  if (!ls) return null;
  const raw = ls.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SaveEnvelope;
    if (!parsed || !parsed.campaign || parsed.campaign.saveVersion !== SAVE_VERSION) {
      return null;
    }
    return parsed.campaign;
  } catch {
    return null;
  }
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
    const parsed = JSON.parse(raw) as SaveEnvelope;
    return parsed.savedAt ?? null;
  } catch {
    return null;
  }
}

/** 存档是否损坏（存在但无法解析为合法结构）。 */
export function isCorrupt(): boolean {
  const ls = safeLocalStorage();
  if (!ls) return false;
  const raw = ls.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Partial<SaveEnvelope>;
    return !parsed || parsed.saveVersion !== SAVE_VERSION || !parsed.campaign;
  } catch {
    return true;
  }
}

/** 清除本地存档。 */
export function clearCampaign(): void {
  const ls = safeLocalStorage();
  if (!ls) return;
  ls.removeItem(STORAGE_KEY);
}
