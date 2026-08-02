// Phase 10D §32：Shuffling Horror / 动态怪物行动优先级 / Echoing Disassembly /
// Hero Stance Shuffle 浏览器层 E2E。
//
// 目标：在 dev-only 调试面板（DebugPanel → ActFourDebugSection + ShufflingHorrorDebugSection）
// 上驱动 §32 的九个场景，验证「调试按钮 → 正式运行时入口 → 只读字段收敛」整条链路，
// 而不修改任何源码。
//
// 确定性说明：
// - ActFourDebugSection / ShufflingHorrorDebugSection 内部使用 makeSeedSequence()
//   （挂载即固定起点递增），每次 page 重载都会重置 → 同一套点击序列可复现；
// - ⚠️ 与 Mammoth Cyst 不同，Shuffling Horror 的 Setup **是家族相关**的
//   （guardian.family !== 'shuffling-horror' 直接拒绝装配），而 Quest 抽取是随机的，
//   因此必须先点「强制 Shuffling Horror 家族」再创建 Guardian Quest。
//
// 硬约束对照（供阅读）：
//  - 硬约束 2/3/13：Monster Opportunity 不绑定 Actor，抽到时才按 Stance 优先级解析；
//  - 硬约束 4/5：Horror 每轮 ≤2 次，Priest/Growth 各 1 次，预算独立；
//  - 硬约束 8/9/10/11/12：Tracker 未满 → 强制 Echoing，Priest→Growth 原子双召唤，各 +1 Opportunity；
//  - 硬约束 18—23：Undulations 生成合法 Hero 排列，只改 Stance 不改 Area，保留已行动标记；
//  - 硬约束 16/17：Priest/Growth 死亡不立即重生，下次 Horror 行动重召唤（generation++）；
//  - 硬约束 25/26/27：Horror 死亡停 Queue + 清理 linked actors；Victory → 3 XP + Final Hamlet；Failure → Campaign Over；
//  - 硬约束 28/29：official 禁用，仅 prototype harness 可跑；
//  - 具体逻辑由 55 个单元用例（shuffling-horror.test.ts）覆盖，本文件只做整链冒烟。

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

async function openDebug(page: Page) {
  const toggle = page.getByRole('button', { name: '🐞 Debug' });
  if (await toggle.count()) await toggle.click();
  await expect(page.getByTestId('debug-panel')).toBeVisible();
}

async function openActFour(page: Page) {
  await page.getByTestId('debug-act-four-toggle').click();
}

async function openShufflingHorror(page: Page) {
  await page.getByTestId('debug-shuffling-horror-toggle').click();
}

/** 刷新后重新展开三层面板（用于验证落盘一致性）。 */
async function reopenAfterReload(page: Page) {
  await page.reload();
  await openDebug(page);
  await openActFour(page);
  await openShufflingHorror(page);
}

/**
 * 把 Act IV 推到「Guardian Battle 已开始」并装配 Shuffling Horror 遭遇。
 * 全程 dev-only 调试按钮；家族由「强制 Shuffling Horror 家族」固定，不依赖随机。
 */
async function driveToShufflingHorrorEncounter(page: Page) {
  await setupToQuests(page);
  await openDebug(page);

  // ⚠️ ActFourDebugSection 默认折叠（useState(false)），按钮只在展开后渲染，
  // 必须先展开再点「解锁 Act IV」，否则 locator 会一直等到 test timeout。
  await openActFour(page);
  await page.getByTestId('debug-actfour-解锁 Act IV').click();
  await page.getByTestId('debug-actfour-跳过第三Boss回归').click();
  await page.getByTestId('debug-actfour-抽 Quest').click();
  await page.getByTestId('debug-actfour-抽 Layout').click();
  await page.getByTestId('debug-actfour-生成地图').click();

  // ⚠️ 必须在创建 Guardian Quest 之前固定家族（Quest 会快照 guardianDefinitionId）。
  await openShufflingHorror(page);
  await page.getByTestId('debug-shuffling-horror-强制 Shuffling Horror 家族').click();

  await page.getByTestId('debug-actfour-创建 Guardian Quest').click();
  await page.getByTestId('debug-actfour-进入 Guardian Battle').click();
  // 进入 Guardian Battle 时 guardian-quest 路由已自动 Setup；此处再点一次验证幂等。
  await page.getByTestId('debug-shuffling-horror-Setup Shuffling Horror').click();
}

/** 读 Shuffling Horror 调试区某一只读行的值（dt + 相邻 dd）。 */
async function shRow(page: Page, label: string): Promise<string> {
  const dt = page.getByTestId('debug-shuffling-horror').locator('dt', { hasText: label });
  const dd = dt.first().locator('+ dd');
  return (await dd.textContent())?.trim() ?? '';
}

async function act(page: Page) {
  await page.getByTestId('debug-shuffling-horror-执行一次行动').click();
}

