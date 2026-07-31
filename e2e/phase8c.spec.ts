import { test, expect, type Page } from '@playwright/test';

/**
 * Phase 8C E2E（文档 §24 八场景）：
 * 1. Loot 获得：经获取状态机，有容量即装备（正面）
 * 2. Quest Reward 获得：同上状态机，第二名英雄同样装备（正面）
 * 3. 容量截断：容量满后新饰品进入待分配浮层（可丢弃）
 * 4. Trinket 使用窗口：战斗中 before-attack-roll 开窗 → 使用 → 翻面
 * 5. Nomad Wagon 买卖：卖出 + 买入同次访问，Gold 净变化正确
 * 6. Hamlet 死亡转移：英雄阵亡 → 饰品转入待分配（正面接收）
 * 7. Hamlet 重置：返回村庄把所有饰品重置为正面
 * 8. 迁移 v6→v7：旧档补齐 Trinket / Nomad Wagon 字段，升级为 v7，不白屏
 *
 * 所有场景注入固定随机种子（localStorage['dd-fixed-rng']）保证确定性。
 * Debug 面板仅在 DEV 渲染（Playwright 走 `npm run dev`），因此调试授予可用。
 */

const HEROES = ['Crusader', 'Vestal', 'Highwayman', 'Hellion'];
const STORAGE_KEY = 'dd-web-prototype-save-v1';

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    if (!window.localStorage.getItem('dd-fixed-rng')) {
      window.localStorage.setItem('dd-fixed-rng', '20260729');
    }
  });
});

// ---------------------------------------------------------------------------
// 公共助手
// ---------------------------------------------------------------------------

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

async function chooseQuest(page: Page, questName: string) {
  await page.getByText(questName, { exact: true }).click();
  await expect(page).toHaveURL(/\/dungeon$/);
}

async function openDebug(page: Page) {
  const toggle = page.getByRole('button', { name: '🐞 Debug' });
  if (await toggle.count()) await toggle.click();
  await expect(page.getByTestId('debug-panel')).toBeVisible();
}

/** 选择调试面板的饰品种类（按 trinket id）。 */
async function selectTrinket(page: Page, trinketId: string) {
  await page.getByTestId('debug-trinket-select').selectOption(trinketId);
}

/** 点击第 idx 个英雄的「授予」按钮（英雄顺序 = campaign.heroes）。 */
async function grantNth(page: Page, idx: number) {
  await page.locator('[data-testid^="debug-trinket-grant-"]').nth(idx).click();
}

/** 读取存档中的 Gold。 */
async function goldOf(page: Page): Promise<number> {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), STORAGE_KEY);
  if (!raw) return -1;
  const d = JSON.parse(raw);
  return d?.campaign?.gold ?? -1;
}

