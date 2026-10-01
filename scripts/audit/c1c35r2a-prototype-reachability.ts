import ts from 'typescript';
import {existsSync,readFileSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
const forbidden=/PROPHET_PROTOTYPE_(ROOM|BOSS|RUBBLE_ID)|prototypeRubblePipeline/;
/** Follow runtime imports/exports from the application and the new public production dispatcher. */
export function auditProductionPrototypeReachability() {
  const root=resolve('.'),seen=new Set<string>(),found:string[]=[];
  const entries=['src/main.tsx','src/game-engine/bosses/definitions.ts','src/game-engine/save.ts'];
  function visit(path:string) {
    if(seen.has(path))return;seen.add(path);
    const code=readFileSync(path,'utf8');
    const file=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true);
    if(forbidden.test(code) || /src\/game-engine\/prophet\/(runtime|index)\.ts$/.test(path.replace(/\\/g,'/')))found.push(relative(root,path).replace(/\\/g,'/'));
    const imports:string[]=[];
    function walk(node:ts.Node) {
      if(ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !node.importClause?.isTypeOnly
        && !(node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)
          && !node.importClause.name && node.importClause.namedBindings.elements.every(e=>e.isTypeOnly))) imports.push(node.moduleSpecifier.text);
      if(ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))imports.push(node.moduleSpecifier.text);
      if(ts.isCallExpression(node) && node.expression.kind===ts.SyntaxKind.ImportKeyword) {
        const arg=node.arguments[0];
        if(!arg || !ts.isStringLiteral(arg))throw new Error('Unresolved production dynamic import: '+path);
        imports.push(arg.text);
      }
      ts.forEachChild(node,walk);
    }
    walk(file);
    for(const spec of imports.filter(i=>i.startsWith('.'))) {
      const base=resolve(dirname(path),spec.split('?')[0]);
      const next=[base,base+'.ts',base+'.tsx',base+'.mjs',resolve(base,'index.ts'),resolve(base,'index.tsx')].find(p=>existsSync(p)&&/\.(tsx?|mjs)$/.test(p));
      if(next)visit(next);
      else if(!/\.(json|css|png|jpg|svg|webp|pdf)(\?|$)/.test(spec))throw new Error('Unresolved runtime import: '+spec+' from '+path);
    }
  }
  entries.forEach(p=>visit(resolve(p)));
  if(found.length)throw new Error('Prototype reachable from production: '+found.join(', '));
  return {productionPrototypeReachability:0,entryPoints:entries,visitedRuntimeModuleCount:seen.size,
    forbiddenModules:['src/game-engine/prophet/runtime.ts','src/game-engine/prophet/index.ts','src/data/bosses/prophet-family.ts'],
    auditMethod:'TYPESCRIPT_AST_RUNTIME_IMPORT_EXPORT_DYNAMIC_IMPORT_GRAPH',historicalPrototypeTestsRetained:true};
}
