import type { CampaignState } from '../../types';
import type { CampaignMilestoneHash, GameEventRecord, RngSnapshotRecord } from './types';
import { stableHashState } from './types';
import { CAMPAIGN_MILESTONES } from './golden-seeds';
import { runGoldenCampaignAttempt } from './run-audit';

export interface DeterministicRuntimeSnapshot {
  randomCursor: number;
  clockCursor: number;
  idCursor: number;
}

/** Audit-only envelope. Ordinary product saves intentionally exclude these cursors. */
export interface CampaignReplayCheckpoint {
  schemaVersion: 1;
  seedId: string;
  milestoneId: string;
  campaignState: CampaignState;
  commandIndex: number;
  eventIndex: number;
  rngDrawIndex: number;
  runtimeSnapshot: DeterministicRuntimeSnapshot;
  stateHash: string;
  initialStateHash: string;
  events: GameEventRecord[];
  rngSnapshots: RngSnapshotRecord[];
  milestones: CampaignMilestoneHash[];
}

function run(seedId: string, target: string, checkpoint?: CampaignReplayCheckpoint) {
  if (!CAMPAIGN_MILESTONES.some(m => m.id === target)) throw new Error(`Unknown milestone: ${target}`);
  const result = runGoldenCampaignAttempt(seedId, 'checkpoint-v1', { until: target, checkpoint });
  if (!result.reachedMilestones.includes(target)) throw new Error(`Unreachable ${target}: ${result.blockedReason}`);
  if (result.invariantErrorCount) throw new Error(result.invariantErrors.join('\n'));
  return result.checkpoint;
}

export function runCampaignUntilMilestone(seedId: string, milestoneId: string) {
  return run(seedId, milestoneId);
}

export function resumeCampaignFromCheckpoint(checkpoint: CampaignReplayCheckpoint, targetMilestoneId: string) {
  if (checkpoint.schemaVersion !== 1 || stableHashState(checkpoint.campaignState) !== checkpoint.stateHash
    || checkpoint.eventIndex !== checkpoint.events.length || checkpoint.commandIndex !== checkpoint.eventIndex
    || checkpoint.rngDrawIndex !== checkpoint.rngSnapshots.length
    || !Object.values(checkpoint.runtimeSnapshot).every(n => Number.isSafeInteger(n) && n >= 0)) {
    throw new Error('Invalid replay checkpoint');
  }
  return run(checkpoint.seedId, targetMilestoneId, checkpoint);
}
