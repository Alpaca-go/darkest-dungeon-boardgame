import type { DungeonRoomType, MonsterDefinition } from '../types';
import { MONSTERS } from './monsters';
import { pick, randInt } from '../game-engine/random';

/**
 * 根据房间类型生成一组简化怪物（2 至 4 个）。
 * Objective 房间更困难（3-4 个），普通 Battle 房间 2-3 个。
 * 怪物可重复（同一类型出现多次），位置在 battle.ts 中分配。
 */
export function buildEncounter(roomType: DungeonRoomType): MonsterDefinition[] {
  const count = roomType === 'objective' ? randInt(3, 4) : randInt(2, 3);
  const out: MonsterDefinition[] = [];
  for (let i = 0; i < count; i++) {
    out.push(pick(MONSTERS));
  }
  return out;
}
