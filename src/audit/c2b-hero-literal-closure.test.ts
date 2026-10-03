import {describe,it,expect} from 'vitest';
import {buildC2BArtifacts,validateC2BArtifacts,verifyC2BBoundary} from '../../scripts/audit/c2b-hero-literal-closure';
const a=buildC2BArtifacts();
const skill=(data:any,id:string,level=1)=>data['hero-skill-literals'].forms.find((s:any)=>s.skillId===id&&s.level===level);
describe('C2B source-bound literal successor without runtime promotion',()=>{
 it('validates all 18 Heroes, 54 Profiles, 126 identities, 378 Skills and 432 rows',()=>{validateC2BArtifacts(a);expect(a['hero-literal-closure-acceptance']).toMatchObject({heroGroups:18,profileFormsLiteralComplete:54,skillIdentities:126,skillFormsLiteralComplete:378,totalLiteralComplete:432,runtimeModified:false,prototypePromoted:false});expect(Object.keys(a).filter(k=>k.startsWith('heroes/'))).toHaveLength(36);});
 it('reviews every front and back with frozen official references and Roman markers',()=>{for(const s of a['hero-skill-literals'].forms){expect(s.visualReview).toMatchObject({reviewedFront:true,reviewedBack:true,navigationIsAuthority:false,derivation:'INDEPENDENT_LEVEL_TRANSCRIPTION',levelAuthority:'VISUALLY_VERIFIED_PRINTED_ROMAN_MARKER'});expect(s.printedLevel).toBe(['I','II','III'][s.level-1]);expect(s.sourceFront.authority).toBe('OFFICIAL_PRINTED_COMPONENT');expect(s.sourceBack.authority).toBe('OFFICIAL_PRINTED_COMPONENT');}});
 it('keeps absent Crit absent and binds omitted Accuracy separately to official page 19',()=>{const s=skill(a,'crusader-bulwark-of-faith');expect(s.numericFields.crit).toMatchObject({printed:'ABSENT',literal:null});expect(s.numericFields.accuracy).toMatchObject({printed:'ABSENT',literal:null});const f=a['hero-executable-field-matrix'].fields.find((f:any)=>f.skillId===s.skillId&&f.level===1&&f.side==='front'&&f.field==='accuracy');expect(f.sharedRuleInterpretation).toMatchObject({requiresRoll:false,doesNotCreatePrintedAccuracy:true,sourceRef:{page:19}});});
 it('records Puncture structural range changes independently and distinguishes ignore icons',()=>{expect([1,2,3].map(l=>skill(a,'shieldbreaker-puncture',l).glyphFields.range.literal)).toEqual(['2','1-2','1-2']);expect(skill(a,'shieldbreaker-puncture').frontLiteral.manualGlyphAwareTranscription).toContain('Ignores [guard]');expect(skill(a,'shieldbreaker-pierce').frontLiteral.manualGlyphAwareTranscription).toContain('Ignores [protection]');expect(skill(a,'shieldbreaker-serpent-sway',3).frontLiteral.manualGlyphAwareTranscription).toContain('Target [protection]2t');});
 it('preserves Abomination Human / Beast Profiles at every level and paired transformation actions',()=>{for(const p of a['hero-profile-literals'].profiles.filter((p:any)=>p.heroId==='abomination'))expect(p.forms.map((f:any)=>f.form).sort()).toEqual(['BEAST_FORM','HUMAN_FORM']);for(const l of [1,2,3]){expect(skill(a,'abomination-transform-to-beast',l).backLiteral.printedName).toBe('Transform to Human');expect(skill(a,'abomination-transform-to-beast',l).backLiteral.manualGlyphAwareTranscription).toContain('Beast Form Only');}});
 it('retains Flagellant Blight, condition transfer and historical unsupported prototype Bleed findings',()=>{expect(skill(a,'flagellant-rain-of-sorrows').frontLiteral.manualGlyphAwareTranscription).toContain('3[blight]2t');expect(skill(a,'flagellant-suffer').frontLiteral.conditions.semanticStatus).toBe('SOURCE_UNRESOLVED');const links=a['hero-glyph-semantic-contract'].c1c19SuccessorLinks;expect(links).toHaveLength(4);expect(links.find((l:any)=>l.historicalSkillId==='crusader-holy-lance').status).toBe('OFFICIAL_PRINT_HAS_NO_BLEED');});
 it('keeps Musketeer source independent and target stance absence distinct from Area range',()=>{for(const s of a['hero-skill-literals'].forms.filter((s:any)=>s.heroId==='musketeer')){expect(s.sourceFront.sourceId).toContain('MUSKETEER');expect(s.glyphFields.targetableStances.printed).toBe('ABSENT');}expect(skill(a,'musketeer-skeet-shot').glyphFields.targeting.literal.groups).toHaveLength(2);});
 it('records official conflicts without choosing a winner, and holds C2C and Thing',()=>{expect(a['hero-source-conflicts'].conflicts).toHaveLength(2);expect(a['hero-literal-closure-acceptance'].outcome).toBe('HERO_LITERAL_CLOSURE_BLOCKED');expect(a['next-workstream-decision']).toMatchObject({C2CAllowed:false,ThingRuntimeAuthorized:false,ThingStatus:'SOURCE_ACQUISITION_HOLD'});verifyC2BBoundary();});
 const attacks:[string,(a:any)=>void][]=[
  ['prototype numeric copy',a=>skill(a,'crusader-smite').numericFields.damage.literal=6],
  ['videogame Life copy',a=>a['hero-profile-literals'].profiles[0].forms[0].literalFields.life.literal=33],
  ['Level I copied to Level II',a=>skill(a,'crusader-smite',2).frontLiteral=structuredClone(skill(a,'crusader-smite').frontLiteral)],
  ['formula-derived progression',a=>skill(a,'crusader-smite',3).visualReview.derivation='SKILL_LEVEL_BONUS'],
  ['missing Crit defaulted to zero',a=>skill(a,'crusader-bulwark-of-faith').numericFields.crit.literal=0],
  ['missing Accuracy defaulted without rule binding',a=>{const f=a['hero-executable-field-matrix'].fields.find((f:any)=>f.sharedRuleInterpretation);delete f.sharedRuleInterpretation.sourceRef;}],
  ['Abomination forms flattened',a=>a['hero-profile-literals'].profiles.find((p:any)=>p.heroId==='abomination').forms.pop()],
  ['Arbalest source used for Musketeer',a=>skill(a,'musketeer-aimed-shot').sourceFront=skill(a,'arbalest-sniper-shot').sourceFront],
  ['PvP used as campaign authority',a=>a['hero-profile-literals'].profiles[0].forms[0].authority='HERO_PVP_CARD'],
  ['unusual glyph discarded',a=>a['hero-glyph-inventory'].glyphs.pop()],
  ['official conflict silently resolved',a=>a['hero-source-conflicts'].conflicts[0].resolutionStatus='RESOLVED'],
  ['state index Level authority',a=>a['hero-skill-literals'].stateIndexIsLevelAuthority=true],
  ['front-only review',a=>a['hero-skill-literals'].forms[0].visualReview.reviewedBack=false],
  ['source reference discarded',a=>a['hero-skill-literals'].forms[0].sourceFront=null],
  ['matrix row discarded',a=>a['hero-literal-closure-matrix'].rows.pop()],
  ['runtime promotion',a=>a['next-workstream-decision'].runtimeImplementationAuthorized=true],
  ['C2C prematurely authorized',a=>a['next-workstream-decision'].C2CAllowed=true],
 ];
 it.each(attacks)('rejects %s',(_name,mutate)=>{const copy=structuredClone(a);mutate(copy);expect(()=>validateC2BArtifacts(copy)).toThrow(/C2B:/);});
});
