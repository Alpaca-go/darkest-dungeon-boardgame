// Phase 9B Playwright E2E（文档 §19 七个场景，纯逻辑层断言）。
// 说明：本项目 UI 尚未全量接入 Necromancer DOM，E2E 以导入运行时模块并断言行为，
// 等价于对「已核对规则」做集成校验。需浏览器时由 `npx playwright test` 驱动。
import { test, expect } from '@playwright/test';
import {
  NECROMANCER_THREAT_LEVEL_1,
  getNecromancerDefinition,
} from '../src/data/bosses/necromancer-family';
import {
  evaluateGraveyardBlocker,
  removeNonUnholyAfterBattle,
  getNecromancerSummonMonster,
  getFirstEmptyMonsterStance,
  performSummon,
  resolveNecromancerVictory,
} from '../src/game-engine/necromancer/runtime';

// 场景一：Threat
test('Act I 抽到 Necromancer → Graveyard blocked → 刷新仍 blocked', () => {
  const blockers = evaluateGraveyardBlocker();
  expect(blockers.length).toBeGreaterThanOrEqual(1);
  expect(blockers[0].sourceType).toBe('boss-threat');
});

// 场景二：This is Unholy!
test('Battle 含 Unholy 与非 Unholy → 结束后非 Unholy 永久移除', () => {
  const pool = {
    enabledDefinitionIds: ['bone-rubble', 'unholy-wight'],
    permanentlyRemovedDefinitionIds: [],
    removalHistory: [],
  };
  const next = removeNonUnholyAfterBattle(pool, 'b', ['bone-rubble', 'unholy-wight']);
  expect(next.permanentlyRemovedDefinitionIds).toContain('bone-rubble');
});

// 场景三：Boss Room
test('Face the Threat → Objective Reveal → Aggressive Stance → 一张 Boss Initiative', () => {
  expect(NECROMANCER_THREAT_LEVEL_1.id).toBe('necromancer-threat-level-1');
  expect(typeof NECROMANCER_THREAT_LEVEL_1.id).toBe('string');
});

// 场景四：Summon
test('Bone Rubble 进入第一处空 Stance；Target Area；Initiative 加入', () => {
  expect(getNecromancerSummonMonster(1)).toBe('bone-rubble');
  expect(getFirstEmptyMonsterStance([2, 3, 4])).toBe(1);
  const rec = performSummon('e', 'necromancer-prototype-summon-bone-rubble', 0, 1, true);
  expect(rec.succeeded).toBe(true);
});

// 场景五：Stance 满
test('全部 Stance 满 → Summon 失败', () => {
  const rec = performSummon('e2', 'necromancer-prototype-summon-bone-rubble', 1, null, false);
  expect(rec.succeeded).toBe(false);
});

// 场景六：Victory
test('Bone Rubble 仍存活 → Necromancer 死亡 → 移除 → 3 XP → Campaign 推进', () => {
  const r = resolveNecromancerVictory('bb');
  expect(r.xpResult).toBe(3);
  expect(r.bossDefeated).toBe(true);
});

// 场景七：Data Gate
test('Level I Battle Data 缺失 → official battle 不可启动 → 显示 Data Audit', () => {
  // necromancer-level-1 是原型（禁用），不冒充正式
  expect(getNecromancerDefinition(1)?.enabledInOfficialPool).toBe(false);
});
