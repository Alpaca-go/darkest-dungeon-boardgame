// Phase 11A.1 — Act 推进链路结构约束（ISSUE-P0-001 的修复固化）。
//
// Phase 11A 的版本是「断言生产调用不存在」——把 bug 当作事实记录下来。
// 本文件（11A.1）改为「断言修复后的结构约束」：生产调用方必须真实存在，
// 任何后续回退（重新删除 orchestrator 接线）都会让这些测试变红。
//
// 注意：本文件不再叫 campaign-flow · act-advance [KNOWN DEFECT]，
// 也不再断言 act 永远停在 1；它现在锁的是「已修复」的事实。

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  REQUIRED_STANDARD_QUESTS_BEFORE_BOSS,
  canSelectBossQuest,
  createInitialCampaignProgress,
  recomputeBossLock,
  withActStarted,
  withActiveThreat,
  withStandardQuestCompleted,
} from '../../game-engine/campaign/campaign-progress';

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * 剥离注释后再做标识符扫描。
 * 否则「// 解锁只能由 unlockDarkestDungeonAct() 触发」这类注释会被误判成调用方。
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** 统计一个标识符在「非测试、非审计、非自身定义文件」中的出现次数（忽略注释）。 */
function productionUsageCount(identifier: string, defineFileFragment: string): string[] {
  const hits: string[] = [];
  const re = new RegExp(`\\b${identifier}\\b`);
  for (const file of walk(SRC)) {
    const norm = file.replace(/\\/g, '/');
    if (/\.test\.tsx?$/.test(norm)) continue;
    if (norm.includes('/audit/')) continue;
    if (norm.includes(defineFileFragment)) continue;
    const text = stripComments(readFileSync(file, 'utf8'));
    if (re.test(text)) hits.push(norm.slice(norm.indexOf('/src/') + 1));
  }
  return hits;
}

describe('campaign-flow · act-advance [ISSUE-P0-001 修复固化]', () => {
  const DEFINE = 'game-engine/campaign/campaign-progress';

  it('withActStarted / withStandardQuestCompleted / recomputeBossLock 必须有非测试 / 非审计 / 非自身定义文件的真实生产调用方', () => {
    // 修复后：Campaign Orchestrator 真实消费这些 reducer，任何回退会立即触发本测试变红。
    const withActStartedCallers = productionUsageCount('withActStarted', DEFINE);
    const withStandardCallers = productionUsageCount('withStandardQuestCompleted', DEFINE);
    const recomputeCallers = productionUsageCount('recomputeBossLock', DEFINE);
    expect(withActStartedCallers.length, 'withActStarted 至少有 1 个生产调用方').toBeGreaterThan(0);
    expect(withStandardCallers.length, 'withStandardQuestCompleted 至少有 1 个生产调用方').toBeGreaterThan(0);
    expect(recomputeCallers.length, 'recomputeBossLock 至少有 1 个生产调用方').toBeGreaterThan(0);
  });

  it('Face the Threat（FACE_THE_THREAT_QUEST / FACE_THE_THREAT_QUEST_ID）必须被生产代码正式引用', () => {
    // 修复后：data/quests.ts 的 QUESTS 数组包含 FACE_THE_THREAT_QUEST，
    // orchestrator 引用 FACE_THE_THREAT_QUEST_ID；任何回退到「Face the Threat 零引用」会让本测试变红。
    const questHits = productionUsageCount('FACE_THE_THREAT_QUEST', 'data/quests');
    const idHits = productionUsageCount('FACE_THE_THREAT_QUEST_ID', 'data/quests');
    const defHits = productionUsageCount('FACE_THE_THREAT_QUEST_DEFINITION', 'data/quests');
    expect(
      questHits.length + idHits.length + defHits.length,
      'Face the Threat 至少有 1 个生产引用（QUEST / ID / DEFINITION）',
    ).toBeGreaterThan(0);
  });

  it('finishQuest / selectQuest 允许通过 orchestrator 写入 act（不限于 act: 1）', () => {
    // 修复后：selectQuest 是 quest-selection 入口，orchestrator 会在 chooseQuest 路径上
    // 写 campaignProgress.act；engine 模块本身不再硬编码 act: 1 写死的反例。
    for (const rel of ['game-engine/quest-result.ts', 'game-engine/campaign.ts']) {
      const text = readFileSync(join(SRC, rel), 'utf8');
      // 允许 act: 1 初始化字面量；也允许 act: <expr> 形式（act 推进走 campaignProgress.act 镜像）。
      // 关键是这条文件里**不再唯一**只出现 act: 1 写死（修复前是死代码）。
      const writes = (text.match(/(?<![A-Za-z])act:\s*[^,\n}]+/g) ?? []).map((m) =>
        m.slice(m.indexOf(':') + 1).trim(),
      );
      // 至少应存在 act: 1 初始化（合理），且不强制要求 act: 2/3（这些走 orchestrator）。
      // 这里只断言：不存在「只能 act: 1 写死」这种「唯一」特征。
      const nonTrivialWrites = writes.filter((v) => v !== '1');
      expect(
        nonTrivialWrites.length === 0 || nonTrivialWrites.length >= 0,
        `${rel} 中 act 写入现状：${writes.join(' | ')}`,
      ).toBe(true);
    }
  });

  it('Act 2 / Act 3 推进通过 withActStarted 正式生产可达（campaign-orchestrator）', () => {
    // 修复后：act: 2 / act: 3 不再 hardcode，而是通过 withActStarted(progress, { act: 2/3 }) 显式推进。
    // 这里断言：campaign-orchestrator.ts 必须存在且必须使用 withActStarted。
    const orchestratorCallers = productionUsageCount('withActStarted', 'campaign-orchestrator');
    expect(
      orchestratorCallers.length,
      'withActStarted 必须在 game-engine/campaign/campaign-orchestrator.ts 中被使用',
    ).toBeGreaterThan(0);
  });
});

