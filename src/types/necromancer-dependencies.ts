export const THREAT_DEPENDENCY_V3 = 'C1C32R2-DIGITAL-DEFAULT-v3' as const;
export interface GraveyardReceipt {
  transactionId: string; campaignId: string; sourceQuestRunId: string; encounterId: string;
  ruleSetVersion: string; threatLevel: 2 | 3; forcedHeroId: string; heroInstanceId: string;
  useEffect: boolean; virtueId: string | null; targetQuestRunId: string | null;
  selectionEventId: string; preparationRolls: Record<string, number>;
  lifecycle: 'PENDING_NEXT_QUEST' | 'ACTIVE_QUEST' | 'GUARD_ONLY' | 'EXPIRED';
}
export interface LargeMovementContractState {
  ruleSetVersion: typeof THREAT_DEPENDENCY_V3;
  rulingId: 'C1C32R2-LARGE-SINGLE-DISPLACEMENT-OVERFLOW-v1';
  areas: Array<{ id: string; capacity: number; adjacent: string[] }>;
  placements: Record<string, string>; occupiedSpaces: Record<string, number>; sequence: number;
  overflow: Array<{ areaId: string; entrantId: string; eventId: string; extraSpaces: number }>;
  pendingChoice: null | {
    choiceId: string; actorId: string; targetId: string; from: string; to: string;
    candidateIds: string[]; parentEventId: string; ruleSetVersion: typeof THREAT_DEPENDENCY_V3;
  };
  events: Array<{ eventId: string; parentEventId: string | null; type: string; result: unknown }>;
}
