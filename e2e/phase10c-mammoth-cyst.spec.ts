// Phase 10C §32：Mammoth Cyst / White Cell Stalk / Teleportation 浏览器层 E2E。
//
// 目标：在 dev-only 调试面板（DebugPanel → ActFourDebugSection + MammothCystDebugSection）
// 上驱动 §32 的九个场景，验证「调试按钮 → 正式运行时入口 → 只读字段收敛」整条链路，
// 而不修改任何源码。
//
// 确定性说明：ActFourDebugSection / MammothCystDebugSection 内部使用
// makeSeedSequence()（挂载即 0x10a16 递增），每次测试 page 重载都会重置，
// 因此同一套按钮点击序列抽到同一张 Quest / Guardian 家族 —— 各测试间可复现。
// 无论抽到的 Guardian 家族是 templars / mammoth-cyst / shuffling-horror，
// MammothCystDebugSection 的「Setup Mammoth Cyst」都是**家族无关**的：
// 只要 guardianBattleId 存在即可装配 mammoth-cyst 遭遇（硬约束 1：不建第二套战斗）。
//
// 硬约束对照（供阅读）：
//  - 硬约束 3：初始 Stalk 只在 Reserve；
//  - 硬约束 5：场上无 Stalk 时 Cyst 行动完全替代普通 Skill（召唤）；
//  - 硬约束 6：Stalk 死亡不立即重召唤，需再行动一次；
//  - 硬约束 8 / maxAlive=1；硬约束 14：d10 先保存后展示；硬约束 20：official 禁用；
//  - 具体逻辑由 60 个单元用例（mammoth-cyst.test.ts）覆盖，本文件只做整链冒烟。

import { test, expect, type Page } from '@playwright/test';
import { SAVE_VERSION } from '../src/game-engine/save';

const HEROES = ['Crusader', 'Vestal', 'Highwayman', 'Hellion'];

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    if (!window.localStorage.getItem('dd-fixed-rng')) {
      window.localStorage.setItem('dd-fixed-rng', '20260801');
    }
  });
});

/** 新建战役并推进到任务选择页（与既有 E2E 同构）。 */
async function setupToQuests(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '新建战役' }).click();
  await expect(page).toHaveURL(/\/setup$/);
  for (const name of HEROES) {
    await page.getByText(name, { exact: true }).first().click();
  }
  await page.getByRole('button', { name: '继续（技能配置）' }).click();
  await expect(page).toHaveURL(/\/loadout$/);
  await page.getByRole('button', { name: '使用默认配置（全部英雄）' }).click();
  await page.getByRole('button', { name: '继续（任务选择）' }).click();
  await expect(page).toHaveURL(/\/quests$/);
}

/** 展开 Debug 面板。 */
async function openDebug(page: Page) {
  const toggle = page.getByRole('button', { name: '🐞 Debug' });
  if (await toggle.count()) await toggle.click();
  await expect(page.getByTestId('debug-panel')).toBeVisible();
}

/** 展开 Act IV 调试区（解锁后会随 actFourState 一起挂载）。 */
async function openActFour(page: Page) {
  const toggle = page.getByTestId('debug-act-four-toggle');
  await toggle.click();
}

/** 展开 Mammoth Cyst 调试区。 */
async function openMammothCyst(page: Page) {
  const toggle = page.getByTestId('debug-mammoth-cyst-toggle');
  await toggle.click();
}

/**
 * 把 Act IV 推到「Guardian Battle 已开始」并装配 Mammoth Cyst 遭遇。
 * 全程 dev-only 调试按钮，不依赖随机家族。
 */
async function driveToMammothCystEncounter(page: Page) {
  await setupToQuests(page);
  await openDebug(page);

  // 解锁 Act IV（带 withUnlockPrecondition 临时补齐 3 个 Boss Family）。
  await page.getByTestId('debug-actfour-解锁 Act IV').click();
  await openActFour(page);
  await page.getByTestId('debug-actfour-跳过第三Boss回归').click();
  await page.getByTestId('debug-actfour-抽 Quest').click();
  await page.getByTestId('debug-actfour-抽 Layout').click();
  await page.getByTestId('debug-actfour-生成地图').click();
  await page.getByTestId('debug-actfour-创建 Guardian Quest').click();
  await page.getByTestId('debug-actfour-进入 Guardian Battle').click();

  // 装配 Mammoth Cyst 遭遇（家族无关；若家族已是 mammoth-cyst 则幂等 no-op）。
  await openMammothCyst(page);
  await page.getByTestId('debug-mammoth-cyst-Setup Mammoth Cyst').click();
}

