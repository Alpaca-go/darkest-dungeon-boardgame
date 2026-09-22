import { expect, test, type Page } from '@playwright/test';
import type { CampaignState, SaveFile } from '../src/types';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../src/game-engine/campaign';
import { acquireTrinket } from '../src/game-engine/trinkets/acquire-trinket';
import { createSaveSnapshot } from '../src/game-engine/save';
import { generateDungeon } from '../src/game-engine/dungeon';
import { initBattle } from '../src/game-engine/battle';
import {
  DARK_BRACER_ID, PRODUCTION_PROOF_REGISTRY, SOLAR_BRACER_ID,
} from '../src/audit/production-proof-registry';

const PARTY = ['crusader', 'highwayman', 'vestal', 'plague-doctor'];
const STORAGE_KEY = 'dd-web-prototype-save-v1';

function battleSave(trinketId: string, side: 'positive' | 'negative', light: number): SaveFile {
  let campaign = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), PARTY));
  campaign = acquireTrinket(campaign, {
    trinketId, source: 'nomad-wagon', sourceEventId: `c1c6-e2e:${trinketId}:${side}`,
    heroId: campaign.heroes[0].instanceId,
  }).campaign;
  campaign = {
    ...campaign, light, gamePhase: 'dungeon-explore', currentQuestId: 'c1c6-e2e', dungeon: generateDungeon('c1c6-e2e'),
    heroes: campaign.heroes.map((hero, index) => index === 0 ? {
      ...hero, equippedSkillIds: ['crusader-smite'],
      equippedTrinkets: hero.equippedTrinkets.map((trinket) => ({ ...trinket, currentSide: side })),
    } : hero),
  };
  const initialized = initBattle(campaign, 'A');
  const actor = initialized.battle!.heroes.find((unit) => unit.sourceId === initialized.heroes[0].instanceId)!;
  const prepared: CampaignState = {
    ...initialized,
    battle: {
      ...initialized.battle!, light, activeActorId: actor.id,
      initiativeIndex: initialized.battle!.initiativeOrder.indexOf(actor.id), currentActionPoints: 2,
      pendingAction: null, pendingMentalCheck: false, status: 'active',
      monsters: initialized.battle!.monsters.map((monster) => ({ ...monster, hp: 99, maxHp: 99, isAlive: true })),
    },
  };
  return createSaveSnapshot(prepared);
}

async function importSave(page: Page, save: SaveFile) {
  await page.goto('/');
  if (await page.locator('input[type="file"]').count() === 0) await page.getByRole('link', { name: '首页' }).click();
  await page.evaluate(() => window.localStorage.setItem('dd-fixed-rng', '2')); // first d10 = 8
  await page.reload();
  if (await page.locator('input[type="file"]').count() === 0) await page.getByRole('link', { name: '首页' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'c1c6-production-save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)),
  });
  await expect(page.getByTestId('home-notice')).toContainText('存档导入成功');
  await page.getByTestId('btn-continue').click();
}

async function storedSave(page: Page): Promise<SaveFile> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (!raw) throw new Error('Production save was not persisted');
  return JSON.parse(raw) as SaveFile;
}

async function declareSmite(page: Page) {
  await page.getByTestId('skill-crusader-smite').click();
  await page.locator('[data-testid="monster-side"] button[class*="border-emerald-400"]').first().click();
}

for (const [label, trinketId, positiveLight, negativeLight] of [
  ['DARK', DARK_BRACER_ID, 3, 4],
  ['SOLAR', SOLAR_BRACER_ID, 4, 2],
] as const) {
  test(PRODUCTION_PROOF_REGISTRY[`C1C6-E2E-${label}-BRACER`].proofId, async ({ page }) => {
    await importSave(page, battleSave(trinketId, 'positive', positiveLight));
    await declareSmite(page);
    await expect(page.getByTestId('post-roll-trinket-window')).toContainText('8');
    await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
    await expect(page.getByText(/掷 8（暴击） 命中/).last()).toBeVisible();
    expect((await storedSave(page)).campaign.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');

    await importSave(page, battleSave(trinketId, 'negative', negativeLight));
    const before = await storedSave(page);
    const targetId = before.campaign.battle!.monsters[0].id;
    const hpBefore = before.campaign.battle!.monsters.find((unit) => unit.id === targetId)!.hp;
    await declareSmite(page);
    await expect(page.getByTestId('pre-damage-trinket-window')).toContainText('伤害尚未应用');
    await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
    await expect(page.getByText(/造成 0 伤害/).last()).toBeVisible();
    const after = await storedSave(page);
    expect(after.campaign.battle!.monsters.find((unit) => unit.id === targetId)!.hp).toBe(hpBefore);
    expect(after.campaign.heroes[0].equippedTrinkets[0].currentSide).toBe('positive');
  });
}
