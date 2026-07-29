import type { RoomTypeMeta } from '../types';

// 房间类型元数据：用颜色与边框区分，未来可替换为正式素材。
export const ROOM_TYPES: RoomTypeMeta[] = [
  { type: 'start', label: '起点', color: '#5b8a5b', description: '队伍进入地牢的位置。' },
  { type: 'empty', label: '空房间', color: '#6b6258', description: '安全，立即清除。' },
  { type: 'trap', label: '陷阱', color: '#b8893b', description: '触发后分配少量伤害或压力。' },
  { type: 'treasure', label: '宝藏', color: '#d9b44a', description: '获得 Gold 并清除。' },
  { type: 'battle', label: '战斗', color: '#8b2b2b', description: '进入战斗页面。' },
  { type: 'objective', label: '目标', color: '#4f8a9c', description: '完成任务目标，需清除战斗。' },
];

export function getRoomMeta(type: string): RoomTypeMeta | undefined {
  return ROOM_TYPES.find((r) => r.type === type);
}
