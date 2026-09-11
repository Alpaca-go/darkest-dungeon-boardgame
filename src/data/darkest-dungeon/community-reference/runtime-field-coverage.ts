import { NORMALIZED_CORPUS, requirement } from './normalized';
import type { CommunityRuntimeBlockerCode } from './runtime-profile';
import { COMMUNITY_REFERENCE_RUNTIME_PROFILE, COMMUNITY_RUNTIME_BLOCKERS } from './runtime-profile';
import {
  COMMUNITY_MAMMOTH_CYST,
  COMMUNITY_MAMMOTH_CYST_GUARDIAN,
  COMMUNITY_MAMMOTH_CYST_ROOM,
  COMMUNITY_MAMMOTH_CYST_SUMMON,
  COMMUNITY_SHUFFLING_ACTORS,
  COMMUNITY_SHUFFLING_ROOM,
  COMMUNITY_TEMPLAR_IMPALER,
  COMMUNITY_TEMPLAR_WARLORD,
  COMMUNITY_TEMPLARS_ENCOUNTER,
  COMMUNITY_TEMPLARS_ROOM,
  COMMUNITY_WHITE_CELL_STALK,
} from './production-adapters';
import {
  getAncestorFirstFormMechanics,
  getAncestorRoomAreaDefinition,
  getAncestorSecondFormMechanics,
  getGestatingHeartMechanics,
  getHeartOfDarknessMechanics,
} from '../final-encounter';

export type RuntimeFieldClassification = 'consumed' | 'explicit-source-blocker' | 'engine-unsupported-blocker' | 'display-only' | 'not-runtime-relevant';

export interface CommunityRuntimeProjectionEnvironment {
  profile: typeof COMMUNITY_REFERENCE_RUNTIME_PROFILE;
  templarImpaler: typeof COMMUNITY_TEMPLAR_IMPALER;
  templarWarlord: typeof COMMUNITY_TEMPLAR_WARLORD;
  templarsRoom: typeof COMMUNITY_TEMPLARS_ROOM;
  templarsEncounter: typeof COMMUNITY_TEMPLARS_ENCOUNTER;
  mammothCyst: typeof COMMUNITY_MAMMOTH_CYST;
  whiteCellStalk: typeof COMMUNITY_WHITE_CELL_STALK;
  mammothRoom: typeof COMMUNITY_MAMMOTH_CYST_ROOM;
  mammothGuardian: typeof COMMUNITY_MAMMOTH_CYST_GUARDIAN;
  mammothSummon: typeof COMMUNITY_MAMMOTH_CYST_SUMMON;
  shufflingActors: typeof COMMUNITY_SHUFFLING_ACTORS;
  shufflingRoom: typeof COMMUNITY_SHUFFLING_ROOM;
  ancestorRoom: ReturnType<typeof getAncestorRoomAreaDefinition>;
  ancestorFirst: ReturnType<typeof getAncestorFirstFormMechanics>;
  ancestorSecond: ReturnType<typeof getAncestorSecondFormMechanics>;
  gestatingHeart: ReturnType<typeof getGestatingHeartMechanics>;
  heartOfDarkness: ReturnType<typeof getHeartOfDarknessMechanics>;
}

export const COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT: CommunityRuntimeProjectionEnvironment = {
  profile: COMMUNITY_REFERENCE_RUNTIME_PROFILE,
  templarImpaler: COMMUNITY_TEMPLAR_IMPALER,
  templarWarlord: COMMUNITY_TEMPLAR_WARLORD,
  templarsRoom: COMMUNITY_TEMPLARS_ROOM,
  templarsEncounter: COMMUNITY_TEMPLARS_ENCOUNTER,
  mammothCyst: COMMUNITY_MAMMOTH_CYST,
  whiteCellStalk: COMMUNITY_WHITE_CELL_STALK,
  mammothRoom: COMMUNITY_MAMMOTH_CYST_ROOM,
  mammothGuardian: COMMUNITY_MAMMOTH_CYST_GUARDIAN,
  mammothSummon: COMMUNITY_MAMMOTH_CYST_SUMMON,
  shufflingActors: COMMUNITY_SHUFFLING_ACTORS,
  shufflingRoom: COMMUNITY_SHUFFLING_ROOM,
  ancestorRoom: getAncestorRoomAreaDefinition('community-reference'),
  ancestorFirst: getAncestorFirstFormMechanics('community-reference'),
  ancestorSecond: getAncestorSecondFormMechanics('community-reference'),
  gestatingHeart: getGestatingHeartMechanics('community-reference'),
  heartOfDarkness: getHeartOfDarknessMechanics('community-reference'),
};

