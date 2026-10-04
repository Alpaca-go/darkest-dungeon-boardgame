import type { HeroProductionProfileDefinition, HeroProductionSkillDefinition, HeroProductionSkillAction } from './hero-production';
import type { CampaignState } from './index';
import type { PendingChoice } from './boss-runtime';

type AuditKey = 'literal' | 'literalVariants' | 'printedFields' | 'printedGlyphs' | 'printedNotation' | 'printedBack' | 'contentSet' | 'hamletAbility' | 'physicalCardId' | 'runtimeSupport' | 'schemaVersion';
export type Compact<T> = T extends (infer U)[] ? Compact<U>[] : T extends object ? { [K in keyof T as K extends AuditKey ? never : K]: Compact<T[K]> } : T;
export type RuntimeProfile = Compact<HeroProductionProfileDefinition>;
export type RuntimeAction = Omit<Compact<HeroProductionSkillAction>, 'targeting'> & {
  targeting: Omit<Compact<HeroProductionSkillAction['targeting']>, 'scope'> & { scope: HeroProductionSkillAction['targeting']['scope'] | 'ALL_ENEMIES' };
};
export type RuntimeSkill = Omit<Compact<HeroProductionSkillDefinition>, 'actions'> & { actions: { front: RuntimeAction; back: RuntimeAction | null } };
export type RuntimeEffect = RuntimeAction['selfEffects'][number];
export type HeroForm = 'HUMAN' | 'BEAST';
export interface HeroRuntimeSelection { runtimeVersion: string; definitionVersion: string }
export interface HeroProductionIdentity extends HeroRuntimeSelection { heroId: string; level: 1 | 2 | 3; form: HeroForm | null; sourceBindingId: string }
export type HeroActionPhase = 'VALIDATE_ACTIVATION' | 'SELECT_TARGETS' | 'ROLL' | 'SELF_EFFECTS' | 'TARGET_EFFECTS' | 'REACTION_WINDOWS' | 'COMMIT' | 'COMPLETE';
export interface HeroProductionActionPlan extends HeroProductionIdentity {
  actionId: string; heroActorId: string; skillId: string; skillLevel: 1 | 2 | 3; face: 'front' | 'back';
  phase: HeroActionPhase; selectedTargetIds: string[]; frozenTargetIds: string[]; frozenSelfTargetIds: string[];
  storedRolls: number[]; resolvedEffectIds: string[]; pendingEffectIndex: number;
  storedOutcomes: Record<string, { hit: boolean; crit: boolean; damage: number | null }>;
  deferredEventIds: string[]; rngCheckpoint: number;
  pendingChoice: PendingChoice | null; pendingTransition: { from: HeroForm; to: HeroForm } | null;
  nodes: { effectId: string; field: string; kind: string; deferredIds: string[] }[];
}
export type HeroRuntimeInput = { type: 'START'; actorId: string; skillId: string; face?: 'front' | 'back' }
  | { type: 'TARGETS'; targetIds: string[] } | { type: 'MOVEMENT_CHOICE'; direction: 'PUSH' | 'PULL'; destinationId?: string } | { type: 'ADVANCE' };
export interface HeroRuntimeEvent {
  eventId: string; eventType: string; actionId: string; heroId: string; skillId: string; level: number;
  field: string; deferredId?: string; runtimeVersion: string; definitionVersion: string; result?: unknown;
}
export interface HeroProductionSession {
  origin: CampaignState; inputs: HeroRuntimeInput[]; seed: number;
  rngCursor: number; rngCalls: number; clockCursor: number; idCursor: number;
  pendingAction: HeroProductionActionPlan | null; completedActions: HeroProductionActionPlan[]; events: HeroRuntimeEvent[];
}
