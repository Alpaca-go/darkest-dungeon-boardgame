import { expect, test } from '@playwright/test';
import type { CampaignState, SaveFile } from '../src/types';
import { CAMOUFLAGE_CLOAK_ID, PROTECTIVE_PADLOCK_ID, PRODUCTION_PROOF_REGISTRY } from '../src/audit/production-proof-registry';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../src/game-engine/campaign';
import { generateDungeon } from '../src/game-engine/dungeon';
import { initBattle, prepareMonsterAttackResolution } from '../src/game-engine/battle';
import { acquireTrinket } from '../src/game-engine/trinkets/acquire-trinket';
import { advancePendingMonsterAttack } from '../src/game-engine/trinkets/battle-trinket-bridge';
import { createSaveSnapshot } from '../src/game-engine/save';
import { setRandomSource } from '../src/game-engine/random';
import { getMonsterSkillById } from '../src/data/monster-skills';

const registrations = [
  PRODUCTION_PROOF_REGISTRY['C1C8-E2E-PROTECTIVE-POSITIVE'],
  PRODUCTION_PROOF_REGISTRY['C1C8-E2E-CAMOUFLAGE-POSITIVE'],
];
if (registrations.some((entry) => entry.runner !== 'playwright' || entry.proofSurface !== 'production-ui')) {
  throw new Error('C1C-8 E2E proofs must use production UI');
}

function incomingSave(trinketId: string, advanceToHit: boolean): SaveFile {
  setRandomSource(() => 0);
  try {
    let campaign: CampaignState = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
      ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
    campaign = { ...campaign, currentQuestId: 'c1c8-e2e', dungeon: generateDungeon('c1c8-e2e') };
    campaign = initBattle(campaign, 'A');
    const monster = campaign.battle!.monsters[0];
    const heroes = campaign.battle!.heroes.map((hero) => ({ ...hero, hp: 99, maxHp: 99 }));
    const monsters = campaign.battle!.monsters.map((unit, index) => index === 0
      ? { ...unit, isAlive: true, hp: Math.max(1, unit.hp) }
      : { ...unit, isAlive: false, hp: 0 });
    let battle = { ...campaign.battle!, heroes, monsters, activeActorId: monster.id, initiativeIndex: 0,
      initiativeOrder: [monster.id, ...heroes.map((hero) => hero.id)], pendingMonsterAttack: null,
      stagedIncomingAttacks: true, status: 'active' as const };
    battle = prepareMonsterAttackResolution(battle, monster.id);
    const target = battle.heroes.find((hero) => hero.id === battle.pendingMonsterAttack!.targetHeroUnitId)!;
    campaign = acquireTrinket({ ...campaign, battle }, {
      trinketId, source: 'debug', sourceEventId: `c1c8-e2e:${trinketId}`, heroId: target.sourceId,
    }).campaign;
    if (trinketId === CAMOUFLAGE_CLOAK_ID) {
      const accuracy = getMonsterSkillById(campaign.battle!.pendingMonsterAttack!.skillId)?.accuracy ?? 7;
      campaign = { ...campaign, battle: { ...campaign.battle!, pendingMonsterAttack: {
        ...campaign.battle!.pendingMonsterAttack!, attackRoll: accuracy,
      } } };
    }
    if (advanceToHit) campaign = advancePendingMonsterAttack(campaign);
    else campaign = advancePendingMonsterAttack(campaign); // opens incoming window and pauses before hit resolution
    return createSaveSnapshot(campaign);
  } finally {
    setRandomSource(null);
  }
}

async function importSave(page: import('@playwright/test').Page, save: SaveFile, name: string) {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)) });
  await expect(page.getByTestId('home-notice')).toContainText('存档导入成功');
}

test(registrations[0].proofId, async ({ page }) => {
  await importSave(page, incomingSave(PROTECTIVE_PADLOCK_ID, true), 'c1c8-padlock.json');
  await expect(page.getByTestId('incoming-attack-context')).toContainText('攻击已命中');
  await expect(page.getByTestId('trinket-use-overlay')).toContainText('本次伤害 ×1/2');
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
  await page.getByTestId('btn-continue').click();
  await expect(page.getByText(/造成 \d+ 伤害/).last()).toBeVisible();
});

test(registrations[1].proofId, async ({ page }) => {
  await importSave(page, incomingSave(CAMOUFLAGE_CLOAK_ID, false), 'c1c8-cloak.json');
  await expect(page.getByTestId('incoming-attack-context')).toContainText('冻结骰点');
  await expect(page.getByTestId('trinket-use-overlay')).toContainText('闪避 +2');
  await page.getByTestId('trinket-use-overlay').getByRole('button', { name: '使用' }).click();
  await page.getByTestId('btn-continue').click();
  await expect(page.getByText(/未命中/).last()).toBeVisible();
});
