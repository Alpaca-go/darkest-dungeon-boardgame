export const RUINS_V4 = 'C1C32R2A-DIGITAL-DEFAULT-v4' as const;
/** Noncanonical, explicitly selected successor. v4 records are never rewritten. */
export const RUINS_V5 = 'C1C32R2B-DIGITAL-DEFAULT-v5' as const;
export const RUINS_V5_REPLACEMENT_RULING = 'C1C32R2B-LARGE-REPLACEMENT-RETURN-WITH-BATTLE-v1' as const;
export const RUINS_V6 = 'C1C32R2C-R-DIGITAL-DEFAULT-v6' as const;
export const RUINS_V6_RULING = 'C1C32R2C-R-ATOMIC-LARGE-CONTRACTS-v1' as const;
export type RuinsRuleSetVersion = typeof RUINS_V4 | typeof RUINS_V5 | typeof RUINS_V6;
export const RUINS_STANCES = ['aggressive', 'defensive', 'ranged', 'support'] as const;
export type RuinsStance = typeof RUINS_STANCES[number];
export interface PrintedSource {
  sourceClass: 'OFFICIAL_PRINTED_COMPONENT' | 'OFFICIAL_SOURCE';
  relativePath: string; fileName: string; sha256: string; page: number;
  location: string; componentId: string; visualReview: boolean;
}
export type PrintedCondition = 'bleed' | 'blight' | 'stun' | 'buff' | 'debuff' | 'mark' | 'guard' | 'riposte' | 'push-pull';
export type PrintedEffect =
  | { type: 'stress'; target: 'target' | 'party'; amount: number }
  | { type: 'light'; target: 'party'; amount: number }
  | { type: 'shuffle'; target: 'self' | 'target'; direction: 'push' | 'pull'; distance: number }
  | { type: 'condition'; target: 'self' | 'target'; condition: Exclude<PrintedCondition, 'push-pull'>; amount: number; turns: number }
  | { type: 'markedDamageBonus'; amount: number }
  | { type: 'heal'; target: 'self' | 'target'; amount: number | 'ALL_WOUNDS' }
  | { type: 'removeCondition'; target: 'self' | 'target'; condition: PrintedCondition }
  | { type: 'disease'; target: 'target'; acquisition: 'DRAW_FROM_DECK' };
export type StanceBehavior = { kind: 'SKILL_TABLE'; rows: Array<{ min: number; max: number; skill: number }> }
  | { kind: 'INHERITS'; stance: RuinsStance } | { kind: 'NO_ACTION' };
export interface RuinsSkill {
  number: number; name: string; range: { kind: 'EXACT'; distance: number } | { kind: 'SELF' };
  targets: number; targetSide: 'hero' | 'monster' | 'self';
  targeting: { priority: 'Closest' | 'Furthest' | 'Most Wounded' | 'Most Stressed' | 'Crowded' | 'Self'; markedFirst: boolean };
  attack: { kind: 'ROLL'; accuracy: number; damage: number; crit: number; critDamage: number } | { kind: 'AUTOMATIC' };
  effects: PrintedEffect[]; sourceReferences: PrintedSource[];
}
export interface RuinsMonster {
  canonicalId: string; printedName: string; group: 'RUINS' | 'COMMON'; printedLevel: number; drawEligibleFromLevel: number;
  size: 'NORMAL' | 'SMALL' | 'LARGE'; occupiedSpaces: number; stanceSlots: number; life: number; speed: number; dodge: number;
  copyCount: number; physicalCopyIds: string[]; deployment: 'FRONT' | 'BACK'; tags: string[];
  printedProtection: boolean; resistances: PrintedCondition[]; immunities: PrintedCondition[];
  status: 'SOURCE_BOUND_TYPED_CANDIDATE' | 'EXECUTABLE_PRODUCTION_DEFINITION'; executable: boolean; skills: RuinsSkill[];
  stanceBehavior: Record<RuinsStance, StanceBehavior>; sourceReferences: PrintedSource[]; unresolvedFields: [];
}
export interface RuinsArea {
  id: string; location: string; boundary: Array<[number, number]>; capacity: number; adjacent: string[];
  elevation: -1 | 0 | 1; glyphs: string[]; sourceReferences: PrintedSource[];
}
export interface RuinsTile {
  tileId: string; roomNumber: number; side: 'front' | 'back'; areas: RuinsArea[];
  heroStartingStanceAreas: Record<RuinsStance, string>; monsterStartingStanceAreas: Record<RuinsStance, string>;
  sourceReferences: PrintedSource[];
}
export interface RuinsRoomRule {
  id: string; trigger: 'END_TURN' | 'SHUFFLED_INTO' | 'PASSIVE' | 'INTERACT' | 'LAST_MONSTER_MOVE' | 'ROUND_END';
  areas: string[]; side: 'hero' | 'monster' | 'all'; actionCost: number; oncePerBattle: boolean; requiresNoMonsters: boolean;
  effects: Array<PrintedEffect | { type: 'damage'; amount: number } | { type: 'healingProhibited' }
    | { type: 'immunity'; conditions: PrintedCondition[] } | { type: 'drawTrinket' }
    | { type: 'moveTowards'; areaId: string } | { type: 'quirkStressAndHealing'; stressPerNegative: number; healPerPositivePerLevel: number }>;
}
export interface RuinsRoom { roomNumber: number; rules: RuinsRoomRule[]; sourceReferences: PrintedSource[] }
export interface RuinsBattleContext {
  encounterId: string; roomNumber: number; tileId: string; ruleSetVersion: RuinsRuleSetVersion;
  placements: Record<string, string>; definitionIds: Record<string, string>; physicalCopyIds: string[];
  occupiedSpaces: Record<string, number>; rngCursor: number; rngCalls: number;
  conditionStacks: Record<string, Array<{ condition: Exclude<PrintedCondition, 'push-pull'>; amount: number; turns: number }>>;
  events: Array<{ eventId: string; type: string; actorId: string; targetIds: string[]; parentEventId: string | null;
    ruleSetVersion: RuinsRuleSetVersion; detail: Record<string, unknown> }>;
  roomUses: string[]; guardStacks: Record<string, number>; riposteStacks: Record<string, number>;
  pendingChoice: null | {
    choiceId: string; candidateIds: string[]; actorId: string; sourceActorId: string; relativeToId: string;
    kind: 'MONSTER_MOVE' | 'PRINTED_SHUFFLE' | 'ROOM_MOVE' | 'LARGE_DISPLACEMENT';
    shuffleEffect: Extract<PrintedEffect, { type: 'shuffle' }> | null;
    skillNumber: number | null; targetIds: string[];
    remainingEffects: PrintedEffect[]; parentEventId: string; ruleSetVersion: RuinsRuleSetVersion;
    attackContinuation?: { actorId: string; skillNumber: number; targetIds: string[]; parentEventId: string; attackRoll: number | null; selfEffectsApplied: boolean };
    movementContinuation?: { kind: 'MONSTER_MOVE' | 'PRINTED_SHUFFLE' | 'ROOM_MOVE'; destinationId: string };
  };
}
