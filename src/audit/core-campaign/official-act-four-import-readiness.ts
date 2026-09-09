import { isDarkestDungeonOfficialGuardianPoolEnabled } from '../../data/darkest-dungeon/guardian-registry';
import { isFinalEncounterOfficialEnabled } from '../../data/darkest-dungeon/final-form-registry';
import { isDarkestDungeonOfficialQuestPoolEnabled } from '../../data/darkest-dungeon/quest-registry';
import { isAllGuardianFamiliesReady } from '../../data/darkest-dungeon/official-guardian-assembly';
import { isDarkestDungeonOfficialMonsterDeckEnabled } from '../../data/darkest-dungeon/final-encounter/darkest-dungeon-monster-deck-registry';

/** Central import gate; callers must not reimplement a subset of these checks. */
export function isOfficialActFourImportReady(): boolean {
  return isDarkestDungeonOfficialMonsterDeckEnabled() && isDarkestDungeonOfficialQuestPoolEnabled() &&
    isDarkestDungeonOfficialGuardianPoolEnabled() && isFinalEncounterOfficialEnabled() && isAllGuardianFamiliesReady();
}