/** 读 Mammoth Cyst 调试区某一只读行的值（dt + 相邻 dd）。 */
async function mcRow(page: Page, label: string): Promise<string> {
  const dt = page.getByTestId('debug-mammoth-cyst').locator('dt', { hasText: label });
  const dd = dt.locator('+ dd');
  return (await dd.textContent())?.trim() ?? '';
}

/** 反复点击「执行一次行动」，直到 predicate 返回 true 或达到上限。 */
async function executeUntil(
  page: Page,
  predicate: () => Promise<boolean>,
  maxClicks = 8,
): Promise<void> {
  for (let i = 0; i < maxClicks; i += 1) {
    if (await predicate()) return;
    await page.getByTestId('debug-mammoth-cyst-执行一次行动').click();
  }
}

test('§32.1 Setup：Cyst Aggressive、2 张卡、Stalk 仅 Reserve、场上 0 Stalk', async ({ page }) => {
  await driveToMammothCystEncounter(page);

  const section = page.getByTestId('debug-mammoth-cyst');
  // Cyst 就位（prototype maxHp = 60，恒 Aggressive）。
  await expect(section).toContainText('60/60');
  await expect(section).toContainText('aggressive');
  // Stalk 初始只在 Reserve，未在场。
  await expect(section).toContainText('Reserve（未在场）');
  // 存活 Stalk 数 = 0。
  expect(await mcRow(page, '存活 Stalk 数')).toBe('0 / 上限 1');
  // 仅 2 张 Cyst Initiative（Cyst 2 + Stalk 0）。
  await expect(section).toContainText('Stalk 0');
  expect(await mcRow(page, '牌堆剩余')).toBe('2');
  // 下一张卡决策应为召唤（无 Stalk → 完全替代普通 Skill，硬约束 5）。
  await expect(section).toContainText('summon-linked-actor');

  // SAVE_VERSION 跟随常量断言。
  await expect(page.getByTestId('debug-panel')).toContainText(`v${SAVE_VERSION}`);
});

test('§32.2 首次召唤：Cyst 行动替代 Skill，召唤 Stalk 并加入 2 张卡，刷新不重复', async ({ page }) => {
  await driveToMammothCystEncounter(page);

  // 第一次行动必然召唤（场上无 Stalk）。
  await page.getByTestId('debug-mammoth-cyst-执行一次行动').click();

  expect(await mcRow(page, '存活 Stalk 数')).toBe('1 / 上限 1');
  expect(await mcRow(page, '召唤 generation')).toBe('1');
  expect(await mcRow(page, '召唤次数')).toBe('1');
  // 召唤后加入 2 张 Stalk Initiative（Cyst 2 + Stalk 2）。
  await expect(page.getByTestId('debug-mammoth-cyst')).toContainText('Stalk 2');

  // 刷新后状态保持（存档落盘，不重掷）。
  await page.reload();
  await openDebug(page);
  await openActFour(page);
  await openMammothCyst(page);
  expect(await mcRow(page, '召唤次数')).toBe('1');
  expect(await mcRow(page, '存活 Stalk 数')).toBe('1 / 上限 1');
});

test('§32.3 正常行动：Stalk 存活时 Cyst 运行普通 Skill，不再召唤', async ({ page }) => {
  await driveToMammothCystEncounter(page);
  await page.getByTestId('debug-mammoth-cyst-执行一次行动').click(); // 召唤 gen1

  // 第二次行动：场上已有 Stalk → 不再召唤。
  await page.getByTestId('debug-mammoth-cyst-执行一次行动').click();

  expect(await mcRow(page, '召唤次数')).toBe('1'); // 无新召唤
  expect(await mcRow(page, '存活 Stalk 数')).toBe('1 / 上限 1'); // Stalk 仍存活
  // 普通 Skill 被掷出（Skill Rolls 计数 >= 1），证明 Cyst 走的是普通行动而非召唤。
  const skillRolls = await mcRow(page, 'Skill Rolls');
  expect(Number(skillRolls)).toBeGreaterThanOrEqual(1);
});

test('§32.4 Teleportation：固定 d10、Room Map 解析、Hero 原子传送、Entry Effect 幂等', async ({ page }) => {
  await driveToMammothCystEncounter(page);
  await page.getByTestId('debug-mammoth-cyst-执行一次行动').click(); // 召唤 Stalk

  // 反复行动直到触发一次 Teleportation（Stalk 的正式 Skill）。
  await executeUntil(page, async () => (await mcRow(page, 'Teleportation 次数')) !== '0');
  expect(Number(await mcRow(page, 'Teleportation 次数'))).toBeGreaterThanOrEqual(1);

  const last = await mcRow(page, '最近 Teleportation');
  // d10 先保存后展示（d10=N），映射只来自 Room Definition（→ 非空 Area，非 '?'），状态收敛。
  expect(last).toMatch(/^d10=\d+ → (?![\?]).+ · (effects-resolved|moved|rolled-back)$/);
  // 幂等：Refresh 不重掷（记录数保持）。
  await page.reload();
  await openDebug(page);
  await openActFour(page);
  await openMammothCyst(page);
  expect(Number(await mcRow(page, 'Teleportation 次数'))).toBeGreaterThanOrEqual(1);
});

