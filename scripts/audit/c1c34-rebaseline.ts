import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { verifyCurrentFreeze } from './historical-baseline';

const root = 'docs/data/complete-edition/';
const baseline = 'e1fcfac0692eb91c5710552ac93e3bacb25f0240';
const read = (n: string) => JSON.parse(readFileSync(root + n + '.json', 'utf8'));
const digest = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const common = { schemaVersion: 1, phase: '11A.4-C1C34', baseline, policyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1',
  contractVersion: 'C1C34-SUCCESSOR-BINDING-v1', gameplayChanged: false, productionPromotion: false };

// Independent visual observations of each locked C1C24 Battle crop. These do not
// rewrite the census or confer completeness on unbound icons/space semantics.
const observations = [
  { level: 1, cardId: 46604, life: 79, dodge: 0, skills: [[0,2,9,1],[0,2,8,1],[0,14,8,9]], blight: 1 },
  { level: 2, cardId: 46605, life: 106, dodge: 1, skills: [[1,3,10,2],[1,3,9,2],[0,19,9,12]], blight: 2 },
  { level: 3, cardId: 46606, life: 151, dodge: 3, skills: [[1,5,11,3],[1,5,10,3],[0,24,10,16]], blight: 3 },
];
const runtime = 'src/game-engine/prophet/runtime.ts';
const familyPath = 'src/data/bosses/prophet-family.ts';
const reportPath = 'docs/reports/phase-9c-prophet-data-audit.md';
const inputs = ['c1c24-boss-printed-definitions', 'c1c24-boss-family-completeness-matrix',
  'c1c24-boss-crop-manifest', 'c1c19-rulebook-extracted-evidence', 'c1c32r2-ruins-room-deck-contract',
  'c1c32r2a-ruins-tile-area-definitions', 'rule-source-policy'];

