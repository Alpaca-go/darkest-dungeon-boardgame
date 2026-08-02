// Phase 11A — `npm run audit:rules`
// 规则追溯矩阵 + RNG 决定性审计 + 状态机迁移合法性表。

import { join } from 'path';
import {
  RULE_TRACEABILITY,
  summarizeRuleTraceability,
  runRngAudit,
  LEGAL_TRANSITIONS,
  ILLEGAL_TRANSITIONS,
  validateCampaignTransition,
} from '../../src/audit/core-campaign/index';
import { banner, mdTable, rel, REPO_ROOT, writeJson, writeReport } from './io';

const ruleSummary = summarizeRuleTraceability();
const rng = runRngAudit(join(REPO_ROOT, 'src'));

// 官方路径 = src/ 下排除 audit / 测试 / e2e 的文件。
const OFFICIAL_PATH = /[\\/](game-engine|data|store|components)[\\/]/;
const officialFindings = rng.findings.filter(
  (f) => OFFICIAL_PATH.test(f.file) && !/\.test\.tsx?$/.test(f.file),
);
const officialMathRandom = officialFindings.filter((f) => f.category === 'math-random');

const transitionChecks = [
  ...LEGAL_TRANSITIONS.map(([from, event, to]) => validateCampaignTransition({ from, event, to })),
  ...ILLEGAL_TRANSITIONS.map(([from, event, to]) => validateCampaignTransition({ from, event, to })),
];
const transitionTableConsistent =
  transitionChecks.slice(0, LEGAL_TRANSITIONS.length).every((c) => c.legal) &&
  transitionChecks.slice(LEGAL_TRANSITIONS.length).every((c) => !c.legal);

const written: string[] = [];

written.push(
  writeJson('rule-traceability.json', {
    summary: ruleSummary,
    records: RULE_TRACEABILITY,
  }),
);
written.push(
  writeJson('rng-audit.json', {
    passed: rng.passed,
    mathRandomLeaks: rng.mathRandomLeaks,
    officialPathMathRandomLeaks: officialMathRandom.length,
    timeSourceLeaks: rng.timeSourceLeaks,
    definitionHashStable: rng.definitionHashStable,
    officialFindings: officialMathRandom.map((f) => ({ file: rel(f.file), line: f.line, text: f.text })),
    allFindings: rng.findings.map((f) => ({
      file: rel(f.file),
      line: f.line,
      category: f.category,
      severity: f.severity,
      text: f.text,
    })),
  }),
);
written.push(
  writeJson('state-transitions.json', {
    legal: LEGAL_TRANSITIONS,
    illegal: ILLEGAL_TRANSITIONS,
    tableConsistent: transitionTableConsistent,
  }),
);

const md = `# Phase 11A — Rule Traceability / RNG 决定性 / 状态机迁移审计

> 由 \`npm run audit:rules\` 自动生成，请勿手改。

## 1. 规则追溯矩阵（P0）

- P0 规则总数：**${ruleSummary.p0Total}**
- implemented-and-tested：**${ruleSummary.implementedAndTested}**
- implemented-not-tested：**${ruleSummary.implementedNotTested}**
- data-missing：**${ruleSummary.dataMissing}**
- implementation-missing：**${ruleSummary.implementationMissing}**
- **P0 全覆盖：${ruleSummary.p0Complete ? '✅ 是' : '❌ 否'}**

${mdTable(
  ['规则 ID', '域', '状态', '实现文件', '测试', '备注'],
  RULE_TRACEABILITY.map((r) => [
    r.id,
    r.ruleDomain,
    r.status,
    r.implementationFiles.map((f) => `\`${f}\``).join('<br>') || '—',
    r.testIds.map((t) => `\`${t}\``).join('<br>') || '—',
    r.notes.join('；') || '—',
  ]),
)}

### 1.1 被阻断的 P0 规则

${
  ruleSummary.blockedRuleIds.length === 0
    ? '_无_'
    : ruleSummary.blockedRuleIds.map((id) => `- \`${id}\``).join('\n')
}

## 2. RNG 决定性审计

- 全库 \`Math.random()\` 命中：**${rng.mathRandomLeaks}**
- **官方路径（game-engine / data / store / components）\`Math.random()\` 泄漏：${officialMathRandom.length}**
- 时间源（\`Date.now()\` / \`new Date()\`）命中：**${rng.timeSourceLeaks}**
- Definition Hash 稳定：**${rng.definitionHashStable ? '✅' : '❌'}**
- 判定：**${officialMathRandom.length === 0 && rng.definitionHashStable ? '✅ PASS' : '❌ FAIL'}**

${mdTable(
  ['file', 'line', 'code'],
  officialMathRandom.map((f) => [`\`${rel(f.file)}\``, f.line, `\`${f.text.replace(/\|/g, '\\|').slice(0, 110)}\``]),
)}

${
  officialMathRandom.length > 0
    ? `> **影响**：这些调用绕开了可注入随机源 \`setRandomSource\`，导致同 seed 的两次 replay 无法逐位复现。\n> Milestone Hash 必须先经 \`stripVolatile()\` 剥离 \`id\` / \`createdAt\` / \`updatedAt\` / \`log\` 才能比较（见 ISSUE-P1-001）。\n`
    : ''
}

## 3. 状态机迁移合法性

- 合法迁移条目：**${LEGAL_TRANSITIONS.length}**
- 非法迁移条目（负样本）：**${ILLEGAL_TRANSITIONS.length}**
- 迁移表自洽：**${transitionTableConsistent ? '✅' : '❌'}**

### 3.1 合法迁移

${mdTable(['from', 'event', 'to'], LEGAL_TRANSITIONS.map(([f, e, t]) => [`\`${f}\``, `\`${e}\``, `\`${t}\``]))}

### 3.2 明确禁止的迁移

${mdTable(['from', 'event', 'to'], ILLEGAL_TRANSITIONS.map(([f, e, t]) => [`\`${f}\``, `\`${e}\``, `\`${t}\``]))}
`;

written.push(writeReport('02-rule-traceability-and-rng.md', md));

banner('audit:rules');
console.log(`P0 规则                : ${ruleSummary.p0Total}`);
console.log(`  implemented-and-tested: ${ruleSummary.implementedAndTested}`);
console.log(`  implemented-not-tested: ${ruleSummary.implementedNotTested}`);
console.log(`  data-missing          : ${ruleSummary.dataMissing}`);
console.log(`P0 全覆盖              : ${ruleSummary.p0Complete ? 'YES' : 'NO'}`);
console.log(`官方路径 Math.random   : ${officialMathRandom.length}`);
console.log(`时间源命中             : ${rng.timeSourceLeaks}`);
console.log(`迁移表自洽             : ${transitionTableConsistent ? 'YES' : 'NO'}`);
console.log('\n产物:');
for (const p of written) console.log(`  - ${rel(p)}`);
