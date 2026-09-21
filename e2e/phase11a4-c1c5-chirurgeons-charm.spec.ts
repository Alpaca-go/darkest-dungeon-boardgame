import { expect, test, type Page } from '@playwright/test';
import type { CampaignState, SaveFile } from '../src/types';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../src/game-engine/campaign';
import { acquireTrinket } from '../src/game-engine/trinkets/acquire-trinket';
import { createSaveSnapshot } from '../src/game-engine/save';
import { generateDungeon } from '../src/game-engine/dungeon';
import { initBattle } from '../src/game-engine/battle';
import { CHIRURGEONS_CHARM_ID, PRODUCTION_PROOF_REGISTRY } from '../src/audit/production-proof-registry';

const PARTY = ['crusader', 'highwayman', 'vestal', 'plague-doctor'];
const STORAGE_KEY = 'dd-web-prototype-save-v1';

function battleSave(owner: 'healer' | 'target', side: 'positive' | 'negative'): SaveFile {
  let campaign = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), PARTY));
  const ownerIndex = owner === 'healer' ? 0 : 1;
  campaign = acquireTrinket(campaign, {
    trinketId: CHIRURGEONS_CHARM_ID, source: 'nomad-wagon',
    sourceEventId: `c1c5-e2e:${owner}:${side}`, heroId: campaign.heroes[ownerIndex].instanceId,
  }).campaign;
  campaign = {
    ...campaign,
    heroes: campaign.heroes.map((hero, index) => index === ownerIndex
      ? {
          ...hero,
          equippedSkillIds: index === 0 ? ['crusader-battle-heal'] : hero.equippedSkillIds,
          equippedTrinkets: hero.equippedTrinkets.map((trinket) => ({ ...trinket, currentSide: side })),
        }
      : index === 0 ? { ...hero, equippedSkillIds: ['crusader-battle-heal'] } : hero),
    gamePhase: 'dungeon-explore', currentQuestId: 'c1c5-e2e', dungeon: generateDungeon('c1c5-e2e'),
  };
  const initialized = initBattle(campaign, 'A');
  const healer = initialized.battle!.heroes.find((unit) => unit.sourceId === initialized.heroes[0].instanceId)!;
  const target = initialized.battle!.heroes.find((unit) => unit.sourceId === initialized.heroes[1].instanceId)!;
  const prepared: CampaignState = {
    ...initialized,
    battle: {
      ...initialized.battle!,
      heroes: initialized.battle!.heroes.map((unit) => unit.id === target.id ? { ...unit, hp: unit.maxHp - 12 } : unit),
      activeActorId: healer.id, initiativeIndex: initialized.battle!.initiativeOrder.indexOf(healer.id),
      currentActionPoints: 2, pendingAction: null, pendingMentalCheck: false, status: 'active',
    },
  };
  return createSaveSnapshot(prepared);
}

async function importSave(page: Page, save: SaveFile) {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'c1c5-production-save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)),
  });
  await expect(page.getByTestId('home-notice')).toContainText('存档导入成功');
  await page.getByTestId('btn-continue').click();
}

async function storedSave(page: Page): Promise<SaveFile> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (!raw) throw new Error('Production save was not persisted');
  return JSON.parse(raw) as SaveFile;
}

async function healThroughProductionUi(page: Page, expectedStage: '治疗者' | '受治疗者') {
  await page.getByTestId('skill-crusader-battle-heal').click();
  await page.getByTestId('hero-side').getByRole('button', { name: /Highwayman/ }).click();
  await expect(page.getByTestId('healing-trinket-window')).toContainText(expectedStage);
  await expect(page.getByTestId('trinket-use-overlay')).toBeVisible();
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
}

test(PRODUCTION_PROOF_REGISTRY['C1C5-E2E-CHIRURGEONS'].proofId, async ({ page }) => {
  await importSave(page, battleSave('healer', 'positive'));
  await healThroughProductionUi(page, '治疗者');
  await expect(page.getByText(/治疗 .* 10 点/).last()).toBeVisible();
  const positive = await storedSave(page);
  expect(positive.campaign.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');
  const positiveTarget = positive.campaign.battle!.heroes.find((unit) => unit.sourceId === positive.campaign.heroes[1].instanceId)!;
  expect(positiveTarget.maxHp - positiveTarget.hp).toBe(2);
  await page.reload();
  await expect(page.getByText(/治疗 .* 10 点/).last()).toBeVisible();
});

test('C1C5-E2E-CHIRURGEONS-NEGATIVE', async ({ page }) => {
  await importSave(page, battleSave('target', 'negative'));
  await healThroughProductionUi(page, '受治疗者');
  await expect(page.getByText(/治疗 .* 4 点/).last()).toBeVisible();
  const negative = await storedSave(page);
  expect(negative.campaign.heroes[1].equippedTrinkets[0].currentSide).toBe('positive');
  const negativeTarget = negative.campaign.battle!.heroes.find((unit) => unit.sourceId === negative.campaign.heroes[1].instanceId)!;
  expect(negativeTarget.maxHp - negativeTarget.hp).toBe(8);
  await page.reload();
  await expect(page.getByText(/治疗 .* 4 点/).last()).toBeVisible();
});
