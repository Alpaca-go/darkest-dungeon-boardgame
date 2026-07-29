import type { SkillDefinition } from '../types';

// 每英雄 4 个技能（第一阶段只需 attack/heal/guard/move 四类）。
export const SKILLS: SkillDefinition[] = [
  // Crusader
  { id: 'crusader-smite', heroId: 'crusader', name: 'Smite', kind: 'attack', damage: 6, range: 1, description: '近身重击单个敌人。' },
  { id: 'crusader-stun', heroId: 'crusader', name: 'Holy Lance', kind: 'attack', damage: 5, range: 2, description: '突刺，可触及稍远目标。' },
  { id: 'crusader-guard', heroId: 'crusader', name: 'Bulwark', kind: 'guard', range: 0, description: '进入防御姿态，为相邻队友承担伤害。' },
  { id: 'crusader-stance', heroId: 'crusader', name: 'Battle Heal', kind: 'move', range: 0, description: '调整站位并小幅恢复。' },

  // Vestal
  { id: 'vestal-heal', heroId: 'vestal', name: 'Divine Grace', kind: 'heal', heal: 8, range: 3, description: '治疗一名队友。' },
  { id: 'vestal-judgement', heroId: 'vestal', name: 'Judgement', kind: 'attack', damage: 5, range: 3, description: '远程神圣打击。' },
  { id: 'vestal-guard', heroId: 'vestal', name: 'Sanctuary', kind: 'guard', range: 0, description: '展开护盾保护自身。' },
  { id: 'vestal-stance', heroId: 'vestal', name: 'Mantra', kind: 'move', range: 0, description: '调整站位，准备下一回合。' },

  // Highwayman
  { id: 'highwayman-shoot', heroId: 'highwayman', name: 'Pistol Shot', kind: 'attack', damage: 5, range: 3, description: '远程射击。' },
  { id: 'highwayman-stab', heroId: 'highwayman', name: 'Wicked Slice', kind: 'attack', damage: 7, range: 1, description: '近身切割。' },
  { id: 'highwayman-guard', heroId: 'highwayman', name: 'Duelist', kind: 'guard', range: 0, description: '架势防御，提升闪避。' },
  { id: 'highwayman-stance', heroId: 'highwayman', name: 'Open Vein', kind: 'move', range: 1, description: '位移并造成持续伤害。' },

  // Hellion
  { id: 'hellion-iron-swan', heroId: 'hellion', name: 'Iron Swan', kind: 'attack', damage: 8, range: 1, description: '强力近战。' },
  { id: 'hellion-bash', heroId: 'hellion', name: 'Bash', kind: 'attack', damage: 5, range: 1, description: '击退敌人。' },
  { id: 'hellion-guard', heroId: 'hellion', name: 'Breakthrough', kind: 'guard', range: 0, description: '蓄力防御姿态。' },
  { id: 'hellion-stance', heroId: 'hellion', name: 'Adrenaline Rush', kind: 'move', range: 0, description: '调整站位获得先攻。' },

  // 占位英雄技能（通用）
  { id: 'leper-hew', heroId: 'leper', name: 'Hew', kind: 'attack', damage: 7, range: 1, description: '占位：沉重劈砍。' },
  { id: 'occultist-sap', heroId: 'occultist', name: 'Sap', kind: 'attack', damage: 5, range: 3, description: '占位：抽取生命。' },
  { id: 'plague-doctor-noxious', heroId: 'plague-doctor', name: 'Noxious Blast', kind: 'attack', damage: 4, range: 3, description: '占位：毒爆。' },
  { id: 'grave-robber-flash', heroId: 'grave-robber', name: 'Flash', kind: 'attack', damage: 5, range: 2, description: '占位：眩光偷袭。' },
];

export function getSkillsByHero(heroId: string): SkillDefinition[] {
  return SKILLS.filter((s) => s.heroId === heroId);
}

export function getSkillById(id: string): SkillDefinition | undefined {
  return SKILLS.find((s) => s.id === id);
}
