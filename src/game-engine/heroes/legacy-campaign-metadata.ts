// Explicit, scoped metadata context for reproducing historical legacy campaigns.
// It changes no Hero definitions, gameplay values, RNG sources or migration rules.
let historicalMetadata = false;
export function usesHistoricalHeroCampaignMetadata(): boolean { return historicalMetadata; }
export function withHistoricalHeroCampaignMetadata<T>(action: () => T): T {
  const previous = historicalMetadata;
  historicalMetadata = true;
  try { return action(); } finally { historicalMetadata = previous; }
}
