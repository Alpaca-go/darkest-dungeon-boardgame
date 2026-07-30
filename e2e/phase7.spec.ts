import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 7 E2E（7 场景 + 1 回归）：
 * 1. (A) 压力达上限触发 Resolve Test 浮层（调试面板统一加压 + 调试控件可用性）
 * 2. (B) 已 Resolve 英雄压力再次达上限 → 心脏病发作死亡
 * 3. (C) 任务结束将 Resolve 状态转化为占位 Quirk（Hamlet 卡显示 Phase 8 提示）
 * 4. (D) 旧 v3 存档可迁移到 v4（精神字段补齐，不损坏、不白屏）
 * 5. (E) 战斗中已 Resolve 英雄的「回合开始」精神效果触发（战斗日志 / 浮层）
 * 6. (F) Hamlet 显示压力并可通过统一管线恢复（含 Resolve 标记）
 * 7. (G) 回归：Resolve 浮层确认后刷新不再重复弹出（幂等，不重掷）
 *
 * 所有场景注入固定随机种子（localStorage['dd-fixed-rng']）保证确定性。
 * Debug 面板仅在 DEV 渲染（Playwright 走 `npm run dev`），因此调试加压可用。
 */

const HEROES = ['Crusader', 'Vestal', 'Highwayman', 'Hellion'];

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    if (!window.localStorage.getItem('dd-fixed-rng')) {
      window.localStorage.setItem('dd-fixed-rng', '20260729');
    }
  });
});

/** 新建战役并推进到任务选择页。 */
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

/** 选择任务进入地牢。 */
async function chooseQuest(page: Page, questName: string) {
  await page.getByText(questName, { exact: true }).click();
  await expect(page).toHaveURL(/\/dungeon$/);
}

/** 展开 Debug 面板（如果处于收起态）。 */
async function openDebug(page: Page) {
  const toggle = page.getByRole('button', { name: '🐞 Debug' });
  if (await toggle.count()) await toggle.click();
  await expect(page.getByTestId('debug-panel')).toBeVisible();
}

/** 反复用调试 +2 把首位英雄压力推到阈值，直到 Resolve/Heart Attack 浮层出现。 */
async function addStressUntilOverlay(page: Page) {
  for (let i = 0; i < 8; i += 1) {
    if (await page.getByTestId('mental-event-overlay').count()) return;
    const btn = page.locator('[data-testid^="debug-stress-add-"]').first();
    if (await btn.count()) await btn.click();
    await page.waitForTimeout(80);
  }
  throw new Error('8 次调试加压仍未出现精神浮层（种子随机下不应发生）');
}

/** 读取调试面板中第一位英雄的当前压力（首次出现的 X/10）。 */
async function firstHeroStress(page: Page): Promise<number> {
  const txt = await page.getByTestId('debug-panel').innerText();
  const m = txt.match(/(\d+)\/10/);
  return m ? Number(m[1]) : -1;
}

/** 探索直到进入战斗节点（仅在进入战斗或目标完成时返回）。 */
async function exploreToBattle(page: Page) {
  for (let step = 0; step < 40; step += 1) {
    if (page.url().endsWith('/battle')) return;
    if (await page.getByText('✓ 任务目标已完成').count()) return;
    const fresh = page
      .locator('button.absolute:not([disabled])')
      .filter({ hasText: /\?|已揭示/ });
    const any = page.locator('button.absolute:not([disabled])');
    const target = (await fresh.count()) ? fresh.first() : any.first();
    if (!(await target.count())) break;
    await target.click();
    await page.waitForTimeout(300);
  }
}

/**
 * 推进战斗：依次尝试技能（优先攻击怪物侧合法目标）→ 否则结束回合。
 * 同时侦测精神效果：出现「回合开始检定」战斗日志或精神浮层即返回对应标记，
 * 否则在胜利/失败/超时后返回相应标记。
 */
