import { expect, test, type Page } from '@playwright/test';
import type { CampaignState, SaveFile, Stance } from '../src/types';
import { LEVEL1_STANCE_ACCURACY_SPECS, PRODUCTION_PROOF_REGISTRY } from '../src/audit/production-proof-registry';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../src/game-engine/campaign';
import { acquireTrinket } from '../src/game-engine/trinkets/acquire-trinket';
import { generateDungeon } from '../src/game-engine/dungeon';
import { initBattle } from '../src/game-engine/battle';
import { setRandomSource } from '../src/game-engine/random';
import { createSaveSnapshot } from '../src/game-engine/save';

const STORAGE_KEY = 'dd-web-prototype-save-v1';

function battleSave(id: string, side: 'positive' | 'negative', stance: Stance): SaveFile {
  setRandomSource(() => 0);
  let campaign = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  const heroId = campaign.heroes[0].instanceId;
  campaign = { ...campaign, heroes: campaign.heroes.map((hero) => hero.instanceId === heroId
    ? { ...hero, level: 2 as const, stance: 'aggressive' as const } : hero) };
  campaign = acquireTrinket(campaign, { trinketId: id, source: 'debug', sourceEventId: `c1c16-e2e:${id}:${side}`,
    heroId }).campaign;
  campaign = { ...campaign, gamePhase: 'dungeon-explore', currentQuestId: 'c1c16-e2e',
    dungeon: generateDungeon('c1c16-e2e'), heroes: campaign.heroes.map((hero) => hero.instanceId === heroId
      ? { ...hero, equippedSkillIds: ['crusader-smite'],
        equippedTrinkets: hero.equippedTrinkets.map((card) => ({ ...card, currentSide: side })) } : hero) };
  const initialized = initBattle(campaign, 'A');
  const actor = initialized.battle!.heroes.find((unit) => unit.sourceId === heroId)!;
  const prepared: CampaignState = { ...initialized, battle: { ...initialized.battle!,
    heroes: initialized.battle!.heroes.map((unit) => unit.id === actor.id ? { ...unit, stance } : unit),
    activeActorId: actor.id, initiativeIndex: initialized.battle!.initiativeOrder.indexOf(actor.id),
    currentActionPoints: 2, pendingAction: null, pendingMentalCheck: false, status: 'active',
    monsters: initialized.battle!.monsters.map((monster) => ({ ...monster, hp: 99, maxHp: 99, isAlive: true })),
  } };
  setRandomSource(null);
  return createSaveSnapshot(prepared);
}

async function importSave(page: Page, save: SaveFile, seed: number) {
  await page.goto('/');
  await page.evaluate((value) => window.localStorage.setItem('dd-fixed-rng', value), String(seed));
  await page.reload();
  if (await page.locator('input[type="file"]').count() === 0) await page.getByRole('link', { name: '首页' }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'c1c16-stance-ring.json',
    mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)) });
  await expect(page.getByTestId('home-notice')).toContainText('存档导入成功');
  await page.getByTestId('btn-continue').click();
}
async function declareSmite(page: Page) {
  await page.getByTestId('skill-crusader-smite').click();
  await page.locator('[data-testid="monster-side"] button[class*="border-emerald-400"]').first().click();
}
async function storedSave(page: Page): Promise<SaveFile> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (!raw) throw new Error('Missing saved campaign');
  return JSON.parse(raw) as SaveFile;
}

for (const ring of LEVEL1_STANCE_ACCURACY_SPECS) {
  const proof = PRODUCTION_PROOF_REGISTRY[`C1C16-E2E-${ring.key}`];
  if (proof.proofSurface !== 'production-ui') throw new Error(`Wrong E2E surface: ${proof.proofId}`);
  test(proof.proofId, async ({ page }) => {
    test.setTimeout(120_000);
    await importSave(page, battleSave(ring.definitionId, 'positive', ring.stance), 30); // first d10 = 9
    await declareSmite(page);
    await expect(page.getByTestId('post-roll-trinket-window')).toContainText('9');
    await expect(page.getByTestId('trinket-use-overlay')).toContainText('命中 +2');
    expect((await storedSave(page)).campaign.battle?.pendingAction?.attackRoll).toBe(9);
    await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
    await expect(page.getByText(/掷 9 命中/).last()).toBeVisible();
    expect((await storedSave(page)).campaign.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');

    const other = ring.stance; // Same as positive: negative must be unconditional.
    await importSave(page, battleSave(ring.definitionId, 'negative', other), 2); // first d10 = 8
    await declareSmite(page);
    await expect(page.getByTestId('post-roll-trinket-window')).toContainText('8');
    await expect(page.getByTestId('trinket-use-overlay')).toContainText('命中 -1');
    expect((await storedSave(page)).campaign.battle?.pendingAction?.attackRoll).toBe(8);
    await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
    await expect(page.getByText(/掷 8 未命中/).last()).toBeVisible();
    expect((await storedSave(page)).campaign.heroes[0].equippedTrinkets[0].currentSide).toBe('positive');
  });
}
