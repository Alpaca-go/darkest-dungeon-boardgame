// 核心类型定义 —— 对应开发文档第 7 节。
// Phase 1 仅使用其中的部分字段（CampaignState / gamePhase / 存档结构），
// 其余字段为后续阶段预留，类型在此统一声明以保证全工程一致。

/** 全局游戏阶段状态机。所有场景切换必须通过此字段完成。 */
export type GamePhase =
  | 'home'
  | 'campaign-setup'
  | 'skill-loadout'
  | 'quest-select'
  | 'dungeon-explore'
  | 'battle'
  | 'quest-result'
  | 'hamlet'
  | 'campaign-over';

/** 四个抽象战斗站位 / 英雄姿态。 */
export type Stance = 'aggressive' | 'defensive' | 'ranged' | 'support';

/** 游戏日志条目。 */
export interface GameLogEntry {
  id: string;
  at: string; // ISO 时间戳
  message: string;
  kind?: 'info' | 'success' | 'warning' | 'danger';
}

/** 补给池。 */
export interface ProvisionPool {
  food: number;
  bandage: number;
  potion: number;
  torch: number;
  tool: number;
}

/** 英雄实例（进入战役后的具体状态）。 */
export interface HeroInstance {
  instanceId: string;
  heroId: string;
  name: string;
  level: 1 | 2 | 3;
  maxLife: number;
  wounds: number;
  stress: number;
  speed: number;
  stance: Stance;
  equippedSkillIds: string[];
  xp: number;
  isAlive: boolean;
  hasActedToday: boolean;
  temporaryDamageBonus: number;
}

/** 地牢房间类型。 */
export type DungeonRoomType =
  | 'start'
  | 'empty'
  | 'trap'
  | 'treasure'
  | 'battle'
  | 'objective';

/** 地牢房间状态。 */
export type DungeonRoomStatus =
  | 'hidden'
  | 'revealed'
  | 'current'
  | 'visited'
  | 'cleared';

/** 地牢房间节点。 */
export interface DungeonRoom {
  id: string;
  type: DungeonRoomType;
  status: DungeonRoomStatus;
  adjacentRoomIds: string[];
}

/** 地牢状态。 */
export interface DungeonState {
  questId: string;
  currentRoomId: string;
  previousRoomId: string | null;
  rooms: DungeonRoom[];
  scoutedNextMove: boolean;
  roomsCleared: number;
  objectiveComplete: boolean;
  canLeave: boolean;
}

/** 战斗单位（英雄或怪物）。 */
export interface BattleUnit {
  id: string;
  side: 'hero' | 'monster';
  sourceId: string;
  name: string;
  maxHp: number;
  hp: number;
  stress?: number;
  speed: number;
  stance: Stance;
  isAlive: boolean;
  actionPoints: number;
  targetRule?: MonsterTargetRule;
  guardTargetId?: string | null;
}

/** 先攻条目。 */
export interface InitiativeEntry {
  id: string;
  unitId: string;
  side: 'hero' | 'monster';
  resolved: boolean;
}

/** 战斗状态。 */
export interface BattleState {
  roomId: string;
  round: 1 | 2 | 3 | 4;
  units: BattleUnit[];
  initiative: InitiativeEntry[];
  activeEntryIndex: number;
  selectedTargetId: string | null;
  result: 'active' | 'victory' | 'fled' | 'defeat';
  log: GameLogEntry[];
}

/** Hamlet（村庄）状态。 */
export interface HamletState {
  preparationDays: number;
  currentDay: number;
  caretakerBlockedBuildingId: string | null;
  occupiedBuildingIds: string[];
  currentEventId: string | null;
}

/** 战役状态（存档根对象）。 */
export interface CampaignState {
  saveVersion: 1;
  id: string;
  createdAt: string;
  updatedAt: string;
  gamePhase: GamePhase;
  act: 1 | 2 | 3 | 4;
  campaignLevel: 1 | 2 | 3;
  completedQuestCount: number;
  currentThreatId: string | null;
  currentQuestId: string | null;
  questStatus: 'none' | 'selected' | 'active' | 'complete' | 'failed';
  gold: number;
  light: number;
  heroes: HeroInstance[];
  waitingHeroIds: string[];
  provisions: ProvisionPool;
  dungeon: DungeonState | null;
  battle: BattleState | null;
  hamlet: HamletState;
  log: GameLogEntry[];
}

// ---------------------------------------------------------------------------
// 以下为 mock 数据域类型，供 data/ 目录与后续阶段使用。
// ---------------------------------------------------------------------------

/** 英雄定义（mock 静态数据）。 */
export interface HeroDefinition {
  id: string;
  name: string;
  baseLife: number;
  speed: number;
  defaultStance: Stance;
  tags: string[];
  color: string; // 纯色块占位
  description?: string;
}

/** 技能定义（mock 静态数据）。 */
export interface SkillDefinition {
  id: string;
  heroId: string;
  name: string;
  kind: 'attack' | 'heal' | 'guard' | 'move';
  damage?: number;
  heal?: number;
  range: number;
  cooldown?: number;
  description: string;
}

/** 怪物目标规则。 */
export type MonsterTargetRule = 'closest' | 'mostWounded' | 'mostStressed' | 'random';

/** 怪物定义（mock 静态数据）。 */
export interface MonsterDefinition {
  id: string;
  name: string;
  maxHp: number;
  speed: number;
  damage: number;
  stress?: number;
  targetRule: MonsterTargetRule;
  color: string;
}

/** 任务定义（mock 静态数据）。 */
export interface QuestDefinition {
  id: string;
  name: string;
  type: string;
  description: string;
  dungeonLevel: number;
  roomCount: number;
  objective: string;
  reward: string;
  difficulty: 'easy' | 'normal' | 'hard';
}

/** 房间类型元数据（用于纯色块区分）。 */
export interface RoomTypeMeta {
  type: DungeonRoomType;
  label: string;
  color: string;
  description: string;
}

/** 探索事件结果（Phase 2 简化集合）。 */
export type ExplorationEventResult =
  | 'none'
  | 'hunger'
  | 'trap'
  | 'darkness'
  | 'rubble';

/** 探索事件定义。 */
export interface ExplorationEventDefinition {
  result: ExplorationEventResult;
  label: string;
  description: string;
}

/** Hamlet 建筑定义。 */
export interface HamletBuildingDefinition {
  id: string;
  name: string;
  cost: number;
  effect: string;
  color: string;
}

/** Hamlet 事件定义。 */
export interface HamletEventDefinition {
  id: string;
  name: string;
  description: string;
}

/** 英雄战斗动作（Phase 3 使用，类型预留）。 */
export interface HeroBattleAction {
  type: 'attack' | 'skill' | 'stance' | 'provision' | 'end';
  skillId?: string;
  targetId?: string | null;
  provisionType?: keyof ProvisionPool;
  newStance?: Stance;
}
