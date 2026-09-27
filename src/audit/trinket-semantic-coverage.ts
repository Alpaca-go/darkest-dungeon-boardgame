import type {
  ActiveEffectDefinition, ActiveModifierDefinition, TrinketDefinition, TrinketSideDefinition, TrinketUseCondition,
} from '../types/trinkets';
import { missingModifierConsumers } from './trinket-modifier-consumer-coverage';
import { missingEffectConsumers } from './trinket-effect-consumer-coverage';
import { missingConditionConsumers } from './trinket-condition-consumer-coverage';
import { trinketTriggerScopeBinding, type TrinketSourceTimingScopeStatus } from './trinket-trigger-scope-coverage';

export type TrinketSemanticImplementationStatus = 'IMPLEMENTED' | 'PARTIAL' | 'UNSUPPORTED' | 'SOURCE_UNRESOLVED';
export type TrinketSemanticMismatchCode =
  | 'TRINKET_TRIGGER_MISMATCH' | 'TRINKET_WINDOW_MISMATCH' | 'TRINKET_TARGET_MISMATCH'
  | 'TRINKET_MODIFIER_TYPE_MISMATCH' | 'TRINKET_MODIFIER_AMOUNT_MISMATCH' | 'TRINKET_MODIFIER_OPERATION_MISMATCH'
  | 'TRINKET_EFFECT_TYPE_MISMATCH' | 'TRINKET_EFFECT_PARAMETER_MISMATCH'
  | 'TRINKET_CONDITION_MISMATCH' | 'TRINKET_RUNTIME_ADDED_CONDITION_UNSUPPORTED'
  | 'TRINKET_TRIGGER_SCOPE_UNRESOLVED' | 'TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED'
  | 'TRINKET_MODIFIER_CONSUMER_MISSING' | 'TRINKET_SOURCE_PAYLOAD_CANONICALIZATION_UNSUPPORTED'
  | 'TRINKET_EFFECT_CONSUMER_MISSING';

export interface CanonicalCondition { type: string; operator?: string; value?: string | number | boolean }
export interface CanonicalModifier { stat: string; operation: 'add' | 'set'; amount: number }
export interface CanonicalEffect { type: string; target: string; parameters: Record<string, unknown> }
export interface CanonicalTrinketSidePayload {
  trigger: string; target: string; conditions: CanonicalCondition[]; modifiers: CanonicalModifier[]; effects: CanonicalEffect[];
}
export interface RuntimeTrinketSemanticBindings {
  trigger: string | null; window: string | null; target: string | null;
  derivedConditionEvidence?: Readonly<Record<string, string>>;
}
export interface TrinketSemanticMismatch { code: TrinketSemanticMismatchCode; source: unknown; runtime: unknown }
export interface TrinketSemanticComparison {
  triggerMatch: boolean; windowMatch: boolean; targetMatch: boolean;
  modifierMatch: boolean; modifierConsumerMatch: boolean; missingModifierConsumers: string[];
  effectMatch: boolean; conditionMatch: boolean;
  effectConsumerMatch: boolean; missingEffectConsumers: string[];
  sourcePayload: CanonicalTrinketSidePayload; runtimePayload: CanonicalTrinketSidePayload;
  derivedRuntimeConditions: CanonicalCondition[]; runtimeConditionEvidence: string[];
  unsupportedRuntimeConditions: string[]; unsupportedRuntimeBehavior: string[];
  mismatches: TrinketSemanticMismatch[]; runtimeSliceSemanticComplete: boolean;
}
export interface TrinketSemanticObligation {
  obligationId: string; definitionId: string; side: 'positive' | 'negative'; printedText: string;
  trigger: string; sourceUseWindow: string; target: string;
  sourceConditions: readonly unknown[]; sourceModifiers: readonly unknown[]; sourceEffects: readonly unknown[];
  runtimeTriggerBinding: string | null; runtimeWindowBinding: string | null; runtimeTargetBinding: string | null;
  runtimeConditionBindings: string[]; derivedRuntimeConditions: CanonicalCondition[];
  unsupportedRuntimeConditions: string[]; unsupportedRuntimeBehavior: string[]; runtimeConditionEvidence: string[];
  runtimeEffectBindings: string[];
  triggerMatch: boolean; windowMatch: boolean; targetMatch: boolean;
  modifierMatch: boolean; modifierConsumerMatch: boolean; missingModifierConsumers: string[];
  effectMatch: boolean; conditionMatch: boolean; runtimeSliceSemanticComplete: boolean;
  effectConsumerMatch: boolean; missingEffectConsumers: string[];
  triggerScopeComplete: boolean; sourceTimingScopeStatus: TrinketSourceTimingScopeStatus;
  semanticMismatches: TrinketSemanticMismatch[];
  implementationStatus: TrinketSemanticImplementationStatus; proofIds: string[]; blockerCode: string | null;
}
export interface TrinketSourceSide {
  label: string; trigger: string; useWindow: string; target: string;
  conditions: readonly unknown[]; modifiers: readonly unknown[]; effects: readonly unknown[];
  unresolvedFields: readonly string[]; runtimeSupport: { existingCandidates: readonly string[] };
}
export interface TrinketSourceDefinition {
  id: string; sourceStatus: string; unresolvedFields: readonly string[];
  positiveSide: TrinketSourceSide; negativeSide: TrinketSourceSide;
}
export interface TrinketProofBinding {
  productionTests: readonly string[]; saveReplayTests: readonly string[];
  selectorTests: readonly string[]; e2eTests: readonly string[];
}