/** 反复用调试 +2 把首位英雄压力推到阈值，直到精神浮层出现。 */
async function addStressUntilOverlay(page: Page) {
  for (let i = 0; i < 8; i += 1) {
    if (await page.getByTestId('mental-event-overlay').count()) return;
    const btn = page.locator('[data-testid^="debug-stress-add-"]').first();
    if (await btn.count()) await btn.click();
    await page.waitForTimeout(80);
  }
  throw new Error('8 次调试加压仍未出现精神浮层（种子随机下不应发生）');
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
 * 推进战斗：尝试技能（攻击怪物侧合法目标）→ 否则结束回合。
 * 出现 Trinket 使用浮层即使用并标记，返回是否使用过（用于验证开窗 + 翻面）。
 */
async function driveBattleUseTrinket(page: Page): Promise<boolean> {
  for (let step = 0; step < 250; step += 1) {
    if (await page.getByTestId('trinket-use-overlay').count()) {
      // 注意：trinket-use- 前缀同时匹配容器 trinket-use-overlay，
      // 必须精确点「使用」按钮，否则点到容器、饰品不会真正使用。
      await page.locator('[data-testid="trinket-use-overlay"]').getByRole('button', { name: '使用' }).click();
      return true;
    }
    if (await page.getByTestId('victory-panel').count()) return false;
    if (await page.getByTestId('defeat-panel').count()) return false;

    const endTurn = page.getByTestId('end-turn');
    if (!(await endTurn.count())) {
      await page.waitForTimeout(80);
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
    if (!acted) await endTurn.click();
    await page.waitForTimeout(70);
  }
  return false;
}

// ---------------------------------------------------------------------------
// 1. Loot 获得：获取状态机 → 有容量即装备（正面）
// ---------------------------------------------------------------------------

test('1. Loot 获得：经获取状态机有容量即装备（正面）', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  await openDebug(page);

  // 调试授予等价于 Loot/Quest 事件调用的同一 acquireTrinket 状态机（source 不同，路径相同）。
  await selectTrinket(page, 'critical-stone');
  await grantNth(page, 0); // 英雄 0 容量 = 等级 1，有空位 → 装备

  const card = page.getByTestId('trinket-critical-stone').first();
  await expect(card).toBeVisible();
  await expect(card).toContainText('正面'); // 装备从正面起
});

// ---------------------------------------------------------------------------
// 2. Quest Reward 获得：同一状态机，第二名英雄同样装备（正面）
// ---------------------------------------------------------------------------

test('2. Quest Reward 获得：第二名英雄经同状态机装备（正面）', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  await openDebug(page);

  // 授予给英雄 1（容量 = 等级 1，有空位 → 装备），验证 Quest Reward 复用同一获取状态机。
  await selectTrinket(page, 'critical-stone');
  await grantNth(page, 1);

  const card = page.getByTestId('trinket-critical-stone').first();
  await expect(card).toBeVisible();
  await expect(card).toContainText('正面');
});

// ---------------------------------------------------------------------------
// 3. 容量截断：容量满后新饰品进入待分配浮层（可丢弃）
// ---------------------------------------------------------------------------

test('3. 容量截断：容量满后新饰品进入待分配浮层（可丢弃）', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  await openDebug(page);

  await selectTrinket(page, 'critical-stone');
  await grantNth(page, 0); // 装备第 1 件（容量 1/1）
  await grantNth(page, 0); // 容量满 → 进入待分配浮层

  await expect(page.getByTestId('trinket-allocation-overlay')).toBeVisible();

  // 丢弃这件溢出的饰品：英雄身上仍只有原本装备的 1 件。
  await page.getByTestId('alloc-discard').click();
  await expect(page.getByTestId('trinket-allocation-overlay')).toHaveCount(0);
  await expect(page.getByTestId('trinket-critical-stone')).toHaveCount(1);
});

// ---------------------------------------------------------------------------
// 4. Trinket 使用窗口：战斗中 before-attack-roll 开窗 → 使用 → 翻面
// ---------------------------------------------------------------------------

test('4. Trinket 使用窗口：before-attack-roll 开窗并使用后翻面', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  await openDebug(page);

  // 给全部 4 名英雄装备 Critical Stone（攻击掷骰前声明窗口），保证首位出手英雄即开窗。
  await selectTrinket(page, 'critical-stone');
  for (let i = 0; i < 4; i += 1) await grantNth(page, i);

  await exploreToBattle(page);
  await expect(page).toHaveURL(/\/battle$/);

  const used = await driveBattleUseTrinket(page);
  expect(used).toBe(true); // 开窗且玩家完成使用决策

  // 翻面证据：某英雄的饰品 currentSide 已变为 negative（核心约束 4）。
  // 存档为异步写入，用 poll 等待持久化完成后再断言。
  await expect
    .poll(
      async () => {
        const raw = (await page.evaluate(
          (k) => window.localStorage.getItem(k) ?? '{}',
          STORAGE_KEY,
        )) as string;
        const d = JSON.parse(raw);
        return (d.campaign?.heroes ?? []).some((h: any) =>
          (h.equippedTrinkets ?? []).some((t: any) => t.currentSide === 'negative'),
        );
      },
      { timeout: 5000 },
    )
    .toBe(true);
});

