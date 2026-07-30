// Phase 8A：全部 35 个 Quirk 定义（Negative 18 + Positive 17）。
// 所有被动效果均以数据声明（modifiers / reactions / statModifiers），
// 由 src/game-engine/quirks.ts 的通用引擎解释执行，禁止为单个 Quirk 写 if/else。
//
// 设计约定（原型简化，与桌游数值不逐一对应，方向保持一致）：
// - modifier：只调整数值，不派生事件。
// - reaction：结算后追加效果，全部路由统一管线（applyStress / resolveDamage / resolveHealing 等）。
// - 光照条件：光照值 0..10（见 CampaignState.light）。

import type { QuirkDefinition } from '../types';

/** 18 个 Negative Quirk。 */
export const NEGATIVE_QUIRKS: QuirkDefinition[] = [
  {
    id: 'anemic',
    name: 'Anemic（贫血）',
    polarity: 'negative',
    description: '受到的流血伤害 +1。',
    modifiers: [
      { eventType: 'damage-taken', condition: { damageSourceIn: ['bleed'] }, flatDelta: 1 },
    ],
  },
  {
    id: 'bad_gambler',
    name: 'Bad Gambler（烂赌鬼）',
    polarity: 'negative',
    description: '回到 Hamlet 时输掉 3 Gold。',
    reactions: [
      { eventType: 'hamlet-arrived', effects: [{ type: 'lose-gold', amount: 3 }] },
    ],
  },
  {
    id: 'clumsy',
    name: 'Clumsy（笨拙）',
    polarity: 'negative',
    description: '受到的陷阱伤害 +1。',
    modifiers: [
      { eventType: 'damage-taken', condition: { damageSourceIn: ['trap'] }, flatDelta: 1 },
    ],
  },
  {
    id: 'fear_of_the_unknown',
    name: 'Fear of the Unknown（未知恐惧）',
    polarity: 'negative',
    description: '侦查时自身 Stress +1。',
    reactions: [
      { eventType: 'scout-attempted', effects: [{ type: 'stress-self', amount: 1 }] },
    ],
  },
  {
    id: 'fragile',
    name: 'Fragile（脆弱）',
    polarity: 'negative',
    description: '受到的所有伤害 +1。',
    modifiers: [{ eventType: 'damage-taken', flatDelta: 1 }],
  },
  {
    id: 'infirm',
    name: 'Infirm（体弱）',
    polarity: 'negative',
    description: '受到的治疗 -1。',
    modifiers: [{ eventType: 'healing-received', flatDelta: -1 }],
  },
  {
    id: 'light_sensitive',
    name: 'Light Sensitive（畏光）',
    polarity: 'negative',
    description: '光照 ≥ 6 时获得的 Stress +1。',
    modifiers: [
      { eventType: 'stress-applied', condition: { minLight: 6 }, flatDelta: 1 },
    ],
  },
  {
    id: 'nervous',
    name: 'Nervous（神经质）',
    polarity: 'negative',
    description: '获得的所有 Stress +1。',
    modifiers: [{ eventType: 'stress-applied', flatDelta: 1 }],
  },
  {
    id: 'night_blindness',
    name: 'Night Blindness（夜盲）',
    polarity: 'negative',
    description: '光照 ≤ 2 时受到的伤害 +1。',
    modifiers: [
      { eventType: 'damage-taken', condition: { maxLight: 2 }, flatDelta: 1 },
    ],
  },
  {
    id: 'nocturnal',
    name: 'Nocturnal（夜行性）',
    polarity: 'negative',
    description: '光照 ≥ 5 时 Stress 恢复 -1。',
    modifiers: [
      { eventType: 'stress-recovered', condition: { minLight: 5 }, flatDelta: -1 },
    ],
  },
  {
    id: 'mercurial',
    name: 'Mercurial（喜怒无常）',
    polarity: 'negative',
    description: 'Resolve Test 更难获得 Virtue（Virtue 阈值 -1）。',
    modifiers: [{ eventType: 'resolve-test', flatDelta: -1 }],
  },
  {
    id: 'off_guard',
    name: 'Off Guard（措手不及）',
    polarity: 'negative',
    description: '战斗开始时自身 Stress +1。',
    reactions: [
      { eventType: 'battle-started', effects: [{ type: 'stress-self', amount: 1 }] },
    ],
  },
  {
    id: 'shocker',
    name: 'Shocker（惊吓者）',
    polarity: 'negative',
    description: '战斗开始时其他队友 Stress +1。',
    reactions: [
      { eventType: 'battle-started', effects: [{ type: 'stress-allies', amount: 1 }] },
    ],
  },
  {
    id: 'slow_reflexes',
    name: 'Slow Reflexes（反应迟钝）',
    polarity: 'negative',
    description: '速度 -1。',
    statModifiers: { speed: -1 },
  },
  {
    id: 'soft',
    name: 'Soft（软弱）',
    polarity: 'negative',
    description: '受到的攻击伤害 +1。',
    modifiers: [
      { eventType: 'damage-taken', condition: { damageSourceIn: ['attack'] }, flatDelta: 1 },
    ],
  },
  {
    id: 'stress_eater',
    name: 'Stress Eater（压力进食）',
    polarity: 'negative',
    description: '进入新房间时 30% 额外消耗 1 份食物。',
    reactions: [
      {
        eventType: 'room-entered',
        chanceD10: 3,
        effects: [{ type: 'consume-provision', provision: 'food', amount: 1 }],
      },
    ],
  },
  {
    id: 'thin_blooded',
    name: 'Thin Blooded（血稀）',
    polarity: 'negative',
    description: '受到的腐蚀伤害 +1。',
    modifiers: [
      { eventType: 'damage-taken', condition: { damageSourceIn: ['blight'] }, flatDelta: 1 },
    ],
  },
  {
    id: 'weak_grip',
    name: 'Weak Grip（握力不足）',
    polarity: 'negative',
    description: '攻击伤害输出 -1。',
    modifiers: [
      { eventType: 'damage-output', condition: { damageSourceIn: ['attack'] }, flatDelta: -1 },
    ],
  },
];

