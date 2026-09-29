import sourceJson from '../community-reference/quests/data.json?raw';
import type { QuestDefinition } from '../../types';
import type { QuestRoomTokenType } from '../../types/content-runtime';
const source = (JSON.parse(sourceJson) as Array<{ id: string; printedName: string; roomCount: number;
  firewood: { tokens: number; restingPoints: number }; dungeonStructure: { roomTokens: Record<QuestRoomTokenType, number> };
  leafProvenance: Record<string, { assetPath: string; assetSha256: string }> }>).find(q=>q.id==='community-quest-boss-face-the-threat');
if (!source || source.roomCount !== 8 || source.firewood.tokens !== 1 || source.firewood.restingPoints !== 12
  || !Object.values(source.leafProvenance).some(p=>p.assetSha256==='3aed3ded69ddd0a3b987fa162c3823159368c569e4514c7a5a1fd2adb7b28001')) throw new Error('Locked printed Face the Threat dependency mismatch');
/** Printed component fields only; transport source IDs carry no rules authority. */
export const PRODUCTION_NECROMANCER_QUEST: QuestDefinition = {
  id: 'face-the-threat', name: source.printedName, type: 'boss', dungeonLevel: 1,
  description: '找到并击败当前 Necromancer。', roomCount: source.roomCount,
  objective: '击败当前 Boss。', reward: '3 XP', difficulty: 'hard',
  objectives: [{ id: 'face-the-threat-defeat-boss', description: '击败 Boss', type: 'complete-objective-room', target: 1, required: true }],
  firewoodSetup: { ...source.firewood }, dungeonComposition: {
    roomTokens: Object.entries(source.dungeonStructure.roomTokens).map(([roomType,count])=>({roomType:roomType as QuestRoomTokenType,count})),
    placement: 'shuffle-on-layout-room-slots',
  }, runtimeContentMetadata: { sourceOrigin: 'community-complete-edition', sourceDefinitionId: source.id, contentSet:'core', region:'ruins' },
};
