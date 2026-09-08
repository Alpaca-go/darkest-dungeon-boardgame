import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { buildReplacementScenario } from '../scenarios/replacement-scenario';
import { validateSaveFile } from '../../game-engine/save';

it('E2E player has only approved public actions and no property mutation', () => {
  const path = 'src/testing/e2e/e2e-player-harness.ts';
  const source = readFileSync(path, 'utf8');
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const allowed = new Set(['declineTrinketOpportunity','resolveTrinketAllocation','leaveDungeon','moveToRoom',
    'battleResolveVictory','selectBattleSkill','battleUseSkill','battleEndTurn','skipHeroToday','endHamletDay',
    'completeReplacementFlow','confirmReplacement','selectReplacementHero']);
  const violations: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment && !ts.isIdentifier(node.left)) violations.push(node.getText(tree));
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const call = node.expression;
      if (call.expression.getText(tree) === 'store' && !allowed.has(call.name.text)) violations.push(call.getText(tree));
      if (['setState', 'replaceCampaign', 'assign', 'push', 'splice', 'fill'].includes(call.name.text)) violations.push(call.getText(tree));
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  expect(violations).toEqual([]);
  expect(source).not.toMatch(/debug|applyDamage|recordHeroDeath|healActor/);
  const app = readFileSync('src/app/App.tsx', 'utf8');
  expect(app).toContain("import.meta.env.VITE_E2E_MODE === '1' ? lazy");
});
it('Replacement scenario uses a valid product save envelope', () => {
  expect(validateSaveFile(buildReplacementScenario())).toBeNull();
});