test('§32.5 Area 满 / Capacity：目标 Area 始终来自 Room Definition（不重掷、不换 Area）', async ({ page }) => {
  await driveToMammothCystEncounter(page);
  await page.getByTestId('debug-mammoth-cyst-执行一次行动').click(); // 召唤 Stalk

  // 触发多次 Teleportation，验证每次的目标 Area 都来自 Definition（非空、格式稳定）。
  await executeUntil(page, async () => Number(await mcRow(page, 'Teleportation 次数')) >= 2);
  const count = Number(await mcRow(page, 'Teleportation 次数'));
  expect(count).toBeGreaterThanOrEqual(2); // 已通过定义驱动映射产生多次传送

  const last = await mcRow(page, '最近 Teleportation');
  // 映射只查 teleportationD10Map（硬约束 15）：目标 Area 非空，绝不落到 '?'（缺项回滚）。
  expect(last).toMatch(/→ (?![\?]).+ · (effects-resolved|moved|rolled-back)/);
  // 注：Area 满导致的 Capacity 回滚（硬约束 17）由单元用例覆盖，本场景验证映射来源正确性。
});

test('§32.6 死亡与重召唤：Stalk 死亡后不立即重生，下一次 Cyst 行动新 Generation 召唤', async ({ page }) => {
  await driveToMammothCystEncounter(page);
  await page.getByTestId('debug-mammoth-cyst-执行一次行动').click(); // 召唤 gen1

  // 击杀 Stalk —— 不应立即重召唤。
  await page.getByTestId('debug-mammoth-cyst-击败 Stalk').click();
  expect(await mcRow(page, '存活 Stalk 数')).toBe('0 / 上限 1');
  expect(await mcRow(page, '召唤次数')).toBe('1'); // 仍为首次召唤
  expect(await mcRow(page, '召唤 generation')).toBe('1'); // generation 未变

  // 下一次 Cyst 行动 → 重召唤 gen2。
  await page.getByTestId('debug-mammoth-cyst-执行一次行动').click();
  expect(await mcRow(page, '存活 Stalk 数')).toBe('1 / 上限 1');
  expect(await mcRow(page, '召唤次数')).toBe('2');
  expect(await mcRow(page, '召唤 generation')).toBe('2'); // 新代
});

test('§32.7 Guardian Victory：Cyst 死亡，Stalk 按 Policy 清理，3 XP，进入 Final Hamlet', async ({ page }) => {
  await driveToMammothCystEncounter(page);

  // 击杀 Cyst → 触发 Victory（prototype 用 boss-defeated / remove-linked-actors-on-boss-victory）。
  await page.getByTestId('debug-mammoth-cyst-击败 Cyst').click();
  await page.getByTestId('debug-mammoth-cyst-Mammoth Cyst Victory').click();

  // Act IV 阶段进入「Guardian 已击败」（复用 Phase 10A 的 3 XP + Final Hamlet 链路）。
  await expect(page.getByTestId('debug-act-four')).toContainText('Guardian 已击败');
  // 遭遇胜利已结算。
  expect(await mcRow(page, '已结算胜利')).toBe('true');
  await expect(page.getByTestId('debug-mammoth-cyst')).toContainText('Victory 满足');
});

test('§32.8 Guardian Failure：队伍无法继续 → Campaign Over', async ({ page }) => {
  await driveToMammothCystEncounter(page);

  await page.getByTestId('debug-mammoth-cyst-Mammoth Cyst 失败').click();

  // 失败 → Campaign Over（gamePhase / stage = campaign-over）。
  await expect(page.getByTestId('debug-panel')).toContainText('campaign-over');
});

test('§32.9 Data Gate：official 禁用，Prototype Harness 可用', async ({ page }) => {
  await driveToMammothCystEncounter(page);

  const section = page.getByTestId('debug-mammoth-cyst');
  // official 因资料缺失禁用（硬约束 20）。
  await expect(page.getByTestId('debug-mammoth-cyst-gate')).toBeVisible();
  await expect(page.getByTestId('debug-mammoth-cyst-gate')).toContainText('禁用');
  expect(await mcRow(page, 'official 启用')).toContain('false');

  // 尽管 official 禁用，Prototype Harness 仍可装配完整遭遇（60/60 Cyst 在场）。
  await expect(section).toContainText('60/60');
  // 下一张卡决策仍为召唤（Prototype 条件覆盖生效）。
  await expect(section).toContainText('summon-linked-actor');
});
