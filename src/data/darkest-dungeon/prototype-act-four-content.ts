// Phase 10A §10 / §11：Darkest Dungeon Room Token 池（开发 harness）。
//
// 16 个 Room Slot 的构成（规则 8—18）：
//   1 × Start（Layout 的 startRoomSlotId）
// + 1 × Objective Room Token
// + 3 × Excavation Site（规则 18：普通 Empty Room 在本 Location 被替换）
// + 11 × 其它 Room Token（Battle / Curio / Trinket）
// = 16
//
// Boss Slot 分配（§10）：Objective + 2 个随机 Non-Objective 混洗后依次放入 3 个 Boss Slot，
// 其余 12 个 Token 正常填充剩下 12 个非 Start / 非 Boss Slot。
//
// 硬约束 7：Empty → Excavation 的解释只发生在本 Location Runtime，
// 不修改全局 Empty Room Definition。

import type { DarkestDungeonRoomToken } from '../../types/act-four';
import { EXCAVATION_SITE_COUNT } from './room-registry';

/** Start Token 的固定 ID（永远落在 Layout 的 startRoomSlotId）。 */
export const DARKEST_DUNGEON_START_TOKEN_ID = 'dd-token-start';

/** Objective Token 的固定 ID（全场唯一）。 */
export const DARKEST_DUNGEON_OBJECTIVE_TOKEN_ID = 'dd-token-objective';

/** 其它（非 Objective / 非 Start）Token 的数量。 */
export const DARKEST_DUNGEON_MISC_TOKEN_COUNT = 11;

/**
 * 构造本次 Quest 的 Room Token 池（不含 Start）。
 * 顺序固定 → 随机只发生在 assignDarkestDungeonBossSlots / fillRemainingSlots 内，
 * 便于用可注入 RNG 复现（硬约束 4：随机结果先保存）。
 */
export function buildDarkestDungeonRoomTokens(): DarkestDungeonRoomToken[] {
  const tokens: DarkestDungeonRoomToken[] = [
    { id: DARKEST_DUNGEON_OBJECTIVE_TOKEN_ID, kind: 'objective' },
  ];

  for (let i = 1; i <= EXCAVATION_SITE_COUNT; i += 1) {
    tokens.push({ id: `dd-token-excavation-${i}`, kind: 'excavation-site' });
  }

  const miscKinds: DarkestDungeonRoomToken['kind'][] = [
    'battle',
    'battle',
    'battle',
    'battle',
    'battle',
    'battle',
    'curio',
    'curio',
    'curio',
    'trinket',
    'trinket',
  ];
  miscKinds.forEach((kind, index) => {
    tokens.push({ id: `dd-token-${kind}-${index + 1}`, kind });
  });

  return tokens;
}

/** Start Token。 */
export function buildDarkestDungeonStartToken(): DarkestDungeonRoomToken {
  return { id: DARKEST_DUNGEON_START_TOKEN_ID, kind: 'start' };
}

/**
 * Token 池自检：
 * - 恰好 1 个 Objective；
 * - 恰好 3 个 Excavation Site；
 * - 总数 = 15（16 Slot 减去 Start）。
 */
export function validateDarkestDungeonRoomTokens(tokens: DarkestDungeonRoomToken[]): string[] {
  const issues: string[] = [];
  const objectives = tokens.filter((t) => t.kind === 'objective');
  if (objectives.length !== 1) issues.push(`Objective Token 数量必须为 1（当前 ${objectives.length}）`);

  const excavations = tokens.filter((t) => t.kind === 'excavation-site');
  if (excavations.length !== EXCAVATION_SITE_COUNT) {
    issues.push(`Excavation Site 必须为 3（当前 ${excavations.length}）`);
  }

  if (tokens.some((t) => t.kind === 'start')) {
    issues.push('Token 池不得包含 Start Token（Start 由 Layout 决定）');
  }

  const expected = 1 + EXCAVATION_SITE_COUNT + DARKEST_DUNGEON_MISC_TOKEN_COUNT;
  if (tokens.length !== expected) {
    issues.push(`Token 总数必须为 ${expected}（当前 ${tokens.length}）`);
  }

  if (new Set(tokens.map((t) => t.id)).size !== tokens.length) {
    issues.push('Token ID 存在重复');
  }

  return issues;
}
