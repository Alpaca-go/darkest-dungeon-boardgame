import { withHistoricalHeroCampaignMetadata } from '../../src/game-engine/heroes/legacy-campaign-metadata';
import { verifyProphetCompatibility, verifyProphetCaptureOrigin } from './c1c37-prophet-compatibility';
import { verifyBossSuccessorCompatibility } from './c1c37-successor';

// Keep the original frozen verifier byte-identical and execute current gameplay
// using its original v22 campaign construction metadata.
if (process.argv.includes('--prophet')) {
  verifyProphetCaptureOrigin();
  withHistoricalHeroCampaignMetadata(verifyProphetCompatibility);
  console.log('PROPHET_SUCCESSOR_COMPATIBILITY: PASS');
}
if (process.argv.includes('--boss')) withHistoricalHeroCampaignMetadata(verifyBossSuccessorCompatibility);