export interface RuntimeProjectionProof {
  requirementId: string;
  sourcePath: string;
  classification: RuntimeFieldClassification;
  sourceReference: string[];
  sourceSelector: () => unknown;
  runtimeSelector?: (environment: CommunityRuntimeProjectionEnvironment) => unknown;
  runtimeSelectorId?: string;
  normalizeSource: (value: unknown) => unknown;
  normalizeRuntime: (value: unknown) => unknown;
  normalizerId: string;
  blockerCode?: CommunityRuntimeBlockerCode;
  proofTests: string[];
}

const identity = (value: unknown) => value;
const localSkillId = (id: string) => id.replace(/^community-dd-skill-/, '');
const actorSkillLocalId = (requirementId: string, id: string) => localSkillId(id).replace(requirementId === 'tierB-templars-impaler' ? /^impaler-/ : requirementId === 'tierB-templars-warlord' ? /^warlord-/ : /^$a/, '');
const sourceField = (requirementId: string, field: string) => requirement(requirementId).fields[field];
const sourceValue = (requirementId: string, field: string) => sourceField(requirementId, field).value;
const sourceSubValue = (requirementId: string, field: string, subPath: string): unknown => subPath.split('.').reduce((value: any, key) => value?.[key], sourceValue(requirementId, field));
const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item) ?? 'undefined';
export const runtimeSemanticHash = (value: unknown): string => {
  const text = stable(value); let hash = 5381;
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const proofs: RuntimeProjectionProof[] = [];
function add(requirementId: string, sourcePath: string, classification: RuntimeFieldClassification, options: Partial<RuntimeProjectionProof> & { field: string; sourceSelector?: () => unknown } = { field: sourcePath }): void {
  proofs.push({ requirementId, sourcePath, classification, sourceReference: sourceField(requirementId, options.field).sourceReference, sourceSelector: options.sourceSelector ?? (() => sourceValue(requirementId, options.field)), runtimeSelector: options.runtimeSelector, runtimeSelectorId: options.runtimeSelectorId, normalizeSource: options.normalizeSource ?? identity, normalizeRuntime: options.normalizeRuntime ?? identity, normalizerId: options.normalizerId ?? 'identity.v1', blockerCode: options.blockerCode, proofTests: options.proofTests ?? [`TRACE:${requirementId}.${sourcePath}`] });
}

const SOURCE_BLOCKERS: Record<string, CommunityRuntimeBlockerCode> = {
  'tierB-templars-room.pitExitRule': 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED',
  'tierB-absolute-nothingness.stance': 'ABSOLUTE_NOTHINGNESS_STANCE_UNRESOLVED',
  'tierB-gestating-heart.lethalWoundTimingRuling': 'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED',
  'tierB-come-unto-your-maker.definition': 'COME_UNTO_YOUR_MAKER_UNRESOLVED',
  'tierB-darkest-dungeon-monster-deck.drawPolicy': 'MONSTER_DECK_DRAW_POLICY_UNRESOLVED',
};

const actorFor = (id: string, env: CommunityRuntimeProjectionEnvironment): any => ({
  'tierB-templars-impaler': env.templarImpaler,
  'tierB-templars-warlord': env.templarWarlord,
  'tierB-mammoth-cyst': env.mammothCyst,
  'tierB-white-cell-stalk': env.whiteCellStalk,
  'tierB-shuffling-horror': env.shufflingActors.find((actor) => actor.role === 'horror'),
  'tierB-cultist-priest': env.shufflingActors.find((actor) => actor.role === 'cultist-priest'),
  'tierB-malignant-growth': env.shufflingActors.find((actor) => actor.role === 'malignant-growth'),
}[id]);

function sourceD10Map(requirementId: string): Record<string, string> {
  const skills = sourceValue(requirementId, 'skillIds') as Array<{ sourceLocalSkillId: string; printedNumber: number }>;
  const byNumber = Object.fromEntries(skills.map((skill) => [skill.printedNumber, skill.sourceLocalSkillId]));
  const result: Record<string, string> = {};
  const wanted = ['tierB-templars-warlord'].includes(requirementId) ? 'ranged' : 'aggressive';
  const table = sourceValue(requirementId, 'd10SkillTable') as Array<{ stances: string[]; ranges: Array<{ rolls: number[]; printedSkillNumber: number }> }>;
  const stance = table.find(entry => entry.stances.includes(wanted)) ?? table[0];
  for (const range of stance.ranges) for (const roll of range.rolls) result[`all:${roll}`] = byNumber[range.printedSkillNumber];
  return result;
}
function runtimeD10Map(requirementId: string, env: CommunityRuntimeProjectionEnvironment): Record<string, string> {
  const actor = actorFor(requirementId, env); const result: Record<string, string> = {};
  if (actor.skills) for (const skill of actor.skills) for (const roll of skill.d10Rolls) result[`all:${roll}`] = actorSkillLocalId(requirementId, skill.id);
  else {
    const ids = actor.skillIds.map(localSkillId);
    const sourceSkills = sourceValue(requirementId, 'skillIds') as Array<{ sourceLocalSkillId: string; printedNumber: number }>;
    const byNumber = Object.fromEntries(sourceSkills.map((skill) => [skill.printedNumber, skill.sourceLocalSkillId]));
    const stance = actor.d10SkillTable[0];
    for (const range of stance.ranges) for (const roll of range.rolls) result[`all:${roll}`] = ids.includes(byNumber[range.printedSkillNumber]) ? byNumber[range.printedSkillNumber] : '';
  }
  return result;
}
const combatIds = new Set(['tierB-templars-impaler','tierB-templars-warlord','tierB-mammoth-cyst','tierB-white-cell-stalk','tierB-shuffling-horror','tierB-cultist-priest','tierB-malignant-growth']);
for (const req of NORMALIZED_CORPUS.requirements) {
  for (const field of Object.keys(req.fields)) {
    const key = `${req.requirementId}.${field}`;
    if (SOURCE_BLOCKERS[key]) { add(req.requirementId, field, 'explicit-source-blocker', { field, blockerCode: SOURCE_BLOCKERS[key], proofTests: [`BLOCK:${key}`] }); continue; }
    if (['name','bossSlotPositions','spikedPitPositions'].includes(field) || req.requirementId.endsWith('-room-tile')) { add(req.requirementId, field, 'display-only', { field }); continue; }

    if (req.requirementId.startsWith('tierB-quest-')) {
      const quest = (env: CommunityRuntimeProjectionEnvironment) => env.profile.quests[Number(req.requirementId.match(/\d+$/)?.[0] ?? 1) - 1];
      if (field === 'provisionPolicyId.cardSpecific') { add(req.requirementId, field, 'engine-unsupported-blocker', { field, blockerCode: 'QUEST_CARD_PROVISION_POLICY_ENGINE_UNSUPPORTED' }); continue; }
      const selectors: Record<string, (env: CommunityRuntimeProjectionEnvironment) => unknown> = {
        name: env => quest(env).name,
        guardianDefinitionId: env => quest(env).guardianDefinitionId.replace('community-dd-guardian-family-', ''),
        skippedFinalFormId: env => quest(env).skippedFinalFormId,
        firewoodCount: env => quest(env).firewoodCount,
      };
      const normalizeGuardian = (value: unknown) => { const ids = (value as any).mappedComponentIds as string[]; return ids.includes('shuffling-horror') ? 'shuffling-horror' : ids.includes('mammoth-cyst') ? 'mammoth-cyst' : 'templars'; };
      add(req.requirementId, field, 'consumed', { field, runtimeSelector: selectors[field], runtimeSelectorId: `quest.${field}`, normalizeSource: field === 'guardianDefinitionId' ? normalizeGuardian : identity, normalizerId: field === 'guardianDefinitionId' ? 'guardian-family.v1' : 'identity.v1' }); continue;
    }

    if (req.requirementId === 'tierB-dd-dungeon-tile') {
      if (field === 'tileGeometry') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'layout.topology', runtimeSelector: env => env.profile.layouts.map((layout) => ({ roomCount: layout.roomSlotIds.length, bossCount: layout.bossSlotIds.length })) , normalizeSource: value => (value as any[]).map(layout => ({ roomCount: layout.roomSlots.length, bossCount: layout.roomSlots.filter((slot: any) => slot.bossCandidate).length })), normalizerId: 'layout-topology.v1' });
      else add(req.requirementId, field, 'display-only', { field });
      continue;
    }

    if (combatIds.has(req.requirementId)) {
      if (field === 'resistances') { add(req.requirementId, field, 'engine-unsupported-blocker', { field, blockerCode: 'GUARDIAN_RESISTANCE_ENGINE_UNSUPPORTED' }); continue; }
      if (field === 'crit') { add(req.requirementId, field, 'engine-unsupported-blocker', { field, blockerCode: 'GUARDIAN_CRIT_ENGINE_UNSUPPORTED' }); continue; }
      if (['maxHp','dodge','speed'].includes(field)) { add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: `actor.${field}`, runtimeSelector: env => actorFor(req.requirementId, env).stats?.[field] ?? actorFor(req.requirementId, env)[field] }); continue; }
      if (field === 'skillIds') { add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'actor.skillIds', runtimeSelector: env => { const actor = actorFor(req.requirementId, env); return (actor.skills?.map((skill: any) => skill.id) ?? actor.skillIds).map((id: string) => actorSkillLocalId(req.requirementId, id)); }, normalizeSource: value => (value as any[]).map(skill => skill.sourceLocalSkillId), normalizerId: 'local-skill-ids.v1' }); continue; }
      if (field === 'd10SkillTable') { add(req.requirementId, field, 'consumed', { field, sourceSelector: () => sourceD10Map(req.requirementId), runtimeSelectorId: 'actor.d10Rolls', runtimeSelector: env => runtimeD10Map(req.requirementId, env), normalizerId: 'd10-by-local-skill.v1' }); continue; }
      if (field === 'accuracy' || field === 'damage') {
        for (const local of Object.keys(sourceValue(req.requirementId, field) as object)) {
          const path = `${field}.${local}`;
          const raw = sourceSubValue(req.requirementId, field, local);
          if (typeof raw === 'string' && field === 'accuracy') { add(req.requirementId, path, 'not-runtime-relevant', { field, sourceSelector: () => raw }); continue; }
          add(req.requirementId, path, 'consumed', { field, sourceSelector: () => raw, runtimeSelectorId: `actor.skill.${local}.${field}`, runtimeSelector: env => { const actor = actorFor(req.requirementId, env); if (!actor.skills) return actor[field][local]; const skill = actor.skills.find((candidate: any) => actorSkillLocalId(req.requirementId, candidate.id) === local); if (field === 'accuracy') return skill?.accuracy; if (typeof raw === 'number') return skill?.minDamage; return skill?.specialEffect; }, normalizeSource: value => typeof value === 'string' && /heal (\d+)/.test(value) ? { type: 'heal-monster', amount: Number(value.match(/heal (\d+)/)![1]) } : typeof value === 'string' && local === 'teleport' ? { type: 'teleport-hero' } : value, normalizeRuntime: value => value && typeof value === 'object' ? (({ type, amount }: any) => ({ type, ...(amount === undefined ? {} : { amount }) }))(value) : value, normalizerId: typeof raw === 'string' ? 'special-effect.v1' : 'identity.v1' });
        }
        continue;
      }
      if (field === 'teleportationD10Map') { add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'mammothRoom.teleportationD10Map', runtimeSelector: env => env.mammothRoom.teleportationD10Map }); continue; }
    }

    if (req.requirementId === 'tierB-templars-room') {
      if (field === 'areaIds') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'templarsRoom.validAreaIds', runtimeSelector: env => env.templarsRoom.validAreaIds });
      else if (field === 'areaCapacities') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'templarsRoom.areaCapacities', runtimeSelector: env => env.templarsRoom.areaCapacities });
      else if (field === 'pitD10Map') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'templarsRoom.pitTossD10Map', runtimeSelector: env => Object.fromEntries(Object.entries(env.templarsRoom.pitTossD10Map).map(([roll,id]) => [roll, id.replace('community-dd-spiked-pit-', '')])), normalizerId: 'pit-local-id.v1' });
      else if (field === 'pitEntryEffects') { add(req.requirementId, `${field}.damage`, 'consumed', { field, sourceSelector: () => sourceSubValue(req.requirementId, field, 'damage'), runtimeSelectorId: 'templarsRoom.pit.damage', runtimeSelector: env => env.templarsRoom.spikedPits[0].entryEffects.find(effect => effect.kind === 'damage')?.amount }); add(req.requirementId, `${field}.bleed`, 'consumed', { field, sourceSelector: () => sourceSubValue(req.requirementId, field, 'bleed'), runtimeSelectorId: 'templarsRoom.pit.bleed', runtimeSelector: env => { const effect = env.templarsRoom.spikedPits[0].entryEffects.find(item => item.kind === 'condition' && item.condition === 'bleed'); return { amount: effect?.amount, turns: effect?.duration }; } }); add(req.requirementId, `${field}.pitToss`, 'consumed', { field, sourceSelector: () => true, runtimeSelectorId: 'templar.bodySlam.pitToss', runtimeSelector: env => env.templarImpaler.skills.some(skill => skill.onHitEffects.some(effect => effect.type === 'trigger-pit-toss')) }); }
      else if (field === 'victoryCondition') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'templarsEncounter.victoryCondition', runtimeSelector: env => env.templarsEncounter.victoryCondition, normalizeSource: () => 'all-boss-members-defeated', normalizerId: 'templar-victory.v1' });
      continue;
    }

    if (req.requirementId === 'tierB-mammoth-cyst-room') {
      if (field === 'spawnAreaPolicy') { for (const part of ['mammothInitialArea','summonPlacement','stanceToArea','noSpace']) { const path = `${field}.${part}`; if (part === 'noSpace') add(req.requirementId, path, 'engine-unsupported-blocker', { field, sourceSelector: () => sourceSubValue(req.requirementId, field, part), blockerCode: 'MAMMOTH_STALK_NO_SPACE_RESOLUTION_ENGINE_UNSUPPORTED' }); else add(req.requirementId, path, 'consumed', { field, sourceSelector: () => sourceSubValue(req.requirementId, field, part), runtimeSelectorId: `mammothRoom.${path}`, runtimeSelector: env => part === 'mammothInitialArea' ? env.mammothRoom.mammothCystPlacement.areaId : part === 'stanceToArea' ? env.mammothRoom.stanceAreaMap : env.mammothRoom.whiteCellStalkSpawn.areaPolicy, normalizeSource: part === 'summonPlacement' ? () => 'corresponding-stance-area' : identity, normalizerId: part === 'summonPlacement' ? 'spawn-area-policy.v1' : 'identity.v1' }); } }
      else if (field === 'spawnStancePolicy') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'mammothSummon.policy', runtimeSelector: env => ({ mammothInitialStance: env.mammothCyst.requiredStance, whiteCellStalk: env.mammothRoom.whiteCellStalkSpawn.stancePolicy, trigger: env.mammothSummon.condition.type, whiteCellStalkInitiativeCards: env.mammothSummon.initiativeCardsToAdd }), normalizeSource: value => ({ mammothInitialStance: (value as any).mammothInitialStance, whiteCellStalk: 'first-empty-stance', trigger: 'no-alive-actors-with-tag', whiteCellStalkInitiativeCards: (value as any).whiteCellStalkInitiativeCards }), normalizerId: 'mammoth-summon-policy.v1' });
      else if (field === 'areaIds') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'mammothRoom.validAreaIds', runtimeSelector: env => env.mammothRoom.validAreaIds });
      else if (field === 'areaCapacities') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'mammothRoom.areaCapacities', runtimeSelector: env => env.mammothRoom.areaCapacities });
      else if (field === 'teleportationD10Map') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'mammothRoom.teleportationD10Map', runtimeSelector: env => env.mammothRoom.teleportationD10Map });
      else if (field === 'victoryCondition') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'mammothGuardian.victory', runtimeSelector: env => ({ objective: env.mammothGuardian.victoryCondition, remainingMonsters: env.mammothGuardian.cleanupPolicy, roundLimit: 'not-counted' }), normalizeSource: () => ({ objective: 'boss-defeated', remainingMonsters: 'remove-linked-actors-on-boss-victory', roundLimit: 'not-counted' }), normalizerId: 'mammoth-victory.v1' });
      continue;
    }

    if (req.requirementId === 'tierB-shuffling-horror-room') {
      if (field === 'areaIds') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'shufflingRoom.areaIds', runtimeSelector: env => env.shufflingRoom.areaIds });
      else if (field === 'areaCapacities') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'shufflingRoom.areaCapacities', runtimeSelector: env => env.shufflingRoom.areaCapacities });
      else add(req.requirementId, field, 'engine-unsupported-blocker', { field, blockerCode: 'GUARDIAN_VICTORY_POLICY_ENGINE_UNSUPPORTED' });
      continue;
    }

    const finalForm = (env: CommunityRuntimeProjectionEnvironment, formId: string) => env.profile.finalForms.find(form => form.formId === formId)!;
    const finalMap: Record<string, { form: string; kind: 'hp' | 'skills' }> = {
      'tierB-ancestor-first-form.ancestor.maxHp': { form: 'ancestor-first-form', kind: 'hp' }, 'tierB-ancestor-first-form.ancestor.skillIds': { form: 'ancestor-first-form', kind: 'skills' },
      'tierB-ancestor-second-form.ancestor.maxHp': { form: 'ancestor-second-form', kind: 'hp' }, 'tierB-ancestor-second-form.ancestor.skillIds': { form: 'ancestor-second-form', kind: 'skills' },
      'tierB-gestating-heart.maxHp': { form: 'gestating-heart', kind: 'hp' }, 'tierB-gestating-heart.skillIds': { form: 'gestating-heart', kind: 'skills' },
      'tierB-heart-of-darkness.maxHp': { form: 'heart-of-darkness', kind: 'hp' }, 'tierB-heart-of-darkness.skillIds': { form: 'heart-of-darkness', kind: 'skills' },
    };
    if (finalMap[key]) { const mapping = finalMap[key]; add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: `finalForm.${mapping.form}.${mapping.kind}`, runtimeSelector: env => mapping.kind === 'hp' ? finalForm(env, mapping.form).maxHp : finalForm(env, mapping.form).skillIds.map(localSkillId), normalizeSource: mapping.kind === 'skills' ? value => (Array.isArray(value) ? value : [value]).map((skill: any) => skill.sourceLocalSkillId) : identity, normalizerId: mapping.kind === 'skills' ? 'local-skill-ids.v1' : 'identity.v1' }); continue; }

    if (req.requirementId === 'tierB-ancestor-room') {
      if (field === 'areaIds') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'ancestorRoom.validAreaIds', runtimeSelector: env => env.ancestorRoom.validAreaIds });
      else if (field === 'areaCapacities') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'ancestorRoom.areaCapacities', runtimeSelector: env => env.ancestorRoom.areaCapacities });
      else if (field === 'formAreaPlacement') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'ancestorRoom.stanceAreaMap', runtimeSelector: env => env.ancestorRoom.stanceAreaMap, normalizeSource: () => ({ aggressive: 'r12-C', defensive: 'r12-N', ranged: 'r12-NW', support: 'r12-S' }), normalizerId: 'ancestor-stance-area-map.v1' });
      else add(req.requirementId, field, 'engine-unsupported-blocker', { field, blockerCode: 'FINAL_ROOM_TRANSITION_ENGINE_UNSUPPORTED' });
      continue;
    }

    if (req.requirementId === 'tierB-ancestor-first-form') {
      if (field === 'perfectReflection.maxHp') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'ancestorFirst.perfect.maxWounds', runtimeSelector: env => env.ancestorFirst.reflectionCards.find(card => card.kind === 'perfect')?.maxWounds });
      else if (field === 'imperfectReflection.maxHp') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'ancestorFirst.imperfect.maxWounds', runtimeSelector: env => env.ancestorFirst.reflectionCards.find(card => card.kind === 'imperfect')?.maxWounds });
      else if (field.endsWith('.skillIds')) { const kind = field.startsWith('perfect') ? 'perfect' : 'imperfect'; add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: `ancestorFirst.${kind}.skillIds`, runtimeSelector: env => env.ancestorFirst.reflectionCards.find(card => card.kind === kind)?.skillIds.map(localSkillId), normalizeSource: value => (value as any[]).map(skill => skill.sourceLocalSkillId), normalizerId: 'local-skill-ids.v1' }); }
      else if (field === 'timeHealsAll.effect') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'ancestorFirst.fullStanceSkillEffect', runtimeSelector: env => env.ancestorFirst.fullStanceSkillEffect });
      else if (field === 'vacantStanceFillSource') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'ancestorFirst.vacantStanceD10Map', runtimeSelector: env => env.ancestorFirst.vacantStanceD10Map, normalizeSource: () => ({ 1:'perfect',2:'perfect',3:'perfect',4:'imperfect',5:'imperfect',6:'imperfect',7:'imperfect',8:'imperfect',9:'imperfect',10:'imperfect' }), normalizerId: 'reflection-d10-map.v1' });
      continue;
    }

    if (req.requirementId === 'tierB-perfect-reflection' || req.requirementId === 'tierB-imperfect-reflection') { const kind = req.requirementId.includes('imperfect') ? 'imperfect' : 'perfect'; if (field === 'maxHp') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: `ancestorFirst.${kind}.maxWounds`, runtimeSelector: env => env.ancestorFirst.reflectionCards.find(card => card.kind === kind)?.maxWounds }); else add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: `ancestorFirst.${kind}.skillIds`, runtimeSelector: env => env.ancestorFirst.reflectionCards.find(card => card.kind === kind)?.skillIds.map(localSkillId), normalizeSource: value => (value as any[]).map(skill => skill.sourceLocalSkillId), normalizerId: 'local-skill-ids.v1' }); continue; }
    if (req.requirementId === 'tierB-ancestor-second-form' && field === 'absoluteNothingness.areaIds') { add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'ancestorSecond.absoluteNothingness', runtimeSelector: env => Object.fromEntries(env.ancestorSecond.absoluteNothingness.map(item => [item.linkedStance, item.areaId])) }); continue; }
    if (req.requirementId === 'tierB-absolute-nothingness' && field === 'areaId') { add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'ancestorSecond.absoluteNothingness.areaIds', runtimeSelector: env => Object.fromEntries(env.ancestorSecond.absoluteNothingness.map(item => [item.linkedStance, item.areaId])) }); continue; }
    if (req.requirementId === 'tierB-gestating-heart' && field === 'd10SkillTable') { add(req.requirementId, field, 'engine-unsupported-blocker', { field, blockerCode: 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED' }); continue; }
    if (req.requirementId === 'tierB-heart-of-darkness' && field === 'impendingDoomD10SkillMap') { add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'heartOfDarkness.impendingDoom.d10SkillMap', runtimeSelector: env => Object.fromEntries(Object.entries(env.heartOfDarkness.impendingDoom.d10SkillMap).map(([roll,id]) => [roll, localSkillId(id)])), normalizeSource: value => { const source = value as Record<string,string>; const names = sourceValue(req.requirementId, 'skillIds') as Array<{ sourceLocalSkillId: string; printedName: string }>; const id = (name: string) => names.find(skill => skill.printedName === name)?.sourceLocalSkillId; return { 1:id(source.rolls1to4),2:id(source.rolls1to4),3:id(source.rolls1to4),4:id(source.rolls1to4),5:id(source.rolls5to7),6:id(source.rolls5to7),7:id(source.rolls5to7),8:id(source.rolls8to10),9:id(source.rolls8to10),10:id(source.rolls8to10) }; }, normalizerId: 'final-d10-local-skill.v1' }); continue; }
    if (req.requirementId === 'tierB-darkest-dungeon-monster-deck') {
      if (field === 'deckComposition') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'profile.monsterComposition.physicalInstances', runtimeSelector: env => env.profile.monsterComposition.map(monster => ({ sourceLocalMonsterDefinitionId: monster.sourceLocalMonsterDefinitionId, count: monster.physicalInstances.length, members: monster.physicalInstances.map(member => ({ guid: member.guid, cardId: member.cardId })) })), normalizeSource: value => (value as any).composition.map((monster: any) => ({ sourceLocalMonsterDefinitionId: monster.sourceLocalMonsterDefinitionId, count: monster.count, members: monster.members })), normalizerId: 'monster-composition.v1' });
      else if (field === 'monsterDefinitionIds') add(req.requirementId, field, 'consumed', { field, runtimeSelectorId: 'profile.monsterComposition.ids', runtimeSelector: env => env.profile.monsterComposition.map(monster => monster.sourceLocalMonsterDefinitionId), normalizeSource: value => (value as any[]).map(monster => monster.sourceLocalMonsterDefinitionId), normalizerId: 'monster-local-ids.v1' });
      continue;
    }

    add(req.requirementId, field, 'not-runtime-relevant', { field });
  }
}