export function buildRebaseline() {
  const cards = read('c1c24-boss-printed-definitions').cards.filter((c: any) => c.family === 'Prophet');
  const inputHashes = Object.fromEntries(inputs.map(n => [root + n + '.json', digest(root + n + '.json')]));
  const refs = (c: any) => c.sourceReferences.map((r: any) => ({ path: r.path, sha256: r.cropSha256, side: r.side,
    authority: 'OFFICIAL_PRINTED_COMPONENT', physicalIdentity: c.physicalIdentity, transportIsAuthority: false }));
  const item = (id: string, status: string, value: any, sourceReferences: any[], reason: string) => ({ id, status,
    canonical: status === 'OFFICIAL_SOURCE', value, sourceReferences, reason, executable: false });
  const rows: any[] = [];
  for (const o of observations) {
    const c = cards.find((c: any) => c.cardId === o.cardId);
    const t = cards.find((c: any) => c.subtype === 'THREAT' && c.printedLevel.value === ['I','II','III'][o.level - 1]);
    rows.push(item(`level-${o.level}-battle`, 'OFFICIAL_SOURCE', { cardId: c.cardId, legacyLiteralStatus: c.literalStatus,
      visualReview: 'C1C34 independent locked crop review; unresolved glyph binding remains below', literalComplete: false }, refs(c),
      'Card image is available; C1C24 partial literal is frozen, not promoted.'));
    rows.push(item(`level-${o.level}-stats`, 'OFFICIAL_SOURCE', { life: o.life, dodge: o.dodge,
      printedType: 'Unholy - Front - Large', resistanceColumn: 'EMPTY', immunityGlyphs: ['YELLOW_THREE_DIAMONDS', 'CYAN_DOUBLE_LEFT_CHEVRON'] }, refs(c),
      'Numbers and glyph appearances read independently for this level. Glyph execution needs binding.'));
    rows.push(item(`level-${o.level}-skill-table`, 'OFFICIAL_SOURCE', { stance: 'AGGRESSIVE', rollToSkill: { '1-5': 'Eye on You', '6-10': 'Fulminate' },
      secondActionOnly: true, skills: o.skills.map(([crit,criticalDamage,accuracy,damage], i) => ({ name: ['Eye on You','Fulminate','Rubble of Ruin'][i],
        crit, criticalDamage, accuracy, damage, targetLabel: i === 2 ? 'Special' : 'Crowded',
        printedRange: i === 2 ? null : 1, printedTargetGlyphCount: i === 0 ? 2 : i === 1 ? 4 : null,
        targetEffectLiteral: i === 0 ? 'YELLOW_THREE_DIAMONDS 2t; BLACK_STRESS_ICON +1' : i === 1 ? `${o.blight} GREEN_DROPLET 3t` : 'NONE_PRINTED' })) }, refs(c),
      'Printed values available; exact target/effect ordering is not inferred from existing code.'));
    rows.push(item(`level-${o.level}-rubble`, 'OFFICIAL_SOURCE', { name: 'Rubble of Ruin', crit: 0,
      criticalDamage: o.skills[2][1], accuracy: o.skills[2][2], damage: o.skills[2][3], targetLabel: 'Special' }, refs(c),
      'Numerical source gap from Phase 9C is closed; each Pew still requires source-bound attack execution.'));
    rows.push(item(`level-${o.level}-threat`, 'OFFICIAL_SOURCE', { cardId: t.cardId, frontLiteral: t.frontLiteral,
      backLiteral: t.backLiteral, literalComplete: t.literalComplete }, refs(t), 'Both printed sides locked; lifecycle hooks require production binding.'));
  }
  const room = read('c1c32r2-ruins-room-deck-contract').rooms.find((r: any) => r.roomNumber === 11);
  const rulebook = { path: root + 'c1c19-rulebook-extracted-evidence.json', sha256: inputHashes[root + 'c1c19-rulebook-extracted-evidence.json'], pages: [38,39] };
  rows.push(item('room', 'OFFICIAL_SOURCE', { roomNumber: 11, sourceCardId: room.sourceCardId, tileId: room.tileId, printedText: room.printedText },
    room.sourceReferences, 'Locked Room 11 extraction exists; spatial positions were not captured by linear text.'));
  rows.push(item('tile', 'SOURCE_UNRESOLVED', null, [rulebook], 'No locked executable Prophet Tile 11 geometry; Ruins v6 binds only ordinary tiles 1-9.'));
  rows.push(item('d10-area-mapping', 'SOURCE_UNRESOLVED', null, room.sourceReferences,
    'Printed roll labels are available but their exact Area positions are unbound. Do not use prototype map or evenly distribute rolls.'));
  rows.push(item('wooden-pews', 'OFFICIAL_SOURCE', { count: 4, firstTurnDice: 4, initiatives: 3, stance: 'AGGRESSIVE',
    thirdAction: 'Rubble of Ruin', attackEachPewSeparately: true, occupiesSpace: false, targetable: false, removeOnBossDefeat: true }, [rulebook],
    'p38 right-column / p39 left-column; reusable behavior independent of missing spatial definitions.'));
  rows.push(item('crowded-area-tie', 'PROJECT_RULING_REQUIRED', null, cards.filter((c: any) => c.subtype === 'BATTLE').flatMap(refs),
    'No Prophet-specific versioned choice/ordering contract. Necromancer rulings may inform review but do not automatically apply.'));
  rows.push(item('pew-attack-order-and-save', 'PROJECT_RULING_REQUIRED', null, [rulebook],
    'Bind independent attack order, atomic death windows, interrupted cursor and causal replay before execution. No implicit array order.'));
  rows.push(item('target-effect-glyph-binding', 'SOURCE_UNRESOLVED', null, cards.filter((c: any) => c.subtype === 'BATTLE').flatMap(refs),
    'Normalize immunity, target icons and effect timing through locked rulebook clauses; crop recognition alone is not an executable definition.'));

  const paths = ['src/game-engine/prophet/index.ts', runtime, 'src/game-engine/prophet/prophet.test.ts', familyPath,
    'src/types/prophet.ts', 'e2e/phase-9c-prophet.spec.ts'];
  const legacy = [
    ['src/game-engine/prophet/index.ts','REUSABLE_AS_IS','Exports only; no source or production acceptance claim.'],
    [runtime,'REUSABLE_AFTER_SOURCE_BINDING','Ordinal, non-occupying hazards, per-Pew attacks and cleanup can be adapted to BattleState.'],
    ['src/game-engine/prophet/prophet.test.ts','PROTOTYPE_ONLY','Synthetic values test mechanics; not production acceptance.'],
    [familyPath,'PROTOTYPE_ONLY','Official levels disabled; prototype stats/map/skills must never provide production defaults.'],
    ['src/types/prophet.ts','REUSABLE_AFTER_SOURCE_BINDING','Add source IDs, ruleset, ownership, pending choices and resumable per-Pew cursor.'],
    ['e2e/phase-9c-prophet.spec.ts','PROTOTYPE_ONLY','Development harness only; successor needs normal production selector and real combat.'],
  ].map(([path,classification,reason]) => ({path,classification,reason,sha256:digest(path)}));
  const symbols = [
    ['createSeededRng','MUST_REPLACE','Use the shared saved RNG stream; do not introduce a second production stream.'],
    ['createProphetInitiativeCards','REUSABLE_AFTER_SOURCE_BINDING','Use shared seeded initiative and saved ordinal accounting.'],
    ['getProphetActionSemantics','REUSABLE_AS_IS','Pure ordinal 1/2/3 dispatch, source-backed p38-39.'],
    ['resolveProphetPewPlacement','MUST_REPLACE','Default room is PROPHET_PROTOTYPE_ROOM; production must fail closed without bound map.'],
    ['getAreaOccupancy / selectTargetableActorIds','REUSABLE_AFTER_SOURCE_BINDING','Preserve non-actor Pew filtering in shared BattleState target/capacity pipeline.'],
    ['resolveProphetSecondAction / resolveProphetRubbleOfRuin','REUSABLE_AFTER_SOURCE_BINDING','Inject shared damage/conditions; bind stats, targets, choices and interruption order.'],
    ['clearAllPews / resolveProphetVictory','REUSABLE_AFTER_SOURCE_BINDING','Connect cleanup to shared idempotent campaign transaction.'],
    ['migrateProphetSave / repairProphetRuntime','MUST_REPLACE','Prototype repair is not schema-2 ownership/causal tamper validation.'],
  ].map(([symbol,classification,reason]) => ({path:runtime,symbol,classification,reason}));
  const dependencies = [
    ['selector-and-level-binding',['level-1-battle','level-2-battle','level-3-battle'],'src/game-engine/bosses/definitions.ts','Shared selector gate; Prophet definitions remain disabled.'],
    ['ordinary-threat-and-cross-quest',['level-1-threat','level-2-threat','level-3-threat'],'src/game-engine/bosses/threat-checkpoint.ts','Checkpoint reusable; entry stress, scouting stress, Unholy spawn and Tavern hooks need Prophet binding.'],
    ['room-reservation-and-boss-entry',['room','tile','d10-area-mapping'],'src/game-engine/bosses/room-storage.ts','Room storage lifecycle reusable; specific Room/Tile/coordinates missing.'],
    ['three-initiative-ordinal',['wooden-pews'],runtime,'Reuse shared initiative stream with Prophet ordinal adapter.'],
    ['first-action-placement',['wooden-pews','d10-area-mapping','tile'],runtime,'Four rolls and placement trace reusable; prohibit prototype fallback.'],
    ['second-action-skills',['level-1-skill-table','level-2-skill-table','level-3-skill-table','crowded-area-tie','target-effect-glyph-binding'],runtime,'Shared damage/target pipeline; exact effect/choice bindings pending.'],
    ['third-action-per-pew',['level-1-rubble','level-2-rubble','level-3-rubble','pew-attack-order-and-save'],runtime,'Independent attacks need resumable cursor/death causality.'],
    ['save-reload-and-tamper',['tile','d10-area-mapping','pew-attack-order-and-save'],'src/game-engine/save.ts','Reuse schema-2 metadata and validations; add Prophet hazards/ordinal/cursor contract.'],
    ['victory-and-room-return',['wooden-pews','room'],'src/game-engine/commands/battle.ts','Reuse campaign transactions and storage return; source-bound Prophet cleanup pending.'],
  ].map(([id,requiredFields,primitive,reason]) => ({id,requiredFields,primitive,reason, status:'REUSABLE_AFTER_SOURCE_BINDING',
    executable:false, missingSourceOrRuling:(requiredFields as string[]).filter(id => rows.find(r => r.id === id)?.status !== 'OFFICIAL_SOURCE'),
    requiredAcceptance:['Level I/II/III source binding','normal selector / no prototype','save reload result equivalence','tamper rejection']}));
  const census = read('c1c24-boss-family-completeness-matrix').families;
  // Explicit project planning cost (lower is better), not official rules or runtime acceptance.
  const profiles = [
    {family:'Prophet',legacyReuse:6,sharedReuse:7,specialComponents:1,saveChanges:2,newUi:1,newBattle:2,
      rationale:'One non-actor Pew mechanism; existing ordinal/area framework; Ruins Threat/checkpoint/storage reuse.',evidence:paths},
    {family:'Thing from the stars',legacyReuse:0,sharedReuse:3,specialComponents:1,saveChanges:2,newUi:1,newBattle:3,
      rationale:'Smallest card set, but no family runtime and less direct Ruins production binding.',evidence:['c1c24-boss-printed-definitions']},
    {family:'Hag',legacyReuse:0,sharedReuse:4,specialComponents:2,saveChanges:4,newUi:3,newBattle:4,
      rationale:'Cauldron/captive Hero and two-unit lifecycle need new battle/UI/save handling.',evidence:['c1c24-boss-printed-definitions']},
    {family:'Collector',legacyReuse:4,sharedReuse:6,specialComponents:4,saveChanges:3,newUi:2,newBattle:3,
      rationale:'Collector prototype exists too; summon/ownership reusable, but Collected actors and Loot Chests widen binding.',
      evidence:['src/game-engine/collector/runtime.ts','src/data/bosses/collector-family.ts','src/game-engine/collector/collector.test.ts']},
  ];
  const ranking = profiles.map(p => {
    const c = census.find((c:any)=>c.family===p.family);
    const cost = c.unresolvedPrintedDefinitionCount * 2 + p.specialComponents * 2 + p.saveChanges * 2 + p.newUi * 2 + p.newBattle * 3
      - p.legacyReuse - p.sharedReuse;
    return {...p, physicalCards:c.physicalCardCount,literalComplete:c.literalCompleteCount,unresolvedDefinitions:c.unresolvedPrintedDefinitionCount,
      sourceGaps:c.sourceGapCount,planningCost:cost,productionReady:false};
  }).sort((a,b)=>a.planningCost-b.planningCost);
  const selected = ranking[0].family;
  const blockers = rows.filter(r => r.status !== 'OFFICIAL_SOURCE').map(r=>r.id);
  return {
    'prophet-source-rebaseline': {...common,inputHashes,prototypeAsAuthority:false,externalAcquisition:false,legacyAudit:{path:reportPath,sha256:digest(reportPath)},
      physicalCards:9,frozenCensusLiteralComplete:6,items:rows},
    'prophet-legacy-runtime-review': {...common,files:legacy,symbols,productionProof:false},
    'prophet-production-dependency-matrix': {...common,executionPaths:dependencies,executablePaths:0,blockers},
    'boss-family-reuse-ranking': {...common,method:'PLANNING_COST_V1',weights:{unresolvedDefinition:2,specialComponent:2,saveChange:2,newUi:2,newBattle:3,legacyReuse:-1,sharedReuse:-1},
      scoreIsProjectEstimate:true,sourceCountsFrozen:true,ranking,selectionDoesNotPromote:true},
    'next-workstream-decision': {...common,outcome:selected==='Prophet'?'PROPHET_PRODUCTION_BINDING_SELECTED':'ANOTHER_BOSS_FAMILY_SELECTED',family:selected,
      nextPhase:'C1C35 — Prophet Official Source Binding & Production Foundation',selectionScope:'SOURCE_BINDING_CONTRACT_ONLY',
      foundationExecutionAllowed:false,canonicalPromotion:false,productionReady:false,blockers,
      contract:{version:'C1C34-SUCCESSOR-BINDING-v1',levels:[1,2,3],requiredFields:rows.map(r=>r.id),executionPaths:dependencies.map(d=>d.id),
        rulingPolicy:{authority:'PROJECT_RULING',canonical:false,explicitVersionRequired:true,canonicalMissingStatus:'SOURCE_UNRESOLVED'},
        promotionRequirements:['Every required source field independently bound to locked evidence','Every missing executable behavior explicitly reviewed and versioned',
          'No prototype Room/RNG/repair fallbacks','Use shared BattleState, damage, RNG, initiative and campaign transactions',
          'Normal production selector / ordinary Threat / Boss Room / real victory for all levels','Save/reload/replay and tamper rejection with choices/causal events/ruleset',
          'Manual production browser gate at successor freeze','C1C33 immutable integrity and remote release gate PASS']},
      rationale:ranking.map(r=>({family:r.family,cost:r.planningCost,reason:r.rationale})),necromancerWorkstream:'FROZEN'},
  };
}