async function driveBattleWatchMental(page: Page): Promise<string> {
  for (let step = 0; step < 150; step += 1) {
    if (await page.getByText('回合开始检定').count()) return 'log';
    if (await page.getByTestId('mental-event-overlay').count()) return 'overlay';
    if (await page.getByTestId('victory-panel').count()) return 'victory';
    if (await page.getByTestId('defeat-panel').count()) return 'defeat';

    const endTurn = page.getByTestId('end-turn');
    if (!(await endTurn.count())) {
      await page.waitForTimeout(100);
      continue;
    }

    const skills = page.locator('[data-testid^="skill-"]:not([disabled])');
    const n = await skills.count();
    let acted = false;
    for (let i = 0; i < n && !acted; i += 1) {
      await skills.nth(i).click();
      const monsterTargets = page.locator(
        '[data-testid="monster-side"] button[class*="border-emerald-400"]',
      );
      const anyTargets = page.locator('button[class*="border-emerald-400"]');
      if (await monsterTargets.count()) {
        await monsterTargets.first().click();
        acted = true;
      } else if (await anyTargets.count()) {
        await anyTargets.first().click();
        acted = true;
      }
    }
    if (!acted) {
      if (await page.getByText('回合开始检定').count()) return 'log';
      if (await page.getByTestId('victory-panel').count()) return 'victory';
      if (await page.getByTestId('defeat-panel').count()) return 'defeat';
      await endTurn.click();
    }
    await page.waitForTimeout(60);
  }
  return 'timeout';
}

// ---------------------------------------------------------------------------

test('A. 压力达上限触发 Resolve Test 浮层（调试面板统一加压 + 调试控件）', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  await openDebug(page);

  // 反复用调试 +2 把首位英雄压力推到 10 → Resolve Test 浮层
  await addStressUntilOverlay(page);
  await expect(page.getByTestId('mental-event-overlay')).toBeVisible();
  await expect(page.getByTestId('mental-overlay-title')).toContainText(/美德觉醒|精神崩溃/);

  // 确认后浮层消失，英雄压力归零且获得 Virtue/Affliction 标记（调试面板显示 ✦/☠）
  await page.getByTestId('mental-overlay-confirm').click();
  await expect(page.getByTestId('mental-event-overlay')).toHaveCount(0);
  await expect(page.getByTestId('debug-panel')).toContainText(/✦|☠/);

  // 调试 -2 控件存在且可用（加压为统一管线，不会误触发阈值）
  const firstSub = page.locator('[data-testid^="debug-stress-sub-"]').first();
  await expect(firstSub).toBeEnabled();
});

test('B. 已 Resolve 英雄压力再次达上限 → 心脏病发作死亡', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  await openDebug(page);

  // 第一次到 10 → Resolve（压力归零、resolveTestedThisQuest=true）
  await addStressUntilOverlay(page);
  await page.getByTestId('mental-overlay-confirm').click();

  // 再加压到 10 → 已 Resolve 过 → 心脏病发作
  await addStressUntilOverlay(page);
  await expect(page.getByTestId('mental-overlay-title')).toContainText('心脏病');
  await page.getByTestId('mental-overlay-confirm').click();

  // 英雄死亡（调试面板首位显示「死亡」）
  await expect(page.getByTestId('debug-panel')).toContainText('死亡');
});

test('C. 任务结束将 Resolve 状态转化为占位 Quirk（Hamlet 卡显示 Phase 8 提示）', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  await openDebug(page);

  // 让首位英雄 Resolve
  await addStressUntilOverlay(page);
  await page.getByTestId('mental-overlay-confirm').click();

  // 离开地牢 → 结算 → Hamlet
  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('leave-dungeon').click();
  await expect(page).toHaveURL(/\/result$/);
  await page.getByTestId('return-hamlet').click();
  await expect(page).toHaveURL(/\/hamlet$/);

  // Hamlet 英雄卡应出现占位 Quirk 卡（Phase 8 提示）
  await expect(page.getByTitle(/Phase 8/).first()).toBeVisible();
});

