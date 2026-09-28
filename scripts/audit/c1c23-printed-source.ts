/** Independently read from all 16 original front crops (590 x 980), not runtime data.
 * Bracketed pictograms are editorial glyph tokens; never substituted rules text.
 */
export type GapCategory = 'TRIGGER_TIMING_UNRESOLVED' | 'TARGET_SCOPE_UNRESOLVED' | 'CHOICE_SCOPE_UNRESOLVED' | 'EFFECT_ORDER_UNRESOLVED' | 'DECK_LIFECYCLE_UNRESOLVED' | 'EXPANSION_MEMBERSHIP_UNRESOLVED';
export const unresolved = (category: GapCategory, reason: string) => ({status: 'SOURCE_UNRESOLVED', category, reason});
const effect = (type: string, target: string, timing: string, details: Record<string, unknown> = {}) => ({type, target, timing, ...details});
const choice = (type: string, actor: string, options: string[], timing = 'HAMLET_EVENT_RESOLVE', details: Record<string, unknown> = {}) => ({choiceRequired: true, choiceType: type, actor, options, selectionTiming: timing, cancelability: unresolved('CHOICE_SCOPE_UNRESOLVED', 'Printed optionality permits declining before commitment; reversal after commitment is not specified.'), ...details});
export const printedSources = [
  {
    cell: 0, name: 'Supply Run', days: 2,
    flavor: "’Tis not only the Heroes but the common folk too, that offer up anything they can for the Hamlet’s common good.",
    rule: 'Party gains +2 [PROVISION_DIE] before the next Quest.',
    effects: [effect('GAIN_PROVISION_DICE', 'party provision pool', 'BEFORE_NEXT_QUEST', {amount: 2, acquisition: unresolved('EFFECT_ORDER_UNRESOLVED', 'Card says gains, not rolls; exact acquisition/roll ordering relative to the normal provision roll is not specified.')})],
  },
  {
    cell: 1, name: 'Busy Week', days: 2,
    flavor: 'He was nowhere to be seen. Yet one could feel his uneasy presence and hear his irritating laughter.',
    rule: 'Do not place the Caretaker anywhere this week.',
    effects: [effect('SUPPRESS_CARETAKER_PLACEMENT', 'hamlet state', 'EACH_DAY_THIS_HAMLET', {duration: 'this week'})],
  },
  {
    cell: 2, name: 'Lost Shipment', days: 4,
    flavor: 'Everyone was expecting the goods to arrive intact. But all they got was news of misfortune and loss...',
    rule: 'Party rolls -2 [PROVISION_DIE] before the next Quest.',
    effects: [effect('MODIFY_PROVISION_ROLL_COUNT', 'party provision roll', 'BEFORE_NEXT_QUEST', {amount: -2})],
  },
  {
    cell: 3, name: 'Unsettling Darkness', days: 3,
    flavor: 'When darkness forms shapes in the horizon making all candle lights dim. This was one such week, one of unsettling darkness...',
    rule: 'Start at [LIGHT]4 next run.',
    effects: [effect('SET_STARTING_LIGHT', 'next quest light tracker', 'NEXT_QUEST_START', {value: 4})],
  },
  {
    cell: 4, name: 'Uneventful Week', days: 3,
    flavor: 'The most exquisite news, to have a week without any...', rule: '',
    effects: [],
  },
  {
    cell: 5, name: 'Labor Force', days: 3,
    flavor: 'Families banded together, seeking to renovate one of the Hamlet’s buildings. Their altruism a welcome but mixed blessing.',
    rule: 'You may upgrade a building for free. If you do, you cannot visit it this week. Discard this event from the deck permanently.',
    choices: [choice('OPTIONAL_BUILDING_SELECTION', 'party (group agreement; rulebook p33)', ['decline', 'upgrade eligible building'], 'HAMLET_EVENT_RESOLVE', {selectionCount: 1, eligibleTargets: 'Upgradeable Hamlet buildings; Guild and Graveyard excluded (p33)', optional: true})],
    costs: [{type: 'WAIVE_BUILDING_UPGRADE_GOLD', amount: 0, scope: 'chosen upgrade'}, {type: 'FORGO_VISITS', target: 'chosen building', duration: 'this week', condition: 'upgrade accepted'}],
    effects: [effect('UPGRADE_BUILDING', 'selected building', 'HAMLET_EVENT_RESOLVE', {condition: 'upgrade accepted'}), effect('BLOCK_BUILDING_VISITS', 'selected building', 'THIS_HAMLET_WEEK', {condition: 'upgrade accepted'})],
    lifecycleOverride: {destination: 'PERMANENT_CAMPAIGN_REMOVAL', condition: unresolved('DECK_LIFECYCLE_UNRESOLVED', 'Final discard sentence is outside the if-clause; whether declining also permanently removes the card is not explicitly settled.')},
  },
  {
    cell: 6, name: 'Town Fair', days: 1,
    flavor: 'Happiness and revelry drive the demons away, albeit only for a short while...',
    rule: '[FOUR_YELLOW_HELMETS]: [STRESS]-3 and [GREEN_PLUS]2 /Hero Level.',
    effects: [effect('RECOVER_STRESS', 'printed four-helmet scope', 'HAMLET_EVENT_RESOLVE', {amount: 3}), effect('HEAL', 'printed four-helmet scope', 'HAMLET_EVENT_RESOLVE', {amountPerHeroLevel: 2})],
    targetScope: unresolved('TARGET_SCOPE_UNRESOLVED', 'Four yellow helmet pictograms are preserved; no explicit legend binding for this target glyph in inspected source pages. Do not silently equate it with selected/current/all campaign heroes.'),
  },
  {
    cell: 7, name: 'Traveling Merchants', days: 2,
    flavor: 'Distrust and hope embodied on these men’s faces. Their gain, our survival.',
    rule: 'After rolling for Provisions, each Hero can choose one of their Provisions dice to be whichever side they want before the next Quest.',
    choices: [choice('OPTIONAL_DIE_AND_FACE_SELECTION', 'each Hero', ['decline', 'choose own die and desired face'], 'AFTER_PROVISION_ROLL_BEFORE_NEXT_QUEST', {selectionCount: 1, eligibleTargets: 'one of that Hero’s rolled provision dice', optional: true})],
    effects: [effect('SET_PROVISION_DIE_FACE', 'each Hero’s selected provision die', 'AFTER_PROVISION_ROLL_BEFORE_NEXT_QUEST', {desiredFace: 'whichever side they want', ownershipAfterPooling: unresolved('TARGET_SCOPE_UNRESOLVED', 'Rulebook p12 pools all dice; card requires their dice. Preserve per-Hero roll provenance; interaction with already-pooled/unattributed dice is not specified.')})],
  },
  {
    cell: 8, name: 'Gypsy Trail', days: 2,
    flavor: 'Back then, the villagers sought to drive the gypsies away from their lands. Now they only pray that they stay some more...',
    rule: 'Heroes gain +5[GOLD] when selling Trinkets.',
    effects: [effect('MODIFY_TRINKET_SALE_GOLD', 'Hero selling a Trinket', 'TRINKET_SALE', {amount: 5, duration: unresolved('TRIGGER_TIMING_UNRESOLVED', 'Card does not explicitly state duration; this-week scope must not be inferred solely from adjacent Events.')})],
  },
  {
    cell: 9, name: 'The Feast', days: 1,
    flavor: 'A feast in commemoration of the family estate’s honor and our willingness to survive...',
    rule: 'Each Hero can choose to fully restore either [STRESS] or [HEART].',
    choices: [choice('SELECT_ONE_OPTION_PER_HERO', 'each Hero', ['decline', 'fully restore stress', 'fully restore health'], 'HAMLET_EVENT_RESOLVE', {selectionCount: 1, eligibleHeroes: 'each party Hero acts for self', optional: true})],
    effects: [effect('FULL_STRESS_RECOVERY', 'choosing Hero', 'HAMLET_EVENT_RESOLVE', {condition: 'stress option chosen'}), effect('FULL_HEALTH_RESTORE', 'choosing Hero', 'HAMLET_EVENT_RESOLVE', {condition: 'health option chosen'})],
  },
  {
    cell: 10, name: 'Medical Breakthrough', days: 3,
    flavor: 'Even maladies can be defeated by the power of the human mind. What about darkness though?',
    rule: 'Party removes a disease from a Hero.',
    choices: [choice('SELECT_HERO_AND_DISEASE', 'party', ['remove one disease from chosen Hero'], 'HAMLET_EVENT_RESOLVE', {selectionCount: 1, eligibleHeroes: 'party Hero with a disease', optional: false, cancelability: unresolved('CHOICE_SCOPE_UNRESOLVED', 'No eligible diseased Hero / cancellation behavior is not specified by this mandatory sentence.')})],
    effects: [effect('REMOVE_DISEASE', 'selected Hero (not current Hero)', 'HAMLET_EVENT_RESOLVE', {count: 1})],
  },
  {
    cell: 11, name: 'Caregivers Convention', days: 2,
    flavor: 'Open your heart to another, united under a common cause. Let your heart not falter.',
    rule: 'Each Hero can remove a Quirk for free.',
    choices: [choice('OPTIONAL_QUIRK_SELECTION_PER_HERO', 'each Hero', ['decline', 'remove own chosen Quirk'], 'HAMLET_EVENT_RESOLVE', {selectionCount: 1, eligibleTargets: 'one Quirk on self; no printed positive/negative restriction', optional: true})],
    costs: [{type: 'GOLD', amount: 0, scope: 'Quirk removal'}],
    effects: [effect('REMOVE_QUIRK', 'each choosing Hero’s selected Quirk', 'HAMLET_EVENT_RESOLVE', {count: 1})],
  },
  {
    cell: 12, name: 'General Repairs', days: 4,
    flavor: 'His role is quite demanding, to keep an abandoned hamlet from falling apart...',
    rule: 'In addition to the Caretaker, roll for another location to be blocked each day.',
    effects: [effect('ROLL_ADDITIONAL_BUILDING_BLOCK', 'hamlet location', 'EACH_DAY_THIS_HAMLET', {count: 1, die: 'ten-sided (p33)', collision: 'reroll occupied Caretaker location until free building (p33)'})],
  },
  {
    cell: 13, name: 'In Good Spirits', days: 3,
    flavor: 'With spirits lifted and head held high, eager and resolute, the Heroes marched to their doom...',
    rule: 'Each Hero rolls a [D10], the Hero or Heroes that roll the highest gain a Virtue and place(s) their (or their) stress marker on the red side.',
    effects: [effect('ROLL_D10_PER_HERO', 'each Hero', 'HAMLET_EVENT_RESOLVE'), effect('GAIN_VIRTUE', 'all Heroes tied for highest roll', 'AFTER_ALL_EVENT_D10_ROLLS', {countEach: 1, existingAfflictionOrVirtue: unresolved('TARGET_SCOPE_UNRESOLVED', 'Interaction with existing Affliction/Virtue and Virtue deck availability is not stated on this card.')}), effect('SET_STRESS_MARKER_SIDE', 'all highest-roll Heroes', 'AFTER_GAIN_VIRTUE', {side: 'red'})],
  },
  {
    cell: 14, name: 'Guild Training', days: 2,
    flavor: 'The guildmaster was once a benevolent adventurer who has witnessed the death of all his prodigies. His tutelage a honorary tribute to them and to himself.',
    rule: 'Each Hero can immediately upgrade a Skill for free. Discard this event from the deck permanently.',
    choices: [choice('OPTIONAL_SKILL_SELECTION_PER_HERO', 'each Hero', ['decline', 'upgrade own chosen Skill'], 'IMMEDIATE', {selectionCount: 1, eligibleTargets: 'own upgradeable Skill; equipped-only restriction not printed', optional: true})],
    costs: [{type: 'FREE_SKILL_UPGRADE', gold: 0, xp: 0, printedBasis: 'for free'}],
    effects: [effect('UPGRADE_SKILL', 'each choosing Hero’s selected Skill', 'IMMEDIATE', {levels: 1})],
    lifecycleOverride: {destination: 'PERMANENT_CAMPAIGN_REMOVAL', condition: 'after event instructions (unconditional printed final sentence)'},
  },
  {
    cell: 15, name: 'Militia Training', days: '?',
    flavor: "The Hamlet’s guards train intensely. If only the Heroes could benefit from that. Alas, they’d lose all of their precious time though...",
    rule: 'All Heroes can Level Up one Lvl 1 Skill. If they do, 0 days. Else 3 days.',
    choices: [choice('PARTY_TRAIN_OR_PREPARE', 'all Heroes', ['train; 0 days', 'else; 3 days'], 'HAMLET_EVENT_RESOLVE', {selectionCount: 'one Level 1 Skill per participating Hero', eligibleTargets: 'Level 1 Skills', optional: true, mixedParticipation: unresolved('CHOICE_SCOPE_UNRESOLVED', 'If they do does not settle mixed acceptance or Heroes without a Level 1 Skill; do not invent an all-or-nothing vote.')})],
    costs: [{type: 'FORGO_PREPARATION_DAYS', amount: 3, condition: 'training branch'}, {type: 'UPGRADE_RESOURCE_COST', status: unresolved('CHOICE_SCOPE_UNRESOLVED', 'Unlike Guild Training this card does not say for free; whether ordinary Gold/XP costs apply is not explicit.')}],
    effects: [effect('UPGRADE_LEVEL_ONE_SKILL', 'each participating Hero’s selected Level 1 Skill', 'HAMLET_EVENT_RESOLVE', {toLevel: 2}), effect('SET_PREPARATION_DAYS', 'hamlet days tracker', 'HAMLET_EVENT_RESOLVE', {training: 0, otherwise: 3})],
  },
] as const;
