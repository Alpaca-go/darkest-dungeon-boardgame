import { expect, test } from '@playwright/test';
import type { CampaignState, SaveFile } from '../src/types';
import { BLOODTHIRST_RING_ID, PRODUCTION_PROOF_REGISTRY } from '../src/audit/production-proof-registry';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../src/game-engine/campaign';
import { generateDungeon } from '../src/game-engine/dungeon';
import { initBattle, prepareMonsterAttackResolution } from '../src/game-engine/battle';
import { acquireTrinket } from '../src/game-engine/trinkets/acquire-trinket';
import { advancePendingMonsterAttack } from '../src/game-engine/trinkets/battle-trinket-bridge';
import { createSaveSnapshot } from '../src/game-engine/save';
import { setRandomSource } from '../src/game-engine/random';

const registration = PRODUCTION_PROOF_REGISTRY['C1C11-E2E-BLOODTHIRST-NEGATIVE'];
if (registration.runner !== 'playwright' || registration.proofSurface !== 'production-ui') {
  throw new Error('C1C-11 E2E proof must use production UI');
}

function bloodthirstSave(): { save: SaveFile; targetUnitId: string } {
  setRandomSource(() => 0);
  try {
    let campaign: CampaignState = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
      ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
    campaign = { ...campaign, currentQuestId: 'c1c11-e2e', dungeon: generateDungeon('c1c11-e2e') };
    campaign = initBattle(campaign, 'A');
    const monster = campaign.battle!.monsters[0];
    const selectedTarget = campaign.battle!.heroes[1];
    const heroes = campaign.battle!.heroes.map((hero) => ({
      ...hero, hp: 99, maxHp: 99,
      ...(hero.id === selectedTarget.id ? { immunities: [], categoricalResistances: [], resistances: {
        stun: 0, bleed: 0, blight: 0, disease: 0, debuff: 0, move: 0,
      } } : {}),
    }));
    const monsters = campaign.battle!.monsters.map((unit, index) => index === 0
      ? { ...unit, isAlive: true, hp: Math.max(1, unit.hp) }
      : { ...unit, isAlive: false, hp: 0 });
    let battle = { ...campaign.battle!, heroes, monsters, activeActorId: monster.id, initiativeIndex: 0,
      initiativeOrder: [monster.id, ...heroes.map((hero) => hero.id)], pendingMonsterAttack: null,
      stagedIncomingAttacks: true, status: 'active' as const };
    battle = prepareMonsterAttackResolution(battle, monster.id);
    battle = { ...battle, pendingMonsterAttack: {
      ...battle.pendingMonsterAttack!, targetHeroUnitId: selectedTarget.id,
      skillId: 'bone-soldier-cleave', attackRoll: 1,
    } };
    campaign = acquireTrinket({ ...campaign, battle }, {
      trinketId: BLOODTHIRST_RING_ID, source: 'debug', sourceEventId: 'c1c11-e2e-ring', heroId: selectedTarget.sourceId,
    }).campaign;
    campaign = { ...campaign, heroes: campaign.heroes.map((hero) => hero.instanceId === selectedTarget.sourceId ? {
      ...hero, equippedTrinkets: hero.equippedTrinkets.map((trinket) => ({ ...trinket, currentSide: 'negative' as const })),
    } : hero) };
    campaign = advancePendingMonsterAttack(campaign);
    return { save: createSaveSnapshot(campaign), targetUnitId: selectedTarget.id };
  } finally {
    setRandomSource(null);
  }
}

async function importSave(page: import('@playwright/test').Page, fixture: { save: SaveFile }) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'c1c11-bloodthirst.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture.save)),
  });
  await expect(page.getByTestId('home-notice')).toContainText('存档导入成功');
}

test(registration.proofId, async ({ page }) => {
  const fixture = bloodthirstSave();
  await importSave(page, fixture);
  await expect(page.getByTestId('incoming-attack-context')).toContainText('攻击已命中');
  await expect(page.getByTestId('trinket-use-overlay')).toContainText('bleed');
  await expect(page.getByTestId('trinket-use-overlay')).toContainText('3');
  await expect(page.getByTestId('trinket-use-overlay')).toContainText('持续 2 回合');
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect(page.getByTestId(`actor-${fixture.targetUnitId}`)).toContainText('流血3');
  await page.getByTestId(`actor-${fixture.targetUnitId}`).click();
  await expect(page.getByTestId(`trinket-${BLOODTHIRST_RING_ID}`)).toContainText('正面');

  const declined = bloodthirstSave();
  await importSave(page, declined);
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '跳过' }).click();
  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect(page.getByTestId(`actor-${declined.targetUnitId}`)).not.toContainText('流血');
  await page.getByTestId(`actor-${declined.targetUnitId}`).click();
  await expect(page.getByTestId(`trinket-${BLOODTHIRST_RING_ID}`)).toContainText('负面');
});
