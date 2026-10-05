import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import type { CampaignState } from '../src/types';

const replayStates = new WeakMap<Page, Array<{ point: string; campaign: CampaignState }>>();
function observe(page: Page, point: string, campaign: CampaignState) {
  const states = replayStates.get(page) ?? [];
  if (!states.some(s => s.point === point)) states.push({ point, campaign });
  replayStates.set(page, states);
}

/** Inspection only: every mutation in this test is a visible player control. */
async function saved(page: Page): Promise<CampaignState> {
  return page.evaluate(() => {
    const value = Object.values(localStorage).map(text => { try { return JSON.parse(text); } catch { return null; } })
      .find(entry => entry?.campaign?.id);
    if (!value) throw new Error('Player save unavailable');
    return value.campaign;
  });
}

async function fight(page: Page, inspect?: (c: CampaignState) => Promise<void>) {
  for (let step = 0; step < 200; step++) {
    const frame = await saved(page), battle = frame.battle;
    if (battle) {
      const domain = battle.ruinsContext ? 'ordinary' : 'boss';
      observe(page, `${domain}-battle-${battle.status}`, frame);
      if (battle.pendingMonsterAttack) observe(page, `${domain}-incoming-reaction`, frame);
      if (battle.ruinsContext?.pendingChoice) observe(page, 'ordinary-movement-choice', frame);
      if (battle.ruinsContext?.pendingReanimationChoice) observe(page, 'ordinary-reanimation-choice', frame);
      if (battle.ruinsContext?.retiredMonsterInstances?.length) observe(page, 'after-ordinary-death', frame);
      if (battle.heroes.some(h => h.id === battle.activeActorId)) observe(page, `${domain}-hero-turn-before-skill`, frame);
    }
    if (await page.getByTestId('trinket-use-overlay').count()) {
      const decline = page.locator('[data-testid^="trinket-decline-"]');
      if (await decline.count()) { await decline.first().click(); continue; }
    }
    const c = await saved(page), b = c.battle;
    if (inspect) await inspect(c);
    if (!b) return;
    if (b.status === 'victory') {
      await page.getByRole('button', { name: '领取奖励并返回地牢', exact: true }).click();
      observe(page, `${b.ruinsContext ? 'ordinary' : 'boss'}-after-settlement`, await saved(page));
      return;
    }
    expect(b.status, JSON.stringify({ round: b.round, log: b.battleLog.slice(-5) })).not.toBe('defeat');
    if (await page.getByTestId('boss-pending-choice').count()) {
      await page.getByTestId('boss-choice-candidate').first().click();
      await page.getByTestId('boss-choice-confirm').click();
      continue;
    }
    const ordinaryChoice = page.getByRole('region', { name: 'Ruins 待决选择' });
    if (await ordinaryChoice.count()) { await ordinaryChoice.getByRole('button').first().click(); continue; }
    const actor = b.heroes.find(u => u.id === b.activeActorId);
    expect(actor, JSON.stringify({ active: b.activeActorId, pending: b.pendingMonsterAttack, phase: c.gamePhase })).toBeTruthy();
    let acted = false;
    for (const id of actor!.equippedSkillIds ?? []) {
      const skill = page.getByTestId(`skill-${id}`);
      if (!await skill.count() || !await skill.isEnabled() || !(await skill.innerText()).includes('伤害')) continue;
      await skill.click();
      const targets = page.getByTestId('monster-side').locator('[data-legal-target="true"]');
      if (!await targets.count()) { await skill.click(); continue; }
      const bone = b.monsters.find(m => m.sourceId.startsWith('bone-') && m.isAlive);
      const boneTarget = bone ? page.getByTestId(`actor-${bone.id}`) : targets.first();
      if (bone && await boneTarget.getAttribute('data-legal-target') === 'true') await boneTarget.click();
      else await targets.first().click();
      acted = true;
      break;
    }
    if (!acted) await page.getByTestId('end-turn').click();
  }
  throw new Error('Player Battle exceeded action budget');
}

