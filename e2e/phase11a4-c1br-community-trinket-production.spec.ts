import { expect, test, type Page } from '@playwright/test';
import type { CampaignState, HamletState, SaveFile } from '../src/types';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../src/game-engine/campaign';
import { createSaveSnapshot } from '../src/game-engine/save';
import { generateDungeon } from '../src/game-engine/dungeon';
import { initBattle } from '../src/game-engine/battle';

const STORAGE_KEY = 'dd-web-prototype-save-v1';
const PARTY = ['crusader', 'highwayman', 'vestal', 'plague-doctor'];
const ACCURACY = 'community-trinket-core-accuracy-stone';
const CRITICAL = 'community-trinket-core-critical-stone';

function hamletState(): HamletState {
  return {
    visitId: 'c1br-production-hamlet', preparationDays: 2, currentDay: 1,
    caretakerBlockedBuildingId: null, occupiedBuildingIds: [], currentEventId: 'event-quiet-week',
    log: [], nextQuestProvisionBonus: 0,
  };
}

function hamletSave(): SaveFile {
  const base = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), PARTY));
  return createSaveSnapshot({
    ...base, gamePhase: 'hamlet', hamlet: hamletState(), gold: 100,
    heroes: base.heroes.map((hero) => ({ ...hero, hasActedToday: false })),
  });
}

async function importSave(page: Page, save: SaveFile) {
  await page.goto('/');
  if (await page.locator('input[type="file"]').count() === 0) {
    await page.getByRole('link', { name: '首页' }).click();
  }
  await expect(page.locator('input[type="file"]')).toHaveCount(1);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'c1br-production-save.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(save)),
  });
  await expect(page.getByTestId('home-notice')).toContainText('存档导入成功');
  await page.getByTestId('btn-continue').click();
}

async function storedSave(page: Page): Promise<SaveFile> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (!raw) throw new Error('Production save was not persisted');
  return JSON.parse(raw) as SaveFile;
}

async function setBrowserSeed(page: Page, seed: number) {
  await page.goto('/');
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), ['dd-fixed-rng', String(seed)]);
  await page.reload();
}

async function openNomad(page: Page) {
  const firstHero = page.locator('[data-testid^="hamlet-hero-"]').first();
  await firstHero.locator('button').first().click();
  await page.getByTestId('building-nomad-wagon').click();
  await expect(page.getByTestId('nomad-wagon-panel')).toBeVisible();
}

async function purchase(page: Page, trinketId: string): Promise<SaveFile> {
  await openNomad(page);
  await expect(page.getByTestId(`nomad-offer-${trinketId}`).first()).toBeVisible();
  const before = await storedSave(page);
  await page.getByTestId(`nomad-buy-${trinketId}`).first().click();
  await page.getByTestId('nomad-wagon-confirm').click();
  const after = await storedSave(page);
  expect(after.campaign.gold).toBe(before.campaign.gold - 4);
  expect(after.campaign.nomadWagon.offeredTrinketIds).not.toContain(trinketId);
  expect(after.campaign.nomadWagon.purchasedTrinketId).toBe(trinketId);
  expect(after.campaign.heroes[0].equippedTrinkets.map((entry) => entry.trinketId)).toContain(trinketId);
  expect(after.campaign.heroes[0].equippedTrinkets.map((entry) => entry.trinketId)).not.toContain('critical-stone');
  return after;
}

function battleSaveFromPurchase(purchased: SaveFile, trinketId: string): SaveFile {
  const dungeon = generateDungeon('scout-ahead');
  const prepared: CampaignState = {
    ...purchased.campaign, gamePhase: 'dungeon-explore', currentQuestId: 'scout-ahead',
    dungeon, battle: null,
  };
  const initialized = initBattle(prepared, 'A');
  const owner = initialized.heroes.find((hero) => hero.equippedTrinkets.some((entry) => entry.trinketId === trinketId))!;
  const unit = initialized.battle!.heroes.find((entry) => entry.sourceId === owner.instanceId)!;
  const initiativeIndex = initialized.battle!.initiativeOrder.indexOf(unit.id);
  return createSaveSnapshot({
    ...initialized,
    battle: {
      ...initialized.battle!, initiativeIndex, activeActorId: unit.id,
      currentActionPoints: 2, selectedSkillId: null, selectedTargetId: null,
      pendingAction: null, pendingMentalCheck: false, status: 'active',
    },
  });
}

async function usePostRollTrinket(page: Page, trinketId: string, expectedRoll: number, expectedLog: RegExp) {
  await page.getByTestId('skill-crusader-smite').click();
  await page.locator('[data-testid="monster-side"] button[class*="border-emerald-400"]').first().click();
  await expect(page.getByTestId('post-roll-trinket-window')).toContainText(String(expectedRoll));
  await expect(page.getByTestId('trinket-use-overlay')).toBeVisible();
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
  await expect(page.getByText(expectedLog).last()).toBeVisible();
  const used = await storedSave(page);
  const instance = used.campaign.heroes.flatMap((hero) => hero.equippedTrinkets).find((entry) => entry.trinketId === trinketId)!;
  expect(instance.currentSide).toBe('negative');
  await page.reload();
  await expect(page.getByText(expectedLog).last()).toBeVisible();
  const replayed = await storedSave(page);
  expect(replayed.campaign.heroes.flatMap((hero) => hero.equippedTrinkets).find((entry) => entry.trinketId === trinketId)?.currentSide).toBe('negative');
}

test('C1BR-E2E-PROFILE: UI creates the Community runtime profile', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('runtime-content-profile').selectOption('community-complete-edition');
  await page.getByRole('button', { name: '新建战役' }).click();
  const save = await storedSave(page);
  expect(save.campaign.runtimeContentProfile).toBe('community-complete-edition');
});

test('C1BR-E2E-OFFER: real Nomad UI is deterministic on reload and diverse across seeds', async ({ page }) => {
  const fixture = hamletSave();
  await setBrowserSeed(page, 7);
  await importSave(page, fixture);
  await openNomad(page);
  const first = (await storedSave(page)).campaign.nomadWagon.offeredTrinketIds;
  expect(first).toEqual(expect.arrayContaining([ACCURACY, CRITICAL]));
  expect(first).not.toContain('critical-stone');
  await page.reload();
  await openNomad(page);
  expect((await storedSave(page)).campaign.nomadWagon.offeredTrinketIds).toEqual(first);

  await setBrowserSeed(page, 4);
  await importSave(page, fixture);
  await openNomad(page);
  const other = (await storedSave(page)).campaign.nomadWagon.offeredTrinketIds;
  expect(other).not.toEqual(first);
});

test('C1BR-E2E-ACCURACY: buy, equip, use to turn roll 9 into a hit, flip, and replay', async ({ page }) => {
  await setBrowserSeed(page, 7);
  await importSave(page, hamletSave());
  const purchased = await purchase(page, ACCURACY);
  await setBrowserSeed(page, 30); // first d10 = 9
  await importSave(page, battleSaveFromPurchase(purchased, ACCURACY));
  await usePostRollTrinket(page, ACCURACY, 9, /掷 9 命中/);
});

test('C1BR-E2E-CRITICAL: buy, equip, use to turn roll 8 into a crit, flip, and replay', async ({ page }) => {
  await setBrowserSeed(page, 7);
  await importSave(page, hamletSave());
  const purchased = await purchase(page, CRITICAL);
  await setBrowserSeed(page, 2); // first d10 = 8
  await importSave(page, battleSaveFromPurchase(purchased, CRITICAL));
  await usePostRollTrinket(page, CRITICAL, 8, /掷 8（暴击） 命中/);
});