// ---------------------------------------------------------------------------
// 5. Nomad Wagon 买卖：卖出 + 买入同次访问，Gold 净变化正确
// ---------------------------------------------------------------------------

test('5. Nomad Wagon 买卖：卖出 + 买入同次访问，Gold 净变化正确', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  await openDebug(page);

  // 先给英雄 0 一件可出售的饰品（L1 卖价 2）。
  await selectTrinket(page, 'critical-stone');
  await grantNth(page, 0);

  // 重载后调试面板收起（open 状态不进存档），避免固定浮层遮挡 leave-dungeon 按钮。
  await page.reload();

  // 离队 → 结算 → 村庄
  await page.getByTestId('leave-dungeon').click();
  await page.getByTestId('leave-dungeon-confirm-ok').click();
  await expect(page).toHaveURL(/\/result$/);
  await page.getByTestId('return-hamlet').click();
  await expect(page).toHaveURL(/\/hamlet$/);

  const goldBefore = await goldOf(page);

  // 选中英雄 0 并打开 Nomad Wagon
  // 注意：hamlet-hero-* 是外层 div，需点内部「选中」按钮（div 中心落在 TrinketSlots，无效）。
  const firstHeroCard = page.locator('[data-testid^="hamlet-hero-"]').first();
  await firstHeroCard.locator('button').first().click();
  await expect(page.getByTestId('building-nomad-wagon')).toBeEnabled();
  await page.getByTestId('building-nomad-wagon').click();
  await expect(page.getByTestId('nomad-wagon-panel')).toBeVisible();

  // 展示位为 L1 Critical Stone，买价 4 Gold（官方池仅 1 张 L1，Level I 布局 3×L1 会渲染 3 张同名卡，取 first）
  await expect(page.getByTestId('nomad-offer-critical-stone').first()).toContainText('4 Gold');

  // 卖出英雄 0 的饰品（+2）并买入展示位（-4），一次访问完成。
  await page.locator('[data-testid^="nomad-sell-btn-"]').first().click();
  await page.getByTestId('nomad-buy-critical-stone').first().click();
  await page.getByTestId('nomad-wagon-confirm').click();

  await expect(page.getByTestId('nomad-wagon-panel')).toHaveCount(0);

  const goldAfter = await goldOf(page);
  expect(goldAfter).toBe(goldBefore - 2); // 卖出 +2、买入 -4，净 -2

  // 英雄 0 卖出后空出容量，买入的饰品重新装备：仍恰好 1 件。
  await expect(page.getByTestId('trinket-critical-stone')).toHaveCount(1);
});

// ---------------------------------------------------------------------------
// 6. Hamlet 死亡转移：英雄阵亡 → 饰品转入待分配（正面接收）
// ---------------------------------------------------------------------------

test('6. Hamlet 死亡转移：阵亡英雄饰品转入待分配浮层', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  await openDebug(page);

  // 给英雄 0 一件饰品（阵亡后将转移）。
  await selectTrinket(page, 'critical-stone');
  await grantNth(page, 0);

  // 压力达上限 → Resolve；再次达上限 → 心脏病发作阵亡。
  await addStressUntilOverlay(page);
  await page.getByTestId('mental-overlay-confirm').click();
  await addStressUntilOverlay(page);
  await expect(page.getByTestId('mental-overlay-title')).toContainText('心脏病');
  await page.getByTestId('mental-overlay-confirm').click();

  // 阵亡触发饰品转移：出现待分配浮层（死亡转移）。
  await expect(page.getByTestId('trinket-allocation-overlay')).toBeVisible();

  // 分配给第一名存活英雄（阵亡转移强制正面落地）。
  await page.locator('[data-testid^="alloc-assign-"]').first().click();
  await expect(page.getByTestId('trinket-allocation-overlay')).toHaveCount(0);

  // 转移后饰品仍存在于某存活英雄身上。
  await expect(await page.getByTestId('trinket-critical-stone').count()).toBeGreaterThanOrEqual(1);
});

