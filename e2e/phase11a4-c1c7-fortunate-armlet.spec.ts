import { expect, test } from '@playwright/test';
import type { SaveFile } from '../src/types';
import { FORTUNATE_ARMLET_ID, PRODUCTION_PROOF_REGISTRY } from '../src/audit/production-proof-registry';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../src/game-engine/campaign';
import { acquireTrinket } from '../src/game-engine/trinkets/acquire-trinket';
import { generateDungeon } from '../src/game-engine/dungeon';
import { initBattle } from '../src/game-engine/battle';
import { createSaveSnapshot } from '../src/game-engine/save';

const STORAGE_KEY = 'dd-web-prototype-save-v1';
const registration = PRODUCTION_PROOF_REGISTRY['C1C7-E2E-FORTUNATE-POSITIVE'];
if (registration.runner !== 'playwright' || registration.proofSurface !== 'production-ui') {
  throw new Error('Fortunate positive E2E proof is not registered on production UI');
}

function battleSave(): SaveFile {
  let campaign = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  campaign = acquireTrinket(campaign, {
    trinketId: FORTUNATE_ARMLET_ID, source: 'nomad-wagon', sourceEventId: 'c1c7-e2e-fixture',
    heroId: campaign.heroes[0].instanceId,
  }).campaign;
  campaign = { ...campaign, gamePhase: 'dungeon-explore', currentQuestId: 'scout-ahead',
    dungeon: generateDungeon('scout-ahead'), battle: null };
  const initialized = initBattle(campaign, 'A');
  const owner = initialized.heroes.find((hero) => hero.equippedTrinkets.some((entry) => entry.trinketId === FORTUNATE_ARMLET_ID))!;
  const unit = initialized.battle!.heroes.find((entry) => entry.sourceId === owner.instanceId)!;
  return createSaveSnapshot({ ...initialized, battle: { ...initialized.battle!,
    initiativeIndex: initialized.battle!.initiativeOrder.indexOf(unit.id), activeActorId: unit.id,
    currentActionPoints: 2, selectedSkillId: null, selectedTargetId: null,
    pendingAction: null, pendingMentalCheck: false, status: 'active' } });
}

async function importSave(page: import('@playwright/test').Page, save: SaveFile) {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'c1c7-fortunate.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)),
  });
  await expect(page.getByTestId('home-notice')).toContainText('存档导入成功');
  await page.getByTestId('btn-continue').click();
}

test(registration.proofId, async ({ page }) => {
  await page.goto('/');
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), ['dd-fixed-rng', '30']);
  await importSave(page, battleSave()); // first d10 = 9
  await page.getByTestId('skill-crusader-smite').click();
  await page.locator('[data-testid="monster-side"] button[class*="border-emerald-400"]').first().click();
  await expect(page.getByTestId('post-roll-trinket-window')).toContainText('9');
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
  await expect(page.getByText(/掷 9（暴击） 命中/).last()).toBeVisible();
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  const persisted = JSON.parse(raw!) as SaveFile;
  const trinket = persisted.campaign.heroes.flatMap((hero) => hero.equippedTrinkets)
    .find((entry) => entry.trinketId === FORTUNATE_ARMLET_ID)!;
  expect(trinket.currentSide).toBe('negative');
  await page.reload();
  await expect(page.getByText(/掷 9（暴击） 命中/).last()).toBeVisible();
});
