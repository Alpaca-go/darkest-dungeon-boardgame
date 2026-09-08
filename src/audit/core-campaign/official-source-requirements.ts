// Phase 11A.3 Source-Gate Integrity Repair dev doc §9-10, §27-28：
// Canonical Official Source Requirements Registry。
//
// 原则：
//   - 所有 Phase 11A.3 官方 Act IV 所需的 source asset 都在这里声明一次。
//   - Manifest / Checklist / Readiness / Summary 全部从这个 registry 派生。
//   - quantity 显式：复数实体的 source 必须在 quantity > 1 表达。
//   - requiredForCompletion 区分「完成 P0-002 必需」与「仅 optional」。
//   - rulebookBackedFields：规则书 p35-41 已锁定的结构字段（用于 partial officialization）。
//   - requiredFields：完成 official pool 必需的 Tier B 字段（仅 source asset 提供）。
//   - sourceFilePattern：用户后续提供结构化 JSON 的 glob 模式。
//
// 禁止：
//   - 在其它文件手写 totalAssets / available / missing 数字。
//   - 复数实体的 source 合并成一个 asset 而不写 quantity。
//   - 让 Source Gate 读 manifest JSON 自己算 summary。

// ---------------------------------------------------------------------------
// 组件分组（Phase 11A.3 关心的范围，不含 unrelated 121 条）
// ---------------------------------------------------------------------------

export type SourceComponentGroup =
  | 'rulebook'
  | 'quest'
  | 'dungeon-tile'
  | 'templars'
  | 'mammoth-cyst'
  | 'shuffling-horror'
  | 'final-encounter'
  | 'monster-deck'
  | 'official-errata';

// ---------------------------------------------------------------------------
// 组件类型（与 componentGroup 几乎正交，限定到 Tier B/C 的物理类型）
// ---------------------------------------------------------------------------

export type SourceComponentType =
  | 'rulebook'
  | 'battle-card'
  | 'quest-card'
  | 'room-card'
  | 'dungeon-tile'
  | 'monster-card'
  | 'special-card'
  | 'official-errata';

// ---------------------------------------------------------------------------
// Tier
// ---------------------------------------------------------------------------

export type SourceTier = 'A' | 'B' | 'C';

// ---------------------------------------------------------------------------
// Requirement 定义
// ---------------------------------------------------------------------------

export interface OfficialSourceRequirement {
  requirementId: string;

  componentGroup: SourceComponentGroup;
  componentType: SourceComponentType;
  componentId: string;

  /** 物理组件数量（同一 logical record 可能代表 quantity 张卡 / 张 tile / 张 reflection）。 */
  quantity: number;

  /** 完成 P0-002 必需；false 表示 optional（如官方 errata）。 */
  requiredForCompletion: boolean;

  /** Tier A（rulebook p35-41）已锁定的结构字段。partial officialization 用。 */
  rulebookBackedFields: string[];

  /** 完成 official pool 必需的所有字段（Tier B/C 补）。 */
  requiredFields: string[];

  /** 用户后续提供结构化 JSON 的 glob pattern（相对 docs/data/darkest-dungeon/official/）。 */
  sourceFilePattern: string;

  /** 备注：dev doc §11 acquisition checklist 来源。 */
  notes: string;
}

// ---------------------------------------------------------------------------
// Canonical Registry（唯一来源；不要在其它地方手写副本）
// ---------------------------------------------------------------------------