async function move(page: Page, roomId: string, inspect?: (c: CampaignState) => Promise<void>) {
  await page.getByTestId(`dungeon-room-${roomId}`).click();
  const c = await saved(page);
  if (c.battle?.ruinsContext) observe(page, 'after-draw-state-and-encounter-creation', c);
  expect(c.dungeon?.currentRoomId).toBe(roomId);
  if (c.battle) await fight(page, inspect);
}

function path(c: CampaignState, target: string): string[] {
  const d = c.dungeon!, queue: string[][] = [[d.currentRoomId]], seen = new Set<string>();
  while (queue.length) {
    const route = queue.shift()!, current = route.at(-1)!;
    if (current === target) return route.slice(1);
    if (seen.has(current)) continue;
    seen.add(current);
    for (const id of d.rooms.find(r => r.id === current)!.adjacentRoomIds) queue.push([...route, id]);
  }
  throw new Error('Room unreachable');
}

test('new Complete Edition player reaches Level I source ordinary Threat, Boss victory and campaign advancement', async ({ page }, info) => {
  test.setTimeout(300_000);
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('runtime-content-profile')).toBeVisible({ timeout: 120_000 });
  await page.getByTestId('runtime-content-profile').selectOption('community-complete-edition');
  await page.getByRole('button', { name: '新建战役', exact: true }).click();
  for (const hero of ['Crusader', 'Leper', 'Highwayman', 'Vestal']) await page.getByText(hero, { exact: true }).first().click();
  await page.getByRole('button', { name: '继续（技能配置）', exact: true }).click();
  await page.getByRole('button', { name: '使用默认配置（全部英雄）', exact: true }).click();
  await page.getByRole('button', { name: '继续（任务选择）', exact: true }).click();
  await page.getByTestId('migrate-hero-dodge-v2').click();
  await page.getByTestId('select-production-ruins-v6').click();

  // Earn the existing 2/2 gate through normal source-backed Standard Quest and Hamlet controls.
  for (let quest = 0; quest < 2; quest++) {
    await page.locator('[data-testid^="quest-community-"]').first().click();
    expect((await saved(page)).campaignProgress.activeBossFamilyId).toBe('necromancer');
    for (const target of ['E', 'H']) for (const room of path(await saved(page), target)) await move(page, room);
    await page.getByTestId('leave-dungeon').click();
    await page.getByTestId('leave-dungeon-confirm-ok').click();
    await page.getByTestId('return-hamlet').click();
    for (let day = 0; day < 8; day++) {
      const c = await saved(page);
      if (c.gamePhase === 'quest-select') break;
      for (const h of c.heroes.filter(h => !h.dead && !h.hasActedToday)) await page.getByTestId(`skip-${h.instanceId}`).click();
      await page.getByTestId('end-day').click();
    }
    await expect(page).toHaveURL(/quests/);
    expect((await saved(page)).campaignProgress.completedStandardQuestsThisAct).toBe(quest + 1);
  }
  await page.getByTestId('quest-face-the-threat').click();
  let c = await saved(page);
  observe(page, 'after-face-the-threat-selection', c);
  const identity = c.bossEncounterCheckpoint!.checkpointContext!.encounterId;
  const bossRoom = c.bossRoomStorage!.roomId;
  const guarded = c.dungeon!.rooms.find(r => r.sourceRoomToken === 'lair')!;
  for (const room of path(c, guarded.id)) await move(page, room);
  c = await saved(page);
  expect(c.ruinsDrawState!.encounters.some(e => e.returned)).toBe(true);
  expect(c.bossEncounterCheckpoint!.checkpointContext!.encounterId).toBe(identity);
  expect(c.bossEncounterCheckpoint!.events.some(e => e.eventType === 'ORDINARY_THREAT_BATTLE_ENTERED')).toBe(true);
  await page.reload();
  c = await saved(page);
  for (const room of path(c, bossRoom)) await move(page, room);
  c = await saved(page);
  expect(c.bossEncounterHistory!.at(-1)!.checkpointContext!.encounterId).toBe(identity);
  expect(c.bossEncounterHistory!.at(-1)!.cleanupState.completed).toBe(true);
  expect(c.campaignProgress.defeatedBossFamilyIds).toContain('necromancer');
  expect(c.campaignProgress.act).toBe(2);
  expect(c.bossRoomStorage!.lifecycle).toBe('RETURNED');
  await page.reload();
  expect((await saved(page)).campaignProgress).toEqual(c.campaignProgress);
  expect(errors).toEqual([]);
  fs.mkdirSync('docs/data/complete-edition', { recursive: true });
  fs.writeFileSync('docs/data/complete-edition/c1c32r3r-browser-level1-replay-states.json', JSON.stringify(replayStates.get(page)) + '\n');
  fs.writeFileSync('docs/data/complete-edition/c1c32r3r-browser-level1-observation.json', JSON.stringify({ status: 'PASS', fixtureInjection: false, identity, standardHistory: c.necromancerQuestThreatHistory, ordinaryEncounters: c.ruinsDrawState!.encounters, encounter: c.bossEncounterHistory!.at(-1), progress: c.campaignProgress }, null, 2) + '\n');
  await info.attach('level-I-player-route', { body: JSON.stringify({ fixtureInjection: false, identity,
    ordinaryEncounters: c.ruinsDrawState!.encounters, encounter: c.bossEncounterHistory!.at(-1), progress: c.campaignProgress }), contentType: 'application/json' });
});

