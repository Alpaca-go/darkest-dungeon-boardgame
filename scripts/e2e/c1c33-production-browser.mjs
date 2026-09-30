import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// Reuse the accepted player route verbatim; redirect output, augment reload assertions only.
const input = 'e2e/c1c32r3r-production-threat-full-path.spec.ts';
const output = 'e2e/c1c33-generated-production.spec.ts';
let source = readFileSync(input, 'utf8').replaceAll('c1c32r3r-browser-', 'c1c33-browser-')
  .replaceAll('c1c32r3r-scenario-c-proof.json', 'c1c33-browser-scenario-c-proof.json');
source = source.replace('const replayStates =', `
const reloadCoverage = new Set<string>();
const externalRequests = new Set<string>();
async function resolveQuestChoice(page: Page) {
  const choice = page.getByTestId('quest-rule-choice');
  if (await choice.count()) await choice.locator('button:not([disabled])').first().click();
}
test.beforeEach(async ({page}) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return route.continue();
    externalRequests.add(url.origin);
    return route.abort();
  });
});
const reloadedPoints = new WeakMap<Page, Set<string>>();
async function reloadPoint(page: Page, point: string, before: CampaignState) {
  const seen = reloadedPoints.get(page) ?? new Set<string>();
  if (seen.has(point)) return;
  seen.add(point); reloadedPoints.set(page, seen);
  await page.reload();
  expect(await saved(page)).toEqual(before);
  reloadCoverage.add(point);
}
test.afterAll(() => {
  fs.writeFileSync('docs/data/complete-edition/c1c33-browser-reload-matrix.json', JSON.stringify({status: 'PASS', points: [...reloadCoverage], externalNetworkBlocked: true, externalRequests: [...externalRequests]}, null, 2) + '\\n');
});
const replayStates =`);
source = source.replace('if (battle) {', `if (battle) {
      const questChoice = page.getByTestId('quest-rule-choice');
      if (await questChoice.count()) {
        await resolveQuestChoice(page);
        continue;
      }
      await reloadPoint(page, battle.ruinsContext
        ? battle.monsters.some(m => m.sourceId === 'bone-captain') ? 'Captain Battle' : 'ordinary Battle'
        : 'Boss Battle', frame);
      if (battle.ruinsContext?.retiredMonsterInstances?.length || battle.ruinsContext?.pendingReanimationChoice)
        await reloadPoint(page, 'Reanimation', frame);`);
source = source.replaceAll("observe(page, 'after-face-the-threat-selection', c);", "observe(page, 'after-face-the-threat-selection', c); await reloadPoint(page, 'Boss Room', c);");
source = source.replace('await page.getByTestId(`dungeon-room-${roomId}`).click();',
  'await resolveQuestChoice(page); await page.getByTestId(`dungeon-room-${roomId}`).click(); await resolveQuestChoice(page);');
// Inject once before first Preparation UI mutation, after the prerequisite is established.
source = source.replace("observe(page, 'preparation-' + c.necromancerPreparationDay!.status, c);",
  "observe(page, 'preparation-' + c.necromancerPreparationDay!.status, c); await reloadPoint(page, 'Preparation Day', c);");
// Extend Standard Quest coverage without changing the accepted Face the Threat / Scenario C route.
const higherStart = source.indexOf('for (const level of [2, 3] as const) test(');
const setupStart = source.indexOf('  test.setTimeout(360_000);', higherStart);
const setupEnd = source.indexOf('  const preparationProof:', setupStart);
if (higherStart < 0 || setupStart < 0 || setupEnd < 0) throw new Error('Accepted R3R higher-level setup changed');
const setup = source.slice(setupStart, setupEnd);
source += `
for (const level of [2, 3] as const) test('C1C33 Level ' + level + ' Standard Quest ordinary Threat archive and Preparation', async ({page}) => {
${setup}
  await page.locator('[data-testid^="quest-community-"]').first().click();
  let c = await saved(page);
  const initialIdentity = c.bossEncounterCheckpoint!.checkpointContext!;
  expect(initialIdentity.questScope).toBe('STANDARD');
  const guarded = c.dungeon!.rooms.find(r => r.sourceRoomToken === 'lair')!;
  for (const room of path(c, guarded.id)) await move(page, room);
  c = await saved(page);
  expect(c.ruinsDrawState!.encounters.some(e => e.returned)).toBe(true);
  expect(c.bossEncounterCheckpoint!.checkpointContext).toMatchObject({questRunId: initialIdentity.questRunId, encounterId: initialIdentity.encounterId, threatId: initialIdentity.threatId});
  const settled = c;
  await page.getByTestId('leave-dungeon').click();
  await page.getByTestId('leave-dungeon-confirm-ok').click();
  expect((await saved(page)).lastQuestResult!.outcome).toBe('completed');
  await page.getByTestId('return-hamlet').click();
  c = await saved(page);
  expect(c.bossEncounterCheckpoint).toBeNull();
  expect(c.activeThreatRuntime!.active).toBe(true);
  expect(c.necromancerQuestThreatHistory!.at(-1)!.checkpoint.checkpointContext!.encounterId).toBe(initialIdentity.encounterId);
  await reloadPoint(page, 'Preparation Day', c);
  fs.writeFileSync('docs/data/complete-edition/c1c33-standard-level' + level + '-observation.json', JSON.stringify({status: 'PASS', campaignActPrerequisiteFixture: true,
    syntheticCombatFixture: false, settled, archived: c, identity: initialIdentity}, null, 2) + '\\n');
});
`;
writeFileSync(output, source);
try {
  execFileSync(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', output, ...process.argv.slice(2)], {stdio: 'inherit'});
} finally { unlinkSync(output); }
