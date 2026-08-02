// Phase 11A — 内容清单 / Data Gate 治理测试。
// 注意：本文件是"审计现状固化（characterization）"测试。
// 带 [KNOWN GAP] / [KNOWN DEFECT] 的用例固化的是审计当天的缺陷现状，
// 缺陷被真正修复后这些用例会转红 —— 这是预期行为，届时应连同 ISSUE 一并关闭。

import { describe, expect, it } from 'vitest';
import { generateContentManifest, summarizeManifest } from './content-manifest';
import type { ContentManifestEntry, CoreCampaignContentManifest } from './types';
import {
  getDarkestDungeonGuardianDataGaps,
  isDarkestDungeonOfficialGuardianPoolEnabled,
} from '../../data/darkest-dungeon/guardian-registry';
import {
  getFinalEncounterDataGaps,
  isFinalEncounterOfficialEnabled,
} from '../../data/darkest-dungeon/final-form-registry';
import {
  getDarkestDungeonQuestDataGaps,
  isDarkestDungeonOfficialQuestPoolEnabled,
} from '../../data/darkest-dungeon/quest-registry';

/** 清单没有扁平 entries 字段，测试里按分类展开。 */
function flatten(m: CoreCampaignContentManifest): ContentManifestEntry[] {
  return [
    ...m.heroes, ...m.heroSkills, ...m.quests, ...m.threats, ...m.bosses, ...m.monsters,
    ...m.rooms, ...m.roomTiles, ...m.curios, ...m.lootChests, ...m.trinkets, ...m.quirks,
    ...m.diseases, ...m.afflictions, ...m.virtues, ...m.hamletEvents, ...m.buildings,
    ...m.buildingUpgrades, ...m.provisions, ...m.darkestDungeonQuests, ...m.guardians,
    ...m.finalForms,
  ];
}

const manifest = generateContentManifest();
const summary = summarizeManifest(manifest);
const entries = flatten(manifest);

describe('content-manifest · 结构', () => {
  it('清单非空，且每条都带四态官方数据标记', () => {
    expect(summary.total).toBeGreaterThan(0);
    expect(entries.length).toBe(summary.total);
    const allowed = new Set(['verified', 'partial', 'prototype', 'unavailable']);
    for (const entry of entries) {
      expect(
        allowed.has(entry.officialDataStatus),
        `${entry.id} officialDataStatus=${entry.officialDataStatus}`,
      ).toBe(true);
    }
  });

  it('每条都带运行时就绪四态标记', () => {
    const allowed = new Set(['official-ready', 'framework-only', 'blocked', 'not-in-scope']);
    for (const entry of entries) {
      expect(
        allowed.has(entry.runtimeReadiness),
        `${entry.id} runtimeReadiness=${entry.runtimeReadiness}`,
      ).toBe(true);
    }
  });

  it('四态计数之和等于总数（没有条目被漏统计）', () => {
    const statusSum = Object.values(summary.byStatus).reduce((a, b) => a + b, 0);
    const readinessSum = Object.values(summary.byReadiness).reduce((a, b) => a + b, 0);
    const categorySum = Object.values(summary.byCategory).reduce((a, b) => a + b, 0);
    expect(statusSum).toBe(summary.total);
    expect(readinessSum).toBe(summary.total);
    expect(categorySum).toBe(summary.total);
  });

  it('条目 id 在同一分类内唯一（避免定义覆盖导致的静默丢失）', () => {
    const seen = new Map<string, number>();
    for (const e of entries) {
      const key = `${e.category}::${e.id}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    const dup = [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    expect(dup).toEqual([]);
  });

  it('official-ready 的条目必须具备 sourceReference（不允许无出处的"官方"内容）', () => {
    const bad = entries.filter(
      (e) => e.runtimeReadiness === 'official-ready' && !e.sourceReference,
    );
    expect(bad.map((e) => e.id)).toEqual([]);
  });
});

describe('content-manifest · source-reference-coverage [KNOWN GAP ISSUE-P2-001]', () => {
  it('记录当前缺 sourceReference 的条目数（修复后应降为 0）', () => {
    // 现状固化：审计当天存在大量无出处条目。
    expect(summary.missingSourceReference).toBeGreaterThan(0);
  });

  it('无出处的条目一律不得被判为 verified', () => {
    const noRef = entries.filter((e) => !e.sourceReference);
    const wrongly = noRef.filter((e) => e.officialDataStatus === 'verified');
    expect(wrongly.map((e) => e.id)).toEqual([]);
  });

  it('缺 sourceReference 必须显式登记在 missingFields 中（不允许静默缺失）', () => {
    const undeclared = entries.filter(
      (e) => !e.sourceReference && !e.missingFields.includes('sourceReference'),
    );
    expect(undeclared.map((e) => e.id)).toEqual([]);
  });
});

describe('content-manifest · data-gate-closed [KNOWN DEFECT ISSUE-P0-002]', () => {
  it('Act IV 三个官方 Data Gate 均处于关闭状态，且缺口被显式列出', () => {
    expect(isDarkestDungeonOfficialGuardianPoolEnabled()).toBe(false);
    expect(isFinalEncounterOfficialEnabled()).toBe(false);
    expect(isDarkestDungeonOfficialQuestPoolEnabled()).toBe(false);
    // 关闭必须有理由：缺口清单不能为空，否则就是"无理由禁用"。
    expect(getDarkestDungeonGuardianDataGaps().length).toBeGreaterThan(0);
    expect(getFinalEncounterDataGaps().length).toBeGreaterThan(0);
    expect(getDarkestDungeonQuestDataGaps().length).toBeGreaterThan(0);
  });

  it('Gate 关闭时 Act IV 内容一律不得冒充 official-ready', () => {
    const actFour = [
      ...manifest.darkestDungeonQuests,
      ...manifest.guardians,
      ...manifest.finalForms,
    ];
    expect(actFour.length).toBeGreaterThan(0);
    for (const e of actFour) {
      expect(e.runtimeReadiness, `${e.id} 在 Gate 关闭时不应为 official-ready`).not.toBe(
        'official-ready',
      );
    }
  });

  it('prototype 原型内容不得进入正式内容池（enabledInOfficialPool=false）', () => {
    const leaked = entries.filter((e) => e.officialDataStatus === 'prototype' && e.enabledInOfficialPool);
    expect(leaked.map((e) => e.id)).toEqual([]);
  });

  it('prototype- 前缀 ID 的条目必须被标为 prototype 或 unavailable', () => {
    const prefixed = entries.filter((e) => e.id.startsWith('prototype-'));
    expect(prefixed.length).toBeGreaterThan(0);
    for (const e of prefixed) {
      expect(
        ['prototype', 'unavailable'].includes(e.officialDataStatus),
        `${e.id} officialDataStatus=${e.officialDataStatus}`,
      ).toBe(true);
    }
  });
});
