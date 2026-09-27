import { test, expect, type Page } from '@playwright/test';
import type { SaveFile } from '../src/types';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../src/game-engine/campaign';
import { generateDungeon } from '../src/game-engine/dungeon';
import { acquireTrinket } from '../src/game-engine/trinkets/acquire-trinket';
import { setRandomSource } from '../src/game-engine/random';
import { createSaveSnapshot } from '../src/game-engine/save';
const STORAGE_KEY = 'dd-web-prototype-save-v1';
function dungeonSave(side: 'positive' | 'negative'): SaveFile {
  setRandomSource(() => 0);
  let campaign = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  campaign = { ...campaign, gamePhase: 'dungeon-explore', currentQuestId: 'c1c17-e2e', questStatus: 'active',
    dungeon: generateDungeon('c1c17-e2e'), provisions: { ...campaign.provisions, food: 3, tool: 1 } };
  campaign = { ...campaign, dungeon: { ...campaign.dungeon!, rooms: campaign.dungeon!.rooms.map((room) => room.id === 'A'
    ? { ...room, type: 'empty', curioId: null, status: 'revealed' } : room) } };
  campaign = acquireTrinket(campaign, { trinketId: 'community-trinket-core-survival-guide', source: 'debug', sourceEventId: 'c1c17:' + side, heroId: campaign.heroes[0].instanceId }).campaign;
  campaign = { ...campaign, heroes: campaign.heroes.map((hero, index) => index === 0 ? { ...hero,
    equippedTrinkets: hero.equippedTrinkets.map((card) => ({ ...card, currentSide: side })) } : hero) };
  setRandomSource(null);
  return createSaveSnapshot(campaign);
}
async function importSave(page: Page, save: SaveFile, seed: number) {
  await page.goto('/');
  await page.evaluate((value) => window.localStorage.setItem('dd-fixed-rng', value), String(seed));
  await page.reload();
  if (await page.locator('input[type="file"]').count() === 0) await page.getByRole('link', { name: '首页' }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'c1c17-guide.json',
    mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)) });
  await expect(page.getByTestId('home-notice')).toContainText('存档导入成功');
  await page.getByTestId('btn-continue').click();
}
async function storedSave(page: Page): Promise<SaveFile> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (!raw) throw new Error('Missing saved campaign');
  return JSON.parse(raw) as SaveFile;
}


for (const side of ['positive', 'negative'] as const) test('C1C17-E2E-SURVIVAL-GUIDE-' + side.toUpperCase(), async ({ page }) => {
  test.setTimeout(120_000);
  // Seed 9's first value is in Hunger's range; seed 7's first value is in None's range.
  await importSave(page, dungeonSave(side), side === 'positive' ? 9 : 7);
  await page.getByTestId('dungeon-room-A').click();
  await expect(page.getByTestId('trinket-use-overlay')).toBeVisible();
  const staged = (await storedSave(page)).campaign;
  expect(staged.dungeon!.currentRoomId).toBe('start');
  expect(staged.provisions).toMatchObject({ food: 3, tool: 1 });
  expect(staged.pendingDungeonTrinketAction).toMatchObject({ originalResult: side === 'positive' ? 'hunger' : 'none' });
  await expect(page.getByTestId('exploration-result-context')).toContainText(side === 'positive' ? 'Hunger' : 'None');
  await page.reload();
  await expect(page.getByTestId('trinket-use-overlay')).toBeVisible();
  expect((await storedSave(page)).campaign.pendingDungeonTrinketAction).toEqual(staged.pendingDungeonTrinketAction);
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
  await expect(page.getByTestId('trinket-use-overlay')).toHaveCount(0);
  const completed = (await storedSave(page)).campaign;
  expect(completed.dungeon!.currentRoomId).toBe('A');
  expect(completed.provisions.food).toBe(3);
  expect(completed.provisions.tool).toBe(side === 'positive' ? 1 : 0);
  expect(completed.heroes[0].equippedTrinkets[0].currentSide).toBe(side === 'positive' ? 'negative' : 'positive');
});
