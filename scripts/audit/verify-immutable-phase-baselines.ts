import {historicalBaselines, verifyHistoricalBaseline} from './historical-baseline';
export const successorHistoricalPhases = ['c1c33','c1c34','c1c35','c1c35r1','c1c35r2','c1c35r2ar','c1c35r2br1','c1c36','c1c37','c1c38','c1c38r1'] as const;
export function verifyImmutablePhaseBaselines() {
  for (const phase of successorHistoricalPhases) verifyHistoricalBaseline(phase);
}
if (process.argv.includes('--verify-immutable')) {
  const selected = process.argv.slice(process.argv.indexOf('--verify-immutable')+1);
  if (!selected.length) verifyImmutablePhaseBaselines();
  else for (const phase of selected) {
    if (!(phase in historicalBaselines)) throw new Error('Unknown immutable phase');
    verifyHistoricalBaseline(phase as keyof typeof historicalBaselines);
  }
}
