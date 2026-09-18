import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COMMUNITY_RUNTIME_BLOCKERS } from './runtime-profile';

const PRODUCTION = 'src/data/darkest-dungeon/community-reference/community-final-production.test.ts';
const SAVE = 'src/data/darkest-dungeon/community-reference/community-final-encounter-save-replay.test.ts';
const TRANSITION = 'src/data/darkest-dungeon/community-reference/community-final-transition-state.test.ts';

function runMutation(
  edits: Array<{ file: string; from: string; to: string }> | string,
  fromOrSuite: string,
  toOrTitle?: string,
  suiteArg?: string,
  titleArg?: string,
) {
  const root = process.cwd();
  const normalized: Array<{ file: string; from: string; to: string }> = Array.isArray(edits)
    ? edits
    : [{ file: edits, from: fromOrSuite, to: toOrTitle! }];
  const suite = Array.isArray(edits) ? fromOrSuite : suiteArg!;
  const titlePrefix = Array.isArray(edits) ? toOrTitle! : titleArg!;
  for (const edit of normalized) {
    if (readFileSync(resolve(root, edit.file), 'utf8').split(edit.from).length !== 2) {
      throw new Error(`Mutation anchor must occur once: ${edit.file} :: ${edit.from}`);
    }
  }
  const scratch = mkdtempSync(join(tmpdir(), 'community-r2-mutation-'));
  const reportPath = join(scratch, 'result.json');
  const configPath = join(scratch, 'vite.config.mts');
  const baseConfig = resolve(root, 'vite.config.ts').split('\\').join('/');
  const editLiteral = JSON.stringify(normalized);
  writeFileSync(configPath, `import base from ${JSON.stringify(baseConfig)};
const edits = ${editLiteral};
export default { ...base, root: ${JSON.stringify(root)}, plugins: [...base.plugins, { name: 'r2-final-mutation', enforce: 'pre', transform(code, id) {
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
    { cwd: root, encoding: 'utf8', timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.error) throw result.error;
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const flat: Array<{ title: string; status: string }> = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const value = node as Record<string, unknown>;
    if (typeof value.title === 'string' && typeof value.status === 'string') flat.push({ title: value.title, status: value.status });
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
    diagnostics: `${result.stdout}\n${result.stderr}\nmatching=${JSON.stringify(matching)}`,
  };
}

describe('Community Final encounter mutation gate', () => {
  it('keeps the three source blockers plus the two R2A re-opened Final runtime blockers', () => {
    expect(COMMUNITY_RUNTIME_BLOCKERS.map((blocker) => blocker.code)).toEqual([
      'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED',
      'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED',
      'COME_UNTO_YOUR_MAKER_UNRESOLVED',
      // Phase 11A.4R2A WP-0：R2 关闭被认定为 false-green，真实验收前保持打开。
      'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED',
      'FINAL_ROOM_TRANSITION_ENGINE_UNSUPPORTED',
    ]);
  });

  it('Ancestor Reflection stance rerolls after reload', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/final-forms/final-form-runtime.ts',
      'if (existing || hasProcessedFinalFormTransaction(base, transactionId)) {',
      'if (false && (existing || hasProcessedFinalFormTransaction(base, transactionId))) {',
      SAVE,
      'FR-SR-02',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('Ancestor Guard allows attacking Ancestor while Reflection alive', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-actors.ts',
      'const guarded = formId === \'ancestor-first-form\' && runtime?.kind === \'ancestor-first-form\' && getAliveReflections(runtime).length > 0;',
      'const guarded = false;',
      PRODUCTION,
      'P-final-skill production turn',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('Imperfect death applies 10 Wounds twice', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      'if (death.ancestorWounds > 0 && formUnit) {\n      const ancestor = next.battle?.monsters.find((monster) => monster.id === formUnit.id);\n      if (ancestor) {\n        const applied = applyBattleUnitDamage(ancestor, death.ancestorWounds);',
      'if (formUnit) {\n      const ancestor = next.battle?.monsters.find((monster) => monster.id === formUnit.id);\n      if (ancestor) {\n        const applied = applyBattleUnitDamage(ancestor, 10);',
      PRODUCTION,
      'P-final-imperfect-death',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('vacant stance uses fixed Perfect instead of d10 source table', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      'const fillKind: ReflectionKind = skillRoll <= 3 ? \'perfect\' : \'imperfect\';',
      'const fillKind: ReflectionKind = \'perfect\';',
      PRODUCTION,
      'P-final-ancestor-first-form-imperfect-reproduction',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('Time Heals All heals wrong target', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      'const patient = mostWoundedMonster(nextBattle, actor.id);',
      'const patient = nextBattle.monsters.find((unit) => unit.isAlive && unit.id !== actor.id) ?? null;',
      PRODUCTION,
      'P-final-ancestor-first-form-time-heals-all',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('Ancestor 2 teleport roll 10 moves anyway', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/final-forms/ancestor-second-form.ts',
      'const resultStance = mech.actionEndTeleportMap[roll] ?? null;',
      'const resultStance = mech.actionEndTeleportMap[roll] ?? \'defensive\';',
      PRODUCTION,
      'P-final-ancestor-second-form-embrace-futility',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('Absolute Nothingness becomes targetable', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/final-forms/ancestor-second-form.ts',
      'export function isAbsoluteNothingnessTargetable(): false {\n  return false;\n}',
      'export function isAbsoluteNothingnessTargetable(): false {\n  return true as false;\n}',
      PRODUCTION,
      'P-final-nothingness',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('Absolute Nothingness does not consume Area capacity', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/final-forms/ancestor-second-form.ts',
      'occupiesAreaSpace: true,',
      'occupiesAreaSpace: false,',
      PRODUCTION,
      'P-final-nothingness',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('Gestating Sispersion uses logical-uniform random instead of physical deck', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/final-forms/final-form-actions.ts',
      'if (ctx.mode === \'community-reference\' && !input.selectedMonsterDefinitionId) {',
      'if (false && ctx.mode === \'community-reference\' && !input.selectedMonsterDefinitionId) {',
      PRODUCTION,
      'P-final-gestating-heart-dispersion',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('Sispersion summons Monster but does not add Initiative', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      'initiativeOrder: already || next.battle.initiativeOrder.includes(summon.id)\n          ? next.battle.initiativeOrder\n          : [...next.battle.initiativeOrder, summon.id],',
      'initiativeOrder: next.battle.initiativeOrder,',
      PRODUCTION,
      'P-final-gestating-heart-dispersion',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('non-lethal Ichor misses Hero Blight', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      'if (hero) battleState = applyStatusEffectEvent(battleState, hero.id, [{ type: \'blight\', amount: reaction.effect.blightPotency, durationTurns: reaction.effect.blightDurationTurns }], `final-ichor:${sequence}`);',
      'if (false && hero) battleState = applyStatusEffectEvent(battleState, hero.id, [{ type: \'blight\', amount: reaction.effect.blightPotency, durationTurns: reaction.effect.blightDurationTurns }], `final-ichor:${sequence}`);',
      PRODUCTION,
      'P-final-gestating-ichor',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('non-lethal Ichor misses Heart heal', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      'if (heart) battleState = setUnit(battleState, { ...heart, hp: Math.min(heart.maxHp, heart.hp + reaction.effect.heartHeal) });',
      'if (false && heart) battleState = setUnit(battleState, { ...heart, hp: Math.min(heart.maxHp, heart.hp + reaction.effect.heartHeal) });',
      PRODUCTION,
      'P-final-gestating-ichor',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('lethal Ichor ordering is guessed', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      'if (formId === \'gestating-heart\' && target?.sourceId === COMMUNITY_FINAL_FORM_SOURCE[formId] && afterTarget && !afterTarget.isAlive) {',
      'if (false && formId === \'gestating-heart\' && target?.sourceId === COMMUNITY_FINAL_FORM_SOURCE[formId] && afterTarget && !afterTarget.isAlive) {',
      PRODUCTION,
      'P-final-gestating-ichor',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('Heart consumes a different skill than forecast', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      'const skillId = consumed.skillIdToCast?.replace(/^community-dd-skill-/, \'\') ?? \'\';',
      'const skillId = \'dissolution\';',
      PRODUCTION,
      'P-final-heart-of-darkness-know-this',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('Heart generates next forecast before action completes', () => {
    const result = runMutation(
      [
        {
          file: 'src/game-engine/campaign/act-four/community-final-combat.ts',
          from: 'const consumed = consumeFinalFormImpendingDoom(campaign, { mode: \'community-reference\', rng: asRng() });',
          to: 'const generatedEarly = generateFinalFormImpendingDoom(campaign, { mode: \'community-reference\', rng: asRng() }); const consumed = consumeFinalFormImpendingDoom(generatedEarly.campaign, { mode: \'community-reference\', rng: asRng() });',
        },
        {
          file: 'src/game-engine/campaign/act-four/final-forms/heart-of-darkness.ts',
          from: 'if (current && !current.consumed) {',
          to: 'if (false && current && !current.consumed) {',
        },
      ],
      PRODUCTION,
      'P-final-heart-of-darkness-know-this',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('Form transition heals Heroes', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/transition-final-form.ts',
      'let next: CampaignState = {\n    ...campaign,\n    // 硬约束 16：不允许 Rest / Change Stance —— heroes 原样带过，一个字段都不动。\n    battle,',
      'let next: CampaignState = {\n    ...campaign,\n    heroes: campaign.heroes.map((hero) => ({ ...hero, wounds: hero.wounds + 1 })),\n    battle,',
      PRODUCTION,
      'P-final-transition',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('Come Unto Your Maker silently executes guessed behavior', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/final-forms/final-form-actions.ts',
      'if (ctx.mode === \'community-reference\') {\n    const blocked = blockCommunityOperation(\'COME_UNTO_YOUR_MAKER_UNRESOLVED\');\n    return { campaign, reason: blocked.blocker.code, ...blocked };\n  }',
      'if (ctx.mode === \'community-reference\') {\n    return { ok: true as false, campaign: { ...campaign, gold: (campaign.gold ?? 0) + 1 }, reason: \'guessed\' };\n  }',
      PRODUCTION,
      'Come Unto Your Maker remains source-blocked',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  // -----------------------------------------------------------------------
  // WP-14：Transition Mutation Gate —— 每个错误必须让 WP-13 production transition suite 失败。
  // -----------------------------------------------------------------------

  it('WP-14: damage disappears on transition (hp not inherited from previous Form)', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/final-form-sequence.ts',
      '      hp: prior.hp,',
      '      hp: fresh.hp,',
      TRANSITION,
      'Form',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-14: stress disappears on transition', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/final-form-sequence.ts',
      '      stress: prior.stress,',
      '      stress: 0,',
      TRANSITION,
      'Form',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-14: bleed disappears on transition', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/final-form-sequence.ts',
      '      bleed: prior.bleed,',
      '      bleed: 0,',
      TRANSITION,
      'Form',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-14: condition durations (mark/stun/bleed) disappear on transition', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/final-form-sequence.ts',
      '      conditionDurations: prior.conditionDurations ? { ...prior.conditionDurations } : undefined,',
      '      conditionDurations: undefined,',
      TRANSITION,
      'Form',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-14: hero HP rebuilt from pre-form Campaign value (inheritance disabled)', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/final-form-sequence.ts',
      '  const previousHeroes = previousBattleId && campaign.battle?.battleId === previousBattleId\n    ? campaign.battle.heroes\n    : null;',
      '  const previousHeroes = null;',
      TRANSITION,
      'Form',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-14: battleId changes on transition', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/transition-final-form.ts',
      '    policy.resetBattleUsage ? null : (campaign.battle?.battleId ?? null),',
      '    null,',
      TRANSITION,
      'Form',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-14: Room changes on transition', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/final-form-sequence.ts',
      '    sourceRoomId: encounter.roomDefinitionId,',
      '    sourceRoomId: \'community-dd-room-mutated\',',
      TRANSITION,
      'Form',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-14: Round not reset on transition', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/final-form-sequence.ts',
      '    // 硬约束 17：Round 重置为 1。\n    round: 1,',
      '    round: 2,',
      TRANSITION,
      'Form',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-14: initiative not rebuilt on transition', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/final-form-sequence.ts',
      '    initiativeOrder,\n    initiativeIndex: -1,',
      '    initiativeOrder: campaign.battle?.initiativeOrder ?? initiativeOrder,\n    initiativeIndex: -1,',
      TRANSITION,
      'Form',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  // -----------------------------------------------------------------------
  // WP-15：Leaf-Level Mutation —— 每类语义至少一个 mutation，不能只 mutation skill selection。
  // -----------------------------------------------------------------------

  it('WP-15: wrong damage (base damage +1)', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      '  const damage = !hit ? 0 : critical && leaf.crit ? leaf.crit.damage : leaf.damage;',
      '  const damage = !hit ? 0 : critical && leaf.crit ? leaf.crit.damage : leaf.damage + 1;',
      PRODUCTION,
      'P-final',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-15: wrong crit (crit never deals crit damage)', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      '  const damage = !hit ? 0 : critical && leaf.crit ? leaf.crit.damage : leaf.damage;',
      '  const damage = !hit ? 0 : leaf.damage;',
      PRODUCTION,
      'P-final',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-15: wrong target (closest policy reversed to furthest)', () => {
    const result = runMutation(
      'src/data/darkest-dungeon/community-reference/community-final-targeting.ts',
      '  const closest = [...heroes].sort((a, b) => a.position - b.position || compareUnitId(a, b));',
      '  const closest = [...heroes].sort((a, b) => b.position - a.position || compareUnitId(a, b));',
      PRODUCTION,
      'P-final',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-15: range ignored (all living heroes legal regardless of range)', () => {
    const result = runMutation(
      'src/data/darkest-dungeon/community-reference/community-final-targeting.ts',
      '  const legal = range === null\n    ? living\n    : living.filter((hero) => communityFinalSkillCanReach(',
      '  const legal = living.filter((hero) => true || communityFinalSkillCanReach(',
      'src/data/darkest-dungeon/community-reference/community-final-targeting.test.ts',
      'out-of-range',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-15: wrong multi-target count (crowded area only hits 1)', () => {
    const result = runMutation(
      'src/data/darkest-dungeon/community-reference/community-final-targeting.ts',
      '    return (ranked[0]?.[1] ?? []).sort((a, b) => a.position - b.position || compareUnitId(a, b)).slice(0, count);',
      '    return (ranked[0]?.[1] ?? []).sort((a, b) => a.position - b.position || compareUnitId(a, b)).slice(0, 1);',
      PRODUCTION,
      'P-final',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-15: missing Bleed', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      "    if (bleed) effects.push({ type: 'bleed', amount: Number(bleed[1]), durationTurns: Number(bleed[2]) });",
      "    if (false && bleed) effects.push({ type: 'bleed', amount: Number(bleed[1]), durationTurns: Number(bleed[2]) });",
      PRODUCTION,
      'P-final',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-15: missing Blight', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      "    if (blight) effects.push({ type: 'blight', amount: Number(blight[1]), durationTurns: Number(blight[2]) });",
      "    if (false && blight) effects.push({ type: 'blight', amount: Number(blight[1]), durationTurns: Number(blight[2]) });",
      PRODUCTION,
      'P-final',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-15: missing Stun', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      "    if (stun) effects.push({ type: 'stun', amount: Number(stun[1]), durationTurns: Number(stun[1]) });",
      "    if (false && stun) effects.push({ type: 'stun', amount: Number(stun[1]), durationTurns: Number(stun[1]) });",
      PRODUCTION,
      'P-final',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-15: missing Mark', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      "    if (mark) effects.push({ type: 'mark', amount: 1, durationTurns: Number(mark[1]) });",
      "    if (false && mark) effects.push({ type: 'mark', amount: 1, durationTurns: Number(mark[1]) });",
      PRODUCTION,
      'P-final',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-15: wrong duration (Mark 2t applied as 1t)', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      "    if (mark) effects.push({ type: 'mark', amount: 1, durationTurns: Number(mark[1]) });",
      "    if (mark) effects.push({ type: 'mark', amount: 1, durationTurns: 1 });",
      PRODUCTION,
      'P-final',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-15: missing Stress (shared pipeline skipped)', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      '    if (!stress) continue;',
      '    if (true) continue;',
      PRODUCTION,
      'P-final',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-15: missing Light -1', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      "    if (leaf.specialEffect.includes('light-1')) {",
      "    if (false && leaf.specialEffect.includes('light-1')) {",
      PRODUCTION,
      'P-final',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-15: missing marked +3 damage bonus', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      "      const markedBonus = leaf.specialEffect.includes('+3 damage vs Marked') && target.marked ? 3 : 0;",
      "      const markedBonus = leaf.specialEffect.includes('+3 damage vs Marked') && target.marked ? 0 : 0;",
      PRODUCTION,
      'P-final',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);

  it('WP-15: missing Push 2', () => {
    const result = runMutation(
      'src/game-engine/campaign/act-four/community-final-combat.ts',
      "  if (leaf.specialEffect.includes('push 2')) {",
      "  if (false && leaf.specialEffect.includes('push 2')) {",
      PRODUCTION,
      'P-final',
    );
    expect(result.discovered, result.diagnostics).toBeGreaterThan(0);
    expect(result.failed, result.diagnostics).toBeGreaterThan(0);
  }, 180_000);
});
