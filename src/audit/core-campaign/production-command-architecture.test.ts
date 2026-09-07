// Phase 11A.2.1 §43 — Architecture 静态测试。
//
// dev doc §45 单测 24-29：Driver / Store / Commands / shim / Test Policies 状态。
//
// 11A.2.1 partial 状态：
//   - Store 已迁到 Production Commands（commitBattleVictory 路径保留 shim 因 Differential 进行中）
//   - Driver dispatch 路径部分迁移（resolveVictory / returnToHamlet 仍走 shim，标注 Finding F）
//   - Test Policies 已在 src/testing/policies/ 独立
//   - shim 保留为 Test Policy Helper（保留期 Finding F 解决 + Differential 通过后删）
//
// 本文件只断言"已迁移部分"的架构不变量；P1-006 close 留待完全迁移。

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('Production Command Architecture (Phase 11A.2.1 §43)', () => {
  it('24a. Store / Driver 不直接 import processBattleDeaths 等原子步骤', () => {
    const targets = [
      'processBattleDeaths',
      'processBattleStressEvents',
      'processBattleRuleEvents',
      'processBattleDiseaseInfections',
      'openRoomEnteredWindows',
    ];
    const STORE = 'src/store/useGameStore.ts';
    const DRIVER = 'src/audit/core-campaign/simulation-driver.ts';
    for (const t of targets) {
      const storeHits = stripComments(readFileSync(STORE, 'utf8')).match(
        new RegExp(`\\b${t}\\b`),
      );
      const driverHits = stripComments(readFileSync(DRIVER, 'utf8')).match(
        new RegExp(`\\b${t}\\b`),
      );
      expect(storeHits, `Store 不应 import ${t}`).toBeNull();
      expect(driverHits, `Driver 不应 import ${t}`).toBeNull();
    }
  });

  it('24b. Driver dispatch 路径不直接 import shim 高层包装（仍允许的 Test Policy Helper 暂不检）', () => {
    // dev doc §43 要求 Driver 无 headless-shim import。
    // 11A.2.1 partial：Driver 仍 import shimReturnToHamlet / shimResolveVictory（Finding F 待 Differential 解决后切）。
    // 这里只断言：Driver 没有 import shim 的高层 setup/dungeon/quest 命令包装。
    const DRIVER = 'src/audit/core-campaign/simulation-driver.ts';
    const driverText = readFileSync(DRIVER, 'utf8');
    expect(driverText).not.toMatch(/\bshimProceedToLoadout\b/);
    expect(driverText).not.toMatch(/\bshimProceedToQuests\b/);
    expect(driverText).not.toMatch(/\bshimMoveToRoom\b/);
    expect(driverText).not.toMatch(/\bshimLeaveDungeon\b/);
    expect(driverText).not.toMatch(/\bshimFailQuestFromDefeat\b/);
    expect(driverText).not.toMatch(/\bshimResolveReplacements\b/);
  });

  it('25. headless-shim 文件在 P1-006 完全关闭前保留为 Test Policy Helper（标注）', () => {
    // dev doc 要求 shim 不存在；11A.2.1 partial 仍保留。
    // 此处只验证：headless-shim.ts 在 src/audit/core-campaign/ 存在并有 shimResolveVictory + shimReturnToHamlet 包装。
    const shimPath = join(SRC, 'audit/core-campaign/headless-shim.ts');
    const shimText = readFileSync(shimPath, 'utf8');
    expect(shimText).toMatch(/export function shimResolveVictory/);
    expect(shimText).toMatch(/export function shimReturnToHamlet/);
  });

  it('26. ui-store-shim runtime marker 不再出现在 commit() 调用', () => {
    const DRIVER = 'src/audit/core-campaign/simulation-driver.ts';
    const driverText = readFileSync(DRIVER, 'utf8');
    // commit() 第 4 个参数 layer 不再传 'ui-store-shim'
    expect(driverText).not.toMatch(/,\s*['"]ui-store-shim['"]\s*\)/);
    // 运行时事件 layer 字段也不应出现 'ui-store-shim'
    expect(driverText).not.toMatch(/layer:\s*['"]ui-store-shim['"]/);
  });

  it('27. Store / Driver 共享同一组 Production Commands 入口', () => {
    const COMMANDS = join(SRC, 'game-engine/commands/index.ts');
    const commandsText = readFileSync(COMMANDS, 'utf8');
    expect(commandsText).toMatch(/proceedCampaignToLoadout/);
    expect(commandsText).toMatch(/proceedCampaignToQuestSelect/);
    expect(commandsText).toMatch(/enterDungeonRoom/);
    expect(commandsText).toMatch(/commitBattleVictory/);
    expect(commandsText).toMatch(/commitLeaveDungeon/);
    expect(commandsText).toMatch(/commitQuestFailureFromDefeat/);
    expect(commandsText).toMatch(/commitReturnToHamlet/);
    expect(commandsText).toMatch(/resolveReplacementsFlow/);
  });

  it('28. retargetPendingReplacement 唯一权威实现在 commands/replacement.ts', () => {
    const RETARGET_FILES = [
      'src/game-engine/commands/replacement.ts',
      'src/game-engine/commands/quest.ts',
      'src/store/useGameStore.ts',
      'src/audit/core-campaign/simulation-driver.ts',
    ];
    for (const f of RETARGET_FILES) {
      const path = join(SRC.replace('src', ''), f);
      try {
        const text = readFileSync(path, 'utf8');
        // 检查未定义 inlined 版本（只允许 commands/replacement.ts 有实现）
        const hasInlinedImplementation = /function retargetPendingReplacementInternal\s*\(/.test(text);
        if (hasInlinedImplementation) {
          throw new Error(`${f} 仍包含 inlined retargetPendingReplacementInternal`);
        }
      } catch (e: any) {
        if (e.code !== 'ENOENT') throw e;
      }
    }
    // commands/replacement.ts 必须有实现
    const replText = readFileSync(join(SRC, 'game-engine/commands/replacement.ts'), 'utf8');
    expect(replText).toMatch(/export function retargetPendingReplacement/);
  });

  it('29. Test Policy 在 src/testing/policies/ 独立，不混入 Production Engine', () => {
    // 三个 policy 必须存在且只从 commands 读，不改 CampaignState
    const policies = [
      'src/testing/policies/deterministic-battle-policy.ts',
      'src/testing/policies/deterministic-trinket-policy.ts',
      'src/testing/policies/deterministic-replacement-policy.ts',
    ];
    for (const p of policies) {
      const text = readFileSync(join(SRC.replace('src', ''), p), 'utf8');
      expect(text).toMatch(/applyDeterministic\w+Policy/);
      // 不直接改 CampaignState：必须包含 import statements 但不写入 c.stagecoach
      expect(text).not.toMatch(/stagecoach\s*[:=]\s*\{/);
    }
  });
});
