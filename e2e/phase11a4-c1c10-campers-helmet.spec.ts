import { expect, test } from '@playwright/test';
import type { CampaignState, SaveFile } from '../src/types';
import { CAMPERS_HELMET_ID, PRODUCTION_PROOF_REGISTRY } from '../src/audit/production-proof-registry';
import { COMMUNITY_QUEST_RUNTIME_ADAPTERS } from '../src/data/community-reference/production-runtime';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../src/game-engine/campaign';
import { generateDungeon } from '../src/game-engine/dungeon';
import { acquireTrinket } from '../src/game-engine/trinkets/acquire-trinket';
import { createQuestRuntimeState } from '../src/game-engine/quests/quest-runtime';
import { createSaveSnapshot } from '../src/game-engine/save';

const QUEST_ID = 'community-quest-ruins-lvl1-scout-ahead';
const campingProof = PRODUCTION_PROOF_REGISTRY['C1C10-E2E-CAMPERS-CAMPING'];
const scoutProof = PRODUCTION_PROOF_REGISTRY['C1C10-E2E-CAMPERS-SCOUT'];
for (const proof of [campingProof, scoutProof]) {
  if (proof.runner !== 'playwright' || proof.proofSurface !== 'production-ui') {
    throw new Error(`${proof.proofId} must use production UI`);
  }
}

function dungeonSave(side: 'positive' | 'negative'): { save: SaveFile; ownerId: string; secondId: string } {
  const base = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  const quest = COMMUNITY_QUEST_RUNTIME_ADAPTERS[QUEST_ID].definition;
  const dungeon = generateDungeon(QUEST_ID);
  let campaign: CampaignState = {
    ...base, currentQuestId: QUEST_ID, questStatus: 'active', gamePhase: 'dungeon-explore',
    dungeon: { ...dungeon, rooms: dungeon.rooms.map((room) => room.id === dungeon.currentRoomId
      ? { ...room, status: 'cleared' as const } : room) },
    questRuntimeState: createQuestRuntimeState(quest),
    heroes: base.heroes.map((hero, index) => index < 2 ? { ...hero, wounds: 4, stress: 4 } : hero),
  };
  campaign = acquireTrinket(campaign, {
    trinketId: CAMPERS_HELMET_ID, source: 'debug', sourceEventId: `c1c10-e2e-${side}`,
    heroId: campaign.heroes[0].instanceId,
  }).campaign;
  if (side === 'negative') campaign = { ...campaign, heroes: campaign.heroes.map((hero, index) => index === 0 ? {
    ...hero, equippedTrinkets: hero.equippedTrinkets.map((trinket) => ({ ...trinket, currentSide: side })),
  } : hero) };
  return { save: createSaveSnapshot(campaign), ownerId: campaign.heroes[0].instanceId, secondId: campaign.heroes[1].instanceId };
}

async function importAndContinue(page: import('@playwright/test').Page, fixture: { save: SaveFile }) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'c1c10.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture.save)),
  });
  await expect(page.getByTestId('home-notice')).toContainText('存档导入成功');
  await page.getByRole('button', { name: '继续游戏' }).click();
}

test(campingProof.proofId, async ({ page }) => {
  const fixture = dungeonSave('positive');
  await importAndContinue(page, fixture);
  await page.getByTestId('rest-at-camp').click();
  for (let index = 0; index < 4; index += 1) await page.getByTestId(`rest-${fixture.ownerId}-life-plus`).click();
  for (let index = 0; index < 4; index += 1) await page.getByTestId(`rest-${fixture.secondId}-stress-plus`).click();
  await page.getByTestId('rest-allocation-confirm').click();
  await expect(page.getByTestId('dungeon-trinket-context')).toContainText('Rest at Camp 结算前');
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
  while (await page.getByTestId('provision-wild-choice').count()) {
    await page.getByTestId('provision-wild-choice').getByRole('button', { name: 'food' }).first().click();
  }
  await expect(page.getByTestId('trinket-use-overlay')).toHaveCount(0);
  await expect(page.getByTestId('quest-rest-runtime')).toContainText('Firewood: 0');
  await expect(page.getByText(/Camper's Helmet：补给骰加入公共补给池/)).toBeVisible();
});

test(scoutProof.proofId, async ({ page }) => {
  const fixture = dungeonSave('negative');
  await importAndContinue(page, fixture);
  await page.getByTestId('scout-dungeon').click();
  await expect(page.getByTestId('dungeon-trinket-context')).toContainText('Scout 结算前');
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
  await expect(page.getByTestId('trinket-use-overlay')).toHaveCount(0);
  await expect(page.getByText(/小队进行了侦察/)).toBeVisible();
  await expect(page.getByTestId(`trinket-${CAMPERS_HELMET_ID}`)).toContainText('正面');

  const declineFixture = dungeonSave('negative');
  await importAndContinue(page, declineFixture);
  await page.getByTestId('scout-dungeon').click();
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '跳过' }).click();
  await expect(page.getByTestId('trinket-use-overlay')).toHaveCount(0);
  await expect(page.getByText(/小队进行了侦察/)).toBeVisible();
  await expect(page.getByTestId(`trinket-${CAMPERS_HELMET_ID}`)).toContainText('负面');
});
