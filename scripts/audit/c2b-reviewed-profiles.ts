/** Visually read official Profile faces, independently at all three Roman markers.
 * Columns: Life, Dodge, number of movement boot icons, resistance glyphs,
 * immunity glyphs. No campaign PvP or prototype values are used.
 */
export const profileReviews: Record<string,string[]> = {
 crusader:['17;0;1;stun;','24;1;1;stun shuffle;','32;2;1;stun debuff;shuffle'],
 hellion:['14;1;2;bleed;','18;2;2;bleed blight;','24;3;2;stun bleed blight;'],
 'bounty-hunter':['14;1;2;stun;','18;2;2;stun debuff;','23;3;2;stun debuff bleed;'],
 highwayman:['12;1;2;stun;','17;2;2;stun bleed;','22;3;3;stun bleed blight;'],
 vestal:['12;0;1;bleed;','17;1;1;stun bleed;','22;2;2;stun bleed;disease'],
 jester:['10;2;3;debuff;','14;3;3;debuff bleed;','18;4;3;debuff bleed blight;'],
 'plague-doctor':['11;0;3;blight;','15;1;3;blight;disease','19;2;3;;blight disease'],
 arbalest:['14;0;1;shuffle;','19;1;1;stun shuffle;','24;2;2;stun;shuffle'],
 'grave-robber':['11;1;3;blight;','15;2;3;blight debuff;','19;3;3;bleed blight debuff;'],
 occultist:['10;1;2;debuff;','14;2;2;bleed debuff;','18;3;3;bleed blight debuff;'],
 abomination:['13;1;2;blight;','18;2;3;stun blight;','23;3;3;stun;blight'],
 'man-at-arms':['16;1;1;shuffle;','22;2;1;shuffle bleed;','28;3;1;stun shuffle bleed;'],
 flagellant:['12;2;2;bleed;','16;3;2;shuffle bleed;','22;3;3;stun shuffle bleed;'],
 leper:['18;0;1;debuff;','25;1;1;shuffle debuff;','33;2;1;stun shuffle debuff;'],
 antiquarian:['9;1;2;shuffle;','12;2;2;stun shuffle;','15;3;2;stun;shuffle disease'],
 shieldbreaker:['11;1;3;stun;','15;2;3;stun shuffle;','19;3;3;stun;shuffle'],
 'hound-master':['11;1;2;stun;','15;2;2;stun bleed;','19;3;2;stun bleed blight;'],
 musketeer:['14;0;1;shuffle;','19;1;1;stun shuffle;','24;2;2;stun;shuffle'],
};
// Beast faces were inspected separately, despite their equal printed stats.
export const abominationBeastReviews=['13;1;2;blight;','18;2;3;stun blight;','23;3;3;stun;blight'];
export const hamletReviews: Record<string,string[]> = {
 crusader:[
 'Hamlet Skill: Zealous Speech (Only as the first action of a day) (Day ends immediately): [hero-target][hero-target][hero-target][hero-target] -5 [stress].',
 'Hamlet Skill: Zealous Speech (Only as the first action of a day) (Day ends immediately): [hero-target][hero-target][hero-target][hero-target] -5 [stress].',
 'Hamlet Skill: Zealous Speech (Only as the first action of a day) (Day ends immediately): [hero-target][hero-target][hero-target][hero-target] -5 [stress].'],
 hellion:[
 'Hamlet Skill: Sharpen Spear Self [buff]5t. or Intimidate Remove the Caretaker from play.',
 'Hamlet Skill: Sharpen Spear Self [buff]5t. or Intimidate Remove the Caretaker from play.',
 'Hamlet Skill: Sharpen Spear Self [buff]5t. or Intimidate Remove the Caretaker from play.'],
 'bounty-hunter':[
 'Hamlet Skill: Scout Ahead Self [stress]+1, reveal a Room in the next Dungeon.',
 'Hamlet Skill: Scout Ahead Self [stress]+1, reveal a Room in the next Dungeon.',
 'Hamlet Skill: Scout Ahead Self [stress]+1, reveal a Room in the next Dungeon.'],
 highwayman:['Hamlet Skill: Clean Guns Self [buff]6t.','Hamlet Skill: Clean Guns Self [buff]6t.','Hamlet Skill: Clean Guns Self [buff]6t.'],
 vestal:[
 'Hamlet Skill: Pray Self [stress]-9, [debuff]6t. or Chant [hero-target][hero-target][hero-target][hero-target]: [stress]-1, [buff]3t.',
 'Hamlet Skill: Pray Self [stress]-9, [debuff]6t. or Chant [hero-target][hero-target][hero-target][hero-target]: [stress]-1, [buff]3t.',
 'Hamlet Skill: Pray Self [stress]-9, [debuff]6t. or Chant [hero-target][hero-target][hero-target][hero-target]: [stress]-1, [buff]3t.'],
 jester:[
 'Hamlet Skill: Every Rose Has Its Thorn [hero-target]: [stress]-2 per [affliction-card] and [disease].',
 'Hamlet Skill: Every Rose Has Its Thorn [hero-target]: [stress]-2 per [affliction-card] and [disease].',
 'Hamlet Skill: Every Rose Has Its Thorn [hero-target]: [stress]-2 per [affliction-card] and [disease].'],
 'plague-doctor':[
 'Hamlet Skill: Experimental Vapours [hero-target]: [heal]4, Remove [disease], [stress]+3.',
 'Hamlet Skill: Experimental Vapours [hero-target]: [heal]7, Remove [disease], [stress]+3.',
 'Hamlet Skill: Experimental Vapours [hero-target]: [heal]9, Remove [disease], [stress]+3.'],
 arbalest:[
 'Hamlet Skill: Field Dressing Choose [hero-target] and roll [d10]: 1-3: [heal]4, 4-8: [heal]2, 9-10: [stress]+2.',
 'Hamlet Skill: Field Dressing Choose [hero-target] and roll [d10]: 1-3: [heal]7, 4-8: [heal]4, 9-10: [stress]+2.',
 'Hamlet Skill: Field Dressing Choose [hero-target] and roll [d10]: 1-3: [heal]9, 4-8: [heal]5, 9-10: [stress]+2.'],
 'grave-robber':['Hamlet Skill: Pilfer Draw a [loot-chest].','Hamlet Skill: Pilfer Draw a [loot-chest].','Hamlet Skill: Pilfer Draw a [loot-chest].'],
 occultist:[
 'Hamlet Skill: Dark Ritual Self [stress]+1, [hero-target]: [heal]2, [stress]-2, [buff]3t.',
 'Hamlet Skill: Dark Ritual Self [stress]+1, [hero-target]: [heal]4, [stress]-2, [buff]3t.',
 'Hamlet Skill: Dark Ritual Self [stress]+1, [hero-target]: [heal]5, [stress]-2, [buff]3t.'],
 abomination:[
 'Hamlet Skill: Psyche Up (once per Hamlet phase) Self [buff]6t, [protection]6t + [hero-target][hero-target][hero-target][hero-target]: [stress]+1. or Anger Management Self [stress]-3 + [hero-target][hero-target][hero-target][hero-target]: [stress]-1.',
 'Hamlet Skill: Psyche Up (once per Hamlet phase) Self [buff]6t, [protection]6t + [hero-target][hero-target][hero-target][hero-target]: [stress]+1. or Anger Management Self [stress]-3 + [hero-target][hero-target][hero-target][hero-target]: [stress]-1.',
 'Hamlet Skill: Psyche Up (once per Hamlet phase) Self [buff]6t, [protection]6t + [hero-target][hero-target][hero-target][hero-target]: [stress]+1. or Anger Management Self [stress]-3 + [hero-target][hero-target][hero-target][hero-target]: [stress]-1.'],
 'man-at-arms':[
 'Hamlet Skill: Wound Care Self: [debuff]4t, remove [disease] OR remove Quirk OR [stress]-5 OR [heal]10.',
 'Hamlet Skill: Wound Care Self: [debuff]4t, remove [disease] OR remove Quirk OR [stress]-5 OR [heal]10.',
 'Hamlet Skill: Wound Care Self: [debuff]4t, remove [disease] OR remove Quirk OR [stress]-5 OR [heal]10.'],
 flagellant:[
 "Hamlet Skill: Lashe’s Solace Self: 8[heart-outline], [stress]-3, gain [virtue-card].",
 "Hamlet Skill: Lashe’s Solace Self: 11[heart-outline], [stress]-3, gain [virtue-card].",
 "Hamlet Skill: Lashe’s Solace Self: 15[heart-outline], [stress]-3, gain [virtue-card]."],
 leper:[
 'Hamlet Skill: Quarantine Self: [damage]6, [hero-target][hero-target][hero-target][hero-target]: [stress]-4.',
 'Hamlet Skill: Quarantine Self: [damage]8, [hero-target][hero-target][hero-target][hero-target]: [stress]-4.',
 'Hamlet Skill: Quarantine Self: [damage]11, [hero-target][hero-target][hero-target][hero-target]: [stress]-4.'],
 antiquarian:[
 'Hamlet Skill: Trinket Scrounge Pay 5 [gold] and roll [d10]: 1-5: Draw 2 Trinkets equal to the Hero Level and pick one. 6-10: Draw 2 Trinkets 1 Level higher than the Hero Level, and pick one.',
 'Hamlet Skill: Trinket Scrounge Pay 5 [gold] and roll [d10]: 1-5: Draw 2 Trinkets equal to the Hero Level and pick one. 6-10: Draw 2 Trinkets 1 Level higher than the Hero Level, and pick one.',
 'Hamlet Skill: Trinket Scrounge Pay 5 [gold] and roll [d10]: 1-5: Draw 2 Trinkets equal to the Hero Level and keep them. 6-10: Draw 2 Trinkets equal to the Hero Level and keep them.'],
 shieldbreaker:[
 'Hamlet Skill: Snake Skin & Eyes Self: [protection]4t, [buff]4t. All Heroes [hero-target]: [buff]2t.',
 'Hamlet Skill: Snake Skin & Eyes Self: [protection]4t, [buff]4t. All Heroes [hero-target]: [buff]2t.',
 'Hamlet Skill: Snake Skin & Eyes Self: [protection]4t, [buff]4t. All Heroes [hero-target]: [buff]2t.'],
 'hound-master':[
 'Hamlet Skill: Release the Hound When you would draw the next Dungeon Tile to setup the Dungeon, draw an additional one and pick one of them.',
 'Hamlet Skill: Release the Hound When you would draw the next Dungeon Tile to setup the Dungeon, draw an additional one and pick one of them.',
 'Hamlet Skill: Release the Hound When you would draw the next Dungeon Tile to setup the Dungeon, draw an additional one and pick one of them.'],
 musketeer:[
 'Hamlet Skill: Field Dressing Choose [hero-target] and roll [d10]: 1-3: [heal]4, 4-8: [heal]2, 9-10: [stress]+2.',
 'Hamlet Skill: Field Dressing Choose [hero-target] and roll [d10]: 1-3: [heal]7, 4-8: [heal]4, 9-10: [stress]+2.',
 'Hamlet Skill: Field Dressing Choose [hero-target] and roll [d10]: 1-3: [heal]9, 4-8: [heal]5, 9-10: [stress]+2.'],
};
