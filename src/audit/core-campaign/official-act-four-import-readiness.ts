import { isDarkestDungeonOfficialGuardianPoolEnabled } from '../../data/darkest-dungeon/guardian-registry';
import { isFinalEncounterOfficialEnabled } from '../../data/darkest-dungeon/final-form-registry';
import { isDarkestDungeonOfficialQuestPoolEnabled } from '../../data/darkest-dungeon/quest-registry';
import { isAllGuardianFamiliesReady } from '../../data/darkest-dungeon/official-guardian-assembly';

export interface OfficialActFourImportReadinessInput { darkestDungeonMonsterDeckReady: boolean }

/** Central import gate; callers must not reimplement a subset of these checks. */
export function isOfficialActFourImportReady(input: OfficialActFourImportReadinessInput): boolean {
  return input.darkestDungeonMonsterDeckReady && isDarkestDungeonOfficialQuestPoolEnabled() &&
    isDarkestDungeonOfficialGuardianPoolEnabled() && isFinalEncounterOfficialEnabled() && isAllGuardianFamiliesReady();
}
