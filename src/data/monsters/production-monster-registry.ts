/** Source-rich C3A content baseline. No combat execution or encounter dispatch. */
import data from '../../../docs/data/complete-edition/c3a-monster-production-data.json';
import type { ProductionMonsterRecord } from './production-monster-types';

export const PRODUCTION_MONSTER_CONTENT_VERSION = data.contentVersion;
export const PRODUCTION_MONSTER_CONTENT: readonly ProductionMonsterRecord[] = data.records as ProductionMonsterRecord[];
