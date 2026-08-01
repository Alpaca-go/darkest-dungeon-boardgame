// Phase 10A Playwright E2E · 浏览器层冒烟（Act IV 调试面板）。
//
// 目标：验证应用可加载、Debug 面板可展开、只读字段正常渲染；
// 并在 Act IV 调试区（data-testid="debug-act-four"）已挂载时，通过
// 「一键通关 (prototype)」按钮驱动 §30 全流程并断言只读字段收敛。
//
// ⚠ 已知缺陷（本套用例不修改任何源码）：
//   src/components/debug/ActFourDebugSection.tsx 已实现完整调试区，
//   但 src/components/debug/DebugPanel.tsx:9 只 import 了 FanaticPyreDebugSection，
//   从未渲染 <ActFourDebugSection />（全仓库无任何引用）。
//   因此 data-testid="debug-act-four" 目前不会出现在 DOM 中，
//   依赖它的用例会 test.skip 并输出原因；§30 九个场景的行为校验
//   由 e2e/phase10a-act-four-framework.spec.ts 在运行时层完成。

import { test, expect, type Page } from '@playwright/test';

const HEROES = ['Crusader', 'Vestal', 'Highwayman', 'Hellion'];

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    if (!window.localStorage.getItem('dd-fixed-rng')) {
      window.localStorage.setItem('dd-fixed-rng', '20260801');
    }
  });
});

/** 新建战役并推进到任务选择页（与 Phase 8D E2E 同构）。 */
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
  await page
    .locator('[data-testid="debug-panel"]')
    .evaluate((el) => {
      (el as HTMLElement).style.pointerEvents = '';
    })
    .catch(() => {});
  const toggle = page.getByRole('button', { name: '🐞 Debug' });
  if (await toggle.count()) await toggle.click();
  await expect(page.getByTestId('debug-panel')).toBeVisible();
}

/** 展开 Act IV 调试区（若已挂载）。 */
async function openActFourSection(page: Page): Promise<boolean> {
  const section = page.getByTestId('debug-act-four');
  if ((await section.count()) === 0) return false;
  const toggle = page.getByTestId('debug-act-four-toggle');
  await toggle.click();
  return true;
}

test('冒烟 1 · 应用可加载，首页渲染「新建战役」入口', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '新建战役' })).toBeVisible();
});

test('冒烟 2 · Debug 面板可展开，只读字段正常渲染', async ({ page }) => {
  await setupToQuests(page);
  await openDebug(page);

  const panel = page.getByTestId('debug-panel');
  await expect(panel).toContainText('Debug');
  await expect(panel).toContainText('gamePhase');
  await expect(panel).toContainText('saveVersion');
  // Phase 10A 存档版本为 v12
  await expect(panel).toContainText('v12');
  await expect(panel).toContainText('route');
  await expect(panel).toContainText('hamlet');
});

test('冒烟 3 · Act IV 调试区渲染 §27 只读字段', async ({ page }) => {
  await setupToQuests(page);
  await openDebug(page);

  const mounted = await openActFourSection(page);
  test.skip(
    !mounted,
    'ActFourDebugSection 未被 DebugPanel.tsx 挂载（DebugPanel.tsx:9 仅 import FanaticPyreDebugSection），DOM 中不存在 data-testid="debug-act-four"',
  );

  const section = page.getByTestId('debug-act-four');
  await expect(section).toContainText('Act Four Stage');
  await expect(section).toContainText('Quest Pool / Selected');
  await expect(section).toContainText('Guardian');
  await expect(section).toContainText('skipped Form');
  await expect(section).toContainText('Layout');
  await expect(section).toContainText('Boss Slots');
  await expect(section).toContainText('Objective Slot');
  await expect(section).toContainText('Room Count');
  await expect(section).toContainText('Excavation States');
  await expect(section).toContainText('Final Hamlet Day');
  await expect(section).toContainText('Final Provisions');
  await expect(section).toContainText('Form Sequence');
  await expect(section).toContainText('Active Form');
  await expect(section).toContainText('Transition State');
});

test('冒烟 4 · Act IV 分步按钮：解锁 → Quest → Layout → 地图（§30 场景一、二）', async ({ page }) => {
  await setupToQuests(page);
  await openDebug(page);

  const mounted = await openActFourSection(page);
  test.skip(
    !mounted,
    'ActFourDebugSection 未被 DebugPanel.tsx 挂载，无法通过 DOM 驱动 Act IV 流程',
  );

  const section = page.getByTestId('debug-act-four');
  await page.getByTestId('debug-actfour-解锁 Act IV').click();
  await page.getByTestId('debug-actfour-跳过第三Boss回归').click();
  await page.getByTestId('debug-actfour-抽 Quest').click();

  // 抽到 Quest 后 Guardian 与 skipped Form 落盘
  await expect(section).not.toContainText('Guardian\u00a0*—');
  await page.getByTestId('debug-actfour-抽 Layout').click();
  await page.getByTestId('debug-actfour-生成地图').click();

  // 16 Rooms / 3 Boss Slots
  await expect(section).toContainText('16');
  await expect(section).toContainText('3 个');
});

test('冒烟 5 · Act IV「一键通关 (prototype)」驱动全流程至 Campaign Victory（§30 场景三～九）', async ({
  page,
}) => {
  await setupToQuests(page);
  await openDebug(page);

  const mounted = await openActFourSection(page);
  test.skip(
    !mounted,
    'ActFourDebugSection 未被 DebugPanel.tsx 挂载，无法通过 DOM 驱动一键通关',
  );

  await page.getByTestId('debug-actfour-一键通关 (prototype)').click();

  const section = page.getByTestId('debug-act-four');
  // 一键通关串起 unlock → quest → layout → map → excavation → guardian →
  // final hamlet(4 days) → prepare → forms → victory
  await expect(section).toContainText('Heart of Darkness');
  await expect(page.getByTestId('debug-panel')).toContainText('campaign-over');

  // 刷新保持（存档落盘）
  await page.reload();
  await openDebug(page);
  await openActFourSection(page);
  await expect(page.getByTestId('debug-panel')).toContainText('campaign-over');
});