export const COMMUNITY_RUNTIME_PROJECTION_PROOFS = proofs;
export function validateCommunityRuntimeProjectionProofs(input = proofs, environment = COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT, blockers: readonly any[] = COMMUNITY_RUNTIME_BLOCKERS): string[] {
  const errors: string[] = [];
  const coveredFields = new Set(input.map(proof => `${proof.requirementId}.${proof.sourcePath.split('.').slice(0, Object.keys(requirement(proof.requirementId).fields).some(field => proof.sourcePath.startsWith(`${field}.`)) ? 1 : undefined).join('.')}`));
  for (const req of NORMALIZED_CORPUS.requirements) for (const field of Object.keys(req.fields)) if (!input.some(proof => proof.requirementId === req.requirementId && (proof.sourcePath === field || proof.sourcePath.startsWith(`${field}.`)))) errors.push(`unclassified field ${req.requirementId}.${field}`);
  void coveredFields;
  const keys = input.map(proof => `${proof.requirementId}.${proof.sourcePath}`); if (new Set(keys).size !== keys.length) errors.push('duplicate semantic leaf');
  for (const proof of input) {
    if (!proof.classification || proof.proofTests.length === 0) errors.push(`incomplete proof ${proof.requirementId}.${proof.sourcePath}`);
    if (proof.classification === 'consumed') {
      if (input.some(candidate => candidate !== proof && candidate.requirementId === proof.requirementId && candidate.sourcePath.startsWith(`${proof.sourcePath}.`) && candidate.classification.endsWith('blocker'))) errors.push(`compound parent consumed above blocked child ${proof.requirementId}.${proof.sourcePath}`);
      if (!proof.runtimeSelector || !proof.runtimeSelectorId) { errors.push(`missing runtime selector ${proof.requirementId}.${proof.sourcePath}`); continue; }
      try { if (stable(proof.normalizeSource(proof.sourceSelector())) !== stable(proof.normalizeRuntime(proof.runtimeSelector(environment)))) errors.push(`runtime semantic mismatch ${proof.requirementId}.${proof.sourcePath}`); } catch (error) { errors.push(`selector failure ${proof.requirementId}.${proof.sourcePath}: ${String(error)}`); }
    }
    if (proof.classification.endsWith('blocker')) {
      const blocker = blockers.find(item => item.code === proof.blockerCode);
      if (!blocker || !blocker.sourcePath || !blocker.runtimeDependency || !blocker.firstBlockingFunction || blocker.tests.length === 0) errors.push(`invalid blocker proof ${proof.requirementId}.${proof.sourcePath}`);
    }
  }
  for (const blocker of blockers) if (!blocker.sourcePath || !blocker.runtimeDependency || !blocker.firstBlockingFunction || !Array.isArray(blocker.tests) || blocker.tests.length === 0) errors.push(`active blocker metadata incomplete ${blocker.code}`);
  return errors;
}

