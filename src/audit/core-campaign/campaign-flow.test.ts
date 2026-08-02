// Phase 11A — Act 推进链路结构测试（ISSUE-P0-001 的根因固化）。
//
// Golden Run 只能证明"跑完 10 个任务 act 还是 1"这个**现象**；
// 本文件用静态结构扫描证明**根因**：Act 推进状态机整体是死代码。
// 一旦有人真的把它接进 finishQuest/selectQuest，这些测试会变红，
// 提示同步关闭 ISSUE-P0-001。

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

describe('campaign-flow · act-advance [KNOWN DEFECT ISSUE-P0-001]', () => {
  const DEFINE = 'game-engine/campaign/campaign-progress';

  it('Act 推进状态机的写入函数没有任何生产调用方（死代码）', () => {
    // 期望行为（修复后）：这些函数至少被 quest-result / campaign 流程各调用一次。
    expect(productionUsageCount('withActStarted', DEFINE)).toEqual([]);
    expect(productionUsageCount('withStandardQuestCompleted', DEFINE)).toEqual([]);
    expect(productionUsageCount('recomputeBossLock', DEFINE)).toEqual([]);
  });

  it('Boss Quest 定义 FACE_THE_THREAT_QUEST_DEFINITION 零生产引用', () => {
    const hits = productionUsageCount('FACE_THE_THREAT_QUEST_DEFINITION', 'data/quests');
    expect(hits).toEqual([]);
  });

  it('finishQuest / selectQuest 只会把 act 初始化为 1，从不推进', () => {
    for (const rel of ['game-engine/quest-result.ts', 'game-engine/campaign.ts']) {
      const text = readFileSync(join(SRC, rel), 'utf8');
      // act: <expr> 形式的对象字面量写入（campaignLevel/actFourState 等不算）
      const writes = (text.match(/(?<![A-Za-z])act:\s*[^,\n}]+/g) ?? []).map((m) =>
        m.slice(m.indexOf(':') + 1).trim(),
      );
      const advancing = writes.filter((v) => v !== '1');
      expect(
        advancing,
        `${rel} 只应出现初始化 act: 1，实际还有：${advancing.join(' | ')}`,
      ).toEqual([]);
    }
  });

  it('Act 2 / Act 3 在生产代码中完全不可达（没有任何 act: 2|3 写入）', () => {
    const found: string[] = [];
    for (const file of walk(SRC)) {
      const norm = file.replace(/\\/g, '/');
      if (/\.test\.tsx?$/.test(norm)) continue;
      if (norm.includes('/audit/')) continue;
      const text = stripComments(readFileSync(file, 'utf8'));
      for (const m of text.match(/(?<![A-Za-z])act:\s*[234]\b/g) ?? []) {
        // campaign-progress.ts 是纯函数定义处（withActStarted 接受入参，不是硬编码推进）
        found.push(`${norm.slice(norm.indexOf('/src/') + 1)} → ${m}`);
      }
    }
    // 唯一允许的例外：Act IV 解锁（1 → 4 直跳），Act 2/3 依然不可达。
    const nonActFour = found.filter((f) => !f.includes('act-four/unlock-act-four.ts'));
    expect(nonActFour).toEqual([]);
  });
});

describe('campaign-flow · Act IV 只能由调试面板进入 [KNOWN DEFECT ISSUE-P0-001]', () => {
  it('defeatedBossFamilyIds 在生产代码里从不追加，唯一写入点是 dev 调试面板', () => {
    const writers: string[] = [];
    for (const file of walk(SRC)) {
      const norm = file.replace(/\\/g, '/');
      if (/\.test\.tsx?$/.test(norm)) continue;
      if (norm.includes('/audit/')) continue;
      const text = stripComments(readFileSync(file, 'utf8'));
      // 只找"写入"形态：defeatedBossFamilyIds: [...] / .push(
      const isWrite =
        /defeatedBossFamilyIds:\s*\[/.test(text) || /defeatedBossFamilyIds\s*\.push\(/.test(text);
      if (isWrite) writers.push(norm.slice(norm.indexOf('/src/') + 1));
    }
    // 现状：初始化空数组、存档反序列化、调试面板硬塞三处，没有任何"击败 Boss → 追加家族"的正式链路。
    const meaningful = writers.filter(
      (f) =>
        !f.includes('campaign/campaign-progress.ts') && // 初始化 []
        !f.includes('game-engine/save.ts'), // 反序列化
    );
    expect(meaningful).toEqual(['src/components/debug/ActFourDebugSection.tsx']);
  });

  it('unlockDarkestDungeonAct 的生产调用方只有 dev 调试面板', () => {
    const callers = productionUsageCount(
      'unlockDarkestDungeonAct',
      'act-four/unlock-act-four.ts',
    ).filter((f) => !f.includes('/index.ts')); // barrel 再导出不算调用
    expect(callers).toEqual(['src/components/debug/ActFourDebugSection.tsx']);
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
    // 还需要一个已抽取的 Threat 才真正可选。
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
    // 幂等：同一事务重复应用不产生第二次推进。
    expect(withActStarted(next, { act: 2, transactionId: 'act-start-2' })).toBe(next);
  });
});