const sideDefinition = (adapter: TrinketDefinition | undefined, side: 'positive' | 'negative'): TrinketSideDefinition | undefined =>
  side === 'positive' ? adapter?.positiveSide : adapter?.negativeSide;
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).sort().join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, child]) => `${key}:${stable(child)}`).join(',')}}`;
  return JSON.stringify(value);
};
const exactArray = (a: readonly unknown[], b: readonly unknown[]) => stable(a) === stable(b);

export function canonicalSourceModifier(value: unknown): CanonicalModifier | null {
  const entry = object(value);
  return entry.kind === 'modify' && typeof entry.stat === 'string' && typeof entry.amount === 'number'
    ? { stat: entry.stat, operation: entry.operation === 'set' ? 'set' : 'add', amount: entry.amount } : null;
}
export function canonicalRuntimeModifier(value: ActiveModifierDefinition): CanonicalModifier {
  return { stat: value.type, operation: value.operation ?? 'add', amount: value.amount };
}
export function canonicalSourceCondition(value: unknown): CanonicalCondition | null {
  const entry = object(value);
  if (entry.kind === 'stance' && typeof entry.value === 'string' && typeof entry.negated === 'boolean') {
    return { type: 'stance', operator: entry.negated ? '!=' : '==', value: entry.value };
  }
  if (entry.kind === 'light' && typeof entry.operator === 'string' && typeof entry.value === 'number') {
    return { type: 'light', operator: entry.operator, value: entry.value };
  }
  if (typeof entry.kind !== 'string') return null;
  return { type: entry.kind, ...(typeof entry.operator === 'string' ? { operator: entry.operator } : {}),
    ...(['string', 'number', 'boolean'].includes(typeof entry.value) ? { value: entry.value as string | number | boolean } : {}) };
}
export function canonicalRuntimeCondition(value: TrinketUseCondition): CanonicalCondition {
  if (value.type === 'stance') return { type: 'stance', operator: value.negated ? '!=' : '==', value: value.value };
  if (value.type === 'min-light') return { type: 'light', operator: '>=', value: value.value };
  if (value.type === 'max-light') return { type: 'light', operator: '<=', value: value.value };
  return { type: value.type };
}
export function canonicalSourceEffect(value: unknown, target: string): CanonicalEffect | null {
  const entry = object(value);
  if (typeof entry.kind !== 'string') return null;
  return { type: entry.kind, target: typeof entry.target === 'string' ? entry.target : target,
    parameters: Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'kind' && key !== 'target')) };
}
export function canonicalRuntimeEffect(value: ActiveEffectDefinition, target: string): CanonicalEffect {
  switch (value.type) {
    case 'heal-self': return { type: 'heal', target, parameters: { amount: value.amount } };
    case 'stress-self': return { type: 'change-stress', target, parameters: { amount: value.amount } };
    case 'recover-stress-self': return { type: 'change-stress', target, parameters: { amount: -value.amount } };
    case 'consume-provision': return { type: 'consume-provision', target, parameters: { provision: value.provision, amount: value.amount } };
    case 'apply-condition-self': return { type: 'apply-condition-stack', target, parameters: { condition: value.condition, amount: value.amount } };
    case 'apply-condition-stack': return { type: 'apply-condition-stack', target: value.target, parameters: {
      condition: value.condition, amount: value.amount, turns: value.durationTurns,
    } };
    case 'damage-self': return { type: 'damage', target, parameters: { amount: value.amount } };
    case 'change-light': return { type: 'change-light', target, parameters: { amount: value.amount } };
    case 'scale-incoming-damage': return { type: 'scale-incoming-damage', target, parameters: {
      factor: value.numerator / value.denominator,
      rounding: value.rounding === 'ceil' ? 'up' : value.rounding,
    } };
    case 'roll-provision-dice': return { type: 'roll-provision-dice', target: value.target, parameters: { count: value.count } };
    case 'discard-disease': return { type: 'discard-disease', target: value.target, parameters: { immediately: value.immediately } };
    case 'convert-incoming-hit-to-critical': return { type: 'convert-incoming-hit-to-critical', target: value.target, parameters: {} };
    case 'ignore-exploration-result': return { type: 'ignore-result', target: value.target, parameters: { options: value.options } };
    case 'replace-exploration-result': return { type: 'replace-result', target: value.target, parameters: { from: value.from, to: value.to } };
    case 'log-only': return { type: 'log-only', target, parameters: { note: value.note } };
  }
}

export const RUNTIME_WINDOW_BINDINGS: Readonly<Record<string, { trigger: string; target: string }>> = Object.freeze({
  'after-attack-roll-before-hit-resolution': { trigger: 'hero-skill-resolution', target: 'skill' },
  'before-damage-applied': { trigger: 'hero-skill-hits', target: 'skill' },
  'before-healing-delivered-resolution': { trigger: 'hero-heals', target: 'healing-delivered' },
  'before-healing-received-resolution': { trigger: 'hero-is-healed', target: 'healing-received' },
  'before-incoming-hit-resolution': { trigger: 'incoming-attack', target: 'equipped-hero' },
  'before-incoming-damage-applied': { trigger: 'hero-hit-by-attack', target: 'equipped-hero' },
  'after-dungeon-roll': { trigger: 'exploration-die-result', target: 'exploration-die' },
  'before-camp-resolution': { trigger: 'camping', target: 'party-provisions' },
  'before-scout-resolution': { trigger: 'scout', target: 'equipped-hero' },
  'before-disease-acquisition-commit': { trigger: 'disease-acquired', target: 'new-disease' },
});
function bindingForRuntime(runtime: TrinketSideDefinition | undefined): RuntimeTrinketSemanticBindings {
  if (!runtime || runtime.useWindows.length !== 1) return { trigger: null, window: null, target: null };
  const window = runtime.useWindows[0]; const semantic = RUNTIME_WINDOW_BINDINGS[window];
  const evidence = runtime.canUse?.reduce<Record<string, string>>((out, condition) => {
    if (semantic?.trigger === 'hero-skill-resolution' && condition.type === 'in-battle') out['in-battle'] = 'C1BR-HERO-SKILL-WINDOW-DERIVATION:DERIVED_FROM_TRIGGER';
    if ((semantic?.trigger === 'incoming-attack' || semantic?.trigger === 'hero-hit-by-attack') && condition.type === 'in-battle') {
      out['in-battle'] = 'C1C8-MONSTER-ATTACK-WINDOW-DERIVATION:DERIVED_FROM_TRIGGER';
    }
    if (semantic?.trigger === 'hero-hit-by-attack' && condition.type === 'incoming-hit-not-critical') {
      out['incoming-hit-not-critical'] = 'C1C13-HOLINESS-CARD-GRAMMAR-AND-CRITICAL-INSTEAD-OF-STANDARD:DERIVED_FROM_TRIGGER';
    }
    if ((semantic?.trigger === 'camping' || semantic?.trigger === 'scout') && condition.type === 'out-of-battle') {
      out['out-of-battle'] = 'C1C10-DUNGEON-ACTION-WINDOW-DERIVATION:DERIVED_FROM_TRIGGER';
    }
    if (semantic?.trigger === 'hero-skill-resolution' && condition.type === 'is-acting-hero') out['is-acting-hero'] = 'C1BR-SOURCE-TRIGGER-ACTOR-DERIVATION:DERIVED_FROM_TRIGGER';
    return out;
  }, {});
  return { trigger: semantic?.trigger ?? null, window, target: semantic?.target ?? null, derivedConditionEvidence: evidence };
}

function modifierMismatch(source: CanonicalModifier[], runtime: CanonicalModifier[]): TrinketSemanticMismatch | null {
  const canonical = (values: CanonicalModifier[]) => [...values].sort((left, right) =>
    left.stat.localeCompare(right.stat) || left.operation.localeCompare(right.operation) || left.amount - right.amount);
  const expectedModifiers = canonical(source); const runtimeModifiers = canonical(runtime);
  if (expectedModifiers.length !== runtimeModifiers.length) {
    return { code: 'TRINKET_MODIFIER_TYPE_MISMATCH', source: expectedModifiers, runtime: runtimeModifiers };
  }
  for (let index = 0; index < expectedModifiers.length; index += 1) {
    const expected = expectedModifiers[index]; const actual = runtimeModifiers[index];
    if (expected.stat !== actual.stat) return { code: 'TRINKET_MODIFIER_TYPE_MISMATCH', source: expected, runtime: actual };
    if (expected.operation !== actual.operation) return { code: 'TRINKET_MODIFIER_OPERATION_MISMATCH', source: expected, runtime: actual };
    if (expected.amount !== actual.amount) return { code: 'TRINKET_MODIFIER_AMOUNT_MISMATCH', source: expected, runtime: actual };
  }
  return null;
}
function effectMismatch(source: CanonicalEffect[], runtime: CanonicalEffect[]): TrinketSemanticMismatch | null {
  if (source.length !== runtime.length) return { code: 'TRINKET_EFFECT_TYPE_MISMATCH', source, runtime };
  for (let index = 0; index < source.length; index += 1) {
    const expected = source[index]; const actual = runtime[index];
    if (expected.type !== actual.type) return { code: 'TRINKET_EFFECT_TYPE_MISMATCH', source: expected, runtime: actual };
    if (expected.target !== actual.target || stable(expected.parameters) !== stable(actual.parameters)) {
      return { code: 'TRINKET_EFFECT_PARAMETER_MISMATCH', source: expected, runtime: actual };
    }
  }
  return null;
}

/** Exact, card-agnostic source → runtime semantic payload comparison. */
export function compareTrinketSemanticPayload(
  sourceSide: TrinketSourceSide,
  runtimeSide: TrinketSideDefinition | undefined,
  bindings: RuntimeTrinketSemanticBindings = bindingForRuntime(runtimeSide),
): TrinketSemanticComparison {
  const sourceModifiers = sourceSide.modifiers.map(canonicalSourceModifier).filter((entry): entry is CanonicalModifier => entry !== null);
  const runtimeModifiers = (runtimeSide?.modifiers ?? []).filter((entry) => (entry.operation ?? 'add') !== 'set').map(canonicalRuntimeModifier);
  const sourceEffects = sourceSide.effects.map((entry) => canonicalSourceEffect(entry, sourceSide.target)).filter((entry): entry is CanonicalEffect => entry !== null);
  const runtimeEffects: CanonicalEffect[] = [
    ...(runtimeSide?.effects ?? []).map((entry) => canonicalRuntimeEffect(entry, bindings.target ?? sourceSide.target)),
    ...(runtimeSide?.modifiers ?? []).filter((entry) => entry.operation === 'set').map((entry) => ({
      type: `set-${entry.type}`, target: bindings.target ?? sourceSide.target, parameters: { amount: entry.amount },
    })),
  ];
  const sourceConditions = sourceSide.conditions.map(canonicalSourceCondition).filter((entry): entry is CanonicalCondition => entry !== null);
  const sourceCanonicalizationComplete = sourceModifiers.length === sourceSide.modifiers.length
    && sourceEffects.length === sourceSide.effects.length
    && sourceConditions.length === sourceSide.conditions.length;
  const sourceConditionRuntime: CanonicalCondition[] = []; const derivedRuntimeConditions: CanonicalCondition[] = [];
  const runtimeConditionEvidence: string[] = []; const unsupportedRuntimeConditions: string[] = [];
  for (const condition of (runtimeSide?.canUse ?? []).map(canonicalRuntimeCondition)) {
    if (sourceConditions.some((candidate) => stable(candidate) === stable(condition))) sourceConditionRuntime.push(condition);
    else {
      const evidence = bindings.derivedConditionEvidence?.[condition.type];
      if (evidence?.endsWith(':DERIVED_FROM_TRIGGER')) { derivedRuntimeConditions.push(condition); runtimeConditionEvidence.push(evidence); }
      else unsupportedRuntimeConditions.push(stable(condition));
    }
  }
  const triggerMatch = bindings.trigger === sourceSide.trigger;
  const expectedWindow = Object.entries(RUNTIME_WINDOW_BINDINGS).find(([, value]) => value.trigger === sourceSide.trigger && value.target === sourceSide.target)?.[0] ?? null;
  const windowMatch = bindings.window !== null && bindings.window === expectedWindow && runtimeSide?.useWindows.length === 1;
  const targetMatch = bindings.target === sourceSide.target;
  const modifierProblem = modifierMismatch(sourceModifiers, runtimeModifiers);
  const consumersMissing = missingModifierConsumers(sourceModifiers, sourceSide.trigger);
  const modifierConsumerMatch = consumersMissing.length === 0;
  const effectProblem = effectMismatch(sourceEffects, runtimeEffects);
  const effectsMissing = missingEffectConsumers(sourceEffects);
  const effectConsumerMatch = effectsMissing.length === 0;
  const conditionExact = exactArray(sourceConditions, sourceConditionRuntime);
  const conditionConsumersMissing = missingConditionConsumers(runtimeSide?.canUse ?? []);
  const conditionMatch = conditionExact && unsupportedRuntimeConditions.length === 0
    && conditionConsumersMissing.length === 0;
  const unsupportedRuntimeBehavior = [
    ...(runtimeModifiers.length > sourceModifiers.length ? runtimeModifiers.slice(sourceModifiers.length).map(stable) : []),
    ...(runtimeEffects.length > sourceEffects.length ? runtimeEffects.slice(sourceEffects.length).map(stable) : []),
  ];
  const mismatches: TrinketSemanticMismatch[] = [];
  if (!sourceCanonicalizationComplete) mismatches.push({
    code: 'TRINKET_SOURCE_PAYLOAD_CANONICALIZATION_UNSUPPORTED',
    source: { modifiers: sourceSide.modifiers, effects: sourceSide.effects, conditions: sourceSide.conditions },
    runtime: { modifiers: sourceModifiers, effects: sourceEffects, conditions: sourceConditions },
  });
  if (!triggerMatch) mismatches.push({ code: 'TRINKET_TRIGGER_MISMATCH', source: sourceSide.trigger, runtime: bindings.trigger });
  if (!windowMatch) mismatches.push({ code: 'TRINKET_WINDOW_MISMATCH', source: expectedWindow, runtime: bindings.window });
  if (!targetMatch) mismatches.push({ code: 'TRINKET_TARGET_MISMATCH', source: sourceSide.target, runtime: bindings.target });
  if (modifierProblem) mismatches.push(modifierProblem);
  if (!modifierConsumerMatch) mismatches.push({
    code: 'TRINKET_MODIFIER_CONSUMER_MISSING', source: consumersMissing, runtime: [],
  });
  if (effectProblem) mismatches.push(effectProblem);
  if (!effectConsumerMatch) mismatches.push({ code: 'TRINKET_EFFECT_CONSUMER_MISSING', source: effectsMissing, runtime: [] });
  if (!conditionExact || conditionConsumersMissing.length > 0) mismatches.push({ code: 'TRINKET_CONDITION_MISMATCH', source: sourceConditions, runtime: sourceConditionRuntime });
  if (unsupportedRuntimeConditions.length) mismatches.push({ code: 'TRINKET_RUNTIME_ADDED_CONDITION_UNSUPPORTED', source: sourceConditions, runtime: unsupportedRuntimeConditions });
  return {
    triggerMatch, windowMatch, targetMatch, modifierMatch: modifierProblem === null,
    modifierConsumerMatch, missingModifierConsumers: consumersMissing,
    effectMatch: effectProblem === null, effectConsumerMatch, missingEffectConsumers: effectsMissing, conditionMatch,
    sourcePayload: { trigger: sourceSide.trigger, target: sourceSide.target, conditions: sourceConditions, modifiers: sourceModifiers, effects: sourceEffects },
    runtimePayload: { trigger: bindings.trigger ?? '', target: bindings.target ?? '', conditions: sourceConditionRuntime, modifiers: runtimeModifiers, effects: runtimeEffects },
    derivedRuntimeConditions, runtimeConditionEvidence, unsupportedRuntimeConditions, unsupportedRuntimeBehavior, mismatches,
    runtimeSliceSemanticComplete: sourceCanonicalizationComplete && triggerMatch && windowMatch && targetMatch
      && modifierProblem === null && modifierConsumerMatch && effectProblem === null && effectConsumerMatch
      && conditionMatch && unsupportedRuntimeBehavior.length === 0,
  };
}

export function trinketSemanticObligations(source: TrinketSourceDefinition, adapter: TrinketDefinition | undefined, proof: TrinketProofBinding | undefined): TrinketSemanticObligation[] {
  return (['positive', 'negative'] as const).map((side) => {
    const value = side === 'positive' ? source.positiveSide : source.negativeSide; const runtime = sideDefinition(adapter, side);
    const bindings = bindingForRuntime(runtime); const comparison = compareTrinketSemanticPayload(value, runtime, bindings);
    const sourceResolved = source.sourceStatus === 'source-supported' && source.unresolvedFields.length === 0 && value.unresolvedFields.length === 0;
    const triggerScope = trinketTriggerScopeBinding(value.trigger);
    const scopeComplete = triggerScope.scopeComplete;
    const proofIds = comparison.runtimeSliceSemanticComplete && proof ? [...new Set([...proof.productionTests, ...proof.saveReplayTests, ...proof.selectorTests, ...proof.e2eTests])] : [];
    const implementationStatus: TrinketSemanticImplementationStatus = !sourceResolved ? 'SOURCE_UNRESOLVED'
      : comparison.runtimeSliceSemanticComplete && scopeComplete && proofIds.length > 0 ? 'IMPLEMENTED'
        : comparison.runtimeSliceSemanticComplete || adapter ? 'PARTIAL' : 'UNSUPPORTED';
    const blockerCode = comparison.missingModifierConsumers.length > 0 ? 'TRINKET_MODIFIER_CONSUMER_MISSING'
      : comparison.missingEffectConsumers.length > 0 ? 'TRINKET_EFFECT_CONSUMER_MISSING'
      : value.trigger === 'voluntary-declaration' && !scopeComplete ? triggerScope.blockerCode
        : comparison.mismatches[0]?.code ?? (!scopeComplete ? triggerScope.blockerCode : null);
    return {
      obligationId: `${source.id}:${side}`, definitionId: source.id, side, printedText: value.label,
      trigger: value.trigger, sourceUseWindow: value.useWindow, target: value.target,
      sourceConditions: value.conditions, sourceModifiers: value.modifiers, sourceEffects: value.effects,
      runtimeTriggerBinding: bindings.trigger, runtimeWindowBinding: bindings.window, runtimeTargetBinding: bindings.target,
      runtimeConditionBindings: (runtime?.canUse ?? []).map((entry) => stable(canonicalRuntimeCondition(entry))),
      derivedRuntimeConditions: comparison.derivedRuntimeConditions, unsupportedRuntimeConditions: comparison.unsupportedRuntimeConditions,
      unsupportedRuntimeBehavior: comparison.unsupportedRuntimeBehavior, runtimeConditionEvidence: comparison.runtimeConditionEvidence,
      runtimeEffectBindings: comparison.runtimeSliceSemanticComplete ? ['CanonicalTrinketSidePayload:exact'] : value.runtimeSupport.existingCandidates.slice(),
      triggerMatch: comparison.triggerMatch, windowMatch: comparison.windowMatch, targetMatch: comparison.targetMatch,
      modifierMatch: comparison.modifierMatch, modifierConsumerMatch: comparison.modifierConsumerMatch,
      missingModifierConsumers: comparison.missingModifierConsumers,
      effectMatch: comparison.effectMatch, effectConsumerMatch: comparison.effectConsumerMatch,
      missingEffectConsumers: comparison.missingEffectConsumers, conditionMatch: comparison.conditionMatch,
      triggerScopeComplete: scopeComplete, sourceTimingScopeStatus: triggerScope.sourceTimingScopeStatus,
      runtimeSliceSemanticComplete: comparison.runtimeSliceSemanticComplete, semanticMismatches: comparison.mismatches,
      implementationStatus, proofIds, blockerCode,
    };
  });
}
export function trinketSourceSemanticComplete(source: TrinketSourceDefinition): boolean {
  return source.sourceStatus === 'source-supported' && source.unresolvedFields.length === 0
    && source.positiveSide.unresolvedFields.length === 0 && source.negativeSide.unresolvedFields.length === 0;
}
export function trinketRuntimeSemanticComplete(sourceSemanticComplete: boolean, obligations: readonly TrinketSemanticObligation[]): boolean {
  return sourceSemanticComplete && obligations.length === 2 && obligations.every((obligation) => obligation.implementationStatus === 'IMPLEMENTED'
    && obligation.runtimeSliceSemanticComplete && obligation.runtimeTriggerBinding !== null && obligation.runtimeWindowBinding !== null
    && obligation.runtimeTargetBinding !== null && obligation.proofIds.length > 0);
}