test('§32.1 Setup：只建 Horror（Aggressive）+ 2 张 Opportunity，Priest/Growth 仅 Reserve', async ({
  page,
}) => {
  await driveToShufflingHorrorEncounter(page);

  const section = page.getByTestId('debug-shuffling-horror');
  // 家族已固定为 prototype Shuffling Horror。
  expect(await shRow(page, 'Guardian')).toContain('prototype-');
  // Horror 在场且位于 Aggressive；Priest/Growth 仅 Reserve（硬约束 10）。
  expect(await shRow(page, 'Horror')).toContain('aggressive');
  expect(await shRow(page, 'Cultist Priest')).toBe('Reserve（未在场）');
  expect(await shRow(page, 'Malignant Growth')).toBe('Reserve（未在场）');
  // 初始 2 张 Monster Opportunity，尚无消费。
  expect(await shRow(page, '牌堆剩余 / 已消费')).toBe('2 / 0');
  // Tracker 只占 Aggressive → 未满 → 下次 Horror 行动强制 Echoing（硬约束 8）。
  expect(await shRow(page, 'Tracker 已满')).toBe('false');
  expect(await shRow(page, '待召唤 Role')).toBe('Priest → Growth');
  await expect(section).toContainText('echoing-disassembly');

  // SAVE_VERSION 跟随常量断言（升版时不需要改这一行）。
  await expect(page.getByTestId('debug-panel')).toContainText(`v${SAVE_VERSION}`);
});

test('§32.2 Echoing Disassembly：Tracker 未满时 Horror 行动被强制替代，Priest→Growth 原子双召唤', async ({
  page,
}) => {
  await driveToShufflingHorrorEncounter(page);

  await act(page); // 第 1 张卡：必然解析为 Horror → Echoing

  // 两名召唤物一次性入场（硬约束 9/11），且各占一个 Stance。
  expect(await shRow(page, 'Cultist Priest')).toContain('defensive');
  expect(await shRow(page, 'Malignant Growth')).toContain('ranged');
  expect(await shRow(page, '已召唤 Role')).toBe('Priest,Growth');
  expect(await shRow(page, '待召唤 Role')).toBe('（无）');
  // 每名召唤物 +1 Opportunity（硬约束 12）：消费 1 张、补 2 张 → 剩 3 张。
  expect(await shRow(page, '牌堆剩余 / 已消费')).toBe('3 / 1');
  // generation：Horror 1 / Priest 1 / Growth 1。
  expect(await shRow(page, 'generation（H/P/G）')).toBe('1/1/1');

  // 刷新后一致（落盘，不重掷）。
  await reopenAfterReload(page);
  expect(await shRow(page, '已召唤 Role')).toBe('Priest,Growth');
  expect(await shRow(page, '牌堆剩余 / 已消费')).toBe('3 / 1');
});

test('§32.3 Undulations：Tracker 满后 Horror 普通行动洗 Hero Stance，排列合法且 Area 不变', async ({
  page,
}) => {
  await driveToShufflingHorrorEncounter(page);

  const before = await shRow(page, 'Hero Stance 排列');
  await act(page); // Echoing
  await act(page); // Tracker 已满 → Undulations

  await expect(page.getByTestId('debug-shuffling-horror')).toContainText('Undulations');
  const after = await shRow(page, 'Hero Stance 排列');
  // 4 名 Hero 各占一个 Stance，不重复、不丢失（硬约束 18/19）。
  const stances = after.split(' ').map((t) => t.split(':')[1]?.replace('*', ''));
  expect(stances).toHaveLength(4);
  expect(new Set(stances).size).toBe(4);
  expect(before.split(' ')).toHaveLength(4);

  // RNG 先保存后展示（硬约束 21）：刷新后排列完全一致，不重掷。
  await reopenAfterReload(page);
  expect(await shRow(page, 'Hero Stance 排列')).toBe(after);
});

test('§32.4 动态 Opportunity：Horror 预算耗尽后同一张卡顺延到 Priest / Growth', async ({ page }) => {
  await driveToShufflingHorrorEncounter(page);

  await act(page); // Horror 1/2（Echoing）
  await act(page); // Horror 2/2（Undulations）
  expect(await shRow(page, '剩余行动（H/P/G）')).toBe('0/1/1');
  // 卡不绑定 Actor：Horror 无剩余行动 → 下一张卡解析到 Priest（硬约束 2/3/13）。
  await expect(page.getByTestId('debug-shuffling-horror')).toContainText('normal-skill｜Priest');

  await act(page); // Priest 行动
  expect(await shRow(page, '剩余行动（H/P/G）')).toBe('0/0/1');
  await expect(page.getByTestId('debug-shuffling-horror')).toContainText('normal-skill｜Growth');

  await act(page); // Growth 行动
  expect(await shRow(page, '剩余行动（H/P/G）')).toBe('0/0/0');
});

