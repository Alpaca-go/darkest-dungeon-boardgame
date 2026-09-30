import { describe, expect, it } from 'vitest';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter } from '../game-engine/ruins/encounter-draw';
import { RUINS_V5 } from '../types/ruins-executable';
import { drawnRuinsFixture } from '../game-engine/ruins/executor-test-fixture';
import { ruinsMonster } from '../game-engine/ruins/source-registry';
import { applyRuinsPrintedEffects, recordRuinsEvent } from '../game-engine/ruins/printed-effect-runtime';

describe('C1C32R2C omitted executable contracts fail closed', () => {
  it('rejects the omitted initial Large layout atomically under frozen v5', () => {
    let rejected = false;
    for (let seed = 1; seed <= 2000; seed++) {
      const state = createRuinsDrawState(3, seed, RUINS_V5), bytes = JSON.stringify(state);
      try { drawOrdinaryRuinsEncounter(state, 'contract-review', { h1: 'aggressive', h2: 'defensive', h3: 'ranged', h4: 'support' }); }
      catch (error) {
        expect(String(error)).toContain('Official initial placement could not bind');
        expect(JSON.stringify(state)).toBe(bytes);
        rejected = true;
        break;
      }
    }
    expect(rejected).toBe(true);
  });

  it('rejects a source self-pull which would overlap an existing two-slot Large card', () => {
    const campaign = drawnRuinsFixture(encounter => encounter.monsters.some(monster => monster.definitionId === 'bone-captain' && monster.stance === 'aggressive')
      && encounter.monsters.some(monster => monster.definitionId === 'bone-rabble' && monster.stance === 'ranged'));
    const battle = campaign.battle;
    const actor = battle.monsters.find(monster => monster.sourceId === 'bone-rabble')!;
    const effects = ruinsMonster(actor.sourceId, RUINS_V5).skills.find(skill => skill.effects.some(effect => effect.type === 'shuffle' && effect.target === 'self'))!.effects;
    const parent = recordRuinsEvent(battle.ruinsContext!, 'SOURCE_SHUFFLE_REVIEW', actor.id, [battle.heroes[0].id], null, {});
    const bytes = JSON.stringify(battle);
    expect(() => applyRuinsPrintedEffects(battle, actor.id, battle.heroes[0].id, effects, parent))
      .toThrow('SOURCE_UNRESOLVED: LARGE_STANCE_SHUFFLE_SLOT_COLLISION');
    expect(JSON.stringify(battle)).toBe(bytes);
  }, 30000);
});
