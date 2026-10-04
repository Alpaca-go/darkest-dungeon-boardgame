import { historicalBaselines, verifyHistoricalBaseline } from './historical-baseline';
const executeOriginal = process.argv.includes('--execute-original');
const selected = process.argv.slice(2).filter(arg=>arg!=='--execute-original');
for (const phase of selected.length ? selected : ['c1c27', 'c1c28']) {
  if (!(phase in historicalBaselines)) throw new Error(`Unknown historical baseline: ${phase}`);
  verifyHistoricalBaseline(phase as keyof typeof historicalBaselines, [], executeOriginal ? ()=>{} : undefined);
}
