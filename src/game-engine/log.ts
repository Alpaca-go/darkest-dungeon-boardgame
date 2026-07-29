import type { CampaignState, GameLogEntry } from '../types';
import { createId, nowIso } from './random';

// 事件日志上限：避免无限增长影响页面性能。
export const LOG_LIMIT = 200;
// 页面默认展示的最近日志条数。
export const LOG_DISPLAY_LIMIT = 12;

/**
 * 向战役追加一条事件日志（不可变更新），并刷新 updatedAt。
 * kind 用于前端着色：info / success / warning / danger。
 */
export function pushLog(
  campaign: CampaignState,
  message: string,
  kind: GameLogEntry['kind'] = 'info'
): CampaignState {
  const entry: GameLogEntry = {
    id: createId('log'),
    at: nowIso(),
    message,
    kind,
  };
  const next = [...campaign.log, entry];
  // 仅保留最近 LOG_LIMIT 条，防止存档无限膨胀。
  const trimmed = next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
  return { ...campaign, log: trimmed, updatedAt: nowIso() };
}
