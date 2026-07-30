import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 5 E2E（5 场景）：
 * 1. 完整成功闭环：新建战役 → 选人 → 技能 → 任务 → 地牢 → 战斗 → 结算 → Hamlet → 下一任务
 * 2. 刷新恢复：dungeon / battle / result / hamlet 各节点刷新后状态与路由恢复
 * 3. 任务未完成闭环：直接离开地牢 → incomplete 结算 → Hamlet
 * 4. 战斗奖励防重复：领奖后刷新不重复发放
 * 5. 损坏存档：不白屏，显示损坏提示并可删除重开
 *
 * 所有场景注入固定随机种子（localStorage['dd-fixed-rng']）保证确定性。
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

/** 打完一场战斗直到胜利面板出现（怪物回合由引擎自动推进，UI 始终停在英雄回合）。 */
async function fightUntilVictory(page: Page) {
  await expect(page).toHaveURL(/\/battle$/);
  for (let step = 0; step < 150; step += 1) {
    if (await page.getByTestId('victory-panel').count()) return;
    if (await page.getByTestId('defeat-panel').count()) {
      throw new Error('战斗失败（种子随机下不应发生）');
    }

    const endTurn = page.getByTestId('end-turn');
    if (!(await endTurn.count())) {
      await page.waitForTimeout(100);
      continue;
    }

    // 依次尝试每个可用技能：优先攻击怪物侧合法目标，其次任意合法目标（治疗/增益）。
    const skills = page.locator('[data-testid^="skill-"]:not([disabled])');
    const n = await skills.count();
    let acted = false;
    for (let i = 0; i < n && !acted; i += 1) {
      await skills.nth(i).click();
      const monsterTargets = page.locator(
        '[data-testid="monster-side"] button[class*="border-emerald-400"]'
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
      // 没有任何合法目标（如目标全灭待结算 / 技能位置不符）：结束回合。
      if (await page.getByTestId('victory-panel').count()) return;
      await endTurn.click();
    }
  }
  await expect(page.getByTestId('victory-panel')).toBeVisible();
}

/** 在地牢中探索直到任务目标完成（进入战斗则打赢返回）。 */
async function exploreUntilObjective(page: Page) {
  for (let step = 0; step < 40; step += 1) {
    if (page.url().endsWith('/battle')) {
      await fightUntilVictory(page);
      await page.getByRole('button', { name: '领取奖励并返回地牢' }).click();
      await expect(page).toHaveURL(/\/dungeon$/);
      continue;
    }
    if (await page.getByText('✓ 任务目标已完成').count()) return;

    // 优先进入未访问过的相邻房间（? / 已揭示），否则任意可点房间。
    const fresh = page.locator(
      'button.absolute:not([disabled])',
    ).filter({ hasText: /\?|已揭示/ });
    const any = page.locator('button.absolute:not([disabled])');
    const target = (await fresh.count()) ? fresh.first() : any.first();
    await target.click();
    // 移动可能触发战斗跳转，稍等路由稳定。
    await page.waitForTimeout(300);
  }
  throw new Error('40 步内未完成任务目标');
}

/** Hamlet：所有英雄跳过 → 结束当天，直到回到任务选择页。 */
async function finishHamlet(page: Page) {
  await expect(page).toHaveURL(/\/hamlet$/);
  for (let day = 0; day < 5; day += 1) {
    // 跳过所有还能行动的英雄
    for (let i = 0; i < 6; i += 1) {
      const skip = page.locator('[data-testid^="skip-"]:not([disabled])');
      if (!(await skip.count())) break;
      await skip.first().click();
    }
    await page.getByTestId('end-day').click();
    await page.waitForTimeout(300);
    if (page.url().endsWith('/quests')) return;
  }
  await expect(page).toHaveURL(/\/quests$/);
}

// ---------------------------------------------------------------------------

test('1. 完整成功闭环：新建 → 战斗胜利 → 结算 completed → Hamlet → 下一任务', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');

  await exploreUntilObjective(page);

  // 离开地牢（确认对话框）→ 任务结算
  await page.getByTestId('leave-dungeon').click();
  await page.getByTestId('leave-dungeon-confirm-ok').click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByTestId('quest-summary')).toContainText('任务完成');

  // 返回 Hamlet 并度过准备阶段
  await page.getByTestId('return-hamlet').click();
  await expect(page.getByTestId('hamlet-event')).toBeVisible();
  await finishHamlet(page);

  // 第二个任务可以正常开始（状态不污染）
  await chooseQuest(page, 'Recover the Relic');
  await expect(page.getByRole('heading', { name: '地牢探索' })).toBeVisible();
});

