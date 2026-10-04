/** Source-rich content only. C3A does not authorize execution of these records. */
export type SourceStatus = 'OFFICIAL_BOUND' | 'SOURCE_PARTIAL' | 'SOURCE_UNRESOLVED';
export type DataStatus = 'SOURCE_BOUND' | 'SOURCE_PARTIAL' | 'SOURCE_UNRESOLVED' | 'DEFERRED_MANUAL_VALIDATION';
export interface MonsterSourceReference {
  bindingId: string;
  relativePath: string;
  fileName: string;
  sha256: string;
  page: number;
  location: string;
  componentId: string;
  sourceClass: 'OFFICIAL_PRINTED_COMPONENT';
  visualReview: boolean;
}
export interface ProductionMonsterIdentity {
  monsterId: string;
  printedName: string;
  contentSet: string;
  group: string | null;
  printedLevel: number | null;
  drawEligibleFromLevel: number | null;
  sourceStatus: SourceStatus;
  sourceBindingIds: string[];
}
export interface ProductionMonsterProfile {
  monsterId: string;
  size: string | null;
  occupiedSpaces: number | null;
  stanceSlots: number | null;
  life: number | null;
  speed: number | null;
  dodge: number | null;
  deployment: string | null;
  tags: string[] | null;
  resistances: string[] | null;
  immunities: string[] | null;
  protection: boolean | null;
  copyCount: number | null;
  physicalCopyIds: string[];
  sourceCardIds: number[];
  sourceBindingIds: string[];
  status: DataStatus;
  unresolvedFields: string[];
  printedAbsences: string[];
}
export interface ProductionMonsterAction {
  monsterId: string;
  number: number;
  actionId: string;
  printedName: string;
  range: unknown;
  targets: unknown;
  targeting: unknown;
  attack: unknown;
  printedEffects: unknown[] | null;
  printedText: string | null;
  sourceBindingIds: string[];
  semanticStatus: DataStatus;
  unresolvedFields: string[];
  printedAbsences: string[];
}
export type MonsterStanceBehavior =
  | { kind: 'SKILL_TABLE'; rows: { min: number; max: number; actionId: string }[] }
  | { kind: 'INHERITS'; stance: string }
  | { kind: 'NO_ACTION' }
  | { kind: 'SOURCE_UNRESOLVED'; reason: string };
export interface ProductionMonsterSelection {
  monsterId: string;
  status: DataStatus;
  stanceBehavior: Record<string, MonsterStanceBehavior>;
  sourceBindingIds: string[];
}
export interface ProductionMonsterRecord extends ProductionMonsterIdentity {
  profile: ProductionMonsterProfile;
  actions: ProductionMonsterAction[];
  selection: ProductionMonsterSelection;
  sourceReferences: MonsterSourceReference[];
  printedText: string | null;
}
