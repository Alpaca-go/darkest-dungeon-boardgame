import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildC2AArtifacts,validateC2AArtifacts,C2A_BASELINE} from '../../scripts/audit/c2a-hero-source-census';

const census=buildC2AArtifacts();
const clone=()=>JSON.parse(JSON.stringify(census));
describe('C2A source census and immutable candidate boundary',()=>{
  it('accepts the honest partial census, with every object and unresolved binding accounted',()=>expect(()=>validateC2AArtifacts(census)).not.toThrow());
  it('enumerates the exact 18 official class identities independently of selectable runtime heroes',()=>{
    expect(census['hero-logical-identities'].heroes.map((h:any)=>h.heroClassId).sort()).toEqual([
      'abomination','antiquarian','arbalest','bounty-hunter','crusader','flagellant','grave-robber','hellion','highwayman',
      'hound-master','jester','leper','man-at-arms','musketeer','occultist','plague-doctor','shieldbreaker','vestal']);
  });
  it('keeps 199 TTS owners distinct from 451 official print slots',()=>{
    const p=census['hero-physical-census'];expect(p.objects).toHaveLength(199);
    expect(p.objects.filter((x:any)=>x.category==='HERO_PVP_CARD')).toHaveLength(36);
    expect(p.objects.filter((x:any)=>x.category==='LEVEL_PROFILE_CARD')).toHaveLength(37);
    expect(p.objects.filter((x:any)=>x.category==='SKILL_TRANSPORT_OWNER')).toHaveLength(126);
    expect(p.officialPrintedObjects).toHaveLength(451);expect(p.delta.total).toBe(252);
  });
  it('binds seven front skill families and 21 directly observed level forms per Hero',()=>{
    for(const h of census['hero-logical-identities'].heroes){
      expect(census['heroes/'+h.heroClassId].skills).toHaveLength(7);
      expect(census['heroes/'+h.heroClassId].skillStates).toHaveLength(21);
    }
    expect(census['hero-skill-level-form-map'].forms).toHaveLength(378);
  });
  it('retains three Abomination profiles and both printed transformation actions',()=>{
    const a=census['heroes/abomination'];expect(a.levelProfileCards).toHaveLength(3);
    expect(a.officialProfileInventory.map((p:any)=>[p.frontLevelMarker,p.backLevelMarker])).toEqual([['I','I'],['II','II'],['III','III']]);
    expect(a.skillStates.filter((s:any)=>s.printedName==='Transform to Beast').map((s:any)=>s.printedBackName)).toEqual(['Transform to Human','Transform to Human','Transform to Human']);
  });
  for(const path of ['src/data/heroes.ts','src/data/skills.ts','src/data/hero-level-profiles.ts'])
    it('preserves accepted content of '+path,()=>expect(readFileSync(path,'utf8').replace(/\r\n/g,'\n')).toBe(execFileSync('git',['show',C2A_BASELINE+':'+path]).toString('utf8').replace(/\r\n/g,'\n')));
  it('preserves Thing hold and existing project-ruling classification',()=>{
    expect(census['next-workstream-decision'].ThingStatus).toBe('SOURCE_ACQUISITION_HOLD');
    expect(census['next-workstream-decision'].ThingRuntimeAuthorized).toBe(false);
    expect(census['hero-official-source-manifest'].existingRulingReview.classification).toBe('PROJECT_RULING_PRESERVED');
    expect(census['hero-source-census-acceptance'].C2BAllowed).toBe(false);
  });
  const attacks:[string,(a:any)=>void][]=[
    ['prototype Hero HP as authority',a=>a['prototype-hero-data-comparison'].heroes[0].sourceAvailability='PROTOTYPE_HP_AUTHORITY'],
    ['prototype Skill damage as authority',a=>a['prototype-hero-data-comparison'].skills[0].valueClassification='OFFICIAL_SOURCE'],
    ['generic SKILL_LEVEL_BONUS as authority',a=>a['prototype-hero-data-comparison'].skillLevelBonus.futureProductionAuthorityAllowed=true],
    ['TTS Name as printed authority',a=>a['hero-logical-identities'].heroes[0].status='TTS_NAME_AUTHORITY'],
    ['state index without printed evidence',a=>a['hero-skill-level-form-map'].forms[0].mappingBasis='TTS state index'],
    ['video game numerical import',a=>a['hero-skill-level-form-map'].forms[0].damage={authority:'VIDEOGAME',value:9}],
    ['community Wiki authority',a=>a['hero-official-source-manifest'].sources[0].authority='COMMUNITY_WIKI'],
    ['duplicate copy as logical Skill',a=>a['hero-skill-identities'].skills.push({...a['hero-skill-identities'].skills[0],skillId:'extra-copy'})],
    ['level state as physical owner',a=>a['hero-physical-census'].objects.push({...a['hero-physical-census'].objects[0],physicalId:'extra-state'})],
    ['discard third Abomination profile',a=>a['heroes/abomination'].levelProfileCards.pop()],
    ['only eight runtime Heroes',a=>a['hero-logical-identities'].heroes=a['hero-logical-identities'].heroes.slice(0,8)],
    ['ignore an unselectable Hero',a=>delete a['heroes/musketeer']],
    ['register new Hero into live runtime',a=>a['heroes/musketeer'].runtimeModified=true],
    ['same counts with wrong official page',a=>a['hero-skill-level-form-map'].forms[0].officialSource.page=1],
    ['fake hash-bound source',a=>a['hero-skill-level-form-map'].forms[0].officialSource.sha256='0'.repeat(64)],
    ['promote missing Profile by CardID',a=>a['heroes/crusader'].levelProfileCards[0].status='OFFICIAL_SOURCE'],
    ['hide missing back',a=>a['hero-source-gap-register'].gaps.pop()],
    ['turn partial into accepted',a=>a['hero-source-census-acceptance'].outcome='HERO_SOURCE_CENSUS_ACCEPTED'],
  ];
  it.each(attacks)('rejects %s',(_name,mutate)=>{const a=clone();mutate(a);expect(()=>validateC2AArtifacts(a)).toThrow(/C2A:/);});
});