/** 17 个 Positive Quirk。 */
export const POSITIVE_QUIRKS: QuirkDefinition[] = [
  {
    id: 'balanced',
    name: 'Balanced（沉稳）',
    polarity: 'positive',
    description: 'Resolve Test 更易获得 Virtue（Virtue 阈值 +1）。',
    modifiers: [{ eventType: 'resolve-test', flatDelta: 1 }],
  },
  {
    id: 'clotter',
    name: 'Clotter（凝血）',
    polarity: 'positive',
    description: '受到的流血伤害 -1。',
    modifiers: [
      { eventType: 'damage-taken', condition: { damageSourceIn: ['bleed'] }, flatDelta: -1 },
    ],
  },
  {
    id: 'early_riser',
    name: 'Early Riser（早起者）',
    polarity: 'positive',
    description: '回到 Hamlet 时恢复 1 Stress。',
    reactions: [
      { eventType: 'hamlet-arrived', effects: [{ type: 'stress-recover-self', amount: 1 }] },
    ],
  },
  {
    id: 'evasive',
    name: 'Evasive（灵巧闪避）',
    polarity: 'positive',
    description: '受到的陷阱伤害 -1。',
    modifiers: [
      { eventType: 'damage-taken', condition: { damageSourceIn: ['trap'] }, flatDelta: -1 },
    ],
  },
  {
    id: 'fast_healer',
    name: 'Fast Healer（愈合迅速）',
    polarity: 'positive',
    description: '受到的治疗 +1。',
    modifiers: [{ eventType: 'healing-received', flatDelta: 1 }],
  },
  {
    id: 'hard_noggin',
    name: 'Hard Noggin（硬脑壳）',
    polarity: 'positive',
    description: '受到的攻击伤害 -1。',
    modifiers: [
      { eventType: 'damage-taken', condition: { damageSourceIn: ['attack'] }, flatDelta: -1 },
    ],
  },
  {
    id: 'hard_skinned',
    name: 'Hard Skinned（厚皮）',
    polarity: 'positive',
    description: '受到的所有伤害 -1。',
    modifiers: [{ eventType: 'damage-taken', flatDelta: -1 }],
  },
  {
    id: 'hoarder',
    name: 'Hoarder（囤积者）',
    polarity: 'positive',
    description: '任务完成结算时额外 +5 Gold。',
    reactions: [
      { eventType: 'quest-completed', effects: [{ type: 'gain-gold', amount: 5 }] },
    ],
  },
  {
    id: 'night_owl',
    name: 'Night Owl（夜猫子）',
    polarity: 'positive',
    description: '光照 ≤ 2 时获得的 Stress -1。',
    modifiers: [
      { eventType: 'stress-applied', condition: { maxLight: 2 }, flatDelta: -1 },
    ],
  },
  {
    id: 'on_guard',
    name: 'On Guard（时刻警惕）',
    polarity: 'positive',
    description: '战斗开始时恢复 1 Stress。',
    reactions: [
      { eventType: 'battle-started', effects: [{ type: 'stress-recover-self', amount: 1 }] },
    ],
  },
  {
    id: 'photomania',
    name: 'Photomania（喜光）',
    polarity: 'positive',
    description: '光照 ≥ 6 时 Stress 恢复 +1。',
    modifiers: [
      { eventType: 'stress-recovered', condition: { minLight: 6 }, flatDelta: 1 },
    ],
  },
  {
    id: 'quick_reflexes',
    name: 'Quick Reflexes（反应敏捷）',
    polarity: 'positive',
    description: '速度 +1。',
    statModifiers: { speed: 1 },
  },
  {
    id: 'resilient',
    name: 'Resilient（坚韧）',
    polarity: 'positive',
    description: '获得的所有 Stress -1。',
    modifiers: [{ eventType: 'stress-applied', flatDelta: -1 }],
  },
  {
    id: 'skilled_gambler',
    name: 'Skilled Gambler（赌术精湛）',
    polarity: 'positive',
    description: '回到 Hamlet 时赢得 3 Gold。',
    reactions: [
      { eventType: 'hamlet-arrived', effects: [{ type: 'gain-gold', amount: 3 }] },
    ],
  },
  {
    id: 'stress_faster',
    name: 'Stress Faster（快速减压）',
    polarity: 'positive',
    description: 'Stress 恢复 +1。',
    modifiers: [{ eventType: 'stress-recovered', flatDelta: 1 }],
  },
  {
    id: 'thick_blooded',
    name: 'Thick Blooded（血浓）',
    polarity: 'positive',
    description: '受到的腐蚀伤害 -1。',
    modifiers: [
      { eventType: 'damage-taken', condition: { damageSourceIn: ['blight'] }, flatDelta: -1 },
    ],
  },
  {
    id: 'warrior_of_light',
    name: 'Warrior of Light（光之战士）',
    polarity: 'positive',
    description: '光照 ≥ 6 时攻击伤害输出 +1。',
    modifiers: [
      {
        eventType: 'damage-output',
        condition: { minLight: 6, damageSourceIn: ['attack'] },
        flatDelta: 1,
      },
    ],
  },
];

