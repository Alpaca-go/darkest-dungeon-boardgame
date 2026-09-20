import { expect, test } from '@playwright/test';
import type { SaveFile } from '../src/types';
import { C1C1_CORE_QUEST_IDS, PRODUCTION_PROOF_REGISTRY } from '../src/audit/production-proof-registry';
import { COMMUNITY_RUNTIME_QUESTS } from '../src/data/community-reference/production-runtime';
import { generateDungeon } from '../src/game-engine/dungeon';
import { recordQuestQualificationEvent } from '../src/game-engine/quests/quest-runtime';

const STORAGE_KEY = 'dd-web-prototype-save-v1';
const PARTY = ['Crusader', 'Vestal', 'Highwayman', 'Hellion'];

test(PRODUCTION_PROOF_REGISTRY['C1C1-E2E-COMMUNITY-QUEST'].proofId, async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('dd-fixed-rng', '20260920'));
  await page.goto('/');
  await page.getByTestId('runtime-content-profile').selectOption('community-complete-edition');
  await page.getByRole('button', { name: '新建战役' }).click();
  for (const hero of PARTY) await page.getByText(hero, { exact: true }).first().click();
  await page.getByRole('button', { name: '继续（技能配置）' }).click();
  await page.getByRole('button', { name: '使用默认配置（全部英雄）' }).click();
  await page.getByRole('button', { name: '继续（任务选择）' }).click();

  await expect(page).toHaveURL(/\/quests$/);
  for (const id of C1C1_CORE_QUEST_IDS.slice(0, 2)) await expect(page.getByTestId(`quest-${id}`)).toBeVisible();
  for (const id of C1C1_CORE_QUEST_IDS.slice(4, 6)) await expect(page.getByTestId(`quest-${id}`)).toBeVisible();
  expect(COMMUNITY_RUNTIME_QUESTS.map((quest) => quest.id)).toEqual([...C1C1_CORE_QUEST_IDS]);
  for (const id of C1C1_CORE_QUEST_IDS) {
    const dungeon = generateDungeon(id, 'e2e-proof');
    expect(dungeon.questId).toBe(id);
    expect(dungeon.rooms.filter((room) => room.sourceRoomToken)).toHaveLength(8);
  }

  const selectedId = C1C1_CORE_QUEST_IDS[0];
  await page.getByTestId(`quest-${selectedId}`).click();
  await expect(page).toHaveURL(/\/dungeon$/);
  const selectedRaw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  const selected = JSON.parse(selectedRaw!) as SaveFile;
  expect(selected.campaign.currentQuestId).toBe(selectedId);
  expect(selected.campaign.dungeon?.questId).toBe(selectedId);
  expect(selected.campaign.questRuntimeState?.definitionId).toBe(selectedId);

  const rooms = selected.campaign.dungeon!.rooms.filter((room) => room.id !== 'start').slice(0, 2);
  let progressed = recordQuestQualificationEvent(selected.campaign, { ...rooms[0], status: 'cleared' });
  progressed = recordQuestQualificationEvent(progressed, { ...rooms[1], status: 'cleared' });
  const partialSave: SaveFile = { ...selected, campaign: progressed };
  await page.evaluate(([key, value]) => window.localStorage.setItem(key, value), [STORAGE_KEY, JSON.stringify(partialSave)]);
  await page.reload();
  await expect(page.getByTestId('leave-dungeon')).toBeVisible();
  await page.getByTestId('leave-dungeon').click();
  await page.getByTestId('leave-dungeon-confirm-ok').click();
  await expect(page).toHaveURL(/\/result$/);

  const resultRaw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  const result = JSON.parse(resultRaw!) as SaveFile;
  expect(result.campaign.currentQuestId).toBe(selectedId);
  expect(result.campaign.pendingQuestXp?.xpPerHero).toBe(1);
  expect(result.campaign.lastQuestResult?.outcome).toBe('incomplete');

  await page.getByTestId('return-hamlet').click();
  await expect(page).toHaveURL(/\/hamlet$/);
  const hamletRaw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  const hamlet = JSON.parse(hamletRaw!) as SaveFile;
  expect(hamlet.campaign.heroes.every((hero) => hero.xpState.currentXp === 1)).toBe(true);
});
