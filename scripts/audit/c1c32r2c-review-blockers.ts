import { writeFileSync } from 'node:fs';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter } from '../../src/game-engine/ruins/encounter-draw';
import { ruinsMonsterDefinitions } from '../../src/game-engine/ruins/source-registry';
import { RUINS_V5 } from '../../src/types/ruins-executable';

const definitions = ruinsMonsterDefinitions(RUINS_V5);
let reproduction: Record<string, unknown> | null = null;
for (let seed = 1; seed <= 2000; seed++) {
  const state = createRuinsDrawState(3, seed, RUINS_V5);
  try { drawOrdinaryRuinsEncounter(state, 'mixed-large-contract-review',
    { h1: 'aggressive', h2: 'defensive', h3: 'ranged', h4: 'support' }); }
  catch (error) {
    if (!String(error).includes('Official initial placement could not bind')) throw error;
    reproduction = { level: 3, seed, error: String(error), startingRoom: state.roomDeck[0],
      leadingCards: state.monsterDeck.slice(0, 5).map(copyId => {
        const definition = definitions.find(item => item.physicalCopyIds.includes(copyId))!;
        return { copyId, definitionId: definition.canonicalId, size: definition.size, stanceSlots: definition.stanceSlots,
          deployment: definition.deployment };
      }) };
    break;
  }
}
if (!reproduction) throw new Error('Omitted Large draw contract reproduction disappeared; review must be updated');
const review = { schemaVersion: 1, phase: '11A.4-C1C32R2C', ruleSetVersion: RUINS_V5,
  status: 'REQUIRED_EXECUTABLE_CONTRACT_ABSENT', canonicalStatus: 'SOURCE_UNRESOLVED', canonical: false,
  sourcePolicy: 'RULEBOOK_ONLY_SOURCE_POLICY_V1', rulingSetChanged: false, productionPromotionStopped: true,
  reproduction, blockers: [
    { id: 'INITIAL_DRAW_MIXED_TWO_LARGE_LAYOUT_POLICY_ABSENT', code: 'src/game-engine/ruins/encounter-draw.ts',
      requirement: 'Resolve a Large + Normal + Large draw or fragmented Large destination without guessing a discard/return policy.',
      existingContractScope: 'Official p17 and R2B review specify replacing the last non-Large after three Monsters; v5 only adds return timing.',
      missingContract: 'No accepted treatment of the second Large when only two Monster cards are already in play.' },
    { id: 'LARGE_STANCE_SHUFFLE_SLOT_COLLISION_CONTRACT_ABSENT', code: 'src/game-engine/ruins/printed-effect-runtime.ts',
      requirement: 'A Shuffle across a two-slot Large card must have a legal, deterministic Stance permutation.',
      existingContractScope: 'Official p17 specifies two Stance slots; p21 specifies equal-number-of-spaces Shuffle and shifting other characters. The inherited v3 contract licenses spatial Area overflow only.',
      missingContract: 'No pinned executable Stance permutation policy for a one-space move intersecting a two-slot card. Runtime rejects the collision.' }
  ], sourceReferences: [
    { path: 'docs/data/complete-edition/c1c19-rulebook-extracted-evidence.json', pages: [17, 21, 24, 38],
      sourceSha256: '9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae' },
    { path: 'docs/data/complete-edition/c1c32r2b-large-replacement-source-review.json' },
    { path: 'docs/data/complete-edition/c1c32r2b-large-replacement-project-ruling.json' },
    { path: 'docs/data/complete-edition/c1c32r2-large-movement-project-ruling.json' }
  ], nextAction: 'Review an explicit successor PROJECT_RULING for these newly exposed ambiguities. Do not mutate v1-v5, infer a runtime discard, or launch broad source intake.' };
writeFileSync('docs/data/complete-edition/c1c32r2c-required-contract-review.json', JSON.stringify(review, null, 2) + '\n');
console.log(JSON.stringify(reproduction, null, 2));