export function validateRebaseline(artifacts: ReturnType<typeof buildRebaseline>) {
  const expected = buildRebaseline();
  if (JSON.stringify(artifacts)!==JSON.stringify(expected)) throw new Error('C1C34 source/reuse/contract drift');
  const rows = artifacts['prophet-source-rebaseline'].items;
  for(const r of rows) {
    if(r.status !== 'OFFICIAL_SOURCE' && (r.canonical || r.value!==null)) throw new Error('Unresolved canonical promotion');
    for(const ref of r.sourceReferences) if(ref.path && ref.sha256 && digest(ref.path)!==ref.sha256) throw new Error('Locked source hash mismatch');
  }
}

if (process.argv.includes('--write') || process.argv.includes('--verify')) {
  verifyCurrentFreeze();
  execFileSync('git',['diff','--exit-code',baseline,'--','src/game-engine','src/data','docs/DD_EN_COREBOX_RULES.pdf'],{stdio:'pipe'});
  const a = buildRebaseline();
  validateRebaseline(a);
  if(process.argv.includes('--write')) for(const [name,data] of Object.entries(a)) writeFileSync(`${root}c1c34-${name}.json`,JSON.stringify(data,null,2)+'\n');
  else validateRebaseline(Object.fromEntries(Object.keys(a).map(n=>[n,read('c1c34-'+n)])) as ReturnType<typeof buildRebaseline>);
  console.log('C1C34 immutable freeze + source/reuse contract: PASS; Prophet binding selected; foundation remains gated.');
}
