/** Manual identity transcription after direct review of the hash-locked print atlases.
 * No numerical gameplay values. Array positions are print-page locators, not levels.
 */
export const printOrder = ['crusader','hellion','bounty-hunter','highwayman','vestal','jester','plague-doctor','arbalest','grave-robber','occultist','abomination','man-at-arms','flagellant','leper','antiquarian','shieldbreaker','hound-master','musketeer'];
export const reviewedSkills: Record<string,string[]> = {
  crusader:['Smite','Zealous Accusation','Stunning Blow','Bulwark of Faith','Battle Heal','Holy Lance','Inspiring Cry'],
  hellion:['Wicked Hack','Iron Swan','Barbaric YAWP!','If It Bleeds','Breakthrough','Adrenaline Rush','Bleed Out'],
  'bounty-hunter':['Collect Bounty','Mark for Death','Come Hither','Uppercut','Flashbang','Finish Him','Caltrops'],
  highwayman:['Wicked Slice','Pistol Shot','Point Blank Shot','Grapeshot Blast','Tracking Shot','Duelist’s Advance','Open Vein'],
  vestal:['Mace Bash','Judgement','Dazzling Light','Divine Grace','Divine Comfort','Illumination','Hand of Light'],
  jester:['Dirk Stab','Harvest','Finale','Solo','Battle Ballad','Inspiring Tune','Slice Off'],
  'plague-doctor':['Noxious Blast','Plague Grenade','Blinding Gas','Incision','Battlefield Medicine','Emboldening Vapours','Disorienting Blast'],
  arbalest:['Sniper Shot','Suppressive Fire','Sniper’s Mark','Bola','Blindfire','Battlefield Bandage','Rallying Flare'],
  'grave-robber':['Pick to the Face','Lunge','Flashing Daggers','Shadow Fade','Throw Dagger','Poison Dart','Toxin Trickery'],
  occultist:['Sacrificial Stab','Abyssal Artillery','Weakening Curse','Wyrd Reconstruction','Vulnerability Hex','Hands from the Abyss','Daemon’s Pull'],
  abomination:['Manacles','Beast’s Bile','Absolution','Transform to Beast','Rake','Rage','Slam'],
  'man-at-arms':['Crush','Rampart','Bellow','Defender','Retribution','Command','Bolster'],
  flagellant:['Punish','Rain of Sorrows','Exsanguinate','Reclaim','Redeem','Endure','Suffer'],
  leper:['Chop','Hew','Purge','Revenge','Withstand','Solemnity','Intimidate'],
  antiquarian:['Nervous Stab','Festering Vapours','Get Down!','Flashpowder','Fortifying Vapours','Invigorating Vapours','Protect Me'],
  shieldbreaker:['Pierce','Puncture','Adder’s Kiss','Impale','Expose','Captivate','Serpent Sway'],
  'hound-master':['Hound’s Rush','Hound’s Harry','Target Whistle','Cry Havoc','Guard Dog','Lick Wounds','Blackjack'],
  musketeer:['Aimed Shot','Smokescreen','Call the Shot','Buckshot','Sidearm','Patch Up','Skeet Shot'],
};
// Directly read from the transport crops, then correlated with official print names.
// This permutation is deliberately independent of card/deck ID and state index.
export const transportSkillOrder: Record<string,number[]> = {
  crusader:[3,2,4,5,6,1,0], hellion:[5,6,1,0,2,3,4], 'bounty-hunter':[4,0,3,6,1,2,5],
  highwayman:[1,0,2,3,4,5,6], vestal:[2,0,6,5,4,3,1], jester:[4,5,0,1,2,3,6],
  'plague-doctor':[2,4,3,5,1,6,0], arbalest:[5,6,0,1,2,3,4], 'grave-robber':[3,5,2,0,1,4,6],
  occultist:[6,5,0,4,1,2,3], abomination:[4,1,2,3,5,6,0], 'man-at-arms':[2,3,4,0,1,5,6],
  flagellant:[5,6,4,3,2,0,1], leper:[3,0,1,2,4,5,6], antiquarian:[5,0,3,6,1,2,4],
  shieldbreaker:[2,4,5,0,6,3,1], 'hound-master':[2,0,6,5,4,3,1], musketeer:[2,3,0,1,4,5,6],
};
export const printedHeroNames: Record<string,string> = Object.fromEntries(printOrder.map(h=>[h,
  h==='hound-master'?'HOUNDMASTER':h==='man-at-arms'?'MAN-AT-ARMS':h.replace(/-/g,' ').toUpperCase()]));
export const specialStructures = [
  {heroId:'abomination',observations:['Three Profile objects: I / II / III; Human front and Beast back at each level.','Human Form Only / Beast Form Only are printed Skill restrictions.','Transform to Beast front / Transform to Human back pair at each I / II / III; seven front identities include this paired transformation family.'],skillName:'Transform to Beast',futureFields:['form restriction','front/back action identity','form transition','all allies target']},
  {heroId:'flagellant',observations:['Punish and Rain of Sorrows show conditional clauses.','Reclaim shows a Self effect separately from a target effect.','Suffer says Transfer all with condition icons.'],skillName:'Suffer',futureFields:['conditional bonus','self effect','condition transfer']},
  {heroId:'shieldbreaker',observations:['Puncture changes the printed range between I and II.','Pierce / Puncture show different ignore icons.','Serpent Sway III has a different printed icon arrangement from I / II.'],skillName:'Puncture',futureFields:['per-Level field variation','ignore defense category','movement']},
];
