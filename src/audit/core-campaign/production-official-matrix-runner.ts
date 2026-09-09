/** A production-only executor: it has no synthetic test-fixture seam. */
import { OFFICIAL_DARKEST_DUNGEON_QUESTS } from '../../data/darkest-dungeon/quest-registry';
import { OFFICIAL_GUARDIAN_ASSEMBLY } from '../../data/darkest-dungeon/official-guardian-assembly';
import { FINAL_FORM_ORDER, OFFICIAL_FINAL_FORMS, UNSKIPPABLE_FINAL_FORM_ID } from '../../data/darkest-dungeon/final-form-registry';
import { registerFormalProductionRunner, type OfficialMatrixRunner, type GuardianFamily, type SkippedFormId } from './official-matrix-runner';
import { isOfficialActFourImportReady } from './official-act-four-import-readiness';

export function createProductionOfficialMatrixRunner(): OfficialMatrixRunner | undefined {
  if (!isOfficialActFourImportReady()) return undefined;
  return registerFormalProductionRunner({ runCombination(family: GuardianFamily, skippedFormId: SkippedFormId, mode: 'formal') {
    if (mode !== 'formal') throw new Error('Production matrix accepts formal mode only');
    const guardian = OFFICIAL_GUARDIAN_ASSEMBLY.find((item) => item.family === family);
    const quest = OFFICIAL_DARKEST_DUNGEON_QUESTS.find((item) => item.guardianDefinitionId === guardian?.id && item.skippedFinalFormId === skippedFormId);
    const noPrototype = [guardian?.id, guardian?.roomDefinitionId, ...(guardian?.actorDefinitionIds ?? []), quest?.id].every((id) => !!id && !id.startsWith('prototype-'));
    const finalPath = FINAL_FORM_ORDER.filter((form) => form !== skippedFormId);
    const finalPathValid = finalPath.includes(UNSKIPPABLE_FINAL_FORM_ID) && finalPath.every((form) => OFFICIAL_FINAL_FORMS.some((item) => item.formId === form && item.enabledInOfficialPool));
    const passed = !!guardian?.enabledInOfficialPool && !!quest?.enabledInOfficialPool && noPrototype && finalPathValid;
    return { family, skippedFormId, status: passed ? 'PASS' as const : 'FAIL' as const, note: passed ? 'formal production registry path validated' : 'formal production mapping or final path invalid' };
  }});
}