for (const level of [2, 3] as const) test(`Level ${level} focused campaign prerequisite, real player Quest/Preparation/Battle/reload/Boss controls`, async ({ page }, info) => {
  test.setTimeout(360_000);
  page.setDefaultTimeout(20_000);
  page.setDefaultNavigationTimeout(120_000);
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('runtime-content-profile')).toBeVisible({ timeout: 120_000 });
  // Only the campaign Act prerequisite is supplied. No Quest, Battle, checkpoint, draw, death or choice fixture.
  await page.evaluate(async level => {
    const load = (p: string) => import(/* @vite-ignore */ p);
    const [{ createNewCampaign, selectParty, applyDefaultLoadout }, { saveCampaign }, { seededRuntimeSources, withRuntimeSources }] = await Promise.all([
      load('/src/game-engine/campaign.ts'), load('/src/game-engine/save.ts'), load('/src/game-engine/runtime-sources.ts')]);
    const c = withRuntimeSources(seededRuntimeSources(3233), () => applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), ['crusader', 'leper', 'highwayman', 'vestal'])));
    c.gamePhase = 'quest-select';
    Object.assign(c.campaignProgress, { act: level, campaignLevel: level,
      defeatedBossFamilyIds: level === 3 ? ['prophet', 'hag'] : ['prophet'] });
    saveCampaign(c);
  }, level);
  await page.goto('/quests');
  await page.getByTestId('migrate-hero-dodge-v2').click();
  await page.getByTestId('select-production-ruins-v6').click();
  const preparationProof: unknown[] = [];
  for (let quest = 0; quest < 2; quest++) {
    await page.locator('[data-testid^="quest-community-"]').first().click();
    await page.getByTestId('leave-dungeon').click();
    await page.getByTestId('leave-dungeon-confirm-ok').click();
    await page.getByTestId('return-hamlet').click();
    await page.reload();
    let c = await saved(page);
    expect(c.necromancerPreparationDay).toBeTruthy();
    observe(page, 'preparation-' + c.necromancerPreparationDay!.status, c);
    const guard = page.getByRole('region', { name: 'Graveyard 守卫任务' });
    if (c.necromancerPreparationDay!.status === 'PENDING_TIE') await guard.getByRole('button').first().click();
    await guard.getByRole('button', { name: '前往墓地', exact: true }).click();
    if (level === 2) {
      await page.reload();
      observe(page, 'preparation-level-II-effect-choice', await saved(page));
      await guard.getByRole('button', { name: quest === 0 ? '使用效果' : '只完成守卫', exact: true }).click();
    } else await expect(guard.getByRole('button', { name: '使用效果', exact: true })).toHaveCount(0);
    c = await saved(page);
    expect(c.necromancerPreparationDay!.status).toBe('COMMITTED');
    preparationProof.push({ preparation: c.necromancerPreparationDay, receipts: c.necromancerGraveyardReceipts });
    for (let day = 0; day < 8; day++) {
      c = await saved(page); if (c.gamePhase === 'quest-select') break;
      for (const h of c.heroes.filter(h => !h.dead && !h.hasActedToday)) await page.getByTestId(`skip-${h.instanceId}`).click();
      await page.getByTestId('end-day').click();
    }
  }
  await page.getByTestId('quest-face-the-threat').click();
  let c = await saved(page);
  observe(page, 'after-face-the-threat-selection', c);
  const identity = c.bossEncounterCheckpoint!.checkpointContext!.encounterId;
  const bossRoom = c.bossRoomStorage!.roomId;
  const initial = c;
  let scenario: Record<string, unknown> | null = null;
  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const inspect = async (state: CampaignState) => {
    const spawned = state.bossEncounterCheckpoint?.events.find(e => e.eventType === 'REANIMATION_SPAWNED');
    if (level !== 3 || !spawned || scenario) return;
    const preSave = state;
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('dd-web-prototype-save-v1')!));
    await page.reload();
    const reloaded = await saved(page);
    expect(reloaded).toEqual(preSave);
    const detail = spawned.result as { instanceId: string; copyId: string; figureId: string | null; predecessorUnitId: string };
    const r = reloaded.battle!.ruinsContext!;
    expect(reloaded.battle!.monsters.some(m => m.id === detail.instanceId && m.isAlive)).toBe(true);
    expect(r.unitPhysicalBindings![detail.instanceId].copyId).toBe(r.unitPhysicalBindings![detail.predecessorUnitId].copyId);
    expect(r.retiredMonsterInstances!.some(m => m.unit.id === detail.predecessorUnitId && !m.unit.isAlive)).toBe(true);
    scenario = { status: 'PASS', productionProof: true, syntheticCombatFixture: false,
      campaignActPrerequisiteFixture: true, deathMutation: 'visible player skill controls', initialStateHash: hash(initial),
      preSaveHash: hash(preSave), saveHash: hash(save), reloadedHash: hash(reloaded),
      physicalOwnershipHash: hash({ draw: reloaded.ruinsDrawState, figures: reloaded.ruinsBoneFigureSupply, bindings: r.unitPhysicalBindings }),
      ruleSetVersion: reloaded.bossEncounterCheckpoint!.ruleSetVersion, spawned: detail };
  };
  const guarded = c.dungeon!.rooms.find(r => r.sourceRoomToken === 'lair')!;
  for (const room of path(c, guarded.id)) await move(page, room, inspect);
  c = await saved(page);
  expect(c.bossEncounterCheckpoint!.checkpointContext!.encounterId).toBe(identity);
  await page.reload();
  for (const room of path(await saved(page), bossRoom)) await move(page, room, inspect);
  c = await saved(page);
  expect(c.bossEncounterHistory!.at(-1)!.cleanupState.completed).toBe(true);
  if (level === 3) {
    expect(scenario).toBeTruthy();
    Object.assign(scenario!, { finalStateHash: hash(c), eventSequenceHash: hash(c.bossEncounterHistory!.at(-1)!.events) });
    fs.writeFileSync('docs/data/complete-edition/c1c32r3r-scenario-c-proof.json', JSON.stringify(scenario, null, 2) + '\n');
  }
  const proof = { status: 'PASS', campaignActPrerequisiteFixture: true, syntheticCombatFixture: false, identity,
    preparationProof, ordinaryEncounters: c.ruinsDrawState!.encounters, encounter: c.bossEncounterHistory!.at(-1), progress: c.campaignProgress };
  fs.writeFileSync(`docs/data/complete-edition/c1c32r3r-browser-level${level}-replay-states.json`, JSON.stringify(replayStates.get(page)) + '\n');
  fs.writeFileSync(`docs/data/complete-edition/c1c32r3r-browser-level${level}-observation.json`, JSON.stringify(proof, null, 2) + '\n');
  await info.attach(`level-${level}-focused-player-route`, { body: JSON.stringify(proof), contentType: 'application/json' });
});
