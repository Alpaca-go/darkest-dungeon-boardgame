/** Candidate source definitions. No campaign state or execution defaults belong here. */
export type HeroProductionLevel = 1 | 2 | 3;
export type SourceValue = null | boolean | number | string | SourceValue[] | { [key: string]: SourceValue };
export type HeroSemanticStatus = 'OFFICIAL_SOURCE' | 'DEFERRED_MANUAL_VALIDATION';
export type PrintedField<T> = { presence: 'PRINTED_VALUE'; value: T } | { presence: 'PRINTED_ABSENT' };
export interface DeferredSemanticField {
  semanticStatus: 'DEFERRED_MANUAL_VALIDATION';
  deferredId: string;
  canonical: false;
  executionBinding: null;
  literalVariants: SourceValue[];
}
export type SemanticBinding = { semanticStatus: 'OFFICIAL_SOURCE'; ruleBinding: string } | DeferredSemanticField;
export interface HeroProductionTarget {
  scope: 'SELF' | 'ONE_ALLY' | 'MULTIPLE_ALLIES' | 'ALL_ALLIES' | 'ONE_ENEMY' | 'MULTIPLE_ENEMIES' | 'GROUP' | 'STANCE_FILTERED';
  groups: { side: 'HERO' | 'MONSTER'; targetCount: { kind: 'exact' | 'maximum'; value: number } }[];
  targetCount: { kind: 'exact' | 'maximum'; value: number } | { kind: 'all' } | null;
  range: PrintedField<string>;
  stanceFilter: PrintedField<string[]>;
  printedNotation: string;
}
export interface HeroProductionPredicate {
  subject: 'SELF' | 'TARGET';
  kind: 'CONDITION' | 'TYPE';
  values: string[];
  connective: 'SINGLE' | DeferredSemanticField;
  literal: string;
}
interface SourceEffect {
  actor: 'SELF' | 'TARGET';
  recipient: 'SELF' | 'TARGET' | 'HERO' | 'MONSTER' | 'ALL_ALLIES';
  literal: string;
  sourceBindingId: string;
  semanticStatus: 'OFFICIAL_SOURCE';
  runtimeSupport: 'REQUIRES_RUNTIME_EXTENSION';
}
export interface ConditionEffect extends SourceEffect {
  kind: 'CONDITION'; operation: 'APPLY' | 'REMOVE'; conditionType: string;
  magnitude: PrintedField<number>; duration: PrintedField<number>;
  resistanceInteraction: SemanticBinding;
}
export interface ConditionTransferEffect extends SourceEffect {
  kind: 'CONDITION_TRANSFER'; conditionTypes: string[]; connective: 'OR';
  quantity: 'ALL'; destination: 'SELF'; stackSemantics: DeferredSemanticField;
}
export interface MovementEffect extends SourceEffect {
  kind: 'MOVEMENT'; type: 'PUSH' | 'PULL' | 'SHUFFLE' | 'STANCE_MOVE';
  distance: PrintedField<number>;
  direction: 'PUSH' | 'PULL' | null;
  alternative: { direction: 'PUSH' | 'PULL'; distance: number } | null;
  timing: SemanticBinding;
  timingSemanticStatus: HeroSemanticStatus;
  optionality: PrintedField<string>;
}
export interface TransformEffect extends SourceEffect {
  kind: 'TRANSFORM'; from: 'HUMAN' | 'BEAST'; to: 'HUMAN' | 'BEAST';
  atomicOrdering: DeferredSemanticField;
}
export interface DamageModifierEffect extends SourceEffect {
  kind: 'DAMAGE_MODIFIER'; amount: number; predicate: HeroProductionPredicate;
  executionPhase: DeferredSemanticField;
}
export interface DefenseModifierEffect extends SourceEffect {
  kind: 'IGNORE_DEFENSE'; defense: 'guard' | 'protection'; executionPhase: DeferredSemanticField;
}
export interface ScalarHeroEffect extends SourceEffect {
  kind: 'STRESS' | 'HEALING' | 'WOUNDS' | 'LIGHT' | 'DODGE' | 'DAMAGE'; amount: number;
}
/** Campaign operations keep source operands, branch conditions and choice groups. */
export interface CampaignHeroEffect extends SourceEffect {
  kind: 'CAMPAIGN_OPERATION'; operation: string; operands: SourceValue;
}
export type HeroProductionEffect = ConditionEffect | ConditionTransferEffect | MovementEffect
  | TransformEffect | DamageModifierEffect | DefenseModifierEffect | ScalarHeroEffect | CampaignHeroEffect;
