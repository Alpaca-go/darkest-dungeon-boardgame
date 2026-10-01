import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { verifyHistoricalArtifacts } from './historical-baseline';
import { verifyGateA } from './c1c35r2-gate-a';
import { verifyNecromancerCompatibility } from './c1c35r2a-necromancer-compatibility';
import { runSharedDispatchProbes, prophetContractFixture, threatShell } from './c1c35r2a-dispatch-probes';
import { auditProductionPrototypeReachability } from './c1c35r2a-prototype-reachability';
import { assertProphetHeroEntryPlacement, prophetProductionDefinition, PROPHET_HERO_ENTRY_BLOCKER } from '../../src/game-engine/prophet/production-definition';
import { bindBossEncounter, applyBossRuntimeInput } from '../../src/game-engine/bosses/foundation';

const root = 'docs/data/complete-edition/';
export const foundationCapabilities = ['ProductionDefinitionL1','ProductionDefinitionL2','ProductionDefinitionL3',
  'Room11Lifecycle','ActorOccupancy','PhysicalPewOwnership','Ordinal1Placement','Ordinal2NormalSkill',
  'CrowdedPendingChoice','Ordinal3Rubble','ThreatLevel1','ThreatLevel2','ThreatLevel3','SaveReplay',
  'TamperValidation','VictoryCleanup','PrototypeIsolation'] as const;
const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Exercise the actual shared command boundary; infrastructure fixtures are never gameplay proof. */
export function probeHeroEntryBlocker(level: 1 | 2 | 3) {
  const definition = prophetProductionDefinition(level);
  const campaign = prophetContractFixture(level), battle = threatShell(campaign);
  const before = JSON.stringify({campaign, battle});
  const rejected = (action: () => unknown) => {
    try { action(); } catch (error) {
      if (error instanceof Error && error.message.startsWith(PROPHET_HERO_ENTRY_BLOCKER)) return error.message;
      throw error;
    }
    throw new Error('Unbound Prophet entry was allowed');
  };
  const gate = rejected(() => assertProphetHeroEntryPlacement(level));
  const binding = rejected(() => bindBossEncounter({...battle, bossEncounter: undefined}, definition, 3535));
  const entry = rejected(() => applyBossRuntimeInput(battle, {type: 'ENTER_BOSS_ROOM'}));
  // Caller-supplied coordinates must not impersonate accepted source bindings.
  const forged = {...definition, heroStartArea: 'ruins-tile-11:S'};
  rejected(() => bindBossEncounter({...battle, bossEncounter: undefined}, forged, 3535));
  if (before !== JSON.stringify({campaign, battle})) throw new Error('Rejected entry mutated state or RNG');
  return {level, heroStartArea: definition.heroStartArea, gate, binding, entry,
    callerCoordinateRejected: true, mutation: false, rngConsumption: 0,
    proofKind: 'ENTRY_REJECTION_ONLY_NOT_PRODUCTION_GAMEPLAY'};
}

