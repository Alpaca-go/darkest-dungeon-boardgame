// Phase 11A.2.3 §3 / §6 — GameCommand Route Contract 回归测试。
//
// dev doc §6：D-03..D-14 之前存在 `if (!precondition) return;` 的空 PASS。
// 本测试文件禁止任何 conditional-pass / fake-pass：每个 contract entry 必须
// 静态验证 Driver case body 真调用了 expected entry point。

import { describe, expect, it } from 'vitest';
import {
  GAME_COMMAND_ROUTE_CONTRACT,
  runGameCommandRouteAudit,
  type GameCommandRouteKind,
} from './game-command-route-contract';

const ROUTE_KINDS: GameCommandRouteKind[] = [
  'production-command',
  'atomic-engine',
  'test-policy',
  'engine-callback',
];

describe('GameCommand Route Contract (Phase 11A.2.3 §3 + §6)', () => {
  it('RC-01: 每个 contract entry commandType 唯一（无 duplicate）', () => {
    const seen = new Set<string>();
    for (const c of GAME_COMMAND_ROUTE_CONTRACT) {
      expect(seen.has(c.commandType), `duplicate commandType: ${c.commandType}`).toBe(false);
      seen.add(c.commandType);
    }
  });

  it('RC-02: 每个 contract entry routeKind 是已知 4 种之一', () => {
    for (const c of GAME_COMMAND_ROUTE_CONTRACT) {
      expect(ROUTE_KINDS, `${c.commandType} routeKind=${c.routeKind}`).toContain(c.routeKind);
    }
  });

  it('RC-03: 每个 contract entry 必有 expectedEntryPoint + reason', () => {
    for (const c of GAME_COMMAND_ROUTE_CONTRACT) {
      expect(c.expectedEntryPoint.length, `${c.commandType} expectedEntryPoint 空`).toBeGreaterThan(0);
      expect(c.reason.length, `${c.commandType} reason 空`).toBeGreaterThan(0);
    }
  });

  it('RC-04: production-command route 必须 expectedImportFrom 含 commands', () => {
    for (const c of GAME_COMMAND_ROUTE_CONTRACT) {
      if (c.routeKind === 'production-command') {
        expect(
          c.expectedImportFrom?.includes('/commands'),
          `${c.commandType} production-command 入口应来自 /commands`,
        ).toBe(true);
      }
    }
  });

  it('RC-05: runGameCommandRouteAudit 静态验证 — 无 unclassified / 无 routeViolations', () => {
    const audit = runGameCommandRouteAudit();
    expect(
      audit.unclassifiedCommands,
      `unclassified: [${audit.unclassifiedCommands.join(', ')}]`,
    ).toEqual([]);
    expect(
      audit.routeViolations,
      `route violations: [${audit.routeViolations.join(', ')}]`,
    ).toEqual([]);
  });

  it('RC-06: 至少 8 个 production-command route（proceedToLoadout / proceedToQuests / chooseQuest / moveToRoom / resolveVictory / finishQuest / resolveReplacements / returnToHamlet / autoBattle(test-policy) / chooseQuest）', () => {
    const productionCount = GAME_COMMAND_ROUTE_CONTRACT.filter(
      (c) => c.routeKind === 'production-command',
    ).length;
    const testPolicyCount = GAME_COMMAND_ROUTE_CONTRACT.filter(
      (c) => c.routeKind === 'test-policy',
    ).length;
    expect(productionCount, 'production-command routes 至少 7 个').toBeGreaterThanOrEqual(7);
    expect(testPolicyCount, 'test-policy routes 至少 2 个（autoBattle + returnToHamlet）').toBeGreaterThanOrEqual(2);
  });

  it('RC-07: 关键 production-command 全部在 contract（防止未来回退）', () => {
    const requiredProductionCommands = [
      'proceedToLoadout',
      'proceedToQuests',
      'chooseQuest',
      'moveToRoom',
      'resolveVictory',
      'finishQuest',
      'resolveReplacements',
    ];
    for (const cmd of requiredProductionCommands) {
      const found = GAME_COMMAND_ROUTE_CONTRACT.find((c) => c.commandType === cmd);
      expect(found, `${cmd} 必须在 contract`).toBeDefined();
      expect(found?.routeKind, `${cmd} 应是 production-command`).toBe('production-command');
    }
  });

  it('RC-08: 关键 atomic-engine（无 orchestration 责任）分类正确', () => {
    const atomicCommands = [
      'newCampaign',
      'selectParty',
      'applyLoadout',
      'scout',
      'skipAllHeroActions',
      'endHamletDay',
    ];
    for (const cmd of atomicCommands) {
      const found = GAME_COMMAND_ROUTE_CONTRACT.find((c) => c.commandType === cmd);
      expect(found, `${cmd} 必须在 contract`).toBeDefined();
      expect(found?.routeKind, `${cmd} 应是 atomic-engine`).toBe('atomic-engine');
    }
  });

  it('RC-09: 关键 test-policy（Player Decision via Policy）分类正确', () => {
    const testPolicyCommands = ['autoBattle', 'returnToHamlet'];
    for (const cmd of testPolicyCommands) {
      const found = GAME_COMMAND_ROUTE_CONTRACT.find((c) => c.commandType === cmd);
      expect(found, `${cmd} 必须在 contract`).toBeDefined();
      expect(found?.routeKind, `${cmd} 应是 test-policy`).toBe('test-policy');
    }
  });

  it('RC-10: details 数组每项 commandType 唯一', () => {
    const audit = runGameCommandRouteAudit();
    const seen = new Set<string>();
    for (const d of audit.details) {
      expect(seen.has(d.commandType), `details 重复: ${d.commandType}`).toBe(false);
      seen.add(d.commandType);
    }
  });

  it('RC-11 (Phase 11A.2.3R §7): 每个 contract 的 expectedImportFrom 必须在 Driver 顶部 import 列表中真出现（15/15 import source validated）', () => {
    const audit = runGameCommandRouteAudit();
    // 所有有 expectedImportFrom 的 contract 必须 import 真出现
    const requiredFragments = GAME_COMMAND_ROUTE_CONTRACT.filter((c) => c.expectedImportFrom).map(
      (c) => `${c.commandType}→${c.expectedImportFrom}`,
    );
    expect(
      audit.importSourceViolations,
      `expectedImportFrom 未在 driver imports 出现: [${audit.importSourceViolations.join(', ')}] / 总共 [${requiredFragments.join(', ')}]`,
    ).toEqual([]);
  });
});
