import type { TrinketDefinition, TrinketSideDefinition } from '../types/trinkets';

export type TrinketSemanticImplementationStatus = 'IMPLEMENTED' | 'PARTIAL' | 'UNSUPPORTED' | 'SOURCE_UNRESOLVED';

export interface TrinketSemanticObligation {
  obligationId: string;
  definitionId: string;
  side: 'positive' | 'negative';
  printedText: string;
  trigger: string;
  sourceUseWindow: string;
  target: string;
  sourceConditions: readonly unknown[];
  sourceModifiers: readonly unknown[];
  sourceEffects: readonly unknown[];
  runtimeTriggerBinding: string | null;
  runtimeWindowBinding: string | null;
  runtimeConditionBindings: string[];
  runtimeConditionEvidence: string[];
  runtimeEffectBindings: string[];
  implementationStatus: TrinketSemanticImplementationStatus;
  proofIds: string[];
  blockerCode: string | null;
}

export interface TrinketSourceSide {
  label: string;
  trigger: string;
  useWindow: string;
  target: string;
  conditions: readonly unknown[];
  modifiers: readonly unknown[];
  effects: readonly unknown[];
  unresolvedFields: readonly string[];
  runtimeSupport: { existingCandidates: readonly string[] };
}

export interface TrinketSourceDefinition {
  id: string;
  sourceStatus: string;
  unresolvedFields: readonly string[];
  positiveSide: TrinketSourceSide;
  negativeSide: TrinketSourceSide;
}

export interface TrinketProofBinding {
  productionTests: readonly string[];
  saveReplayTests: readonly string[];
  selectorTests: readonly string[];
  e2eTests: readonly string[];
}

const sideDefinition = (adapter: TrinketDefinition | undefined, side: 'positive' | 'negative'): TrinketSideDefinition | undefined =>
  side === 'positive' ? adapter?.positiveSide : adapter?.negativeSide;

const conditionKey = (condition: TrinketSideDefinition['canUse'] extends (infer T)[] | undefined ? T : never): string => {
  if (!condition) return '';
  return 'value' in condition ? `${condition.type}:${condition.value}` : condition.type;
};

function conditionEvidence(trigger: string, bindings: readonly string[]): string[] {
  if (trigger !== 'hero-skill-resolution') return [];
  return bindings.flatMap((binding) => binding === 'is-acting-hero'
    ? ['C1BR-SOURCE-TRIGGER-ACTOR-DERIVATION']
    : binding === 'in-battle' ? ['C1BR-HERO-SKILL-WINDOW-DERIVATION'] : []);
}

function matchingWindow(trigger: string, runtime: TrinketSideDefinition | undefined): string | null {
  const expected = trigger === 'hero-heals' ? 'before-healing-delivered-resolution'
    : trigger === 'hero-is-healed' ? 'before-healing-received-resolution'
      : trigger === 'hero-skill-resolution' ? 'after-attack-roll-before-hit-resolution' : null;
  return expected && runtime?.useWindows.includes(expected) ? expected : null;
}

function triggerScopeComplete(trigger: string): boolean {
  // Healing wording is not battle-qualified in the source. The current runtime only
  // exposes battle skill healing, so these definition-level obligations remain partial.
  return trigger !== 'hero-heals' && trigger !== 'hero-is-healed';
}

export function trinketSemanticObligations(
  source: TrinketSourceDefinition,
  adapter: TrinketDefinition | undefined,
  proof: TrinketProofBinding | undefined,
): TrinketSemanticObligation[] {
  return (['positive', 'negative'] as const).map((side) => {
    const value = side === 'positive' ? source.positiveSide : source.negativeSide;
    const runtime = sideDefinition(adapter, side);
    const runtimeWindowBinding = matchingWindow(value.trigger, runtime);
    const runtimeConditionBindings = (runtime?.canUse ?? []).map(conditionKey).filter(Boolean);
    const runtimeConditionEvidence = conditionEvidence(value.trigger, runtimeConditionBindings);
    const runtimeAddedConditions = runtimeConditionBindings.length > value.conditions.length
      && runtimeConditionEvidence.length !== runtimeConditionBindings.length;
    const sourceResolved = source.sourceStatus === 'source-supported'
      && source.unresolvedFields.length === 0 && value.unresolvedFields.length === 0;
    const effectBound = Boolean(runtime && runtime.modifiers.length >= value.modifiers.length
      && runtime.effects.length >= value.effects.length);
    const battleSliceBound = Boolean(runtimeWindowBinding && effectBound);
    const scopeComplete = triggerScopeComplete(value.trigger);
    const proofIds = battleSliceBound && proof ? [
      ...proof.productionTests, ...proof.saveReplayTests, ...proof.selectorTests, ...proof.e2eTests,
    ] : [];
    const implementationStatus: TrinketSemanticImplementationStatus = !sourceResolved ? 'SOURCE_UNRESOLVED'
      : runtimeAddedConditions ? 'PARTIAL'
        : battleSliceBound && scopeComplete ? 'IMPLEMENTED'
          : battleSliceBound ? 'PARTIAL' : adapter ? 'UNSUPPORTED' : 'UNSUPPORTED';
    return {
      obligationId: `${source.id}:${side}`,
      definitionId: source.id,
      side,
      printedText: value.label,
      trigger: value.trigger,
      sourceUseWindow: value.useWindow,
      target: value.target,
      sourceConditions: value.conditions,
      sourceModifiers: value.modifiers,
      sourceEffects: value.effects,
      runtimeTriggerBinding: runtimeWindowBinding ? value.trigger : null,
      runtimeWindowBinding,
      runtimeConditionBindings,
      runtimeConditionEvidence,
      runtimeEffectBindings: effectBound ? ['TrinketSideDefinition:modifiers/effects'] : value.runtimeSupport.existingCandidates.slice(),
      implementationStatus,
      proofIds,
      blockerCode: implementationStatus === 'IMPLEMENTED' ? null
        : runtimeAddedConditions ? 'TRINKET_RUNTIME_ADDED_CONDITION_UNSUPPORTED'
          : battleSliceBound && !scopeComplete ? 'TRINKET_TRIGGER_SCOPE_UNRESOLVED'
            : 'TRINKET_SEMANTIC_OBLIGATION_UNSUPPORTED',
    };
  });
}

export function trinketSourceSemanticComplete(source: TrinketSourceDefinition): boolean {
  return source.sourceStatus === 'source-supported'
    && source.unresolvedFields.length === 0
    && source.positiveSide.unresolvedFields.length === 0
    && source.negativeSide.unresolvedFields.length === 0;
}

export function trinketRuntimeSemanticComplete(
  sourceSemanticComplete: boolean,
  obligations: readonly TrinketSemanticObligation[],
): boolean {
  return sourceSemanticComplete && obligations.length === 2 && obligations.every((obligation) =>
    obligation.implementationStatus === 'IMPLEMENTED'
    && obligation.runtimeTriggerBinding !== null
    && obligation.runtimeWindowBinding !== null
    && obligation.proofIds.length > 0);
}