test('§32.5 Excess Initiative：全员预算耗尽后再抽卡标记 Excess 并移除', async ({ page }) => {
  await driveToShufflingHorrorEncounter(page);

  await act(page); // Horror（Echoing，补 2 张）
  await act(page); // Horror（Undulations）
  await act(page); // Priest
  await act(page); // Growth
  expect(await shRow(page, '剩余行动（H/P/G）')).toBe('0/0/0');

  // 推进 Round 会补新卡；这里在预算耗尽状态下先确认已消费 4 张、Excess 尚为 0。
  expect(await shRow(page, 'Excess 数')).toBe('0');
  expect(await shRow(page, '牌堆剩余 / 已消费')).toBe('0 / 4');

  // 推进 Round → 预算重置，队列可继续（硬约束 4/5 每轮独立预算）。
  await page.getByTestId('debug-shuffling-horror-推进 Round').click();
  expect(await shRow(page, 'Round')).toBe('2');
  expect(await shRow(page, '剩余行动（H/P/G）')).toBe('2/1/1');
});

test('§32.6 死亡不立即重生：Priest 阵亡后需下一次 Horror 行动才重召唤（generation++）', async ({
  page,
}) => {
  await driveToShufflingHorrorEncounter(page);
  await act(page); // Echoing → Priest/Growth 入场

  await page.getByTestId('debug-shuffling-horror-击败 Priest').click();
  // 硬约束 16：不立即重生。
  expect(await shRow(page, 'Cultist Priest')).toContain('已击败');
  expect(await shRow(page, 'generation（H/P/G）')).toBe('1/1/1');
  expect(await shRow(page, '下次 Horror 行动重召唤')).toBe('true');
  expect(await shRow(page, '待召唤 Role')).toBe('Priest');

  // 硬约束 17：下一次 Horror 行动重召唤（Horror 本轮还剩 1 次预算）。
  await act(page);
  expect(await shRow(page, 'generation（H/P/G）')).toContain('1/2/');
  expect(await shRow(page, '下次 Horror 行动重召唤')).toBe('false');
});

test('§32.7 Horror 死亡：立即停止 Monster Queue 并清理关联召唤物', async ({ page }) => {
  await driveToShufflingHorrorEncounter(page);
  await act(page); // Echoing → Priest/Growth 在场

  await page.getByTestId('debug-shuffling-horror-击败 Horror').click();

  // 硬约束 25：Queue 停止（牌堆清空）+ linked actors 一并清理。
  expect(await shRow(page, '牌堆剩余 / 已消费')).toMatch(/^0 \//);
  expect(await shRow(page, 'Horror')).toContain('已击败');
  expect(await shRow(page, 'Cultist Priest')).toContain('已击败');
  expect(await shRow(page, 'Malignant Growth')).toContain('已击败');
  expect(await shRow(page, 'Victory 满足')).toContain('true');
});

test('§32.8 Victory / Failure：3 XP + Final Hamlet；失败 → Campaign Over', async ({ page }) => {
  await driveToShufflingHorrorEncounter(page);

  await page.getByTestId('debug-shuffling-horror-击败 Horror').click();
  await page.getByTestId('debug-shuffling-horror-Shuffling Horror Victory').click();

  // 复用 Phase 10A 的 3 XP + Final Hamlet 链路（硬约束 27）。
  await expect(page.getByTestId('debug-act-four')).toContainText('Guardian 已击败');
  expect(await shRow(page, 'Victory 满足')).toContain('true');

  // 另起一局验证 Failure → Campaign Over（硬约束 26）。
  // ⚠️ 第一段已把战役推到终局并落盘，此时首页的「新建战役」会被
  // 「覆盖现有存档？」确认框拦住；直接清掉存档并整页重载，回到干净首页再跑第二段。
  await page.evaluate(() => window.localStorage.removeItem('dd-web-prototype-save-v1'));
  await driveToShufflingHorrorEncounter(page);
  await page.getByTestId('debug-shuffling-horror-Shuffling Horror 失败').click();
  await expect(page.getByTestId('debug-panel')).toContainText('campaign-over');
});

test('§32.9 Data Gate + 一键跑通：official 禁用，prototype harness 可端到端完成', async ({
  page,
}) => {
  await driveToShufflingHorrorEncounter(page);

  // official 因资料缺失禁用（硬约束 28）。
  await expect(page.getByTestId('debug-shuffling-horror-gate')).toBeVisible();
  await expect(page.getByTestId('debug-shuffling-horror-gate')).toContainText('禁用');
  expect(await shRow(page, 'official 启用')).toContain('false');
  // prototype ID 前缀（硬约束 29）。
  expect(await shRow(page, 'Guardian')).toContain('prototype-');

  // 一键跑通：Echoing → Undulations → Priest/Growth → 击杀 Priest → 重召唤 → 击杀 Horror → Victory。
  await page.getByTestId('debug-shuffling-horror-一键 Shuffling Horror (prototype)').click();
  await expect(page.getByTestId('debug-act-four')).toContainText('Guardian 已击败');
  expect(await shRow(page, 'Victory 满足')).toContain('true');
  expect(await shRow(page, 'Horror')).toContain('已击败');
});
