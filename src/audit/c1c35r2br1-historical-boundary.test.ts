import {describe,it} from 'vitest';
import {verifyHistoricalBaseline} from '../../scripts/audit/historical-baseline';
describe('C1C35R2B-R1 frozen infrastructure boundary',()=>{
  it('executes the unchanged R2A-R verifier and 32 infrastructure tests in the accepted detached checkout',()=>{
    verifyHistoricalBaseline('c1c35r2ar');
  },180000);
});
