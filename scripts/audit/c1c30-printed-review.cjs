// Local locked components only. This transcription is not an acquisition tool.
const fs = require('node:fs');
const crypto = require('node:crypto');
const root = 'docs/data/complete-edition/';
const binding = JSON.parse(fs.readFileSync(root + 'c1c25-necromancer-bone-source-binding.json'));
const ref = (path, region, page) => ({ path, sha256: crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'), region, ...(page ? { page } : {}) });
const rule = (page, region) => ref(root + 'c1c19-rulebook-extracted-evidence.json', region, page);
const skill = (number, name, range, targets, targeting, accuracy, damage, crit, critDamage, selfPull = 0, targetPush = 0, targetDebuffTurns = 0) =>
  ({ number, name, range, targets, targeting, accuracy, damage, crit, critDamage, selfPull, targetPush, targetDebuffTurns });
const table = (skill) => [{ min: 1, max: 10, skill }];
const reviewed = [
  { name: 'Bone Rabble', skills: [skill(1, 'Bump in the Night', 0, 1, 'Closest', 7, 4, 0, 6), skill(2, 'Tic-Toc', 1, 1, 'Closest', 5, 4, 0, 6, 1)],
    stanceSelections: { aggressive: null, defensive: null, ranged: table(1), support: table(2) }, immunities: ['bleed'], resistances: [] },
  { name: 'Bone Soldier', skills: [skill(1, 'Graveyard Slash', 1, 1, 'Most Wounded', 9, 5, 1, 9), skill(2, 'Graveyard Stumble', 1, 1, 'Furthest', 5, 3, 0, 6, 1)],
    stanceSelections: { aggressive: null, defensive: null, ranged: table(1), support: table(2) }, immunities: ['bleed'], resistances: [] },
  { name: 'Bone Spearman', skills: [skill(1, 'Spear Thrust', 0, 1, 'Closest', 8, 8, 1, 12, 0, 1), skill(2, 'Impale', 1, 4, 'Crowded', 9, 5, 2, 7)],
    stanceSelections: { aggressive: null, defensive: [{ min: 1, max: 5, skill: 2 }, { min: 6, max: 10, skill: 1 }], ranged: null, support: table(1) }, immunities: ['bleed'], resistances: [] },
  { name: 'Bone Captain', skills: [skill(1, 'Crushing Blow', 1, 1, 'Closest', 9, 11, 2, 17, 0, 1), skill(2, 'Ground Pound', 0, 4, 'Crowded', 9, 5, 1, 7, 0, 0, 2)],
    stanceSelections: { aggressive: [{ min: 1, max: 6, skill: 1 }, { min: 7, max: 10, skill: 2 }], defensive: null, ranged: null, support: table(2) }, immunities: ['bleed', 'debuff'], resistances: ['shuffle'] },
];
const monsters = reviewed.map(r => {
  const unit = binding.units.find(u => u.name === r.name);
  const card = unit.bindings.find(b => b.cardId === (r.name === 'Bone Captain' ? 46600 : unit.bindings[0].cardId));
  const unresolvedFields = Object.entries(r.stanceSelections).filter(([, value]) => value === null).map(([stance]) => `stanceSelections.${stance}`);
  return { monsterId: r.name.toLowerCase().replaceAll(' ', '-'), displayName: r.name,
    life: unit.printedFacts.HP, speed: unit.printedFacts.speed, dodge: unit.printedFacts.dodge,
    size: unit.printedFacts.type.includes('Large') ? 'LARGE' : 'NORMAL', sourceCardId: card.cardId,
    skills: r.skills, stanceSelections: r.stanceSelections, immunities: r.immunities, resistances: r.resistances,
    initiative: { cardsPerInstance: 1, sourceReferences: [rule(17, 'Monster Initiative Card per spawned miniature'), rule(38, 'Necromancer summon Initiative insertion')] },
    sourceReferences: [ref(card.front.path, 'Printed stats, Skills, Stance icons and selection numbers'), ref(root + 'c1c25-necromancer-bone-source-binding.json', r.name)],
    status: 'PARTIAL', unresolvedFields, canonicalMissingStatus: 'SOURCE_UNRESOLVED',
    reviewNote: 'Unmarked/grey Stance icons in this locked crop are not executable selection instructions. No default Skill, cloned Stance table or prototype fallback is authorized.' };
});
const artifact = { schemaVersion: 1, definitionVersion: 'C1C30-PRINTED-DEPENDENCIES-v1',
  ruleSourcePolicyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1', externalSourceUsed: false, runtimeParsesPrintedText: false,
  monsters,
  heroDodge: [
    { heroId: 'crusader', level: 1, dodge: 0, sourceReferences: [ref('docs/DD_EN_COREBOX_RULES.pdf', 'Anatomy of the Hero Boards: labelled Dodge 0', 10)] },
    { heroId: 'highwayman', level: 1, dodge: 1, sourceReferences: [ref('docs/DD_EN_COREBOX_RULES.pdf', 'Printed Level I Highwayman card in Condition stack example', 20)] },
    { heroId: 'hellion', level: 1, dodge: 1, sourceReferences: [rule(22, 'Clumsy Axeblade against Hellion: 5 Accuracy minus 1 Dodge')] },
  ],
  heroCoverage: 'Only explicitly reviewed class/level pairs; all others remain SOURCE_UNRESOLVED. Other Hero registry fields retain their existing credibility.',
};
const output = JSON.stringify(artifact, null, 2) + '\n';
if (process.argv.includes('--verify')) {
  if (fs.readFileSync(root + 'c1c30-reviewed-component-combat.json', 'utf8') !== output) throw new Error('Printed review or source hashes changed');
} else fs.writeFileSync(root + 'c1c30-reviewed-component-combat.json', output);
