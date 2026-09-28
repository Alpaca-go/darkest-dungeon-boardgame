/** Authored observations from all 231 original two-sided crops. Not an OCR classifier.
 * Ranges below enumerate reviewed cells; no missing/unseen cell is inferred from its deck.
 * Printed names intentionally retain differences from the source container (The Collector,
 * The Flesh / Flesh Head, Thing from the Stars). Tokens describe glyphs, not engine effects. */
export interface Observation {
  cardId: number; name: string; level: string | null; levelSide: 'front' | 'back' | 'ABSENT';
  subtype: 'BATTLE' | 'THREAT' | 'ABILITY' | 'BOSS_IDENTITY'; role: string;
  marker: string; backName: string; variant: string | null; frontFull?: string; backFull?: string;
  sameNameLevelCandidateIds?: number[];
  observedHeaderGlyph?: 'WHITE_CIRCULAR_MARK' | 'BLACK_CIRCULAR_MARK';
}
export const observations: Observation[] = [];
const levels = ['I', 'II', 'III'];
function add(ids: number[], name: string, subtype: Observation['subtype'], role: string, marker: string,
  backName = 'BOSS', printedLevels: Array<string | null> = levels, variant: string | null = null) {
  ids.forEach((cardId, i) => observations.push({cardId, name, subtype, role, marker, backName,
    level: printedLevels[i] ?? null, levelSide: printedLevels[i] ? 'front' : 'ABSENT', variant}));
}
const tri = (start: number) => [start, start + 1, start + 2];
// Reviewed identity + reversible Battle-ability / two-passive-Threat component blocks.
const blocks: Array<[number, string, number, string]> = [
  [42000, 'Necromancer', 1, 'Summoning'], [42006, 'Prophet', 3, 'Calamitous Prognostication; Rubble of Ruin'],
  [42012, 'Collector', 1, 'Collect All'], [42018, 'Fanatic', 3, 'Sentence Rendered'],
  [42100, 'Shambler', 1, 'Absolute Darkness; Summon'], [42106, 'Siren', 2, 'Song of Desire'], [42112, 'Drowned Crew', 2, 'All Hands On Deck'],
  [42200, 'Viscount', 3, 'The Feast'], [42206, 'Countess', 3, 'Parasite Egg'],
  [42212, 'Garden Guardian', 2, 'One Body'], [42224, 'Baron', 0, 'Pulsating Eggs'],
  [42300, 'Brigand Vvulf', 2, "Time's Up"], [42306, 'Swine Prince', 2, 'Enraged Destruction'],
  [42312, 'The Flesh', 4, 'One Body'], [42400, 'Shrieker', 3, "Shrieker's Nest; Call the Murder"],
  [42406, 'Brigand Pounder', 1, 'Reinforcements'], [42412, 'Hag', 2, 'Into the Pot!'],
];
for (const [start, name, actions, marker] of blocks) {
  add(tri(start), name, 'BOSS_IDENTITY', 'BOSS_SUBJECT_IDENTITY', 'Named flavor text; reverse printed BOSS and same Roman level');
  add(tri(start + 3), name, 'THREAT', 'REVERSIBLE_THREAT_AND_BATTLE_ABILITY',
    `ACTIONS / Round: ${actions || 'Special'}; ${marker}; reverse has two separately oriented passive rules`, 'TWO_PASSIVE_THREATS');
}
// Both Threat titles are literal, including printed level suffixes where present.
const threatTitles: Array<[number, string[], string[]]> = [
  [42003,['This is Unholy!','Army of the Dead','Reanimation'],['Unsettling Silhouettes','Haunted Graveyard','The Restless Dead']],
  [42009,['Visions of a Torturous End','Convoluted Farsight','Fear of the Beyond'],['Visions of Past Deeds','Visions of a Bleak Future','Visions of Doom']],
  [42015,['Taken Away','Already Collected','Missing Supplies'],['Missing Artefacts','Lust for Gold','Shinies!']],
  [42021,['Marked for Death',"Heretic's Mark","Fanatic's Mark"],['The Black Sheep','Sinful Acts','Lynch Mob']],
  [42103,['Thick Darkness','Thick Darkness','Thick Darkness'],['Unfortunate Events','Dreamlight','Dark Sun']],
  [42109,['Songs in the Dark I','Songs in the Dark II','Songs in the Dark III'],['Luring Tunes I','Luring Tunes II','Luring Tunes III']],
  [42115,['Merry Shanties','Haunted Shanties','Eldritch Shanties'],['Repay','Repay More','Repay All']],
  [42203,['Bulimic Snack','Bulimic Lunch','Bulimic Feast'],['One Round on Me!','Two Rounds on Me!','All Rounds on Me!']],
  [42209,['Blood Curse I','Blood Curse II','Blood Curse III'],['Parasite Infection','Parasite Spread','Parasite Spread']],
  [42215,['What Was That... ?','Is It Alive... ?','It Is Alive!'],['Walls Have Many Eyes','Walls Have Many Eyes','Faces on the Wall']],
  [42227,['Demise of the Fittest I','Demise of the Fittest II','Demise of the Fittest III'],['Carnal Pleasures I','Carnal Pleasures II','Carnal Pleasures III']],
  [42303,['Brigand Ambush','Brigand Assault','Brigand Onslaught'],['Stolen Material I','Stolen Material II','Stolen Material III']],
  [42309,['Bestial Rage','Bestial Bloodlust','Bestial Frenzy'],['Uneasy Times I','Uneasy Times II','Uneasy Times III']],
  [42315,['Big Troubles','Bigger Troubles','Huge Troubles'],['Creeping Sickness I','Creeping Sickness II','Creeping Sickness III']],
  [42403,['Where Did It Go? I','Where Did It Go? II','Where Did It Go? III'],['Murder of Magpies I','Murder of Magpies II','Murder of Magpies III']],
  [42409,['Bullseye Guillotine I','Bullseye Guillotine II','Bullseye Guillotine III'],['Bombardment I','Bombardment II','Bombardment III']],
  [42415,['Painfully Soothing I','Painfully Soothing II','Painfully Soothing III'],['No Rest for the Wicked I','No Rest for the Wicked II','No Rest for the Wicked III']],
];
for (const [start, top, bottom] of threatTitles) tri(start).forEach((id,i) => {
  observations.find(o => o.cardId === id)!.backName = top[i]+'\n[LOWER_HALF_ROTATED_180]\n'+bottom[i];
});
add([41900], 'The Miller', 'BOSS_IDENTITY', 'BOSS_SUBJECT_IDENTITY', 'Named flavor text; reverse BOSS', 'BOSS', [null]);
add([41902], 'Thing from the Stars', 'BOSS_IDENTITY', 'BOSS_SUBJECT_IDENTITY', 'Named flavor text; reverse BOSS', 'BOSS', [null]);
add([41904], 'The Sleeper', 'BOSS_IDENTITY', 'BOSS_SUBJECT_IDENTITY', 'Named flavor text; reverse BOSS', 'BOSS', [null]);
for (const [id, name, actions, marker] of [[41901, 'The Miller', 2, 'The Master Beckons'], [41903, 'Thing from the Stars', 2, 'Return to the Stars'], [41905, 'The Sleeper', 2, 'Seeds of Despair']] as const)
  add([id], name, 'ABILITY', 'BOSS_BATTLE_ABILITY', `ACTIONS / Round: ${actions}; ${marker}`, 'BOSS Ability', [null]);
