import type { CampaignState } from '../../types';
import { resolveBossDefinition } from './definitions';
import { validateThreatCheckpoint } from './threat-checkpoint';
import { validateRuinsDrawState } from '../ruins/encounter-draw';
import { resolveHeroDodge } from '../rules/hero-dodge';

/** Archived Quest identities are never rebound to the next Quest's dungeon. */
export function validateQuestThreatHistory(c: CampaignState): void {
  const history = c.necromancerQuestThreatHistory;
  if (history === undefined) return;
  if (!Array.isArray(history) || new Set(history.map(h => h.questRunId)).size !== history.length)
    throw new Error('Invalid Quest Threat archive identities');
  for (const entry of history) {
    const e = entry.checkpoint, ctx = e?.checkpointContext;
    if (!ctx || ctx.questScope !== 'STANDARD' || entry.questRunId !== ctx.questRunId || entry.activeThreatId !== ctx.threatId
      || ctx.campaignId !== c.id || e.bossFamily !== 'necromancer' || ctx.campaignLevel !== e.bossLevel
      || !c.processedCampaignTransactionIds?.includes(`${ctx.encounterId}:standard-checkpoint-archive`)
      || e.pendingChoice || JSON.stringify(e.definition) !== JSON.stringify(resolveBossDefinition(e.bossFamily, e.bossLevel, e.ruleSetVersion))
      || e.events.some(event => event.ruleSetVersion !== e.ruleSetVersion)) throw new Error('Invalid Quest Threat archive linkage');
    const archived = structuredClone(e);
    archived.checkpointContext!.heroDodgeBindings = undefined;
    for (const [id, binding] of Object.entries(ctx.heroDodgeBindings ?? {})) {
      if (ctx.heroDodge[id] !== binding.value || JSON.stringify(binding) !== JSON.stringify(resolveHeroDodge(binding)))
        throw new Error('Archived Hero Dodge binding mismatch');
    }
    validateThreatCheckpoint({ ...c, heroes: [], dungeon: { ...c.dungeon!, questRunId: entry.questRunId },
      campaignProgress: { ...c.campaignProgress, campaignLevel: e.bossLevel, activeThreatId: ctx.threatId, activeBossFamilyId: e.bossFamily } }, archived);
    if (entry.drawState) {
      validateRuinsDrawState(entry.drawState);
      if (entry.drawState.encounters.some(encounter => !encounter.returned || !encounter.encounterId.startsWith(`${ctx.encounterId}:ordinary:`)))
        throw new Error('Archived Quest has unresolved physical ownership');
    }
  }
}
