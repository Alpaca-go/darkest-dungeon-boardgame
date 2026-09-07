// Phase 11A.2.2 §23 — Test Policy Architecture Boundary。
//
// dev doc §23：
//   - 允许 import：selectors, data, Production Commands
//   - 禁止 import：debug APIs, store, React, localStorage
//   - 禁止：直接 spread CampaignState / 写 hero.hp / 写 battle.status / 跳 pending windows
//
// 本文件断言 src/testing/policies/** 下每个 .ts 文件满足上述边界。

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const POLICIES_DIR = join(process.cwd(), 'src/testing/policies');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(p) && !/\.test\.ts$/.test(p)) out.push(p);
  }
  return out;
}

function stripCommentsAndStrings(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/import\s+type\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?/g, '')
    .replace(/import\s+type\s+\w+\s+from\s+['"][^'"]+['"];?/g, '')
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
}

const POLICY_FILES = walk(POLICIES_DIR);

// dev doc §23 禁止的 import 模式
const FORBIDDEN_IMPORT_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /from\s+['"][^'"]*store['"]/, label: 'store' },
  { pattern: /from\s+['"][^'"]*useGameStore/, label: 'useGameStore' },
  { pattern: /from\s+['"]react['"]/, label: 'react' },
  { pattern: /from\s+['"][^'"]*react-dom/, label: 'react-dom' },
  { pattern: /from\s+['"][^'"]*localStorage/, label: 'localStorage' },
  // dev doc §22 禁止：直接 spread CampaignState 本身（不是 spread 子数组）
  { pattern: /\{\s*\.\.\.campaign\s*,/, label: 'spread CampaignState into object' },
  { pattern: /\[\s*\.\.\.campaign\s*\]/, label: 'spread CampaignState into array' },
  // 直接写 battle/hero/pending 字段
  { pattern: /\bhero\.hp\s*=/, label: '直接写 hero.hp' },
  { pattern: /\bhero\.stress\s*=/, label: '直接写 hero.stress' },
  { pattern: /\bbattle\.status\s*=/, label: '直接写 battle.status' },
  { pattern: /\bpending\w+\s*=\s*\[\]/, label: '清空 pending 数组' },
];

// dev doc §22 允许的 import 模式
const ALLOWED_IMPORT_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /from\s+['"]\.\.\/\.\.\/types/, label: 'types (type definitions)' },
  { pattern: /from\s+['"]\.\.\/\.\.\/game-engine\/(commands|campaign|dungeon|battle|hamlet|quest|trinket|replacement)/, label: 'game-engine pure selectors / Production Commands' },
  { pattern: /from\s+['"]\.\.\/\.\.\/data\//, label: 'data (game data)' },
  // simulation-driver 是 audit 测试 helper（其内部已迁到 production commands）
  { pattern: /from\s+['"]\.\.\/\.\.\/(audit\/core-campaign\/simulation-driver|game-engine\/simulation-driver)/, label: 'simulation-driver (test helper)' },
];

describe('Test Policy Architecture Boundary (Phase 11A.2.2 §23)', () => {
  it('Policy 文件必须存在且至少有 1 个 apply*Policy 入口', () => {
    expect(POLICY_FILES.length).toBeGreaterThan(0);
    for (const f of POLICY_FILES) {
      const text = readFileSync(f, 'utf8');
      expect(text).toMatch(/applyDeterministic\w+Policy/);
    }
  });

  it('Policy 不 import 禁止模块：store / React / localStorage / debug', () => {
    for (const f of POLICY_FILES) {
      const text = stripCommentsAndStrings(readFileSync(f, 'utf8'));
      for (const { pattern, label } of FORBIDDEN_IMPORT_PATTERNS) {
        expect(
          pattern.test(text),
          `${f} 违反 Policy Boundary：${label}（pattern: ${pattern}）`,
        ).toBe(false);
      }
    }
  });

  it('Policy 只 import 允许模块：types / game-engine pure selectors / Production Commands / data', () => {
    for (const f of POLICY_FILES) {
      const text = readFileSync(f, 'utf8');
      // 提取所有 import from '...'
      const importRe = /import\s+(?:\w+(?:\s*,\s*\{[^}]+\})?|\{[^}]+\})\s+from\s+['"]([^'"]+)['"]/g;
      const importPaths: string[] = [];
      for (const m of text.matchAll(importRe)) {
        importPaths.push(m[1]);
      }
      for (const p of importPaths) {
        // 相对路径必须匹配至少一个允许模式
        const isAllowed = ALLOWED_IMPORT_PATTERNS.some(({ pattern }) => pattern.test(`from '${p}'`));
        if (!isAllowed) {
          // 允许同目录内 import（如 index.ts 转发）
          const sameDir = POLICIES_DIR.replace(/\\/g, '/');
          if (!p.startsWith('.')) {
            throw new Error(
              `${f} import '${p}' 不在允许列表（types / game-engine / data / simulation-driver）`,
            );
          }
          // 相对路径的，从 src 算起的相对路径
          const abs = join(POLICIES_DIR, p).replace(/\\/g, '/');
          if (!abs.startsWith(sameDir) && !abs.includes('/types/') && !abs.includes('/game-engine/') && !abs.includes('/data/')) {
            throw new Error(`${f} import '${p}' 解析到 ${abs}，不在 src/testing/policies / src/types / src/game-engine / src/data 范围内`);
          }
        }
      }
    }
  });

  it('Policy 函数返回 CampaignState 必须经过 Production Command 转换（不得直接返回 mutated input）', () => {
    // 简化断言：每个具体 policy 文件（非 index 转发）必须 import 至少一个 production command 函数
    for (const f of POLICY_FILES) {
      const fileName = f.split(/[\\/]/).pop() ?? '';
      // index.ts 只做 barrel 转发，不需 import commands
      if (fileName === 'index.ts') continue;
      const text = readFileSync(f, 'utf8');
      // 必须 import 自 game-engine/commands 或 simulation-driver（仅 battle policy 例外）
      if (/simulation-driver/.test(text)) {
        // battle policy 可通过 autoPlayBattle（其内部已迁到 production commands）
        expect(text).toMatch(/autoPlayBattle/);
      } else {
        expect(text).toMatch(/from\s+['"]\.\.\/\.\.\/game-engine\/commands/);
      }
    }
  });
});
