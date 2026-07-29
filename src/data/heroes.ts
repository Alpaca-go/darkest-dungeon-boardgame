import type { HeroDefinition } from '../types';

// 8 名英雄数据入口。前 4 名为完整配置，后 4 名为通用占位。
export const HEROES: HeroDefinition[] = [
  {
    id: 'crusader',
    name: 'Crusader',
    baseLife: 42,
    speed: 2,
    defaultStance: 'aggressive',
    tags: ['前排', '坦克', '近战'],
    color: '#b5651d',
    description: '坚毅的圣战者，擅长前排坚守与打击。',
  },
  {
    id: 'vestal',
    name: 'Vestal',
    baseLife: 34,
    speed: 4,
    defaultStance: 'support',
    tags: ['治疗', '后排', '远程'],
    color: '#d9b44a',
    description: '信仰的守护者，可输出亦可治疗。',
  },
  {
    id: 'highwayman',
    name: 'Highwayman',
    baseLife: 32,
    speed: 6,
    defaultStance: 'ranged',
    tags: ['输出', '灵活', '远程'],
    color: '#5b8a5b',
    description: '机敏的佣兵，擅长机动与连击。',
  },
  {
    id: 'hellion',
    name: 'Hellion',
    baseLife: 38,
    speed: 4,
    defaultStance: 'aggressive',
    tags: ['输出', '前排', '近战'],
    color: '#a83737',
    description: '狂暴的战士，以高伤换取生存。',
  },
  {
    id: 'leper',
    name: 'Leper',
    baseLife: 46,
    speed: 1,
    defaultStance: 'defensive',
    tags: ['前排', '重型'],
    color: '#7a8c9c',
    description: '占位英雄：迟缓而沉重的前排。',
  },
  {
    id: 'occultist',
    name: 'Occultist',
    baseLife: 30,
    speed: 5,
    defaultStance: 'ranged',
    tags: ['诅咒', '治疗'],
    color: '#6b4f8a',
    description: '占位英雄：操控禁忌之力。',
  },
  {
    id: 'plague-doctor',
    name: 'Plague Doctor',
    baseLife: 28,
    speed: 5,
    defaultStance: 'support',
    tags: ['毒', '辅助'],
    color: '#4f8a6b',
    description: '占位英雄：以药剂与解剖见长。',
  },
  {
    id: 'grave-robber',
    name: 'Grave Robber',
    baseLife: 30,
    speed: 7,
    defaultStance: 'ranged',
    tags: ['机动', '偷袭'],
    color: '#8a6b4f',
    description: '占位英雄：灵巧的盗墓者。',
  },
];

export function getHeroById(id: string): HeroDefinition | undefined {
  return HEROES.find((h) => h.id === id);
}
