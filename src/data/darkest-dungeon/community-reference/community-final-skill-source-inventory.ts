/**
 * Phase 11A.4R2 WP-1：Community Final skill source inventory.
 *
 * 只记录仓库内已存在的 Complete Edition 卡面 / rulebook / TTS 绑定能证明的叶子。
 * 未在现有 source 包确认的字段保持 source-blocked，禁止用 Prototype 数值补洞。
 */
import type { FinalFormId } from '../../../types/final-encounter';

export type CommunityFinalTargetPolicy =
  | 'closest'
  | 'furthest'
  | 'most-stressed'
  | 'most-wounded-hero'
  | 'most-wounded-monster'
  | 'marked-then-closest'
  | 'crowded'
  | 'none';

export type CommunityFinalSkillLeafStatus = 'source-complete' | 'source-blocked';

export interface CommunityFinalSkillSourceLeaf {
  formId: FinalFormId;
  actorId: string;
  localSkillId: string;
  printedSkill: string;
  printedNumber: number;
  selectionRule: string;
  accuracy: number | null;
  damage: number | null;
  crit: { threshold: number; damage: number } | null;
  targetPolicy: CommunityFinalTargetPolicy;
  range: string;
  multiTargetCount: number;
  attack: boolean;
  statusStressEffects: string[];
  specialEffect: string;
  sourceReference: string;
  sourceCompleteness: CommunityFinalSkillLeafStatus;
}

const CARD = {
  ancestor1: 'src/assets/darkest-dungeon/community-reference/antha-complete-edition/final-encounter/ancestor-first-form.front.png',
  perfect: 'src/assets/darkest-dungeon/community-reference/antha-complete-edition/final-encounter/perfect-reflection.front.png',
  imperfect: 'src/assets/darkest-dungeon/community-reference/antha-complete-edition/final-encounter/imperfect-reflection.front.png',
  ancestor2: 'src/assets/darkest-dungeon/community-reference/antha-complete-edition/final-encounter/ancestor-second-form.front.png',
  gestating: 'src/assets/darkest-dungeon/community-reference/antha-complete-edition/final-encounter/gestating-heart.front.png',
  heart: 'src/assets/darkest-dungeon/community-reference/antha-complete-edition/final-encounter/heart-of-darkness.front.png',
  rulebook40: 'DD_EN_COREBOX_RULES.pdf:p40',
  rulebook41: 'DD_EN_COREBOX_RULES.pdf:p41',
} as const;

