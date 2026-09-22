import { expect, test } from '@playwright/test';
import type { CampaignState, SaveFile } from '../src/types';
import { BOOK_OF_CONSTITUTION_ID, PRODUCTION_PROOF_REGISTRY } from '../src/audit/production-proof-registry';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../src/game-engine/campaign';
import { generateDungeon } from '../src/game-engine/dungeon';
import { acquireTrinket } from '../src/game-engine/trinkets/acquire-trinket';
import { createSaveSnapshot } from '../src/game-engine/save';

const registration = PRODUCTION_PROOF_REGISTRY['C1C12-E2E-CONSTITUTION-CURIO'];
if (registration.runner !== 'playwright' || registration.proofSurface !== 'production-ui') {
  throw new Error('C1C-12 E2E proof must use production UI');
}

function curioSave(): { save: SaveFile; ownerId: string } {
  let campaign: CampaignState = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  const dungeon = generateDungeon('c1c12-e2e');
  campaign = {
    ...campaign,
    currentQuestId: 'c1c12-e2e',
    questStatus: 'active',
    gamePhase: 'dungeon-explore',
    dungeon: {
      ...dungeon,
      rooms: dungeon.rooms.map((room) => room.id === dungeon.currentRoomId
        ? { ...room, status: 'cleared' as const, curioId: 'plague-cart', curioUsed: false }
        : room),
    },
    heroes: campaign.heroes.map((hero, index) => index === 0 ? { ...hero, level: 2 as const } : hero),
  };
  campaign = acquireTrinket(campaign, {
    trinketId: BOOK_OF_CONSTITUTION_ID,
    source: 'debug',
    sourceEventId: 'c1c12-e2e-book',
    heroId: campaign.heroes[0].instanceId,
  }).campaign;
  return { save: createSaveSnapshot(campaign), ownerId: campaign.heroes[0].instanceId };
}

async function importAndContinue(page: import('@playwright/test').Page, fixture: { save: SaveFile }) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'c1c12.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture.save)),
  });
  await expect(page.getByTestId('home-notice')).toContainText('存档导入成功');
  await page.getByRole('button', { name: '继续游戏' }).click();
}

test(registration.proofId, async ({ page }) => {
  const used = curioSave();
  await importAndContinue(page, used);
  await page.getByTestId(`curio-search-${used.ownerId}`).click();
  await expect(page.getByTestId('disease-trinket-context')).toContainText('Black Plague');
  await expect(page.getByTestId('trinket-use-overlay')).toContainText('立即丢弃本次新疾病');
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
  await expect(page.getByTestId('disease-overlay-title')).toContainText('疾病已被丢弃');
  await expect(page.getByTestId('curio-used')).toBeVisible();
  await page.getByTestId('disease-overlay-confirm').click();
  await expect(page.getByTestId(`trinket-${BOOK_OF_CONSTITUTION_ID}`)).toContainText('负面');

  const declined = curioSave();
  await importAndContinue(page, declined);
  await page.getByTestId(`curio-search-${declined.ownerId}`).click();
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '跳过' }).click();
  await expect(page.getByTestId('disease-overlay-title')).toContainText('感染疾病');
  await expect(page.getByTestId('curio-used')).toBeVisible();
  await page.getByTestId('disease-overlay-confirm').click();
  await expect(page.getByTestId(`trinket-${BOOK_OF_CONSTITUTION_ID}`)).toContainText('正面');
});
