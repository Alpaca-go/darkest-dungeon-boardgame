import {describe,it} from 'vitest';
import {verifyHistoricalBaseline} from '../../scripts/audit/historical-baseline';

/** Original phase-specific boundaries remain immutable and run at their accepted HEADs. */
describe('C2C unchanged Hero historical boundaries',()=>{
  it('passes the original C2A-R1 source and adversarial suite at its frozen checkpoint',()=>{
    verifyHistoricalBaseline('c2a-r1',['src/audit/c2a-r1-transport-binding.test.ts']);
  },600000);
  it('passes the original C2B source and adversarial suite at its frozen checkpoint',()=>{
    verifyHistoricalBaseline('c2b',['src/audit/c2b-hero-literal-closure.test.ts']);
  },600000);
});