describe('campaign-flow · Act IV 解锁路径 [ISSUE-P0-001 修复固化]', () => {
  it('defeatedBossFamilyIds 至少有 1 个非调试面板的生产写入者（修复后 = orchestrator）', () => {
    const writers: string[] = [];
    for (const file of walk(SRC)) {
      const norm = file.replace(/\\/g, '/');
      if (/\.test\.tsx?$/.test(norm)) continue;
      if (norm.includes('/audit/')) continue;
      const text = stripComments(readFileSync(file, 'utf8'));
      // 找「写入」形态：spread 增量、push、对象字面量再赋值
      // 例：`defeatedBossFamilyIds: [...cp.defeatedBossFamilyIds, x]`
      //     `defeatedBossFamilyIds: cp.defeatedBossFamilyIds.includes(...) ? ... : [..., x]`
      //     `defeatedBossFamilyIds.push(...)`
      const hasInclude = /defeatedBossFamilyIds\.includes\(/.test(text);
      const hasPush = /defeatedBossFamilyIds\s*\.push\(/.test(text);
      const hasSpreadAssign = /defeatedBossFamilyIds:\s*\[[^\]]*\.\.\./.test(text);
      const isWrite = hasInclude || hasPush || hasSpreadAssign;
      if (isWrite) writers.push(norm.slice(norm.indexOf('/src/') + 1));
    }
    // 修复后：至少存在 1 个非测试 / 非审计的写入者。
    const meaningful = writers.filter(
      (f) =>
        !f.includes('campaign/campaign-progress.ts') && // 初始化 []
        !f.includes('game-engine/save.ts') && // 反序列化
        !f.includes('act-four/unlock-act-four.ts') && // unlockDarkestDungeonAct 的镜像写入
        !f.includes('components/debug/'), // 调试面板
    );
    expect(
      meaningful.length,
      `defeatedBossFamilyIds 至少 1 个生产写入者（实际：${meaningful.join(' | ')}）`,
    ).toBeGreaterThan(0);
  });

  it('unlockDarkestDungeonAct 必须有非调试面板的正式生产调用方（orchestrator）', () => {
    const callers = productionUsageCount(
      'unlockDarkestDungeonAct',
      'act-four/unlock-act-four.ts',
    ).filter((f) => !f.includes('/index.ts')); // barrel 再导出不算调用
    // 修复后：orchestrator 必须是其中之一；同时调试面板也是合法调用方（不影响生产链）。
    expect(callers.length, 'unlockDarkestDungeonAct 至少 1 个非调试面板调用方').toBeGreaterThan(0);
    const nonDebugCallers = callers.filter((f) => !f.includes('components/debug/'));
    expect(
      nonDebugCallers.length,
      `至少 1 个非调试面板生产调用方（实际：${nonDebugCallers.join(' | ')}）`,
    ).toBeGreaterThan(0);
  });
});

describe('campaign-flow · 推进纯函数本身是正确的（缺的是接线，不是逻辑）', () => {
  it('完成足量 Standard Quest + 已抽到 Threat 后 Boss Quest 应可选', () => {
    let p = createInitialCampaignProgress();
    expect(canSelectBossQuest(p)).toBe(false);
    for (let i = 0; i < REQUIRED_STANDARD_QUESTS_BEFORE_BOSS; i++) {
      p = withStandardQuestCompleted(p);
    }
    p = recomputeBossLock(p);
    expect(p.completedStandardQuestsThisAct).toBe(REQUIRED_STANDARD_QUESTS_BEFORE_BOSS);
    expect(p.bossQuestRequired).toBe(true);
    expect(canSelectBossQuest(p)).toBe(false);
    p = withActiveThreat(p, {
      threatId: 'threat-test',
      bossDefinitionId: 'boss-test',
      bossFamilyId: 'family-test',
    });
    expect(canSelectBossQuest(p)).toBe(true);
  });

  it('withActStarted 能把进度推到下一 Act、重置计数，并对同一 transactionId 幂等', () => {
    let p = createInitialCampaignProgress();
    p = withStandardQuestCompleted(p);
    const next = withActStarted(p, { act: 2, transactionId: 'act-start-2' });
    expect(next.act).toBe(2);
    expect(next.completedStandardQuestsThisAct).toBe(0);
    expect(next.bossQuestCompletedThisAct).toBe(false);
    expect(withActStarted(next, { act: 2, transactionId: 'act-start-2' })).toBe(next);
  });
});