add(tri(42218), 'Blood Fount', 'ABILITY', 'ATTACHED_MECHANISM', 'ACTIONS / Round: 1; Spearheading', 'BOSS Ability');
add(tri(42221), 'Stone Shield', 'ABILITY', 'ATTACHED_MECHANISM', 'ACTIONS / Round: 1; Shield of Protection', 'BOSS Ability');
add(tri(42418), 'Cauldron', 'ABILITY', 'ATTACHED_MECHANISM', "ACTIONS / Round: 1; Something's Cooking", 'BOSS Ability');
// Every listed combat-stat cell was inspected front and back, including auxiliary components.
const battles: Array<[number, string, string, string]> = [
  [46037, 'Necromancer', 'BOSS_SUBJECT_BATTLE', 'The Flesh is Willing; The Crawling Dead; Six Feet Under'],
  [46040, 'The Collector', 'BOSS_SUBJECT_BATTLE', 'Show Collection; Life Steal'],
  [46043, 'Collected Highwayman', 'SUMMONED_COMPONENT', 'Headhunt'],
  [46046, 'Collected Man-at-Arms', 'SUMMONED_COMPONENT', 'Head Knocker'],
  [46049, 'Collected Vestal', 'SUMMONED_COMPONENT', 'Headache'],
  [46604, 'Prophet', 'BOSS_SUBJECT_BATTLE', 'Eye on You; Fulminate; Rubble of Ruin'],
  [46607, 'Fanatic', 'BOSS_SUBJECT_BATTLE', 'Righteous Condemnation; Strike the Heretic; Fury of the Righteous'],
  [46610, 'Pyre', 'ATTACHED_MECHANISM', 'Burn the Heretic'],
  [43727, 'Shambler', 'BOSS_SUBJECT_BATTLE', 'Obdurous Advancement; Undulating Withdrawal; Stentorious Lament'],
  [43730, 'Siren', 'BOSS_SUBJECT_BATTLE', 'Pressure Crash; Devour'],
  [43733, 'Drowned Crew', 'BOSS_SUBJECT_BATTLE', 'Mutiny; Drink with the Dead; Boarding Clutch'],
  [44028, 'Drowned Anchorman', 'ATTACHED_MECHANISM', 'Heave To!'],
  [44122, 'Viscount', 'BOSS_SUBJECT_BATTLE', 'Hungry Eyes; Riposte Attack; Refined Pairing'],
  [44125, 'Emaciated Body', 'FEEDING_FORM_COMPONENT', 'Resistances; Immunities; numeric Life; stance row'],
  [44128, 'Body', 'FEEDING_FORM_COMPONENT', 'Resistances; Immunities; numeric Life; stance row'],
  [44131, 'Bloodstuffed Body', 'FEEDING_FORM_COMPONENT', 'Resistances; Immunities; numeric Life; stance row'],
  [44134, 'Blood Fount', 'ATTACHED_MECHANISM', 'Feed the Soil'],
  [44137, 'Stone Shield', 'ATTACHED_MECHANISM', 'Plummeting Doom'],
  [44140, 'Baron', 'BOSS_SUBJECT_BATTLE', 'Crowd Pleaser; Necessary Discipline; The Thirst'],
  [45701, 'Countess', 'BOSS_SUBJECT_BATTLE', 'Disrobe; Sway with Me; Love Letter'],
  [45704, 'Garden Guardian', 'BOSS_SUBJECT_BATTLE', 'Battered beyond Time; Annihilating Glare'],
  [46701, 'Brigand Vvulf', 'BOSS_SUBJECT_BATTLE', 'Get Them!; Tower Shield; Warcry'],
  [46704, 'Swine Prince', 'BOSS_SUBJECT_BATTLE', 'Obliterate Body; Obliterate Masses; Wild Flailing'],
  [44219, 'Wilbur', 'ATTACHED_MECHANISM', 'End This One; End These Two'],
  [44222, 'Flesh Head', 'SHARED_BODY_PART', 'Maws of Life'],
  [44225, 'Flesh Bone', 'SHARED_BODY_PART', 'Bone Zephyr'],
  [44228, 'Flesh Heart', 'SHARED_BODY_PART', 'Sanguine Stroke'],
  [44231, 'Flesh Butt', 'SHARED_BODY_PART', 'Undulating Invasion'],
  [44319, 'Brigand Pounder', 'BOSS_SUBJECT_BATTLE', 'BOOOOOOM!'],
  [44322, 'Brigand Matchman', 'SUMMONED_COMPONENT', 'Fire in the Hole!'],
];
for (const [start, name, role, marker] of battles) add(tri(start), name, 'BATTLE', role, marker);
add([44022, 44023, 44024, 44025, 44026, 44027], 'Shambler Tentacle', 'BATTLE', 'SUMMONED_COMPONENT', 'Clapperclaw', 'BOSS', ['I', 'I', 'II', 'II', 'III', 'III']);
add([43121, 43122], 'Frozen Farmhand', 'BATTLE', 'TRANSFORMING_SUMMON', 'Hollow Keening; The Soil Thaws; transform to Farmhand II', 'BOSS', ['I', 'I']);
// Original-resolution comparison: paired names/levels have DIFFERENT white/black
// circular header marks. Preserve this printed difference; neither equivalent
// semantics nor duplicate policy follows from matching artwork/skill values.
for (const group of [[43121,43122],[44022,44023],[44024,44025],[44026,44027]])
  for (const [i, id] of group.entries()) {
    const o = observations.find(o => o.cardId === id)!;
    o.sameNameLevelCandidateIds = group;
    o.observedHeaderGlyph = i === 0 ? 'WHITE_CIRCULAR_MARK' : 'BLACK_CIRCULAR_MARK';
  }
