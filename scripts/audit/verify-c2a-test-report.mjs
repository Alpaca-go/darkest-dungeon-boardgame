import {readFileSync} from 'node:fs';
const report=JSON.parse(readFileSync(process.argv[2],'utf8'));
for(const key of ['numFailedTests','numFailedTestSuites','numPendingTests','numTodoTests'])
  if(report[key]!==0)throw new Error(`C2A regression requires ${key}=0, received ${report[key]}`);
const targeted=report.testResults.find(r=>r.name.replaceAll('\\','/').endsWith('/src/audit/c2a-hero-source-census.test.ts'));
if(!targeted||targeted.assertionResults.length<27||targeted.assertionResults.some(a=>a.status!=='passed'))
  throw new Error('C2A requires all targeted/adversarial audit cases to pass');
if(report.numPassedTests<2822)throw new Error('C2A requires the complete successor regression suite');
console.log(`C2A regression PASS: ${report.numPassedTests} passed; 0 failed / pending / todo; ${targeted.assertionResults.length} targeted cases.`);