export const OFFICIAL_SOURCE_REQUIREMENTS: OfficialSourceRequirement[] = [
  // ---- Tier A: Rulebook ----
  {
    requirementId: 'tierA-rulebook',
    componentGroup: 'rulebook',
    componentType: 'rulebook',
    componentId: 'DD_EN_COREBOX_RULES',
    quantity: 1,
    requiredForCompletion: false,
    rulebookBackedFields: [
      'p35:darkest-dungeon.isActFour',
      'p35:darkest-dungeon.questCardCount',
      'p35:darkest-dungeon.xpReward',
      'p35:darkest-dungeon.roomCount',
      'p36:darkest-dungeon.dungeonTileCount',
      'p36:darkest-dungeon.excavationSite.provisionPerHero',
      'p36:darkest-dungeon.excavationSite.restEquivalent',
      'p36:final-encounter.finalHamlet.preparationDays',
      'p36:final-encounter.noDungeonExplorationBeforeEncounter',
      'p36:final-encounter.rollProvisionsBeforeEncounter',
      'p36:final-encounter.formCount',
      'p36:final-encounter.encounteredFormCount',
      'p36:final-encounter.formOrder',
      'p36:final-encounter.heartOfDarknessNeverSkipped',
      'p36:final-encounter.sameRoomAcrossForms',
      'p36:final-encounter.noLifeStressRecoveryOnFormSwitch',
      'p36:final-encounter.noRestOnFormSwitch',
      'p36:final-encounter.noStanceAdjustmentOnFormSwitch',
      'p36:final-encounter.newInitiativeDeckAndRoundOnFormSwitch',
      'p39:templars.impaler.requiredStance',
      'p39:templars.warlord.requiredStance',
      'p39:templars.impaler.initiativeCardCount',
      'p39:templars.warlord.initiativeCardCount',
      'p39:templars.bodySlamTriggersPitToss',
      'p39:templars.pitTossUsesD10',
      'p39:mammoth-cyst.cyst.requiredStance',
      'p39:mammoth-cyst.cyst.initiativeCardCount',
      'p39:mammoth-cyst.whiteCellStalk.summonWhenAbsent',
      'p39:mammoth-cyst.whiteCellStalk.summonAddsInitiativeCount',
      'p39:mammoth-cyst.whiteCellStalk.teleportationRollsD10',
      'p40:shuffling-horror.requiredStance',
      'p40:shuffling-horror.initiativeCardCount',
      'p40:shuffling-horror.cultistPriestKeptAside',
      'p40:shuffling-horror.malignantGrowthKeptAside',
      'p40:shuffling-horror.echoingDisassemblySummonOrder',
      'p40:shuffling-horror.undulationsShufflesHeroStanceTokens',
      'p40:ancestor-first.requiredStance',
      'p40:ancestor-first.perfectReflectionCount',
      'p40:ancestor-first.imperfectReflectionCount',
      'p40:ancestor-first.monsterInitiativeCardCount',
      'p40:ancestor-first.reflectionsAlwaysGuardAncestor',
      'p40:ancestor-first.imperfectDeathDeals10WoundsToAncestor',
      'p40:ancestor-first.reflectionDeathDoesNotReduceInitiative',
      'p41:ancestor-second.initiativeCardCount',
      'p41:ancestor-second.absoluteNothingnessCount',
      'p41:ancestor-second.absoluteNothingnessNotTargetable',
      'p41:ancestor-second.absoluteNothingnessOccupiesArea',
      'p41:ancestor-second.teleportD10Map',
      'p41:gestating-heart.requiredStance',
      'p41:gestating-heart.initiativeCardCount',
      'p41:gestating-heart.sispersionAddsOneInitiative',
      'p41:gestating-heart.woundedReaction.blightTurns',
      'p41:gestating-heart.woundedReaction.healAmount',
      'p41:heart-of-darkness.requiredStance',
      'p41:heart-of-darkness.initiativeCardCount',
      'p41:heart-of-darkness.impendingDoomRollsAtBattleStart',
      'p41:heart-of-darkness.impendingDoomRollsAfterAction',
      'p41:heart-of-darkness.defeatIsCampaignVictory',
    ],
    requiredFields: [],
    sourceFilePattern: 'docs/DD_EN_COREBOX_RULES.pdf',
    notes: '规则书只锁结构（数量 / 顺序 / 时机 / 触发 / d10 大范围）。所有具体数值 / 卡面 / Room 几何 / Pit 细节都必须来自 Tier B/C。',
  },

  // ---- Tier B: Quest Cards (3) ----
  ...(['darkest-dungeon-quest-1', 'darkest-dungeon-quest-2', 'darkest-dungeon-quest-3'] as const).map(
    (id, idx) => ({
      requirementId: `tierB-quest-${idx + 1}`,
      componentGroup: 'quest' as const,
      componentType: 'quest-card' as const,
      componentId: id,
      quantity: 1,
      requiredForCompletion: true,
      rulebookBackedFields: [
        'roomCount:16',
        'xpReward:3',
        'questType:darkest-dungeon-guardian',
      ],
      requiredFields: [
        'name',
        'guardianDefinitionId',
        'skippedFinalFormId',
        'firewoodCount',
        'provisionPolicyId.cardSpecific',
      ],
      sourceFilePattern: `docs/data/darkest-dungeon/official/quests/${id}.json`,
      notes: `第 ${idx + 1} 张 Quest Card。name / Guardian mapping / Skipped Form / Firewood 全部来自卡面，禁止从 prototype index 推断。`,
    }),
  ),

  // ---- Tier B: Darkest Dungeon Dungeon Tiles (2 张) ----
  {
    requirementId: 'tierB-dd-dungeon-tile',
    componentGroup: 'dungeon-tile',
    componentType: 'dungeon-tile',
    componentId: 'darkest-dungeon-dungeon-tile',
    quantity: 2,
    requiredForCompletion: true,
    rulebookBackedFields: [
      'tileCount:2',
      'drawPolicy:random-1-of-2',
      'bossSlotCount:3',
    ],
    requiredFields: ['tileGeometry', 'bossSlotPositions'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/dungeon-tiles/dd-tile-*.json',
    notes: '2 张 Darkest Dungeon 专用 Dungeon Tile。quantity 显式 = 2。',
  },

  // ---- Tier B: Templars (4 张 Battle Card + 1 张 Room Card + 1 张 Room Tile) ----
  {
    requirementId: 'tierB-templars-impaler',
    componentGroup: 'templars',
    componentType: 'battle-card',
    componentId: 'templar-impaler',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [
      'requiredStance:aggressive',
      'initiativeCardCount:2',
      'bodySlamTriggersPitToss:true',
    ],
    requiredFields: [
      'maxHp',
      'dodge',
      'speed',
      'resistances',
      'accuracy',
      'damage',
      'crit',
      'skillIds',
      'd10SkillTable',
    ],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/guardians/templars/impaler.json',
    notes: 'Templar Impaler 战斗卡。',
  },
  {
    requirementId: 'tierB-templars-warlord',
    componentGroup: 'templars',
    componentType: 'battle-card',
    componentId: 'templar-warlord',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: ['requiredStance:ranged', 'initiativeCardCount:2'],
    requiredFields: [
      'maxHp',
      'dodge',
      'speed',
      'resistances',
      'accuracy',
      'damage',
      'crit',
      'skillIds',
      'd10SkillTable',
    ],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/guardians/templars/warlord.json',
    notes: 'Templar Warlord 战斗卡。',
  },
  {
    requirementId: 'tierB-templars-room',
    componentGroup: 'templars',
    componentType: 'room-card',
    componentId: 'templars-room',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: ['bodySlamHitTriggersPitToss'],
    requiredFields: [
      'areaIds',
      'areaCapacities',
      'spikedPitPositions',
      'pitD10Map',
      'pitEntryEffects',
      'pitExitRule',
      'victoryCondition',
    ],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/guardians/templars/room.json',
    notes: 'Templars Room Card。',
  },
  {
    requirementId: 'tierB-templars-room-tile',
    componentGroup: 'templars',
    componentType: 'dungeon-tile',
    componentId: 'templars-room-tile',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [],
    requiredFields: ['tileGeometry'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/guardians/templars/room-tile.json',
    notes: 'Templars Room Tile 几何（如果 Room geometry 不在卡上）。',
  },

  // ---- Tier B: Mammoth Cyst (2 张 Battle Card + 1 张 Room Card) ----
  {
    requirementId: 'tierB-mammoth-cyst',
    componentGroup: 'mammoth-cyst',
    componentType: 'battle-card',
    componentId: 'mammoth-cyst',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [
      'requiredStance:aggressive',
      'initiativeCardCount:2',
      'stalkSummonWhenAbsent',
      'stalkSummonAddsInitiativeCount',
      'stalkTeleportationRollsD10',
    ],
    requiredFields: ['maxHp', 'dodge', 'speed', 'resistances', 'accuracy', 'damage', 'crit', 'skillIds', 'd10SkillTable'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/guardians/mammoth-cyst/cyst.json',
    notes: 'Mammoth Cyst 战斗卡。',
  },
  {
    requirementId: 'tierB-white-cell-stalk',
    componentGroup: 'mammoth-cyst',
    componentType: 'battle-card',
    componentId: 'white-cell-stalk',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [
      'summonViaCystTurn',
      'spawnStanceFromCyst',
      'spawnAreaFromCyst',
      'teleportationRollsD10',
    ],
    requiredFields: ['maxHp', 'dodge', 'speed', 'resistances', 'accuracy', 'damage', 'crit', 'skillIds', 'd10SkillTable', 'teleportationD10Map'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/guardians/mammoth-cyst/stalk.json',
    notes: 'White Cell Stalk 战斗卡。',
  },
  {
    requirementId: 'tierB-mammoth-cyst-room',
    componentGroup: 'mammoth-cyst',
    componentType: 'room-card',
    componentId: 'mammoth-cyst-room',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [],
    requiredFields: ['areaIds', 'areaCapacities', 'teleportationD10Map', 'spawnStancePolicy', 'spawnAreaPolicy', 'victoryCondition'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/guardians/mammoth-cyst/room.json',
    notes: 'Mammoth Cyst Room Card。',
  },

  // ---- Tier B: Shuffling Horror (3 张 Battle Card + 1 张 Room Card) ----
  {
    requirementId: 'tierB-shuffling-horror',
    componentGroup: 'shuffling-horror',
    componentType: 'battle-card',
    componentId: 'shuffling-horror',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [
      'requiredStance:aggressive',
      'initiativeCardCount:2',
      'cultistPriestKeptAside',
      'malignantGrowthKeptAside',
      'echoingDisassemblySummonOrder',
      'summonAddsInitiative',
      'undulationsShufflesHeroStanceTokens',
    ],
    requiredFields: ['maxHp', 'dodge', 'speed', 'resistances', 'accuracy', 'damage', 'crit', 'skillIds', 'd10SkillTable'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/guardians/shuffling-horror/horror.json',
    notes: 'Shuffling Horror 战斗卡。',
  },
  {
    requirementId: 'tierB-cultist-priest',
    componentGroup: 'shuffling-horror',
    componentType: 'battle-card',
    componentId: 'cultist-priest',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: ['keptAsideInitially', 'summonedByShufflingHorror'],
    requiredFields: ['maxHp', 'dodge', 'speed', 'resistances', 'accuracy', 'damage', 'crit', 'skillIds', 'd10SkillTable'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/guardians/shuffling-horror/cultist-priest.json',
    notes: 'Cultist Priest 战斗卡。',
  },
  {
    requirementId: 'tierB-malignant-growth',
    componentGroup: 'shuffling-horror',
    componentType: 'battle-card',
    componentId: 'malignant-growth',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: ['keptAsideInitially', 'summonedByShufflingHorror'],
    requiredFields: ['maxHp', 'dodge', 'speed', 'resistances', 'accuracy', 'damage', 'crit', 'skillIds', 'd10SkillTable'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/guardians/shuffling-horror/malignant-growth.json',
    notes: 'Malignant Growth 战斗卡。',
  },
  {
    requirementId: 'tierB-shuffling-horror-room',
    componentGroup: 'shuffling-horror',
    componentType: 'room-card',
    componentId: 'shuffling-horror-room',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [],
    requiredFields: ['areaIds', 'areaCapacities', 'victoryCondition'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/guardians/shuffling-horror/room.json',
    notes: 'Shuffling Horror Room Card。',
  },

  // ---- Tier B: Final Encounter (1 Room Card + 1 Room Tile + 4 Form Battle Card + 3 Reflection Card + 3 Absolute Nothingness + 1 Come Unto Your Maker) ----
  {
    requirementId: 'tierB-ancestor-room',
    componentGroup: 'final-encounter',
    componentType: 'room-card',
    componentId: 'ancestor-room',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [
      'sameRoomAcrossAllForms',
      'noRestOnFormSwitch',
      'noStanceAdjustmentOnFormSwitch',
      'newInitiativeAndRoundOnFormSwitch',
    ],
    requiredFields: ['areaIds', 'areaCapacities', 'roomEffects', 'formAreaPlacement'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/final-encounter/room.json',
    notes: 'Ancestor Room Card。',
  },
  {
    requirementId: 'tierB-ancestor-room-tile',
    componentGroup: 'final-encounter',
    componentType: 'dungeon-tile',
    componentId: 'ancestor-room-tile',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [],
    requiredFields: ['tileGeometry'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/final-encounter/room-tile.json',
    notes: 'Ancestor Room Tile 几何。',
  },
  {
    requirementId: 'tierB-ancestor-first-form',
    componentGroup: 'final-encounter',
    componentType: 'battle-card',
    componentId: 'ancestor-first-form',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [
      'requiredStance:aggressive',
      'perfectReflectionCount:2',
      'imperfectReflectionCount:1',
      'monsterInitiativeCardCount:4',
      'reflectionsAlwaysGuardAncestor',
      'imperfectDeathDeals10WoundsToAncestor',
      'reflectionDeathDoesNotReduceInitiative',
    ],
    requiredFields: [
      'ancestor.maxHp',
      'ancestor.skillIds',
      'perfectReflection.maxHp',
      'perfectReflection.skillIds',
      'imperfectReflection.maxHp',
      'imperfectReflection.skillIds',
      'timeHealsAll.effect',
      'vacantStanceFillSource',
    ],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/final-encounter/ancestor-first-form.json',
    notes: 'Ancestor 1st Form 战斗卡。',
  },
  {
    requirementId: 'tierB-perfect-reflection',
    componentGroup: 'final-encounter',
    componentType: 'special-card',
    componentId: 'perfect-reflection',
    quantity: 2, // dev doc §6：2 Perfect Reflections
    requiredForCompletion: true,
    rulebookBackedFields: ['count:2', 'guardsAncestor'],
    requiredFields: ['maxHp', 'skillIds'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/final-encounter/perfect-reflection.json',
    notes: 'Perfect Reflection 卡（quantity=2）。',
  },
  {
    requirementId: 'tierB-imperfect-reflection',
    componentGroup: 'final-encounter',
    componentType: 'special-card',
    componentId: 'imperfect-reflection',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: ['count:1', 'deathDeals10WoundsToAncestor'],
    requiredFields: ['maxHp', 'skillIds'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/final-encounter/imperfect-reflection.json',
    notes: 'Imperfect Reflection 卡。',
  },
  {
    requirementId: 'tierB-ancestor-second-form',
    componentGroup: 'final-encounter',
    componentType: 'battle-card',
    componentId: 'ancestor-second-form',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [
      'initiativeCardCount:2',
      'absoluteNothingnessCount:3',
      'absoluteNothingnessNotTargetable:true',
      'absoluteNothingnessOccupiesArea:true',
      'teleportD10Map',
    ],
    requiredFields: ['ancestor.maxHp', 'ancestor.skillIds', 'absoluteNothingness.areaIds'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/final-encounter/ancestor-second-form.json',
    notes: 'Ancestor 2nd Form 战斗卡。',
  },
  {
    requirementId: 'tierB-absolute-nothingness',
    componentGroup: 'final-encounter',
    componentType: 'special-card',
    componentId: 'absolute-nothingness',
    quantity: 3, // dev doc §6：3 Absolute Nothingness
    requiredForCompletion: true,
    rulebookBackedFields: ['count:3', 'untargetable:true', 'occupiesArea:true'],
    requiredFields: ['stance', 'areaId'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/final-encounter/absolute-nothingness-*.json',
    notes: 'Absolute Nothingness 卡（quantity=3）。',
  },
  {
    requirementId: 'tierB-gestating-heart',
    componentGroup: 'final-encounter',
    componentType: 'battle-card',
    componentId: 'gestating-heart',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [
      'requiredStance:aggressive',
      'initiativeCardCount:1',
      'sispersionAddsOneInitiative',
      'woundedReaction.blightTurns:2-or-3',
      'woundedReaction.healAmount:2',
    ],
    requiredFields: ['maxHp', 'skillIds', 'd10SkillTable', 'lethalWoundTimingRuling'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/final-encounter/gestating-heart.json',
    notes: 'Gestating Heart 战斗卡。致死 Wound 后 woundedReaction 是否触发需官方 errata / FAQ ruling。',
  },
  {
    requirementId: 'tierB-heart-of-darkness',
    componentGroup: 'final-encounter',
    componentType: 'battle-card',
    componentId: 'heart-of-darkness',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [
      'requiredStance:aggressive',
      'initiativeCardCount:2',
      'impendingDoomRollsAtBattleStart',
      'impendingDoomRollsAfterCompletedAction',
      'impendingDoomForecastVisible',
      'impendingDoomDeterminesNextSkill',
      'defeatTriggersCampaignVictory',
    ],
    requiredFields: ['maxHp', 'skillIds', 'impendingDoomD10SkillMap'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/final-encounter/heart-of-darkness.json',
    notes: 'Heart of Darkness 战斗卡。**绝对禁止**从电子游戏 Darkest Dungeon 的 Come Unto Your Maker 机制照搬。',
  },
  {
    requirementId: 'tierB-come-unto-your-maker',
    componentGroup: 'final-encounter',
    componentType: 'special-card',
    componentId: 'come-unto-your-maker',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [],
    requiredFields: ['definition'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/final-encounter/come-unto-your-maker.json',
    notes: 'Come Unto Your Maker 卡（独立 card 来源，禁止电子游戏照搬）。',
  },

  // ---- Tier B: Darkest Dungeon Monster Deck (Gestating Heart Sispersion 抽牌源) ----
  {
    requirementId: 'tierB-darkest-dungeon-monster-deck',
    componentGroup: 'monster-deck',
    componentType: 'monster-card',
    componentId: 'darkest-dungeon-monster-deck',
    quantity: 1,
    requiredForCompletion: true,
    rulebookBackedFields: [],
    requiredFields: ['deckComposition', 'monsterDefinitionIds', 'drawPolicy'],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/monster-deck.json',
    notes: 'Darkest Dungeon Monster Deck 组成 + Sispersion 抽牌 policy。无来源 → Final Encounter 整体不可 enable。',
  },

  // ---- Tier C: Official Errata（optional） ----
  {
    requirementId: 'tierC-official-errata',
    componentGroup: 'official-errata',
    componentType: 'official-errata',
    componentId: 'official-errata',
    quantity: 1,
    requiredForCompletion: false, // optional
    rulebookBackedFields: [],
    requiredFields: [],
    sourceFilePattern: 'docs/data/darkest-dungeon/official/errata/*.md',
    notes: '官方勘误 / FAQ。optional（仅在规则争议时必需）。',
  },
];

// ---------------------------------------------------------------------------
// 派生函数：从 canonical registry 算 summary（严禁手写）
// ---------------------------------------------------------------------------

export interface OfficialSourceSummary {
  totalRequirements: number;
  totalPhysicalAssets: number;
  tierARequirements: number;
  tierBRequirements: number;
  tierCRequirements: number;
  /** 资料齐备且所有 required fields 都有 provenance 的 requirement 数。 */
  availableRequirements: number;
  /** 资料完全缺失的 requirement 数。 */
  missingRequirements: number;
  /** 部分资料（如只有 rulebook-backed fields 而无 Tier B/C）的 requirement 数。 */
  partialRequirements: number;
  /** audit 是否成功执行（不含 missing）。malformed / contradictory 走 auditPasses=false。 */
  auditPasses: boolean;
}

export function tierOf(req: OfficialSourceRequirement): SourceTier {
  if (req.componentGroup === 'rulebook') return 'A';
  if (req.componentGroup === 'official-errata') return 'C';
  return 'B';
}

export function summarizeRequirements(): OfficialSourceSummary {
  const total = OFFICIAL_SOURCE_REQUIREMENTS.length;
  const tierA = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => tierOf(r) === 'A').length;
  const tierB = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => tierOf(r) === 'B').length;
  const tierC = OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => tierOf(r) === 'C').length;
  const physical = OFFICIAL_SOURCE_REQUIREMENTS.reduce((s, r) => s + r.quantity, 0);
  return {
    totalRequirements: total,
    totalPhysicalAssets: physical,
    tierARequirements: tierA,
    tierBRequirements: tierB,
    tierCRequirements: tierC,
    availableRequirements: 0, // 由 audit pass 填入
    missingRequirements: 0, // 由 audit pass 填入
    partialRequirements: 0, // 由 audit pass 填入
    auditPasses: false, // 由 audit pass 设置
  };
}

export function findRequirement(requirementId: string): OfficialSourceRequirement | undefined {
  return OFFICIAL_SOURCE_REQUIREMENTS.find((r) => r.requirementId === requirementId);
}

export function getRequirementsByGroup(group: SourceComponentGroup): OfficialSourceRequirement[] {
  return OFFICIAL_SOURCE_REQUIREMENTS.filter((r) => r.componentGroup === group);
}

/** 11A.3 官方 Act IV 范围内的所有 requirementId（用于 officialActFourMissingSourceReferences）。 */
export function getOfficialActFourRequirementIds(): Set<string> {
  return new Set(
    OFFICIAL_SOURCE_REQUIREMENTS
      .filter((r) => r.requiredForCompletion)
      .map((r) => r.requirementId),
  );
}