export const COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY: readonly CommunityFinalSkillSourceLeaf[] = [
  {
    formId: 'ancestor-first-form',
    actorId: 'ancestor-first-form',
    localSkillId: 'perfect-replication',
    printedSkill: 'Perfect Replication',
    printedNumber: 1,
    selectionRule: 'vacant Monster Stance: d10 1-3',
    accuracy: 12,
    damage: 2,
    crit: { threshold: 2, damage: 4 },
    targetPolicy: 'closest',
    range: '0',
    multiTargetCount: 1,
    attack: true,
    statusStressEffects: [],
    specialEffect: 'light-1; summon Perfect Reflection into vacant non-aggressive stance',
    sourceReference: `${CARD.ancestor1}; ${CARD.rulebook40}`,
    sourceCompleteness: 'source-complete',
  },
  {
    formId: 'ancestor-first-form',
    actorId: 'ancestor-first-form',
    localSkillId: 'imperfect-reproduction',
    printedSkill: 'Imperfect Reproduction',
    printedNumber: 2,
    selectionRule: 'vacant Monster Stance: d10 4-10',
    accuracy: 12,
    damage: 2,
    crit: { threshold: 1, damage: 4 },
    targetPolicy: 'most-stressed',
    range: '1',
    multiTargetCount: 1,
    attack: true,
    statusStressEffects: ['stress+2'],
    specialEffect: 'summon Imperfect Reflection into vacant non-aggressive stance',
    sourceReference: `${CARD.ancestor1}; ${CARD.rulebook40}`,
    sourceCompleteness: 'source-complete',
  },
  {
    formId: 'ancestor-first-form',
    actorId: 'ancestor-first-form',
    localSkillId: 'time-heals-all',
    printedSkill: 'Time Heals All',
    printedNumber: 3,
    selectionRule: 'all Reflection Stances occupied; no d10',
    accuracy: null,
    damage: null,
    crit: null,
    targetPolicy: 'most-wounded-monster',
    range: '1',
    multiTargetCount: 1,
    attack: false,
    statusStressEffects: [],
    specialEffect: 'heal 10 Most Wounded Monster',
    sourceReference: `${CARD.ancestor1}; ${CARD.rulebook40}; normalized:tierB-ancestor-first-form.timeHealsAll.effect`,
    sourceCompleteness: 'source-complete',
  },
  {
    formId: 'ancestor-first-form',
    actorId: 'perfect-reflection',
    localSkillId: 'reunion',
    printedSkill: 'Reunion',
    printedNumber: 1,
    selectionRule: 'd10 1-5',
    accuracy: 11,
    damage: 5,
    crit: { threshold: 1, damage: 8 },
    targetPolicy: 'marked-then-closest',
    range: '1',
    multiTargetCount: 1,
    attack: true,
    statusStressEffects: ['bleed 2/3', 'stress+1'],
    specialEffect: '+3 damage vs Marked',
    sourceReference: CARD.perfect,
    sourceCompleteness: 'source-complete',
  },
  {
    formId: 'ancestor-first-form',
    actorId: 'perfect-reflection',
    localSkillId: 'we-are-the-same',
    printedSkill: 'We Are the Same',
    printedNumber: 2,
    selectionRule: 'd10 6-10',
    accuracy: 12,
    damage: 2,
    crit: { threshold: 1, damage: 3 },
    targetPolicy: 'most-stressed',
    range: '2',
    multiTargetCount: 1,
    attack: true,
    statusStressEffects: ['stress+2'],
    specialEffect: 'none',
    sourceReference: CARD.perfect,
    sourceCompleteness: 'source-complete',
  },
  {
    formId: 'ancestor-first-form',
    actorId: 'imperfect-reflection',
    localSkillId: 'it-chooses',
    printedSkill: 'It Chooses',
    printedNumber: 1,
    selectionRule: 'd10 1-5',
    accuracy: 11,
    damage: 2,
    crit: { threshold: 0, damage: 4 },
    targetPolicy: 'closest',
    range: '1',
    multiTargetCount: 1,
    attack: true,
    statusStressEffects: ['mark 2t', 'debuff 1t'],
    specialEffect: 'none',
    sourceReference: CARD.imperfect,
    sourceCompleteness: 'source-complete',
  },
  {
    formId: 'ancestor-first-form',
    actorId: 'imperfect-reflection',
    localSkillId: 'we-are-the-same',
    printedSkill: 'We Are the Same',
    printedNumber: 2,
    selectionRule: 'd10 6-10',
    accuracy: 12,
    damage: 2,
    crit: { threshold: 0, damage: 3 },
    targetPolicy: 'most-stressed',
    range: '2',
    multiTargetCount: 1,
    attack: true,
    statusStressEffects: ['stress+1'],
    specialEffect: 'none',
    sourceReference: CARD.imperfect,
    sourceCompleteness: 'source-complete',
  },
  {
    formId: 'ancestor-second-form',
    actorId: 'ancestor-second-form',
    localSkillId: 'refashion-them',
    printedSkill: 'Refashion Them',
    printedNumber: 1,
    selectionRule: 'd10 1-2',
    accuracy: 12,
    damage: 9,
    crit: { threshold: 2, damage: 16 },
    targetPolicy: 'crowded',
    range: '1',
    multiTargetCount: 2,
    attack: true,
    statusStressEffects: ['bleed 3/3', 'stress+1'],
    specialEffect: 'light-1; action-end teleport d10',
    sourceReference: `${CARD.ancestor2}; ${CARD.rulebook41}`,
    sourceCompleteness: 'source-complete',
  },
  {
    formId: 'ancestor-second-form',
    actorId: 'ancestor-second-form',
    localSkillId: 'unmake-them-all',
    printedSkill: 'Unmake Them All',
    printedNumber: 2,
    selectionRule: 'd10 3-6',
    accuracy: 12,
    damage: 4,
    crit: { threshold: 1, damage: 8 },
    targetPolicy: 'furthest',
    range: '2',
    multiTargetCount: 1,
    attack: true,
    statusStressEffects: ['bleed 2/4', 'stress+1'],
    specialEffect: 'action-end teleport d10',
    sourceReference: `${CARD.ancestor2}; ${CARD.rulebook41}`,
    sourceCompleteness: 'source-complete',
  },
  {
    formId: 'ancestor-second-form',
    actorId: 'ancestor-second-form',
    localSkillId: 'embrace-futility',
    printedSkill: 'Embrace Futility',
    printedNumber: 3,
    selectionRule: 'd10 7-10',
    accuracy: 12,
    damage: 2,
    crit: { threshold: 0, damage: 4 },
    targetPolicy: 'closest',
    range: '0',
    multiTargetCount: 1,
    attack: true,
    statusStressEffects: ['stun 2t', 'stress+2'],
    specialEffect: 'push 2; action-end teleport d10',
    sourceReference: `${CARD.ancestor2}; ${CARD.rulebook41}`,
    sourceCompleteness: 'source-complete',
  },
  {
    formId: 'gestating-heart',
    actorId: 'gestating-heart',
    localSkillId: 'dispersion',
    printedSkill: 'Dispersion',
    printedNumber: 1,
    selectionRule: 'always printed skill 1; no d10',
    accuracy: null,
    damage: null,
    crit: null,
    targetPolicy: 'none',
    range: 'n/a',
    multiTargetCount: 0,
    attack: false,
    statusStressEffects: [],
    specialEffect: 'Sispersion: physical Darkest Dungeon Monster deck top card + vacant stance + initiative card',
    sourceReference: `${CARD.gestating}; ${CARD.rulebook41}; physical-deck:community-dd-monster-deck`,
    sourceCompleteness: 'source-complete',
  },
  {
    formId: 'heart-of-darkness',
    actorId: 'heart-of-darkness',
    localSkillId: 'know-this',
    printedSkill: 'Know This',
    printedNumber: 1,
    selectionRule: 'Impending Doom forecast d10 1-4; consume saved forecast',
    accuracy: 12,
    damage: 2,
    crit: { threshold: 1, damage: 3 },
    targetPolicy: 'crowded',
    range: '0-10',
    multiTargetCount: 4,
    attack: true,
    statusStressEffects: ['stress+3'],
    specialEffect: 'light-1',
    sourceReference: `${CARD.heart}; ${CARD.rulebook41}`,
    sourceCompleteness: 'source-complete',
  },
  {
    formId: 'heart-of-darkness',
    actorId: 'heart-of-darkness',
    localSkillId: 'puncture',
    printedSkill: 'Puncture',
    printedNumber: 2,
    selectionRule: 'Impending Doom forecast d10 5-7; consume saved forecast',
    accuracy: 12,
    damage: 14,
    crit: { threshold: 2, damage: 18 },
    targetPolicy: 'closest',
    range: '0-10',
    multiTargetCount: 1,
    attack: true,
    statusStressEffects: ['bleed 3/3', 'stress+1'],
    specialEffect: 'none',
    sourceReference: `${CARD.heart}; ${CARD.rulebook41}`,
    sourceCompleteness: 'source-complete',
  },
  {
    formId: 'heart-of-darkness',
    actorId: 'heart-of-darkness',
    localSkillId: 'dissolution',
    printedSkill: 'Dissolution',
    printedNumber: 3,
    selectionRule: 'Impending Doom forecast d10 8-10; consume saved forecast',
    accuracy: 12,
    damage: 14,
    crit: { threshold: 2, damage: 18 },
    targetPolicy: 'furthest',
    range: '0-10',
    multiTargetCount: 1,
    attack: true,
    statusStressEffects: ['debuff 1t', 'blight 3/3', 'stress+1'],
    specialEffect: 'none',
    sourceReference: `${CARD.heart}; ${CARD.rulebook41}`,
    sourceCompleteness: 'source-complete',
  },
] as const;

export const COMMUNITY_FINAL_SOURCE_BLOCKED_LEAVES = [
  {
    code: 'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED',
    leaf: 'gestating-heart.ichor.lethalOrdering',
    reason: 'normalized lethalWoundTimingRuling is null; no accepted source orders blight/heal vs death',
  },
  {
    code: 'COME_UNTO_YOUR_MAKER_UNRESOLVED',
    leaf: 'heart-of-darkness.come-unto-your-maker.definition',
    reason: 'no tabletop definition in rulebook p40-41, Ancestor/Heart/Ability cards, or TTS metadata/Lua',
  },
] as const;

export function requiredCommunityFinalSourceLeaves(): readonly CommunityFinalSkillSourceLeaf[] {
  return COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.filter((leaf) => leaf.sourceCompleteness === 'source-complete');
}
