import { expect, test } from '@playwright/test';
import type { CampaignState, SaveFile } from '../src/types';
import { BOOK_OF_HOLINESS_ID, PRODUCTION_PROOF_REGISTRY } from '../src/audit/production-proof-registry';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../src/game-engine/campaign';
import { generateDungeon } from '../src/game-engine/dungeon';
import { initBattle, prepareMonsterAttackResolution } from '../src/game-engine/battle';
import { acquireTrinket } from '../src/game-engine/trinkets/acquire-trinket';
import { advancePendingMonsterAttack } from '../src/game-engine/trinkets/battle-trinket-bridge';
import { createSaveSnapshot } from '../src/game-engine/save';
import { setRandomSource } from '../src/game-engine/random';

const registration = PRODUCTION_PROOF_REGISTRY['C1C13-E2E-HOLINESS-CRITICAL'];
if (registration.runner !== 'playwright' || registration.proofSurface !== 'production-ui') {
  throw new Error('C1C-13 E2E proof must use production UI');
}

function holinessSave(): { save: SaveFile; targetUnitId: string } {
  setRandomSource(() => 0);
  try {
    let campaign: CampaignState = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
      ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
    campaign = { ...campaign, currentQuestId: 'c1c13-e2e', dungeon: generateDungeon('c1c13-e2e') };
    campaign = initBattle(campaign, 'A');
    const monster = campaign.battle!.monsters[0];
    const selected = campaign.battle!.heroes[1];
    const heroes = campaign.battle!.heroes.map((hero) => ({ ...hero, hp: 30, maxHp: 30, stress: 0, quirkIds: [] }));
    const monsters = campaign.battle!.monsters.map((unit, index) => index === 0
      ? { ...unit, isAlive: true, hp: Math.max(1, unit.hp) } : { ...unit, isAlive: false, hp: 0 });
    let battle = { ...campaign.battle!, heroes, monsters, activeActorId: monster.id, initiativeIndex: 0,
      initiativeOrder: [monster.id, ...heroes.map((hero) => hero.id)], pendingMonsterAttack: null,
      stagedIncomingAttacks: true, status: 'active' as const };
    battle = prepareMonsterAttackResolution(battle, monster.id);
    battle = { ...battle, pendingMonsterAttack: {
      ...battle.pendingMonsterAttack!, stage: 'hero-hit-window' as const, targetHeroUnitId: selected.id,
      skillId: 'bone-soldier-cleave', attackRoll: 5, hit: true, crit: false, baseDamage: 2,
      diseaseRoll: null, criticalOverride: null,
    } };
    campaign = acquireTrinket({ ...campaign, battle }, {
      trinketId: BOOK_OF_HOLINESS_ID, source: 'debug', sourceEventId: 'c1c13-e2e-book', heroId: selected.sourceId,
    }).campaign;
    campaign = { ...campaign, heroes: campaign.heroes.map((hero) => hero.instanceId === selected.sourceId ? {
      ...hero, equippedTrinkets: hero.equippedTrinkets.map((trinket) => ({ ...trinket, currentSide: 'negative' as const })),
    } : hero) };
    campaign = advancePendingMonsterAttack(campaign);
    return { save: createSaveSnapshot(campaign), targetUnitId: selected.id };
  } finally { setRandomSource(null); }
}

async function importSave(page: import('@playwright/test').Page, fixture: { save: SaveFile }, name: string) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type="file"]').setInputFiles({
    name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture.save)),
  });
  await expect(page.getByTestId('home-notice')).toContainText('存档导入成功');
}

test(registration.proofId, async ({ page }) => {
  const used = holinessSave();
  await importSave(page, used, 'c1c13-holiness-use.json');
  await expect(page.getByTestId('incoming-attack-context')).toContainText('冻结基础伤害：2');
  await expect(page.getByTestId('trinket-use-overlay')).toContainText('转换为暴击');
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect(page.getByTestId(`actor-${used.targetUnitId}`)).toContainText('HP 22/30');
  await expect(page.getByText(/转化为暴击.*造成 8 伤害/).last()).toBeVisible();
  await page.getByTestId(`actor-${used.targetUnitId}`).click();
  await expect(page.getByTestId(`trinket-${BOOK_OF_HOLINESS_ID}`)).toContainText('正面');

  const declined = holinessSave();
  await importSave(page, declined, 'c1c13-holiness-decline.json');
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '跳过' }).click();
  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect(page.getByTestId(`actor-${declined.targetUnitId}`)).toContainText('HP 28/30');
  await expect(page.getByText(/造成 2 伤害/).last()).toBeVisible();
  await page.getByTestId(`actor-${declined.targetUnitId}`).click();
  await expect(page.getByTestId(`trinket-${BOOK_OF_HOLINESS_ID}`)).toContainText('负面');
});