export function buildFoundationArtifacts() {
  verifyGateA();
  const protectedArtifactCount = verifyHistoricalArtifacts('c1c35r2ar');
  verifyNecromancerCompatibility();
  const probes = runSharedDispatchProbes();
  const reachability = auditProductionPrototypeReachability();
  const entryProbes = ([1,2,3] as const).map(probeHeroEntryBlocker);
  const ordinaryTiles = JSON.parse(readFileSync(root+'c1c32r2a-ruins-tile-area-definitions.json','utf8')) as {tiles: Array<{tileId: string}>};
  if (ordinaryTiles.tiles.some(t=>t.tileId==='ruins-tile-11')) throw new Error('Review newly bound Tile 11 entry contract before promotion');
  const inputPaths = ['c1c35-prophet-tile-contract.json','c1c35r2-prophet-production-definitions.json',
    'c1c32r2a-ruins-tile-area-definitions.json','c1c32r2-ordinary-threat-encounter-draw-contract.json','rule-source-policy.json'];
  const common = {schemaVersion:1,phase:'11A.4-C1C35R2B',baseline:'007712ab6aec2c814fa31e06cf5fe05b21a30879',
    policyId:'RULEBOOK_ONLY_SOURCE_POLICY_V1',ruleSetVersion:'C1C35R2-PROPHET-DIGITAL-DEFAULT-v1',
    sourceContractVersion:'C1C35R2-PROPHET-EXECUTION-CONTRACT-v1',heroDodgeRuleSetVersion:'C1C31-DIGITAL-DEFAULT-v2',
    outcome:'PROPHET_PRODUCTION_FOUNDATION_BLOCKED',blocker:PROPHET_HERO_ENTRY_BLOCKER,
    canonicalSourceStatus:'SOURCE_UNRESOLVED',implicitProjectRulingCreated:false,
    productionFoundation:false,productionAccepted:false,controlledFoundationRouteAllowed:false,
    unrestrictedSelectorAllowed:false,c1c36Allowed:false,
    evidence:{sourceFacts:'Existing accepted source rows remain unchanged; no Hero entry Area bound for Tile 11.',
      projectRulings:'Existing accepted rulings remain pinned; none resolves Hero entry placement.',
      runtimeImplementation:'Shared bind and ENTER_BOSS_ROOM reject before mutation or RNG.',
      testProof:'Entry rejection and predecessor infrastructure only; no Prophet gameplay acceptance.',
      productionAcceptance:'BLOCKED'},
    inputHashes:Object.fromEntries(inputPaths.map(p=>[root+p,hash(root+p)]))};
  const blocked = (dependency: string) => ({...common,status:'BLOCKED',dependency,executedProductionGameplayTests:0});
  return {
    'production-state-contract': {...blocked('Hero entry placement'),entryProbes,runtimeRegistered:true,gameplayEnabled:false},
    'pew-ownership-contract': blocked('Live Room 11 encounter required before physical Pew runtime acceptance'),
    'action-scheduler-contract': blocked('Live Room 11 encounter required before three-action runtime acceptance'),
    'ordinal1-proof': blocked('Live encounter and source-bound Hero entry required'),
    'ordinal2-proof': blocked('Live encounter and source-bound Hero entry required'),
    'rubble-proof': blocked('Live encounter and source-bound Hero entry required'),
    'threat-runtime-proof': blocked('No R2B Prophet Threat lifecycle hooks installed'),
    'room-lifecycle-proof': {...blocked('Source-bound Hero entry required for RESERVED → IN_PLAY'),entryProbes},
    'save-replay-matrix': blocked('No live Prophet encounter / ordinal / Pew replay proof'),
    'tamper-matrix': {...blocked('No live Prophet transaction tamper matrix'),entryProbes},
    'foundation-capability-matrix': {...common,rows:foundationCapabilities.map(capability=>({capability,status:'BLOCKED',
      reason:capability==='PrototypeIsolation'?'Import isolation passes but does not accept a production foundation':PROPHET_HERO_ENTRY_BLOCKER})),
      infrastructure:{sharedDispatchProbesPassed:probes.length,necromancerCompatibility:'PASS',gateA:'PASS',...reachability}},
    'production-foundation-acceptance': {...common,status:'BLOCKED',entryProbes,
      infrastructureCheckpoint:{phase:'C1C35R2A-R',commit:common.baseline,protectedArtifactCount,
        verification:'ORIGINAL_VERIFIER_IN_DETACHED_ACCEPTED_CHECKOUT'},
      remoteReleaseGate:{status:'NOT_ACCEPTED',conclusion:null,headSha:null}},
    'next-workstream-decision': {...common,next:'Resolve and explicitly bind Room 11 Hero entry placement before resuming C1C35R2B',
      sourceAcquisitionRequired:false,requiredDependency:'Accepted source/generic Room-entry contract with Tile 11 Hero starting Area mapping; any executable gap requires explicit versioned PROJECT_RULING canonical=false.',
      forbiddenFallbacks:['Necromancer Hero start coordinate','Phase 9C placement','Caller-supplied unbound coordinate']},
  };
}

export function verifyFoundationArtifacts(write = false) {
  const artifacts = buildFoundationArtifacts();
  for (const [name, data] of Object.entries(artifacts)) {
    const path = root+'c1c35r2b-prophet-'+name+'.json';
    // The successor decision has the phase-wide name requested by the phase brief.
    const target = name==='next-workstream-decision' ? root+'c1c35r2b-next-workstream-decision.json' : path;
    const bytes = JSON.stringify(data,null,2)+'\n';
    if (write) writeFileSync(target,bytes);
    else if (readFileSync(target,'utf8')!==bytes) throw new Error('R2B artifact drift: '+target);
  }
  return artifacts;
}
if (process.argv.includes('--write-r2b') || process.argv.includes('--verify-r2b')) {
  verifyFoundationArtifacts(process.argv.includes('--write-r2b'));
  console.log('C1C35R2B: PROPHET_PRODUCTION_FOUNDATION_BLOCKED; '+PROPHET_HERO_ENTRY_BLOCKER+'; C1C36 prohibited.');
  // A blocked artifact audit can pass; the production acceptance gate cannot.
  if (process.argv.includes('--verify-r2b')) process.exitCode=1;
}