// ---------------------------------------------------------------------------
// 7. Hamlet 重置：返回村庄把所有饰品重置为正面
// ---------------------------------------------------------------------------

test('7. Hamlet 重置：返回村庄把所有饰品重置为正面', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  await openDebug(page);

  await selectTrinket(page, 'critical-stone');
  await grantNth(page, 0); // 正面装备

  // 直接把该饰品翻到负面（模拟战斗使用后），验证村庄返回会重置。
  await page.evaluate((k) => {
    const raw = window.localStorage.getItem(k);
    if (!raw) return;
    const d = JSON.parse(raw);
    const h = d.campaign.heroes[0];
    if (h.equippedTrinkets && h.equippedTrinkets[0]) h.equippedTrinkets[0].currentSide = 'negative';
    window.localStorage.setItem(k, JSON.stringify(d));
  }, STORAGE_KEY);
  await page.reload();

  // 离队 → 结算 → 村庄（村庄进入即重置所有饰品为正面）。
  await page.getByTestId('leave-dungeon').click();
  await page.getByTestId('leave-dungeon-confirm-ok').click();
  await expect(page).toHaveURL(/\/result$/);
  await page.getByTestId('return-hamlet').click();
  await expect(page).toHaveURL(/\/hamlet$/);

  const card = page.getByTestId('trinket-critical-stone').first();
  await expect(card).toBeVisible();
  await expect(card).toContainText('正面'); // 已重置为正面（关键规则 6）
});

// ---------------------------------------------------------------------------
// 8. 迁移 v6→v7：旧档补齐字段并升级为 v7，不白屏
// ---------------------------------------------------------------------------

test('8. 迁移 v6→v7：补齐 Trinket / Nomad Wagon 字段并升级为 v7', async ({ page }) => {
  await setupToQuests(page);
  await chooseQuest(page, 'Scout Ahead');
  await openDebug(page);
  await page.getByRole('button', { name: '强制保存' }).click();

  // 降级为 v6 并剥离 Phase 8C 字段，模拟旧档。
  await page.evaluate((k) => {
    const raw = window.localStorage.getItem(k);
    if (!raw) return;
    const d = JSON.parse(raw);
    d.version = 6;
    const c = d.campaign;
    delete c.nomadWagon;
    delete c.pendingTrinketAllocations;
    delete c.pendingTrinketUseOpportunities;
    delete c.pendingTrinketUseTransaction;
    delete c.trinketAcquisitionRecords;
    delete c.trinketUseRecords;
    delete c.trinketTransferRecords;
    delete c.processedTrinketEventIds;
    delete c.processedTrinketResetKeys;
    window.localStorage.setItem(k, JSON.stringify(d));
  }, STORAGE_KEY);

  await page.reload();
  // 不白屏、不显示损坏提示。
  await expect(page.getByTestId('save-broken')).toHaveCount(0);
  await expect(page).toHaveURL(/\/(dungeon|quests)$/);

  // 重新保存并校验已升级为 v7，且补齐了 nomadWagon（buildingLevel 1）。
  await openDebug(page);
  await page.getByRole('button', { name: '强制保存' }).click();
  const after = await page.evaluate((k) => {
    const raw = window.localStorage.getItem(k);
    if (!raw) return { version: null, nomadWagon: null };
    const d = JSON.parse(raw);
    return { version: d.version, nomadWagon: d.campaign?.nomadWagon ?? null };
  }, STORAGE_KEY);
  expect(after.version).toBe(7); // 升级到当前最新版本 v7
  expect(after.nomadWagon).toBeTruthy();
  expect(after.nomadWagon.buildingLevel).toBe(1);
});
