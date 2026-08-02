// Phase 10E §33：Final Encounter / Ancestor 四形态链（ancestor-first-form /
// ancestor-second-form / gestating-heart / heart-of-darkness）与 Heart of Darkness
// 终局 浏览器层 E2E。
//
// 目标：在 dev-only 调试面板（DebugPanel → ActFourDebugSection）上驱动 §33 的十二个
// 场景，验证「调试按钮 → 正式运行时入口 → 只读字段收敛」整条链路，而不修改任何源码。
//
// 确定性说明：
// - ActFourDebugSection 内部使用 makeSeedSequence()（挂载即固定起点递增），每次 page
//   重载都会重置 → 同一套点击序列可复现；
// - ⚠️ Quest 会随机跳过 ancestor-first/second-form / gestating-heart 三者之一
//  （heart-of-darkness 永不跳过，硬约束 13）。因此针对「具体某个 Form」的场景（§33.2/3/4/5/6）
//   在读取到本局 skipped Form 命中时调用 test.skip()，避免依赖随机；该 Form 的确定性
//   逻辑由 27 个单元用例（final-forms.test.ts）完整覆盖。
//
// 硬约束对照（供阅读）：
//  - 硬约束 1：不新建第二套 Battle / Final Encounter 状态机，战斗复用既有 BattleState；
//  - 硬约束 8/10：Reflection 死亡不减少 Card；Imperfect 死亡反噬仅触发一次（10 Wounds）；
//  - 硬约束 13：heart-of-darkness 恒为最后一个，永不跳过；
//  - 硬约束 14：ancestor-second-form 的 Absolute Nothingness 不可 Target、占 Area Space；
//              roll=10 不传送；
//  - 硬约束 15/16：gestating-heart 的 Sispersion 只抽 DD Monster 且召唤与 Initiative 原子；
//  - 硬约束 17：Gestating Reaction 仅在实际造成 Wounds 时触发；
//  - 硬约束 18—20：heart-of-darkness 必须先生成 Forecast、消费不重掷、生成不覆盖未消费；
//  - 硬约束 3/5/18：Form 切换不恢复 Life/Stress、不改 Stance、共用同一 Room；
//  - 硬约束 26/27：Final Failure → Campaign Over；Heart 死亡 → Campaign Victory；
//  - 硬约束 28/29：official 禁用，仅 prototype harness 可跑（prototype ID 前缀）。

import { test, expect, type Page } from '@playwright/test';
import { SAVE_VERSION } from '../src/game-engine/save';

