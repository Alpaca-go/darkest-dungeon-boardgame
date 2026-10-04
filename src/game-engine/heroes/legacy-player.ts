import {getHeroById} from '../../data/heroes';
export function legacyHeroColor(id:string) {return getHeroById(id)?.color;}
import {getSkillById} from '../../data/skills';
export function legacySkillName(id:string) {return getSkillById(id)?.name??id;}