test('2. 刷新恢复：dungeon / battle / result / hamlet 节点刷新后路由与状态恢复', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');

  // --- dungeon 节点刷新 ---
  await page.reload();
  await expect(page).toHaveURL(/\/dungeon$/);
  await expect(page.getByRole('heading', { name: '地牢探索' })).toBeVisible();

  // --- battle 节点刷新 ---
  await exploreUntilBattleOrObjective(page);
  if (page.url().endsWith('/battle')) {
    await page.reload();
    await expect(page).toHaveURL(/\/battle$/);
    await expect(page.getByTestId('hero-side')).toBeVisible();
    await fightUntilVictory(page);
    await page.getByRole('button', { name: '领取奖励并返回地牢' }).click();
  }

  // --- result 节点刷新 ---
  await page.getByTestId('leave-dungeon').click();
  await page.getByTestId('leave-dungeon-confirm-ok').click();
  await expect(page).toHaveURL(/\/result$/);
  await page.reload();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByTestId('quest-summary')).toBeVisible();

  // --- hamlet 节点刷新 ---
  await page.getByTestId('return-hamlet').click();
  await expect(page).toHaveURL(/\/hamlet$/);
  await page.reload();
  await expect(page).toHaveURL(/\/hamlet$/);
  await expect(page.getByTestId('hamlet-event')).toBeVisible();

  // 直接访问首页时按 gamePhase 自动恢复路由（不停留在首页）
  await page.goto('/');
  await expect(page).toHaveURL(/\/hamlet$/);
  await expect(page.getByTestId('hamlet-event')).toBeVisible();
});

/** 探索直到进入战斗或目标完成（场景 2 专用：只需要到达 battle 节点）。 */
async function exploreUntilBattleOrObjective(page: Page) {
  for (let step = 0; step < 40; step += 1) {
    if (page.url().endsWith('/battle')) return;
    if (await page.getByText('✓ 任务目标已完成').count()) return;
    const fresh = page
      .locator('button.absolute:not([disabled])')
      .filter({ hasText: /\?|已揭示/ });
    const any = page.locator('button.absolute:not([disabled])');
    const target = (await fresh.count()) ? fresh.first() : any.first();
    await target.click();
    await page.waitForTimeout(300);
  }
}

test('3. 任务未完成：直接离开地牢 → incomplete 结算 → Hamlet 正常进行', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');

  await page.getByTestId('leave-dungeon').click();
  await page.getByTestId('leave-dungeon-confirm-ok').click();
  await expect(page).toHaveURL(/\/result$/);
  await expect(page.getByTestId('quest-summary')).toContainText('任务未完成');

  await page.getByTestId('return-hamlet').click();
  await expect(page).toHaveURL(/\/hamlet$/);
  await expect(page.getByTestId('hamlet-event')).toBeVisible();
});

test('4. 战斗奖励防重复：领奖后刷新不重复发放', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');

  // 进入第一场战斗并获胜（先在胜利面板处刷新，确认胜利状态被保存且不自动重复结算）
  await exploreUntilBattleOrObjective(page);
  if (!page.url().endsWith('/battle')) test.skip(true, '种子随机下未遇到战斗');
  await fightUntilVictory(page);

  await page.reload();
  await expect(page.getByTestId('victory-panel')).toBeVisible();

  await page.getByRole('button', { name: '领取奖励并返回地牢' }).click();
  await expect(page).toHaveURL(/\/dungeon$/);
  const goldText = await page.getByText(/Gold/).first().textContent();

  // 刷新后：不回到胜利面板、Gold 不再增加
  await page.reload();
  await expect(page).toHaveURL(/\/dungeon$/);
  expect(await page.getByTestId('victory-panel').count()).toBe(0);
  const goldTextAfter = await page.getByText(/Gold/).first().textContent();
  expect(goldTextAfter).toBe(goldText);
});

test('5. 损坏存档：不白屏，显示明确提示并可删除重开', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    window.localStorage.setItem('dd-web-prototype-save-v1', '{broken json!!!');
  });
  await page.reload();

  // 不白屏：显示损坏提示 UI
  await expect(page.getByTestId('save-broken')).toBeVisible();
  await expect(page.getByText('存档已损坏')).toBeVisible();

  // 删除存档后回到正常首页
  await page.getByRole('button', { name: '删除存档' }).click();
  await expect(page.getByRole('button', { name: '新建战役' })).toBeVisible();
  expect(await page.getByTestId('save-broken').count()).toBe(0);
});
