import ts from 'typescript';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,sep} from 'node:path';
import {auditProductionPrototypeReachability} from './c1c35r2a-prototype-reachability';

const debug=/force-pew-roll|force-prophet-skill|debug-prophet|inject-crowded|inject-rubble|set-boss-hp|debug-rng|e2e-test-controls|e2e-player-harness/;
export function auditBuiltProductionIsolation(dist=resolve('dist')) {
  const html=readFileSync(resolve(dist,'index.html'),'utf8'),seen=new Set<string>();
  const entries=[...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map(m=>resolve(dist,m[1].replace(/^\//,'')));
  if(!entries.length)throw new Error('Built production entry absent');
  function visit(path:string){
    if(seen.has(path))return;
    if(!path.startsWith(dist+sep))throw new Error('Chunk escapes dist');seen.add(path);
    const code=readFileSync(path,'utf8');if(debug.test(code)||/PROPHET_PROTOTYPE_(ROOM|BOSS|RUBBLE_ID)|prototypeRubblePipeline/.test(code))throw new Error('Forbidden production chunk: '+path);
    // Includes static imports, dynamic imports and Vite's preload dependency table.
    for(const match of code.matchAll(/["']([^"'\s]+\.js)["']/g)){
      const spec=match[1];if(/^https?:/.test(spec))throw new Error('External JS runtime dependency');
      for(const target of [resolve(dirname(path),spec),resolve(dist,spec.replace(/^\//,''))])if(existsSync(target)){visit(target);break;}
    }
  }
  entries.forEach(visit);
  const reachableChunks=[...seen].sort().map(path=>({path:relative(dist,path).replace(/\\/g,'/'),sha256:createHash('sha256').update(readFileSync(path)).digest('hex')}));
  return {status:'PASS',scanScope:'ALL_REACHABLE_EMITTED_JS_INCLUDING_DYNAMIC_AND_PRELOAD_CHUNKS',reachableChunks,
    buildIdentity:createHash('sha256').update(JSON.stringify(reachableChunks)).digest('hex'),debugHooks:0,prototypeProductionReachability:0};
}

export function auditSuccessorProductionIsolation() {
  const source=auditProductionPrototypeReachability();
  const seen=new Set<string>();let auditArtifactRuntimeCoupling=0,rawLocalRulebookRuntimeDependency=0;
  function visit(path:string){
    if(seen.has(path))return;seen.add(path);
    const code=readFileSync(path,'utf8'),file=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true);
    const specs:string[]=[];
    function walk(node:ts.Node){
      if(ts.isImportDeclaration(node)&&ts.isStringLiteral(node.moduleSpecifier)&&!node.importClause?.isTypeOnly)specs.push(node.moduleSpecifier.text);
      if(ts.isExportDeclaration(node)&&node.moduleSpecifier&&ts.isStringLiteral(node.moduleSpecifier)&&!node.isTypeOnly)specs.push(node.moduleSpecifier.text);
      if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword&&ts.isStringLiteral(node.arguments[0]))specs.push(node.arguments[0].text);
      ts.forEachChild(node,walk);
    }walk(file);
    for(const spec of specs){
      if(/c1c36-.*(acceptance|browser|proof)|c1c37-/.test(spec))auditArtifactRuntimeCoupling++;
      if(/\.pdf(?:\?|$)/i.test(spec))rawLocalRulebookRuntimeDependency++;
      if(!spec.startsWith('.'))continue;
      const base=resolve(dirname(path),spec.split('?')[0]);
      const next=[base,base+'.ts',base+'.tsx',resolve(base,'index.ts')].find(p=>existsSync(p)&&/\.(tsx?|mjs)$/.test(p));if(next)visit(next);
    }
  }
  visit(resolve('src/main.tsx'));visit(resolve('src/game-engine/bosses/definitions.ts'));visit(resolve('src/game-engine/save.ts'));
  if(auditArtifactRuntimeCoupling||rawLocalRulebookRuntimeDependency)throw new Error('Production audit / raw rulebook runtime dependency');
  return {schemaVersion:1,phase:'11A.4-C1C37',...auditBuiltProductionIsolation(),sourceGraph:source,
    auditArtifactRuntimeCoupling,rawLocalRulebookRuntimeDependency};
}