add([43123], 'Focus Point/Aberration', 'BATTLE', 'MULTIFORM_MECHANISM', 'Grey Aberration; Purple Aberration; Red Aberration; Green Aberration', 'BOSS', ['I']);
for (const id of [43121, 43122, 43123]) observations.find(o => o.cardId === id)!.levelSide = 'back';
add([43702], 'The Miller', 'BATTLE', 'BOSS_SUBJECT_BATTLE', 'The Reaping; The Harvest', 'BOSS', ['I']);
add([43703], 'Thing from the Stars', 'BATTLE', 'BOSS_SUBJECT_BATTLE', 'Vorpal Strike; Weakening Shard; Return to the Stars', 'BOSS', ['I']);
add([43704], 'The Sleeper', 'BATTLE', 'BOSS_SUBJECT_BATTLE', 'The Sleeper Awakens; The Sleeper Stirs; Show the Sands', 'BOSS', ['I']);
for (const id of [43702, 43703, 43704]) observations.find(o => o.cardId === id)!.levelSide = 'back';
for (const [hag, cauldron, shrieker, nest, level] of [[54209,54212,48003,48006,'I'], [47310,47313,47904,47907,'II'], [47611,47614,48105,48108,'III']] as const) {
  add([hag], 'Hag', 'BATTLE', 'BOSS_SUBJECT_BATTLE', 'Into the Pot; Meat Tenderizer; Season to Perfection', 'BOSS', [level]);
  add([cauldron], 'Cauldron Empty', 'BATTLE', 'PAIRED_EMPTY_FULL_STATE', 'Reverse Cauldron Full; Boil', 'Cauldron Full', [level], 'Empty / Full');
  add([shrieker], 'Shrieker', 'BATTLE', 'BOSS_SUBJECT_BATTLE', 'Peck; Call the Murder; Regurgitate', 'BOSS', [level]);
  add([nest], "Shrieker's Nest", 'BATTLE', 'ATTACHED_MECHANISM', 'Resistances; Immunities; numeric Life; stance row', 'BOSS', [level]);
}
const full = (id: number, front: string, back?: string) => {
  const o = observations.find(o => o.cardId === id)!;
  o.frontFull = `${o.name}${o.level ? '\n[LEVEL:' + o.level + ']' : ''}\n${front}`;
  o.backFull = back ?? `${o.backName}${o.level ? '\n[LEVEL:' + o.level + ']' : ''}`;
};
full(42000, 'Mastery over life and death was chief among my early pursuits. I began in humility, but my ambition was limitless. Who could have divined the prophetic import of something as unremarkable as a twitch in the leg of dead rat?');
full(42001, 'I entertained a delegation of experts from overseas, eager to plumb the depths of their knowledge and share with them certain techniques and alchemical processes I had found to yield wondrous and terrifying results. Having learned all I could from my visiting guests, I murdered them as they slept.');
full(42002, 'I brought my colleagues back with much of their intellect intact, a remarkable triumph for even the most experienced necromancer. Freed from the trappings of their humanity, they plied their terrible trade anew - the dead reviving the dead, on and on down the years... forever.');
const summon = 'ACTIONS / Round: 1\nSummoning [SKULL_RED_DOWN_ARROW]: When a Monster is [SKULL_RED_DOWN_ARROW], the Monster miniature is placed on the Target Area, and a new Monster Initiative Card is shuffled into the Initiative Deck. If all Stances are occupied, the Summoning does not take effect.';
const necroThreats = [
  '[LEVEL:I]\n[GREEN_DUNGEON_ARCH]\nThis is Unholy!\nAfter Battles, remove any non-unholy Monsters permanently from the game.\n[LOWER_HALF_ROTATED_180]\nUnsettling Silhouettes\nGraveyard is blocked.',
  "[LEVEL:II]\n[GREEN_DUNGEON_ARCH]\nArmy of the Dead\nAt the start of the first Battle in this Dungeon, spawn a Bone Captain as the first Monster.\n[LOWER_HALF_ROTATED_180]\nHaunted Graveyard\nOn the first preparation day, Heroes roll a [D10]. The Hero with the lowest roll is forced to spend the first day visiting the Graveyard for guard duty. They can use the Graveyard's effect as normal.",
  "[LEVEL:III]\n[GREEN_DUNGEON_ARCH]\nReanimation\nImmediately respawn the first non-large Monster that dies in each Battle. Place it in the corresponding Area on the board. If there is no space available, ignore this effect.\n[LOWER_HALF_ROTATED_180]\nThe Restless Dead\nOn the first preparation day, Heroes roll a [D10]. The Hero with the lowest roll is forced to spend the first day visiting the Graveyard for guard duty. They can't use the Graveyard's effect though.",
];
tri(42003).forEach((id, i) => full(id, summon, necroThreats[i]));
// No engine names for these glyphs. Location/count/colour are literal observations.
for (const [id, speed, life, acc, critDamage1, damage1, critDamage2, damage2, monster] of [
  [46037,0,77,10,9,6,7,5,'Bone Rabble'], [46038,1,103,11,12,8,9,6,'Bone Soldier'], [46039,3,144,12,16,10,11,8,'Bone Spearman'],
] as const) full(id, `Eldritch - Unholy - Front\n[GRAY_RUINS_ARCH_BANNER]\n[YELLOW_SPEED_FOOTPRINT:${speed}]\n[BLUE_DODGE_SQUARES:3]\n[ORANGE_HEART:${life}]\nResistances: [YELLOW_ORANGE_DOWN_DOUBLE_CHEVRON] [BLUE_LEFT_DOUBLE_CHEVRON]\nImmunities: [THREE_YELLOW_DIAMONDS]\n1 The Flesh is Willing\nCrowded [GRAY_RANGE_ARROW:1] [YELLOW_HELMETS:2]\nCrit 1 [RED_DAMAGE_BOLT:${critDamage1}] Acc ${acc} [RED_DAMAGE_BOLT:${damage1}]\n[GRAY_SELF_ARROW] Self [BLUE_LEFT_DOUBLE_CHEVRON] Push 1\n[GRAY_TARGET_ARROW] [SKULL_RED_DOWN_ARROW] ${monster}\n2 The Crawling Dead\nCrowded [GRAY_RANGE_ARROW:2] [YELLOW_HELMETS:2]\nCrit 1 [RED_DAMAGE_BOLT:${critDamage2}] Acc ${acc} [RED_DAMAGE_BOLT:${damage2}]\n[GRAY_SELF_ARROW] Self [BLUE_LEFT_DOUBLE_CHEVRON] Push 1\n[GRAY_TARGET_ARROW] [SKULL_RED_DOWN_ARROW] ${monster}\n3 Six Feet Under\nCrowded [GRAY_RANGE_ARROW:2] [YELLOW_HELMETS:4]\nAcc ${acc}\n[GRAY_SELF_ARROW] Self [BLUE_LEFT_DOUBLE_CHEVRON] Push 1\n[GRAY_TARGET_ARROW] [SKULL_RED_DOWN_ARROW] ${monster}\n[BLACK_STRESS_SQUARE]+2\n[STANCE_AGGRESSIVE:DIE] [STANCE_DEFENSIVE:DIE] [STANCE_RANGED:DIE] [STANCE_SUPPORT:DIE]\n[SUPPORT_SKILL_TABLE] 1:1-3; 2:4-6; 3:7-10`);
const prophetAbility = 'ACTIONS / Round: 3\nCalamitous Prognostication: On his first turn each round, instead of using a Skill, the Prophet rolls 4 [D10] and places the 4 Wooden Pews in the corresponding Areas on the board.\nRubble of Ruin: On his third turn each round, the Prophet uses his Rubble of Ruin Skill, targeting all Areas with Wooden Pews. Roll an attack for each pew separately.';
full(42006, 'Excavations beneath the Manor were well underway, when a particularly ragged indigent arrived in the Hamlet. This filthy, toothless degenerate boasted an uncanny knowledge of my ambitions, and prognosticated to all who would listen that I would soon unleash doom upon the world.');
full(42007, 'This raving creature had to be silenced, but, to my bafflement, doing so proved maddeningly impossible. How had he survived the stockades, the icy waters, and the knives I delivered so enthusiastically into his back? How had he returned time and time again to rouse the townsfolk with his wild speculations and prophecies?');
full(42008, 'Finally, resigned to his uncommon corporeal resilience, I lured him to the dig. There, I showed him the Thing, and detailed the full extent of my plans. Triumphantly, I watched as he tore his eyes from their sockets, and ran shrieking into the shadows - wailing maniacally that the end was upon us all.');
const prophetThreats = [
  'Visions of a Torturous End\nWhen entering the Dungeon, each Hero suffers [BLACK_STRESS_SQUARE]+2.\n[LOWER_HALF_ROTATED_180]\nVisions of Past Deeds\nThe Tavern recovers [BLACK_STRESS_SQUARE]-1.',
  'Convoluted Farsight\nWhen scouting, Heroes suffer [BLACK_STRESS_SQUARE]+1.\n[LOWER_HALF_ROTATED_180]\nVisions of a Bleak Future\nThe Tavern recovers [BLACK_STRESS_SQUARE]-2.',
  'Fear of the Beyond\nWhenever an unholy Monster is spawned in Battle, each Hero suffers [BLACK_STRESS_SQUARE]+1.\n[LOWER_HALF_ROTATED_180]\nVisions of Doom\nThe Tavern recovers [BLACK_STRESS_SQUARE]-3.',
];
tri(42009).forEach((id, i) => full(id, prophetAbility, `[LEVEL:${levels[i]}]\n[GREEN_DUNGEON_ARCH]\n${prophetThreats[i]}`));
full(42012, 'Our lives used to be much simpler, if only they had remained that way. People began to go missing, vanishing from the woods and taken away from their homes. Only to be found days later thrown into the wilderness, with their tongues and eyes ripped out of their sockets and their organs missing too. They named this beast "The Collector". They knew it resided deep in the estate\'s ruins but none dared to go there and put an end to this. So it falls upon you to brave the ruins\' horrors and put an end to this rising menace.');
full(42013, 'But no evil remains dormant forever, for after a couple of moons the Collector made its appearance. An elusive apparition that manifested only in front of a selected few, leaving behind the empty shell of its victims. Toothless husks with their tongues and eyes ripped from their sockets, others with heads missing, or with their hearts ripped out. Beware, for this vile ghost has rightfully earned its name!');
full(42014, 'And all this evil manifested into the malevolent entity known as the Collector. Ambushing the clueless and the innocent, it collected body parts from its victims, diligently creating its own "folk". Are you prepared to face an army? For deep in the ruins they\'re waiting for you. Venture forth and follow the Collector\'s dark trail and bring an end to this once and for all!');
const collect = 'ACTIONS / Round: 1\nCollect All: At the start of his turn, if there are no Collected in play, the Collector, instead of using a Skill, will summon a Collected Man-At-Arms in [STANCE_DEFENSIVE], a Collected Highwayman in [STANCE_RANGED], and a Collected Vestal in [STANCE_SUPPORT]. Place their miniatures in the corresponding Areas on the board. If there is no space for a Collected, place them in the closest Area with enough space.';
const collectorThreats = [
  'Taken Away\nDon\'t draw Curio cards in Curio Rooms.\n[LOWER_HALF_ROTATED_180]\nMissing Artefacts\nThe Nomad Wagon is blocked.',
  "Already Collected\nWhen a Curio awards Gold and/or Trinket, roll a [D10]. On a roll of 1-5, the Gold and Trinket has already been collected by the Collector (Heroes don't gain it).\n[LOWER_HALF_ROTATED_180]\nLust for Gold\nAt the end of each day, roll a [D10]. If the roll matches a Building with a Hero in it, the Caretaker will steal 1 [D10] Gold from the party.",
  "Missing Supplies\nCamping always gives 4 Rest Points.\n[LOWER_HALF_ROTATED_180]\nShinies!\nAt the end of each day, roll a [D10]. If the roll matches a Building with a Hero in it, the Caretaker will steal a Trinket from the Hero (player's choice).",
];
tri(42015).forEach((id, i) => full(id, collect, `[LEVEL:${levels[i]}]\n[GREEN_DUNGEON_ARCH]\n${collectorThreats[i]}`));
const fanaticFlavor = "Madness can take many forms, but none so contemptible as man's belief in a mythology of his own making. A world view buttressed by dogmatic desperation invariably leads to single-minded fanaticism, and a need to do terrible things in the name of righteousness. This man is an animal - rabid, destructive, and incapable of nuanced understanding. He must be put down.";
tri(42018).forEach(id => full(id, fanaticFlavor));
full(41900, "Pity the poor Miller. Humble in life, and brought even lower by the comet's fall. He is an echo of a man - trapped in time, and suffering for the absence of his departed wife. End what remains of his life, and rest easy in the knowledge that his murder would be a kindness.");
full(41902, 'Of all the hideous and contemptible forms life can take, there is none more grotesque than this lumbering assemblage of carcass and corpse. Animated by an alien will, its tenuous, haphazard form is in a near-constant state of organic dissolution. This necrotic abomination cannot be allowed to wander the earth unopposed - destroy it!');
full(41904, 'It lurked for untold eons at the edge of space, gazing covetously at our fragile earth. Called forth from the infinite gulfs of the void, it promises to unleash incalculable profanity on our unsuspecting planet, should it ever escape the temporal vacuum created upon its arrival. Strike it down again and again, but know that while it may sleep, it will never die.');
full(41903, 'ACTIONS / Round: 2\nReturn to the Stars: Before its first action of each round, the Star Thing will use the [SKILL_NUMBER:3] Return to the Stars skill as a free action. Among its effects, this skill will summon as many monsters as possible if the Monster Posture track is not full, including at least one Crystalline Aberration I.');
full(41905, 'ACTIONS / Round: 2\nSeeds of Despair: When the Focus Point/Aberrations\' turn comes, roll 3 [D10] and place Focus Point tokens on the corresponding Areas on the board. If there is already one there, do not place one, instead Flip the Focus Point onto its Aberration side. If there is an Aberration when the existing Focus Point is about to spawn, do not spawn it, just activate the Aberration instead. Each Aberration has different effects depending on its color.');
const shriekerFlavor = "Hold fast your trinkets and baubles, your glittering treasures, your sacred heirlooms - the Shrieker's rapacious talons will not be denied. Rancid and contemptible, this opportunistic corvid swoops from its perch high above the Weald, claiming whatever catches its covetous eye. The Shrieker's nest is a rancorous tangle of corpses and collected valuables, making it a veritable treasure trove for those with a stomach for risk. As much as the thing delights in hoarding its ill-gotten gains, it will flee its nest if its life is threatened. We need not kill it, merely scare it away, and reclaim what is ours.";
tri(42400).forEach(id => full(id, shriekerFlavor));
full(42406, 'Simple folk are by their nature loquacious, and the denizens of the Hamlet were no exception. It was not long before rumours of my morbid genius and secretive excavations began to fuel local legend. In the face of my increasingly egregious flaunting of public taboos, awe turned to ire, and demonstrations were held in the town square.');
full(42407, 'The wild whispers of heresy roused the rabble to violent action. Such was the general air of rebellion that even my generous offer of gold to the local constabulary was rebuffed! To reassert my rule, I sought out unscrupulous men skilled in the application of force. Tight-lipped and terrifying, these mercenaries brought with them a war machine of terrible implication.');
full(42408, 'Eager to end the tiresome domestic distraction, I instructed my newly formed militia of hardened bandits, brigands and killers to go forth and do their work. Compliance and order were restored, and the noisome population of the Hamlet was culled to more... manageable numbers.');
full(42412, 'I had collected many rare and elusive volumes on ancient herbal properties, and was set to enjoy several weeks immersed in comfortable study. My work was interrupted, however, by a singularly striking young woman who insisted on repeated calls to the house.');
full(42413, 'Her knowledge of horticulturalism, and its role in various arcane practices impressed me greatly. My licentious impulse gave way to a genuine, professional respect, and together, we began to plant, harvest, and brew.');
full(42414, 'As time wore on, her wild policy of self-experimentation grew intolerable. She quaffed all manner of strange fungi, herbs and concoctions, intent on gaining some insight into the horror we both knew to be growing beneath us. The change in her was appalling, and, no longer able to stomach it, I sent her to live in the Weald, where her wildness would be welcomed.');
tri(42418).forEach(id => full(id, "ACTIONS / Round: 1\nSomething's Cooking: The Cauldron starts Empty side up. When a Hero is in the Cauldron, flip it to its Full side and remove all Wounds from it. A Hero that is in the Cauldron cannot move or be [BLUE_LEFT_DOUBLE_CHEVRON]. When the Cauldron suffers wounds equal to its Life or the Hero in it reaches Death's Door, place that Hero in an adjacent Area and flip the Cauldron to its Empty side, removing all Wounds from it."));
tri(42218).forEach(id => full(id, "ACTIONS / Round: 1\nSpearheading: When the Blood Fount enters the Garden Guardian's Area, the Garden Guardian gains [BLUE_UP_CHEVRON_LEFT]2t, [BLUE_UP_CHEVRON_RIGHT]2t."));
tri(42221).forEach(id => full(id, 'ACTIONS / Round: 1\nShield of Protection: When the Stone Shield enters the same Area as the Garden Guardian, Garden Guardian gains [GRAY_TUNIC]2t.'));
const shamblerAbility = 'ACTIONS / Round: 1\nAbsolute Darkness: At the start of battle, [FLAME_LIGHT] drops to 0.\nSummon [SKULL_RED_DOWN_ARROW]: The Shambler [SKULL_RED_DOWN_ARROW] up to 2 Shambler Tentacles.';
const shamblerLower = [
  'At the start of the week, draw 2 Hamlet Event Cards. Win the lowest number of days and use the effect of the other card. If both have the same number, choose which effect to apply.',
  'Ignore the effects of the events that give 1 or 2 preparation days.',
  'The party has -1 preparation day (min. 1).',
];
// Level I lower rule prints "Win the lowest number of days". Preserve source wording.
tri(42103).forEach((id,i) => full(id, shamblerAbility,
  `[LEVEL:${levels[i]}]\n[GREEN_DUNGEON_ARCH]\nThick Darkness\nWhen entering the Dungeon, drop the [FLAME_LIGHT] by ${i+1}.\n[LOWER_HALF_ROTATED_180]\n${['Unfortunate Events','Dreamlight','Dark Sun'][i]}\n${shamblerLower[i]}`));