export function materializeCommunityRuntimeFieldCoverage(environment = COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT) {
  return proofs.map(proof => {
    const sourceCanonical = proof.normalizeSource(proof.sourceSelector());
    const runtimeCanonical = proof.runtimeSelector ? proof.normalizeRuntime(proof.runtimeSelector(environment)) : null;
    return { requirementId: proof.requirementId, sourcePath: proof.sourcePath, classification: proof.classification, sourceReference: proof.sourceReference, sourceValueHash: runtimeSemanticHash(sourceCanonical), runtimeValueHash: proof.classification === 'consumed' ? runtimeSemanticHash(runtimeCanonical) : null, runtimeSelectorId: proof.runtimeSelectorId ?? null, normalizerId: proof.normalizerId, blockerCode: proof.blockerCode ?? null, tests: proof.proofTests };
  });
}

export const COMMUNITY_RUNTIME_FIELD_COVERAGE = materializeCommunityRuntimeFieldCoverage();
export function validateCommunityRuntimeFieldCoverage(_coverage = COMMUNITY_RUNTIME_FIELD_COVERAGE, environment = COMMUNITY_RUNTIME_PROJECTION_ENVIRONMENT): string[] { return validateCommunityRuntimeProjectionProofs(proofs, environment); }
export function runtimeFieldCoverageTotals() {
  const entries = COMMUNITY_RUNTIME_FIELD_COVERAGE;
  const count = (classification: RuntimeFieldClassification) => entries.filter(entry => entry.classification === classification).length;
  const selectorExpected = entries.filter(entry => entry.classification === 'consumed').length;
  const selectorResolved = entries.filter(entry => entry.classification === 'consumed' && entry.runtimeSelectorId).length;
  return { total: entries.length, consumed: count('consumed'), 'explicit-source-blocker': count('explicit-source-blocker'), 'engine-unsupported-blocker': count('engine-unsupported-blocker'), 'display-only': count('display-only'), 'not-runtime-relevant': count('not-runtime-relevant'), unclassified: validateCommunityRuntimeProjectionProofs().filter(error => error.startsWith('unclassified')).length, runtimeSelectorExpected: selectorExpected, runtimeSelectorResolved: selectorResolved, runtimeSelectorMissing: selectorExpected - selectorResolved };
}

export const COMMUNITY_COMBAT_SEMANTICS = Object.fromEntries(NORMALIZED_CORPUS.requirements.filter(req => req.componentType === 'battle-card').map(req => [req.requirementId, { criticalHits: req.fields.crit?.value }]));
export const COMMUNITY_SHUFFLING_POLICY_PROVENANCE = { initialArea: { classification: 'engine-unsupported-blocker', blockerCode: 'SHUFFLING_INITIAL_AREA_UNRESOLVED' }, capacityPerStance: { classification: 'generic-engine-rule', sourceReference: 'src/types/shuffling-horror.ts' } } as const;
