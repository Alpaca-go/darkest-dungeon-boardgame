import {describe, it} from 'vitest';
import {verifyHistoricalBaseline} from '../../scripts/audit/historical-baseline';
describe('Successor historical exact verification',()=>{
  it('runs unchanged source/freeze/rejection suites in the accepted R2 checkout',()=>{
    verifyHistoricalBaseline('c1c35r2',['src/audit/c1c34-successor-rebaseline.test.ts','src/audit/c1c35-prophet-source-contract.test.ts',
      'src/audit/c1c35r1-prophet-residual-contract.test.ts','src/audit/c1c35r2-prophet-gate-foundation-review.test.ts']);
  },180000);
});
