import {describe,it,expect} from 'vitest';
import {buildC1C38R1Artifacts,validateC1C38R1Artifacts} from '../../scripts/audit/c1c38r1-source-intake';
import {productionBossFamilyRegistry} from '../game-engine/bosses/definitions';
import {productionBossCapabilities,productionBossPlayerRouteEnabled} from '../game-engine/bosses/production-capabilities';

describe('C1C38R1 official print intake boundaries',()=>{
  const baseline=buildC1C38R1Artifacts();
  it('accepts per-field source closure with exact conserved accounting and blocked runtime',()=>{
    expect(()=>validateC1C38R1Artifacts(baseline)).not.toThrow();
    const matrix=baseline['thing-executable-field-matrix'];
    expect(matrix.summary).toEqual({total:155,official:107,sourceUnresolved:24,projectRulingRequired:24,projectRuling:0});
    expect(matrix.transitions).toHaveLength(46);
    expect(baseline['source-intake-decision'].outcome).toBe('THING_OFFICIAL_SOURCE_INTAKE_PARTIAL');
  });
  it('keeps production unreachable and fixes only the source model',()=>{
    expect(productionBossFamilyRegistry.has('thing-from-the-stars')).toBe(false);
    expect(productionBossCapabilities.some(c=>c.familyId==='thing-from-the-stars')).toBe(false);
    expect(productionBossPlayerRouteEnabled('thing-from-the-stars','C1C38R1-OFFICIAL-INTAKE-v1')).toBe(false);
    expect(baseline['thing-encounter-source-closure'].encounterModel).toBe('EXPANSION_SPECIAL_ENCOUNTER');
    expect(baseline['thing-encounter-source-closure'].mainCampaignApplicable).toBe(false);
  });
  it('separates miniature census, Level print slots and unresolved ownership supply',()=>{
    const census=baseline['physical-component-census'];
    expect(census.officialMiniatureList.crystallineAberration).toBe(2);
    expect(census.aberrationCardPrintSlots).toMatchObject({levelI:1,levelII:1,levelICopySupply:'SOURCE_UNRESOLVED'});
    expect(census.rulebookTokenList.total).toBe(99);
    expect(census.boxTokenTotal).toBe(33);
    expect(census.conflicts[0].canonicalResolution).toBe(false);
  });
  const field=(a:typeof baseline,id:string)=>a['thing-executable-field-matrix'].fields.find((f:any)=>f.id===id);
  const attacks:Array<[string,(a:typeof baseline)=>void]>=[
    ['Color of Madness from filename',a=>{field(a,'encounter.contentSet').sourceReferences=[{path:'color-of-madness',authority:'FILENAME'}];}],
    ['Farmstead from franchise knowledge',a=>{field(a,'encounter.encounterType').sourceReferences=[];}],
    ['Face the Threat assumed',a=>{field(a,'encounter.FaceTheThreatApplicable').normalizedValue=true;}],
    ['fabricated RoomStorage card',a=>{field(a,'encounter.RoomModel').normalizedValue={room:'prototype-room'};}],
    ['fabricated Thing II/III',a=>{a['thing-encounter-source-closure'].synthesizedLevels=['II','III'];}],
    ['TTS copy count promoted',a=>{a['physical-component-census'].transportObjectCountsAccepted=true;}],
    ['community image as rule authority',a=>{field(a,'aberration.productionDefinition').sourceReferences=[{path:'src/assets/community-reference/farmstead.png',authority:'OFFICIAL_SOURCE'}];}],
    ['videogame stats',a=>{field(a,'actor.life').normalizedValue=200;}],
    ['any Monster summon pool',a=>{field(a,'summon.eligiblePool').status='OFFICIAL_SOURCE';field(a,'summon.eligiblePool').normalizedValue='ANY_MONSTER';}],
    ['Aberration II creates Thing II',a=>{a['crystalline-aberration-source-closure'].levelIIDoesNotCreateThingLevelII=false;}],
    ['infinite supply',a=>{a['physical-component-census'].infiniteSupplyAllowed=true;}],
    ['source blocker becomes approved ruling',a=>{field(a,'physical.aberrationCopies').status='PROJECT_RULING';}],
    ['unapproved tie silently approved',a=>{a['thing-special-combat-source-closure'].newRulingCandidates[0].approved=true;}],
    ['Thing production authorized',a=>{a['source-intake-decision'].runtimeImplementationAuthorized=true;}],
    ['silent singleton override of Ability',a=>{a['return-to-stars-source-closure'].countAlgorithm='EXACTLY_ONE';}],
    ['All Heroes reduced to one per Area',a=>{a['crystalline-aberration-source-closure'].allHeroesScope='ONE_PER_AREA';}],
    ['delayed Wounds become healing',a=>{a['crystalline-aberration-source-closure'].delayedSelfEffect={heal:10};}],
    ['missing symbol numeric zero',a=>{field(a,'actor.unprintedResistanceDefaults').normalizedValue=0;}],
    ['two miniatures imply two Level I copies',a=>{a['physical-component-census'].aberrationCardPrintSlots.levelICopySupply=2;}],
    ['source conflict silently resolved',a=>{a['return-to-stars-source-closure'].conflicts[0].canonicalResolution=true;}],
    ['field disappearance',a=>{a['thing-executable-field-matrix'].fields.pop();}],
    ['incomplete grouped source request',a=>{a['missing-official-source-request'].requests[0].blockedFields.pop();}],
    ['rulebook source hash drift',a=>{a['official-source-intake-manifest'].sources[0].sha256='0'.repeat(64);}],
  ];
  it.each(attacks)('rejects %s',(_name,mutate)=>{
    const changed=structuredClone(baseline);mutate(changed);
    expect(()=>validateC1C38R1Artifacts(changed)).toThrow(/C1C38R1:/);
  });
});
