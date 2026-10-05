import {spawnSync} from 'node:child_process';
const name=process.argv[process.argv.length-1];
if(!/^(?:[a-z0-9]+:)*[a-z0-9-]+$/.test(name))throw new Error('Invalid package gate name');
const r=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run',name],{stdio:'inherit',shell:process.platform==='win32'});
process.exitCode=r.status??1;
