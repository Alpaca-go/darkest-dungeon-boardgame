import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { drawDarkestDungeonMonster } from '../../../game-engine/campaign/act-four/content-runtime';
import { COMMUNITY_RUNTIME_BLOCKERS } from './runtime-profile';
import { COMMUNITY_GUARDIAN_SKILL_COVERAGE } from './special-skill-coverage';
import { resolveCommunityMonsterTarget } from '../../../game-engine/campaign/act-four/community-monster-targeting';
import { communityGuardianMonsterSkills } from '../../../game-engine/campaign/act-four/community-guardian-combat';

const SPECIAL_SKILL_SUITE = 'src/data/darkest-dungeon/community-reference/community-guardian-special-skill.test.ts';
const PLACEMENT_SUITE = 'src/data/darkest-dungeon/community-reference/community-physical-monster-placement-production.test.ts';
const SAVE_REPLAY_SUITE = 'src/data/darkest-dungeon/community-reference/community-guardian-room-save-replay.test.ts';
const TARGETING_SUITE = 'src/data/darkest-dungeon/community-reference/community-monster-targeting-adversarial.test.ts';
const read = (path: string, _encoding?: BufferEncoding) => readFileSync(path, 'utf8');

function runGuardianMutation(
  edits: Array<{ file: string; from: string; to: string }> | string,
  fromOrSuite?: string,
  toOrTitle?: string,
  suiteArg?: string,
  titleArg?: string,
) {
  const root = process.cwd();
  const normalized: Array<{ file: string; from: string; to: string }> = Array.isArray(edits)
    ? edits
    : [{ file: edits, from: fromOrSuite!, to: toOrTitle! }];
  const suite = Array.isArray(edits) ? fromOrSuite! : suiteArg!;
  const titlePrefix = Array.isArray(edits) ? toOrTitle! : titleArg!;

  for (const edit of normalized) {
    if (readFileSync(resolve(root, edit.file), 'utf8').split(edit.from).length !== 2) {
      throw new Error(`Mutation anchor must occur once: ${edit.file} :: ${edit.from}`);
    }
  }
  const scratch = mkdtempSync(join(tmpdir(), 'community-r1-mutation-'));
  const reportPath = join(scratch, 'result.json');
  const configPath = join(scratch, 'vite.config.mts');
  const baseConfig = resolve(root, 'vite.config.ts').split('\\').join('/');
  const editLiteral = JSON.stringify(normalized);
  writeFileSync(configPath, `import base from ${JSON.stringify(baseConfig)};
const edits = ${editLiteral};
export default { ...base, root: ${JSON.stringify(root)}, plugins: [...base.plugins, { name: 'r1-guardian-mutation', enforce: 'pre', transform(code, id) {
  const normalizedId = id.replaceAll('\\\\','/').split('?')[0];
  let next = code;
  let touched = false;
  for (const edit of edits) {
    if (!normalizedId.endsWith('/' + edit.file)) continue;
    if (!next.includes(edit.from)) throw new Error('Mutation anchor missing: ' + edit.file);
    next = next.replace(edit.from, edit.to);
    touched = true;
  }
  return touched ? next : null;
} }], test: { ...base.test, pool: 'forks', maxWorkers: 1, minWorkers: 1 } };\n`);
  const result = spawnSync(
    process.execPath,
    [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', suite, '--config', configPath, '--reporter=json', `--outputFile=${reportPath}`],
    { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const flat: Array<{ title: string; status: string }> = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const value = node as Record<string, unknown>;
    if (typeof value.title === 'string' && typeof value.status === 'string') {
      flat.push({ title: value.title, status: value.status });
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(walk);
      else walk(child);
    }
  };
  walk(report);
  const matching = flat.filter((row) => row.title.includes(titlePrefix) || row.title.startsWith(titlePrefix));
  return {
    exitCode: result.status,
    discovered: matching.length,
    failed: matching.filter((row) => row.status === 'failed').length,
    matching,
    diagnostics: `${result.stdout}\n${result.stderr}\nmatching=${JSON.stringify(matching)}`,
  };
}

describe('Community Guardian / Room R1 adversarial mutation gate (WP-7)', () => {
  it('keeps TEMPLARS_PIT_EXIT_RULE_UNRESOLVED as the only R1 source blocker', () => {
    const codes = COMMUNITY_RUNTIME_BLOCKERS.map((blocker) => blocker.code);
    expect(codes).toEqual([
      'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED',
      'FINAL_ROOM_TRANSITION_ENGINE_UNSUPPORTED',
      'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED',
      'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED',
      'COME_UNTO_YOUR_MAKER_UNRESOLVED',
    ]);
    expect(codes).toHaveLength(5);
  });

  it('rejects helper-direct as a production entry for coverage closure', () => {
    expect(COMMUNITY_GUARDIAN_SKILL_COVERAGE.every((entry) => (entry.productionEntryType as string) !== 'helper-direct')).toBe(true);
    expect(COMMUNITY_GUARDIAN_SKILL_COVERAGE.find((entry) => entry.localSkillId === 'the-finger')?.productionEntryType).toBe('monster-turn');
  });

  it('Body Slam event-only pit write (no Hero move) fails production proof', () => {
    const result = runGuardianMutation(
      'src/game-engine/campaign/act-four/community-guardian-special-skills.ts',
      'const toss = applyCommunityPitToss(next, tgt, pitTossRoll, `${eventId}:pit-toss`);',
      'const toss = { state: next, event: { eventId, heroId: tgt.id, roll: pitTossRoll, pitId: "mutated-pit", areaId: "mutated-area", ignored: false }, pitAreaId: "mutated-pit" };',
      SPECIAL_SKILL_SUITE,
      'Body Slam moves the Hero into the mapped Pit Area',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 120_000);

  it('Body Slam missing Bleed fails production proof', () => {
    const result = runGuardianMutation(
      'src/game-engine/campaign/act-four/community-guardian-room-state.ts',
      "} else if (effect.kind === 'condition' && effect.condition === 'bleed' && target.isAlive) {",
      "} else if (false && effect.kind === 'condition' && effect.condition === 'bleed' && target.isAlive) {",
      SPECIAL_SKILL_SUITE,
      'Body Slam moves the Hero into the mapped Pit Area',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 120_000);

  it('Stinger Shot missing Debuff fails production proof', () => {
    const result = runGuardianMutation(
      [
        {
          file: 'src/game-engine/campaign/act-four/community-guardian-combat.ts',
          from: "'stinger-shot': [{ type: 'blight', amount: 3, durationTurns: 3 }, { type: 'debuff', amount: 0, durationTurns: 2 }],",
          to: "'stinger-shot': [{ type: 'blight', amount: 3, durationTurns: 3 }],",
        },
        {
          file: 'src/game-engine/campaign/act-four/community-guardian-special-skills.ts',
          from: "'stinger-shot': { attack: true, blight: { amount: 3, durationTurns: 3 }, debuffTurns: 2 },",
          to: "'stinger-shot': { attack: true, blight: { amount: 3, durationTurns: 3 } },",
        },
      ],
      SPECIAL_SKILL_SUITE,
      'Stinger Shot applies Blight 3/3 and Debuff 2 turns together',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 120_000);

  it('Revivify exceeding max HP fails production proof', () => {
    const result = runGuardianMutation(
      'src/data/darkest-dungeon/community-reference/production-adapters.ts',
      "? { type: 'heal-monster' as const, amount: 15, target: 'self' as const }",
      "? { type: 'heal-monster' as const, amount: 999, target: 'self' as const }",
      SPECIAL_SKILL_SUITE,
      'Revivify heals self by 15 and never exceeds max HP',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 120_000);

  it('Reconstitute healing the wrong target fails production proof', () => {
    const result = runGuardianMutation(
      'src/data/darkest-dungeon/community-reference/production-adapters.ts',
      "amount: 14, target: 'ally' as const",
      "amount: 14, target: 'self' as const",
      SPECIAL_SKILL_SUITE,
      'Reconstitute heals Mammoth Cyst by 14 and applies Buff 2 turns',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 120_000);

  it('Displace using position + 2 instead of Room 11 Push fails production proof', () => {
    const result = runGuardianMutation(
      'src/game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action.ts',
      `if ('pushDistance' in leaf && leaf.pushDistance) {
      const push = startDisplacePush(working, {
        heroId: options.targetHeroId,
        awayFromActorId: card.actorId,
        distance: leaf.pushDistance,
        sourceActionEventId: initiativeCardId,
        now,
      });
      working = push.campaign;
      pendingChoice = push.pendingChoice;
    }`,
      `if ('pushDistance' in leaf && leaf.pushDistance) {
      const battleHero = working.battle?.heroes.find((unit) => unit.sourceId === options.targetHeroId);
      if (working.battle && battleHero) {
        working = {
          ...working,
          battle: {
            ...working.battle,
            heroes: working.battle.heroes.map((unit) =>
              unit.id === battleHero.id ? { ...unit, position: unit.position + 2 } : unit,
            ),
          },
        };
      }
    }`,
      SPECIAL_SKILL_SUITE,
      'Displace applies Debuff 2 and starts Room 11 Push 2',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 120_000);

  it('Teleport destination-only event without Area change fails production proof', () => {
    const result = runGuardianMutation(
      'src/game-engine/bosses/mammoth-cyst/resolve-teleportation.ts',
      'p.heroId === options.targetHeroId ? { ...p, areaId: target.areaId! } : p',
      'p.heroId === options.targetHeroId ? p : p',
      SPECIAL_SKILL_SUITE,
      'Teleport applies Stress +2 then Room 11 d10 relocation',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 120_000);

  it('Undulations helper-only proof is rejected by coverage entry binding', () => {
    expect(COMMUNITY_GUARDIAN_SKILL_COVERAGE.find((entry) => entry.localSkillId === 'undulations')).toMatchObject({
      productionEntryType: 'monster-turn',
      productionTestId: 'Undulations production Monster Turn redistributes living Heroes onto Stance slots',
    });
    const body = read(SPECIAL_SKILL_SUITE, 'utf8');
    const start = body.indexOf("it('Undulations production Monster Turn redistributes living Heroes onto Stance slots'");
    const next = body.indexOf("\n  it('", start + 1);
    const undulationsBody = body.slice(start, next < 0 ? undefined : next);
    expect(undulationsBody).toContain('runMonsterTurn');
    expect(undulationsBody).not.toContain('resolveUndulationsHeroStanceShuffle');
  });

  it('Echoing helper-only / missing Priest-Growth fails forced production proof', () => {
    const result = runGuardianMutation(
      'src/game-engine/campaign/act-four/community-guardian-special-skills.ts',
      'for (const role of COMMUNITY_ECHOING_SUMMON_ORDER) {',
      'for (const role of [] as typeof COMMUNITY_ECHOING_SUMMON_ORDER) {',
      SPECIAL_SKILL_SUITE,
      'Echoing Disassembly is forced when Monster Stance slots are not filled',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 120_000);

  it('The Finger helper-only Marked path without +5 fails Monster Turn proof', () => {
    const result = runGuardianMutation(
      'src/game-engine/campaign/act-four/community-guardian-combat.ts',
      'const damage = outcome.hit ? outcome.damage + bonus : 0;',
      'const damage = outcome.hit ? outcome.damage : 0;',
      SPECIAL_SKILL_SUITE,
      'The Finger Marked Hero Monster Turn adds exactly +5 damage',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 120_000);

  it('Monster targeting never degenerates to first living Hero', () => {
    const battle = createCommunityGuardianScenario(1).battle!;
    const monster = battle.monsters.find((unit) => unit.sourceId === 'community-dd-templars-impaler')!;
    const skill = communityGuardianMonsterSkills().find((entry) => entry.id.endsWith('torment') && entry.monsterId === monster.sourceId)!;
    const living = battle.heroes.filter((hero) => hero.isAlive).map((hero, index) => ({
      ...hero,
      stance: (['support', 'defensive', 'ranged', 'aggressive'] as const)[index % 4],
      position: index + 1,
    }));
    const firstLiving = living[0];
    const state = { ...battle, heroes: living };
    const resolved = resolveCommunityMonsterTarget(state, monster, 'torment', skill)!;
    expect(resolved.unit.stance).toBe('aggressive');
    expect(resolved.unit.id).not.toBe(firstLiving.id);
    expect(read(TARGETING_SUITE, 'utf8')).toContain('hero array order does not change Stance-priority target');
  });

  it('no-space unresolved tie does not auto-randomize a choice', () => {
    const result = runGuardianMutation(
      'src/game-engine/bosses/mammoth-cyst/summon-white-cell-stalk.ts',
      `    return pend({
      ...choiceBase,
      kind: 'summon-hero-displacement',
      heroId,
      heroCandidateIds: heroesInArea.length > 1 ? heroesInArea : [],
      monsterCandidateIds: [],
      destinationAreaIds: nearest.areaIds,
    });`,
      `    const autoHeroId = heroId ?? heroesInArea[0];
    const moved = applyMammothCystDisplacement(campaign, {
      kind: 'summon-hero-displacement',
      heroId: autoHeroId,
      toAreaId: nearest.areaIds[0],
      distance: nearest.distance,
      sourceActionEventId: options.sourceActionEventId,
      transactionId: displacementTransactionId,
      now,
    });
    if (!moved.ok) return { ...base, campaign: moved.campaign, state: moved.state, rolledBack: true, reason: moved.reason };
    return summonWhiteCellStalk(moved.campaign, options);`,
      SAVE_REPLAY_SUITE,
      'SR-R1-02 Mammoth no-space pending choice survives reload without reroll or duplicate summon',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 120_000);

  it('Front/Back four-slot fill is reachable only through product drawDarkestDungeonMonster', () => {
    const campaign = createCommunityGuardianScenario(0);
    const result = drawDarkestDungeonMonster(campaign, () => {
      throw new Error('product fill must not RNG');
    });
    expect(result.ok).toBe(true);
    expect(result.campaign.actFourState.contentRuntime!.physicalMonsterDeck!.activePlacements).toHaveLength(4);
    expect(read(PLACEMENT_SUITE, 'utf8')).toContain('drawDarkestDungeonMonster');
    expect(read(PLACEMENT_SUITE, 'utf8')).not.toMatch(/drawCommunityMonster\s*\(/);
  });

  it('Front/Back placement side ignore fails production placement proof', () => {
    const result = runGuardianMutation(
      'src/game-engine/campaign/act-four/community-physical-monster-deck.ts',
      'const stance = firstEmptyStanceForPlacement(occupied, attr.placementSide);',
      "const stance = firstEmptyStanceForPlacement(occupied, 'front');",
      PLACEMENT_SUITE,
      'ordinary DD room encounter setup fills exactly four Stance slots',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 120_000);

  it('save/reload RNG re-consumption fails Undulations save proof', () => {
    const result = runGuardianMutation(
      'src/data/darkest-dungeon/community-reference/community-guardian-room-save-replay.test.ts',
      'setRandomSource(noRng);\n    expect(restored.battle!.heroes.filter((hero) => hero.isAlive).map((hero) => hero.id).sort()).toEqual(livingIds);',
      'expect(restored.battle!.heroes.filter((hero) => hero.isAlive).map((hero) => hero.id).sort()).toEqual(livingIds);',
      SAVE_REPLAY_SUITE,
      'SR-R1-04 Undulations complete survives reload without RNG re-consumption',
    );
    // Removing noRng alone may still pass if replay is event-idempotent; force replay to require noRng by mutating the replay call.
    if (result.failed === 0) {
      const forced = runGuardianMutation(
        'src/game-engine/campaign/act-four/community-guardian-combat.ts',
        'const skillRoll = saved ? saved.skillRoll : forcedEchoing ? 0 : d10();',
        'const skillRoll = forcedEchoing ? 0 : d10();',
        SAVE_REPLAY_SUITE,
        'SR-R1-04 Undulations complete survives reload without RNG re-consumption',
      );
      expect(forced.discovered, forced.diagnostics).toBeGreaterThan(0);
      expect(forced.failed, forced.diagnostics).toBeGreaterThan(0);
    } else {
      expect(result.failed, result.diagnostics).toBeGreaterThan(0);
    }
  }, 180_000);
});