test('D. 旧 v3 存档可迁移到 v4（精神字段补齐，不损坏、不白屏）', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  // 强制保存一份真实 v4 存档
  await openDebug(page);
  await page.getByRole('button', { name: '强制保存' }).click();

  // 把存档降级为 v3 并剥离 Phase 7 字段，模拟旧档
  await page.evaluate(() => {
    const raw = window.localStorage.getItem('dd-web-prototype-save-v1');
    if (!raw) return;
    const data = JSON.parse(raw);
    data.version = 3;
    const c = data.campaign;
    if (c?.heroes) {
      for (const h of c.heroes) {
        delete h.resolveTestedThisQuest;
        delete h.resolveState;
        delete h.virtueId;
        delete h.afflictionId;
        delete h.heartAttackCount;
        delete h.positiveQuirkIds;
        delete h.negativeQuirkIds;
        delete h.lastResolveQuestId;
        delete h.lastMentalEventId;
      }
    }
    delete c.mentalEvents;
    delete c.resolveConversionRecords;
    delete c.processedStressBatchIds;
    window.localStorage.setItem('dd-web-prototype-save-v1', JSON.stringify(data));
  });

  await page.reload();
  // 不白屏、不显示损坏提示（若迁移失败，v3 残档会被判为损坏并白屏）
  await expect(page.getByTestId('save-broken')).toHaveCount(0);
  // 恢复到任务/地牢页（gamePhase 驱动的路由恢复）
  await expect(page).toHaveURL(/\/(dungeon|quests)$/);

  // 重新打开调试面板并把迁移后的 Campaign 回写存档，验证其已升级为合法 v4
  await openDebug(page);
  await page.getByRole('button', { name: '强制保存' }).click();

  const after = await page.evaluate(() => {
    const raw = window.localStorage.getItem('dd-web-prototype-save-v1');
    if (!raw) return { version: null, resolveState: null };
    const d = JSON.parse(raw);
    return { version: d.version, resolveState: d?.campaign?.heroes?.[0]?.resolveState };
  });
  // 关键证据：迁移后的存档已是 v4，且英雄补全了 resolveState 字段
  expect(after.version).toBe(4);
  expect(after.resolveState).toBe('normal');
});

test('E. 战斗中已 Resolve 英雄的「回合开始」精神效果触发', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  await openDebug(page);

  // 先让首位英雄（前排）Resolve
  await addStressUntilOverlay(page);
  await page.getByTestId('mental-overlay-confirm').click();

  // 探索进入战斗
  await exploreToBattle(page);
  await expect(page).toHaveURL(/\/battle$/);

  // 推进战斗，等待回合开始精神检定（日志出现 回合开始检定，或弹出精神浮层）
  const kind = await driveBattleWatchMental(page);
  expect(kind).toMatch(/log|overlay/);
});

test('F. Hamlet 显示压力并可通过统一管线恢复（含 Resolve 标记）', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  await openDebug(page);
  await addStressUntilOverlay(page);
  await page.getByTestId('mental-overlay-confirm').click();

  page.once('dialog', (d) => void d.accept());
  await page.getByTestId('leave-dungeon').click();
  await expect(page).toHaveURL(/\/result$/);
  await page.getByTestId('return-hamlet').click();
  await expect(page).toHaveURL(/\/hamlet$/);

  // Hamlet 英雄卡显示压力
  const heroCard = page.locator('[data-testid^="hamlet-hero-"]').first();
  await expect(heroCard).toBeVisible();
  await expect(heroCard).toContainText('Stress');

  // 通过统一管线加压 / 减压：相对变化校验（英雄进入 Hamlet 带有弃任务惩罚压力，绝对值未知）
  await openDebug(page);
  const add = page.locator('[data-testid^="debug-stress-add-"]').first();
  const sub = page.locator('[data-testid^="debug-stress-sub-"]').first();

  const base = await firstHeroStress(page);
  expect(base).toBeGreaterThanOrEqual(0);
  await add.click();
  const afterAdd = await firstHeroStress(page);
  expect(afterAdd).toBeGreaterThan(base); // 加压走统一管线，压力上升
  await sub.click();
  const afterSub = await firstHeroStress(page);
  expect(afterSub).toBe(base); // 减压精确回到基线（不会误触阈值）
});

test('G. 回归：Resolve 浮层确认后刷新不再重复弹出（幂等、不重掷）', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  await openDebug(page);

  await addStressUntilOverlay(page);
  await expect(page.getByTestId('mental-event-overlay')).toBeVisible();
  await page.getByTestId('mental-overlay-confirm').click();
  await expect(page.getByTestId('mental-event-overlay')).toHaveCount(0);

  // 刷新：挂载时把「已确认」水位初始化为最新序号，历史事件不再弹出
  await page.reload();
  await expect(page).toHaveURL(/\/dungeon$/);
  await expect(page.getByTestId('mental-event-overlay')).toHaveCount(0);
});