export interface DelayedHeroEffectDefinition {
  trigger: 'NEXT_DUNGEON' | 'NEXT_DUNGEON_SETUP'; literal: string; effects: HeroProductionEffect[];
  storage: DeferredSemanticField;
}
export interface HamletAbilityDefinition {
  printedName: string; level: HeroProductionLevel; literal: string;
  timing: { firstActionOfDay: boolean; dayEndsImmediately: boolean; oncePerHamletPhase: boolean };
  choices: { literal: string; effects: HeroProductionEffect[]; targets: { scope: 'SELF' | 'HERO' | 'ALL_HEROES'; count: PrintedField<number> }[] }[];
  delayedEffects: DelayedHeroEffectDefinition[];
  preparationDays: DeferredSemanticField | PrintedField<number>;
  semanticStatus: 'OFFICIAL_SOURCE'; deferredFields: string[];
}
export interface HeroProductionProfileVariant {
  formVariant: 'HERO_PROFILE' | 'HUMAN_FORM' | 'BEAST_FORM'; sourceBindingId: string;
  life: PrintedField<number>; dodge: PrintedField<number>; speed: PrintedField<number>;
  movement: PrintedField<{ glyphId: string; count: number }>;
  stances: { starting: PrintedField<string[]>; available: PrintedField<string[]> };
  tags: PrintedField<string[]>; categoricalResistances: PrintedField<string[]>; immunities: PrintedField<string[]>;
  hamletAbility: HamletAbilityDefinition | null;
  printedGlyphs: string[];
  printedFields: Record<string, PrintedField<SourceValue>>;
}
export interface HeroProductionProfileDefinition {
  schemaVersion: 'HERO_PRODUCTION_SCHEMA_V1'; definitionVersion: 'C2C-HERO-PRODUCTION-DEFINITION-v1';
  heroId: string; printedName: string; level: HeroProductionLevel; sourceBindingId: string;
  variants: { default: HeroProductionProfileVariant } | { human: HeroProductionProfileVariant; beast: HeroProductionProfileVariant };
  contentSet: SourceValue; semanticStatus: 'OFFICIAL_SOURCE'; deferredSemanticIds: string[];
}
export interface HeroProductionSkillAction {
  printedName: string; sourceBindingId: string;
  kind: 'attack' | 'heal' | 'support' | 'movement' | 'transform' | 'mixed';
  activation: { usableFromStances: PrintedField<string[]>; formRequirement: 'ANY' | 'HUMAN' | 'BEAST'; actionCost: PrintedField<number> };
  targeting: HeroProductionTarget;
  roll: { kind: 'SKILL_ACCURACY'; requiresRoll: boolean; accuracy: PrintedField<number>; crit: PrintedField<number>; semanticStatus: 'OFFICIAL_SOURCE'; ruleBinding: string };
  effectTimingRules: { self: SemanticBinding; target: SemanticBinding; exceptions: string[] };
  attack: { accuracy: PrintedField<number>; damage: PrintedField<number>; crit: PrintedField<number>; critDamage: PrintedField<number> } | null;
  healing: { wounds: PrintedField<number>; critWounds: PrintedField<number>; stress: PrintedField<number> } | null;
  selfEffects: HeroProductionEffect[]; targetEffects: HeroProductionEffect[];
  literal: string; printedFields: Record<string, PrintedField<SourceValue>>;
  printedGlyphs: string[];
}
export interface HeroProductionSkillDefinition {
  schemaVersion: 'HERO_PRODUCTION_SCHEMA_V1'; definitionVersion: 'C2C-HERO-PRODUCTION-DEFINITION-v1';
  heroId: string; skillId: string; printedName: string; level: HeroProductionLevel;
  physicalCardId: string; sourceBindingId: string;
  actions: { front: HeroProductionSkillAction; back: HeroProductionSkillAction | null };
  printedBack: { role: string; printedName: string; literal: string; printedFields: Record<string, PrintedField<SourceValue>>; printedGlyphs: string[] };
  semanticStatus: 'OFFICIAL_SOURCE'; deferredSemanticIds: string[];
}
export interface HeroProductionSourceBinding {
  id: string; sourceFormId: string; sourceArtifact: string; literalDigest: string;
}