/** 全部 35 个 Quirk。 */
export const ALL_QUIRKS: QuirkDefinition[] = [...NEGATIVE_QUIRKS, ...POSITIVE_QUIRKS];

const QUIRK_MAP = new Map(ALL_QUIRKS.map((q) => [q.id, q]));

/** 按 id 查询 Quirk 定义。 */
export function getQuirkById(id: string): QuirkDefinition | undefined {
  return QUIRK_MAP.get(id);
}

/** Phase 7 placeholder Quirk id → Phase 8A 真实 Quirk id 的迁移映射。 */
export const LEGACY_QUIRK_ID_MAP: Record<string, string> = {
  // Phase 7 占位 id（placeholder-quirks.ts）→ Phase 8A 真实 Quirk
  quirk_pos_hard_skinned: 'hard_skinned',
  quirk_pos_quick_reflexes: 'quick_reflexes',
  quirk_pos_steady: 'balanced',
  quirk_neg_nervous: 'nervous',
  quirk_neg_fragile: 'fragile',
  quirk_neg_paranoid: 'fear_of_the_unknown',
  // 裸名兼容（手工编辑存档 / 早期调试数据）
  hard_skinned: 'hard_skinned',
  quick_reflexes: 'quick_reflexes',
  nervous: 'nervous',
  fragile: 'fragile',
  steady: 'balanced',
  paranoid: 'fear_of_the_unknown',
};

/** 把任意（含旧版）Quirk id 归一化为当前有效 id；无法识别返回 null。 */
export function normalizeQuirkId(id: string): string | null {
  if (getQuirkById(id)) return id;
  const mapped = LEGACY_QUIRK_ID_MAP[id];
  return mapped && getQuirkById(mapped) ? mapped : null;
}
