import { RUINS_STANCES } from '../types/ruins-executable';
/** Exact tie contract of the selectRuinsMonsterTargets primitive cited by C3B. */
export function compareMonsterTargetPriority(a: { stance: string; position: number; id: string },
  b: { stance: string; position: number; id: string }): number {
  return (RUINS_STANCES as readonly string[]).indexOf(a.stance) - (RUINS_STANCES as readonly string[]).indexOf(b.stance)
    || a.id.localeCompare(b.id);
}