tri(42309).forEach((id,i) => full(id,
  `ACTIONS / Round: 2\nEnraged Destruction: When Wilbur takes [RED_DAMAGE_BOLT], Swine Prince will retaliate, dealing [RED_DAMAGE_BOLT:${[6,12,18][i]}] to all Heroes.`,
  `[LEVEL:${levels[i]}]\n[GREEN_DUNGEON_ARCH]\n${['Bestial Rage','Bestial Bloodlust','Bestial Frenzy'][i]}\nBeasts deal [RED_DAMAGE_BOLT:+${[2,4,6][i]}].\n[LOWER_HALF_ROTATED_180]\nUneasy Times ${levels[i]}\n${i===0 ? 'The Survivalist is blocked.' : 'The Survivalist provides -'+i+' [FOOD_PROVISION_DIE_FACE].'}`));
const viscountFlavor = 'The feasting and revelry would last for weeks at a time. Great stone tables were set with such an abundance of rare delicacies that we would stuff ourselves until the exotic became mundane. When the lavish spread began to spoil, a ravenous gourmand gleefully proposed that we sample from the fetid pile of composting refuse! The notion was dismissed as decidedly unhealthy, but days later he was found cackling madly atop a heap of rancid comestibles, licking his fingers in delight.';
tri(42200).forEach(id => full(id, viscountFlavor));
export const transcriptionPolicy = 'Independent visual crop reading; line wraps joined and typographic apostrophes normalized. Bracket tokens preserve functional glyph colour/count/position, without guessing engine meaning. Decorative artwork lettering is excluded. OCR drafts remain unreviewed aids and never confer literalComplete. Full means BOTH sides including functional numerals/icons; partial records contain only reviewed header/structural text.';