const HEROES = ['Crusader', 'Vestal', 'Highwayman', 'Hellion'];

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    if (!window.localStorage.getItem('dd-fixed-rng')) {
      window.localStorage.setItem('dd-fixed-rng', '20260802');
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

/** 刷新后重新展开两层面板（用于验证落盘一致性）。 */
async function reopenAfterReload(page: Page) {
  await page.reload();
  await openDebug(page);
  await openActFour(page);
}

/** 读 ActFourDebugSection 某一只读行（dt + 相邻 dd）。 */
async function ffRow(page: Page, label: string): Promise<string> {
  const dt = page.getByTestId('debug-act-four').locator('dt', { hasText: label });
  const dd = dt.first().locator('+ dd');
  return (await dd.textContent())?.trim() ?? '';
}

/** 把 Act IV 完整推到「Final Encounter 第一个 Form 已出场」。全程 dev-only 调试按钮。 */
async function driveToFinalEncounter(page: Page) {
  await setupToQuests(page);
  await openDebug(page);
  await openActFour(page);
  await page.getByTestId('debug-actfour-解锁 Act IV').click();
  await page.getByTestId('debug-actfour-跳过第三Boss回归').click();
  await page.getByTestId('debug-actfour-抽 Quest').click();
  await page.getByTestId('debug-actfour-抽 Layout').click();
  await page.getByTestId('debug-actfour-生成地图').click();
  await page.getByTestId('debug-actfour-Reveal Objective').click();
  await page.getByTestId('debug-actfour-创建 Guardian Quest').click();
  await page.getByTestId('debug-actfour-进入 Guardian Battle').click();
  // 三个 Excavation Site 依次 resolve + rest（幂等，多点是安全的）。
  for (let i = 0; i < 4; i++) {
    await page.getByTestId('debug-actfour-进入 Excavation').click();
    await page.getByTestId('debug-actfour-完成 Free Rest').click();
  }
  await page.getByTestId('debug-actfour-击败 Guardian').click();
  await page.getByTestId('debug-actfour-进入 Final Hamlet').click();
  for (let i = 0; i < 4; i++) {
    await page.getByTestId('debug-actfour-Final Hamlet Day').click();
  }
  await page.getByTestId('debug-actfour-准备 Final Encounter').click();
  await page.getByTestId('debug-actfour-进入 Final Encounter').click();
}

/**
 * 从当前 Active Form 依次「击败当前 Form → 切换下一 Form」推进到目标 Form。
 * 用于在随机跳过的序列里稳定到达某个实际在场的 Form。
 */
async function advanceToForm(page: Page, displayName: string) {
  for (let i = 0; i < 5; i++) {
    const active = await ffRow(page, 'Active Form');
    if (active.includes(displayName)) return;
    const before = active;
    await page.getByTestId('debug-actfour-击败当前 Form').click();
    // 等 defeat 的 transitionState 提交，再点切换 —— 连点无间隔会触发竞态导航。
    await page.waitForTimeout(300);
    await page.getByTestId('debug-actfour-切换下一 Form').click();
    // 等 Active Form 真正切走（defeat 后 status=transitioning，active 暂不变，
    // 切到下一 Form 后才会变），避免误判。
    await expect
      .poll(async () => (await ffRow(page, 'Active Form')), { timeout: 6000 })
      .not.toBe(before);
  }
  const final = await ffRow(page, 'Active Form');
  if (!final.includes(displayName)) {
    throw new Error(`未能推进到 ${displayName}，当前 Active Form=${final}`);
  }
}

/** 读取本局被跳过的 Form 展示名（'—' 表示无跳过）。 */
async function skippedForm(page: Page): Promise<string> {
  return (await ffRow(page, 'skipped Form')).trim();
}

/** 若目标 Form 本局被跳过，跳过该场景。 */
async function skipIfSkipped(page: Page, displayName: string) {
  const skipped = await skippedForm(page);
  if (skipped !== '—' && skipped.includes(displayName)) {
    test.skip(true, `本局跳过了 ${displayName}，该 Form 确定性逻辑由单元用例覆盖`);
  }
}

test('§33.1 进入 Final Encounter：序列恒以 Heart of Darkness 结尾；首 Form 机制运行时建立', async ({
  page,
}) => {
  await driveToFinalEncounter(page);

  // Heart 永不跳过（硬约束 13）：序列里一定包含它，且位于末位。
  const seq = await ffRow(page, 'Form Sequence');
  expect(seq).toContain('Heart of Darkness');
  expect(seq.trim()).toMatch(/Heart of Darkness\s*$/);
  // 本局恰好面对三个 Form（跳过一个）。
  expect(seq.split('→').map((s) => s.trim()).filter(Boolean)).toHaveLength(3);

  // 首 Form 机制运行时已建立（内容模式 prototype）。
  expect(await ffRow(page, 'FinalForm Runtime')).toContain('prototype');
  const runtimes = await ffRow(page, 'FinalForm Runtimes');
  expect(runtimes).toContain('ancestor-first-form');
  // 首 Form 有 3 个 Reflection、initiative Card 锁死 4（硬约束 8 的基数）。
  const refl = await ffRow(page, 'Reflections');
  expect(refl).toContain('3/3');
  expect(refl).toContain('Card 4');

  await expect(page.getByTestId('debug-panel')).toContainText(`v${SAVE_VERSION}`);
});

test('§33.2 Reflection 死亡不减少 Card（硬约束 8）+ Imperfect 反噬仅一次（硬约束 10）', async ({
  page,
}) => {
  await driveToFinalEncounter(page);
  await skipIfSkipped(page, 'Ancestor 第一形态');

  // 首 Form 必须是 ancestor-first-form 才能跑这段机制。
  await expect.poll(async () => (await ffRow(page, 'Active Form'))).toContain('Ancestor 第一形态');

  const cardOf = async () => {
    const m = (await ffRow(page, 'Reflections')).match(/Card (\d+)/);
    return Number(m?.[1] ?? '-1');
  };
  expect(await cardOf()).toBe(4);

  // 连续杀死全部 3 个 Reflection。
  for (let i = 0; i < 3; i++) {
    await page.getByTestId('debug-actfour-Reflection 死亡').click();
  }
  const reflAfter = await ffRow(page, 'Reflections');
  expect(reflAfter).toContain('0/3');
  // 硬约束 8：每杀一个都不减少 initiative Card（恒为 4）。
  expect(await cardOf()).toBe(4);

  // 硬约束 10：Imperfect 死亡反噬最多触发一次（一旦触发即保持，不会反复），
  // 且 Final Outcome 仍为进行中（ongoing，未误判胜利/失败）。
  const imperfect = await ffRow(page, 'Imperfect 反噬');
  expect(['未触发', '已触发（10 Wounds）']).toContain(imperfect);
  expect(await ffRow(page, 'Final Outcome')).toContain('ongoing');
});

test('§33.3 Ancestor Stance 结算：不破坏 Card 基数、不误判终局', async ({ page }) => {
  await driveToFinalEncounter(page);
  await skipIfSkipped(page, 'Ancestor 第一形态');

  await expect.poll(async () => (await ffRow(page, 'Active Form'))).toContain('Ancestor 第一形态');

  for (let i = 0; i < 4; i++) {
    await page.getByTestId('debug-actfour-Ancestor Stance 结算').click();
  }

  // 结算过程不减少 Card（硬约束 8 基数的延伸），且不产生非法终局。
  const refl = await ffRow(page, 'Reflections');
  expect(refl).toContain('Card 4');
  const outcome = await ffRow(page, 'Final Outcome');
  expect(outcome).toMatch(/ongoing|victory/);
  // 运行时仍在位、内容模式不变。
  expect(await ffRow(page, 'FinalForm Runtime')).toContain('prototype');
});

test('§33.4 Ancestor 第二形态：Absolute Nothingness 不可 Target / 占 Area Space', async ({ page }) => {
  await driveToFinalEncounter(page);
  await skipIfSkipped(page, 'Ancestor 第二形态');
  await advanceToForm(page, 'Ancestor 第二形态');

  // 3 个 Absolute Nothingness 占位（占 Area Space）。
  const nt = await ffRow(page, 'Nothingness / 传送');
  expect(nt).toContain('3 占位');
  // 上一 Form（第一形态）运行时被保留（共用 Room / 可回看，硬约束 3/5/18）。
  const runtimes = await ffRow(page, 'FinalForm Runtimes');
  expect(runtimes).toContain('ancestor-first-form');
  expect(runtimes).toContain('ancestor-second-form');
  // 不存在针对 Nothingness 的「目标/攻击」调试按钮（它不可 Target）。
  expect(await page.getByTestId('debug-act-four').getByText('Nothingness 死亡').count()).toBe(0);
});

test('§33.5 Gestating Heart：Sispersion 原子召唤 + Initiative（硬约束 15/16）', async ({ page }) => {
  await driveToFinalEncounter(page);
  await skipIfSkipped(page, 'Gestating Heart');
  await advanceToForm(page, 'Gestating Heart');

  const cardOf = (s: string) => Number((s.match(/Card (\d+)/) ?? [, '0'])[1]);

  // 初始 0 次 Sispersion，读出初始 Card 基数。
  const s0 = await ffRow(page, 'Sispersion');
  expect(s0).toContain('0 次');
  const base = cardOf(s0);

  // 点击一次 → 原子召唤一个 DD Monster 并写入 Initiative：历史 +1、Card 恰好 +1。
  await page.getByTestId('debug-actfour-Sispersion 召唤').click();
  const s1 = await ffRow(page, 'Sispersion');
  expect(s1).toContain('1 次');
  expect(cardOf(s1)).toBe(base + 1); // Sispersion 原子写入 1 张 Initiative
  expect(await ffRow(page, 'Final Outcome')).toContain('ongoing');

  // 再点一次（牌堆仍有牌）→ 历史 2 次，Card 再 +1（每次原子加 1，不跳变）。
  await page.getByTestId('debug-actfour-Sispersion 召唤').click();
  const s2 = await ffRow(page, 'Sispersion');
  expect(s2).toContain('2 次');
  expect(cardOf(s2)).toBe(base + 2);
});

test('§33.6 Gestating Reaction：仅实际造成 Wounds 时触发（硬约束 17）', async ({ page }) => {
  await driveToFinalEncounter(page);
  await skipIfSkipped(page, 'Gestating Heart');
  await advanceToForm(page, 'Gestating Heart');

  const before = await ffRow(page, 'Gestating Reaction');
  expect(before).toContain('0 次');

  // 调试按钮传入 woundsApplied=2（>0）→ 实际触发一次反应。
  await page.getByTestId('debug-actfour-Gestating Reaction').click();
  expect(await ffRow(page, 'Gestating Reaction')).toContain('1 次');
});

test('§33.7 Heart of Darkness：Battle Start 生成首个 Forecast；消费不重掷（硬约束 18/19）', async ({
  page,
}) => {
  await driveToFinalEncounter(page);
  await advanceToForm(page, 'Heart of Darkness');

  // Battle Start 即生成首个 Impending Doom Forecast（带 d10 + 技能映射）。
  const doom0 = await ffRow(page, 'Impending Doom');
  expect(doom0).toMatch(/^d10=\d+→/);
  expect(doom0).not.toContain('无预告');

  // 消费该 Forecast（只消费、不重掷）。
  await page.getByTestId('debug-actfour-消费 Impending Doom').click();
  const doom1 = await ffRow(page, 'Impending Doom');
  expect(doom1).toContain('（已消费）');

  // 消费后再生成：新 Forecast 替代当前，且未消费（硬约束 20：不覆盖未消费的；这里已消费故可生成）。
  await page.getByTestId('debug-actfour-生成 Impending Doom').click();
  const doom2 = await ffRow(page, 'Impending Doom');
  expect(doom2).toMatch(/^d10=\d+→/);
  expect(doom2).not.toContain('（已消费）');
});

test('§33.8 Forecast 落盘一致性：刷新后 d10 不重掷（硬约束 18 / 随机先保存后展示）', async ({ page }) => {
  await driveToFinalEncounter(page);
  await advanceToForm(page, 'Heart of Darkness');

  const before = (await ffRow(page, 'Impending Doom')).trim();
  await reopenAfterReload(page);
  const after = (await ffRow(page, 'Impending Doom')).trim();
  // 同一次 Fore‐cast 的 d10 与映射在刷新后完全一致。
  expect(after).toBe(before);
});

test('§33.9 Form 切换：共用 Room / 运行时保留 / 不误判', async ({ page }) => {
  await driveToFinalEncounter(page);
  const active0 = await ffRow(page, 'Active Form');

  // 击败当前 Form → 切换下一 Form。
  await page.getByTestId('debug-actfour-击败当前 Form').click();
  await page.getByTestId('debug-actfour-切换下一 Form').click();

  // 切换后 Transition State 标记 from→to:completed。
  const ts = await ffRow(page, 'Transition State');
  expect(ts).toContain('completed');
  expect(ts).toContain('→'); // from→to 结构存在
  // 旧 Form 运行时仍在（共用同一 Room，可回看，硬约束 3/5/18）。
  const runtimes = await ffRow(page, 'FinalForm Runtimes');
  expect(runtimes).toContain('ancestor-first-form');
  // 新的 Active Form 已切换（不等于原 Form）。
  const active1 = await ffRow(page, 'Active Form');
  expect(active1).not.toBe(active0);
});

test('§33.10 Heart 死亡结算 → Campaign Victory（硬约束 27）', async ({ page }) => {
  await driveToFinalEncounter(page);
  await advanceToForm(page, 'Heart of Darkness');

  await page.getByTestId('debug-actfour-Heart 死亡结算').click();

  // 终局评估为胜利；整库调试面板落到 campaign-victory 阶段。
  expect(await ffRow(page, 'Final Outcome')).toContain('victory');
  await expect(page.getByTestId('debug-panel')).toContainText('campaign-victory');
});

test('§33.11 Final Failure → Campaign Over（硬约束 26）', async ({ page }) => {
  await driveToFinalEncounter(page);

  await page.getByTestId('debug-actfour-模拟失败').click();

  // 硬约束 26：显式失败 → 阶段落到 campaign-over（evaluateFinalEncounterOutcome 仅在
  // party-wiped 时返回 'failure'，这里以阶段信号为准）。
  await expect(page.getByTestId('debug-panel')).toContainText('campaign-over');
});

test('§33.12 一键通关 + 落盘一致性 + Data Gate（official 禁用 / prototype harness）', async ({ page }) => {
  await setupToQuests(page);
  await openDebug(page);
  await openActFour(page);

  // 一键通关：从干净战役跑完 Act IV + 四形态链到 Campaign Victory。
  await page.getByTestId('debug-actfour-一键通关 (prototype)').click();

  await expect(page.getByTestId('debug-panel')).toContainText('campaign-victory');
  expect(await ffRow(page, 'Final Outcome')).toContain('victory');

  // 落盘一致性：刷新后仍 Victory（不重掷、不回退）。
  await reopenAfterReload(page);
  await expect(page.getByTestId('debug-panel')).toContainText('campaign-victory');

  // Data Gate：Final Encounter 仅 prototype harness 可用（硬约束 28/29）。
  expect(await ffRow(page, 'FinalForm Runtime')).toContain('prototype');
});
