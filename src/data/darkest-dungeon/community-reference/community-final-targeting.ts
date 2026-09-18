/**
 * Phase 11A.4R2A WP-10：Final skill 的 Range / Target 语义真正进入 Runtime。
 *
 * 不在 Final runtime 里重新发明距离算法：
 * - Area 拓扑复用共享推导 `adjacencyEdgesFromOutlines`（与 Room 9/11 同一函数），
 *   输入是唯一已接受的 normalized `tierB-ancestor-room-tile.tileGeometry`
 *   （confirmed_from_visual，含 11 个 Area 轮廓与 stanceMarkers）；
 * - Hero / Monster 的 Stance → Area 映射同样从 stanceMarkers 派生，不手写；
 * - 距离 = Area 图上的 BFS 最短路径（与 nearestAvailableAreas 同一 graph 模式）。
 *
 * Rulebook 语义（DD_EN_COREBOX_RULES p24 / p40-41）：
 * - Range 是 Area 距离：0 = 只能打自己所在 Area；2 = 必须恰好隔 2 个 Area；
 *   区间（如 0-10）= 落在区间 bracket 内即可；
 * - Monster 行动前最多移动 Speed 个 Area 以进入射程；移动后仍无合法目标
 *   → skip the rest of its turn（本模块给出 skippedOutOfRange，由 runtime 记录）。
 */
import type { BattleState, BattleUnit, Stance } from '../../../types';
import { requirement } from './normalized';
import { adjacencyEdgesFromOutlines, type SourceAreaOutline } from './community-source-geometry';
import {
  COMMUNITY_FINAL_ACTOR_SOURCE_STATS,
  type CommunityFinalSkillSourceLeaf,
  type CommunityFinalTargetPolicy,
} from './community-final-skill-source-inventory';

type Point = [number, number];

interface Room12TileGeometry {
  areas: Array<{
    sourceLocalAreaId: string;
    capacityDots: number;
    outlineOn1600Canvas: Point[];
    stanceMarkers?: string[];
  }>;
}

const room12TileGeometry = requirement('tierB-ancestor-room-tile').fields.tileGeometry;
if (room12TileGeometry.evidenceType !== 'confirmed_from_visual' || room12TileGeometry.status !== 'confirmed') {
  throw new Error('Ancestor Room tile geometry must come from the accepted confirmed_from_visual record');
}

const room12Geometry = room12TileGeometry.value as Room12TileGeometry;

export const COMMUNITY_ANCESTOR_ROOM12_AREAS: SourceAreaOutline[] = room12Geometry.areas.map((area) => ({
  sourceLocalAreaId: area.sourceLocalAreaId,
  outlineOn1600Canvas: area.outlineOn1600Canvas.map((point) => [...point] as Point),
  capacityDots: area.capacityDots,
}));

export const COMMUNITY_ANCESTOR_ROOM12_EDGES = adjacencyEdgesFromOutlines(COMMUNITY_ANCESTOR_ROOM12_AREAS);

if (COMMUNITY_ANCESTOR_ROOM12_EDGES.length === 0) {
  throw new Error('Ancestor Room topology derivation failed: empty edge set');
}
for (const area of COMMUNITY_ANCESTOR_ROOM12_AREAS) {
  if (!COMMUNITY_ANCESTOR_ROOM12_EDGES.some(([a, b]) => a === area.sourceLocalAreaId || b === area.sourceLocalAreaId)) {
    throw new Error(`Ancestor Room topology derivation left ${area.sourceLocalAreaId} isolated`);
  }
}

/** Stance → Area 映射从已接受 tileGeometry 的 stanceMarkers 派生（不手写）。 */
function deriveStanceAreas(side: 'hero' | 'monster'): Record<Stance, string> {
  const map = {} as Record<Stance, string>;
  for (const area of room12Geometry.areas) {
    for (const marker of area.stanceMarkers ?? []) {
      const [markerSide, stance] = marker.split(':');
      if (markerSide === side) map[stance as Stance] = area.sourceLocalAreaId;
    }
  }
  for (const stance of ['aggressive', 'ranged', 'defensive', 'support'] as const) {
    if (!map[stance]) throw new Error(`Ancestor Room tileGeometry missing ${side}:${stance} stance marker`);
  }
  return map;
}

export const COMMUNITY_ANCESTOR_ROOM12_MONSTER_STANCE_AREAS = deriveStanceAreas('monster');
export const COMMUNITY_ANCESTOR_ROOM12_HERO_STANCE_AREAS = deriveStanceAreas('hero');

// ---------------------------------------------------------------------------
// Area 距离（BFS，与 nearestAvailableAreas 同一 graph 模式）
// ---------------------------------------------------------------------------

const ROOM12_GRAPH = (() => {
  const graph = new Map<string, string[]>();
  for (const [from, to] of COMMUNITY_ANCESTOR_ROOM12_EDGES) {
    graph.set(from, [...(graph.get(from) ?? []), to]);
    graph.set(to, [...(graph.get(to) ?? []), from]);
  }
  return graph;
})();

export function communityFinalAreaDistance(fromAreaId: string, toAreaId: string): number {
  if (fromAreaId === toAreaId) return 0;
  const visited = new Set<string>([fromAreaId]);
  let frontier = [fromAreaId];
  let distance = 0;
  while (frontier.length > 0) {
    distance += 1;
    const next: string[] = [];
    for (const node of frontier) {
      for (const neighbor of ROOM12_GRAPH.get(node) ?? []) {
        if (visited.has(neighbor)) continue;
        if (neighbor === toAreaId) return distance;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return Number.POSITIVE_INFINITY;
}

// ---------------------------------------------------------------------------
// Range 解析与可达性
// ---------------------------------------------------------------------------

export interface CommunityFinalRangeBracket {
  min: number;
  max: number;
}

/** 'n/a' → null（无射程约束的非攻击技能）；'0-10' → bracket；'2' → 恰好 2。 */
export function parseCommunityFinalRange(range: string): CommunityFinalRangeBracket | null {
  if (range === 'n/a') return null;
  const bracket = range.match(/^(\d+)-(\d+)$/);
  if (bracket) return { min: Number(bracket[1]), max: Number(bracket[2]) };
  const exact = range.match(/^(\d+)$/);
  if (exact) return { min: Number(exact[1]), max: Number(exact[1]) };
  throw new Error(`Unparseable Final skill range: ${range}`);
}

/** Actor 的 printed Speed（卡面顶部），来自经 evidence 校验的 inventory。 */
export function communityFinalActorSpeed(actor: BattleUnit): number {
  const stats = COMMUNITY_FINAL_ACTOR_SOURCE_STATS.find((item) => item.sourceUnitId === actor.sourceId);
  if (!stats) throw new Error(`Missing Final actor source stats for ${actor.sourceId}`);
  return stats.printedSpeed;
}

/** BattleUnit 在 Ancestor Room tile 上所在的 Area。 */
export function communityFinalUnitAreaId(unit: BattleUnit): string {
  return unit.side === 'monster'
    ? COMMUNITY_ANCESTOR_ROOM12_MONSTER_STANCE_AREAS[unit.stance]
    : COMMUNITY_ANCESTOR_ROOM12_HERO_STANCE_AREAS[unit.stance];
}

/**
 * Monster 从 actorAreaId 出发，最多移动 speed 个 Area 后，
 * 是否存在某个落点 M' 使 dist(M', targetAreaId) 落在 range bracket 内。
 */
export function communityFinalSkillCanReach(
  actorAreaId: string,
  targetAreaId: string,
  range: CommunityFinalRangeBracket,
  speed: number,
): boolean {
  const visited = new Set<string>([actorAreaId]);
  let frontier = [actorAreaId];
  for (let step = 0; step <= speed; step += 1) {
    const next: string[] = [];
    for (const node of frontier) {
      const distance = communityFinalAreaDistance(node, targetAreaId);
      if (distance >= range.min && distance <= range.max) return true;
      if (step === speed) continue;
      for (const neighbor of ROOM12_GRAPH.get(node) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Target resolver：source range → 合法目标 Area → policy
// ---------------------------------------------------------------------------

function compareUnitId(a: BattleUnit, b: BattleUnit): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * 在候选目标上应用 target policy。所有排序比较符都以 (position, id) 等
 * 单位字段为键 —— 与 state.heroes 数组顺序无关（reorder-invariant）。
 * 'crowded' 按 Area（而非 Stance）分组：同一 Area 内不同 Stance 的 Hero 一起计数。
 */
export function pickCommunityFinalTargetsByPolicy(
  candidates: readonly BattleUnit[],
  policy: CommunityFinalTargetPolicy,
  count: number,
): BattleUnit[] {
  const heroes = candidates.filter((hero) => hero.isAlive);
  if (heroes.length === 0 || policy === 'none' || count <= 0) return [];
  const closest = [...heroes].sort((a, b) => a.position - b.position || compareUnitId(a, b));
  const furthest = [...heroes].sort((a, b) => b.position - a.position || compareUnitId(a, b));
  const stressed = [...heroes].sort((a, b) => b.stress - a.stress || a.position - b.position || compareUnitId(a, b));
  const wounded = [...heroes].sort((a, b) => (b.maxHp - b.hp) - (a.maxHp - a.hp) || compareUnitId(a, b));
  if (policy === 'closest') return closest.slice(0, count);
  if (policy === 'furthest') return furthest.slice(0, count);
  if (policy === 'most-stressed') return stressed.slice(0, count);
  if (policy === 'most-wounded-hero') return wounded.slice(0, count);
  if (policy === 'marked-then-closest') {
    const marked = closest.filter((hero) => hero.marked);
    return (marked.length > 0 ? marked : closest).slice(0, count);
  }
  if (policy === 'crowded') {
    const groups = new Map<string, BattleUnit[]>();
    for (const hero of heroes) {
      const areaId = communityFinalUnitAreaId(hero);
      const list = groups.get(areaId) ?? [];
      list.push(hero);
      groups.set(areaId, list);
    }
    const ranked = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1));
    return (ranked[0]?.[1] ?? []).sort((a, b) => a.position - b.position || compareUnitId(a, b)).slice(0, count);
  }
  return [];
}

export interface CommunityFinalTargetResolution {
  targets: BattleUnit[];
  /** 通过 range 过滤后的合法目标（policy 之前）。 */
  legalTargetIds: string[];
  /** 有存活 Hero 但全部超出射程 → rulebook「skip the rest of its turn」。 */
  skippedOutOfRange: boolean;
}

/**
 * source range → canonical legal target areas → target resolver。
 * 先用 range（含 Speed 移动）过滤合法目标，再在合法目标上应用 target policy。
 */
export function resolveCommunityFinalTargets(
  state: BattleState,
  actor: BattleUnit,
  leaf: CommunityFinalSkillSourceLeaf,
): CommunityFinalTargetResolution {
  const living = state.heroes.filter((hero) => hero.isAlive);
  if (!leaf.attack || leaf.targetPolicy === 'none' || living.length === 0) {
    return { targets: [], legalTargetIds: [], skippedOutOfRange: false };
  }
  const range = parseCommunityFinalRange(leaf.range);
  const legal = range === null
    ? living
    : living.filter((hero) => communityFinalSkillCanReach(
      communityFinalUnitAreaId(actor),
      communityFinalUnitAreaId(hero),
      range,
      communityFinalActorSpeed(actor),
    ));
  if (legal.length === 0) {
    return { targets: [], legalTargetIds: [], skippedOutOfRange: true };
  }
  return {
    targets: pickCommunityFinalTargetsByPolicy(legal, leaf.targetPolicy, leaf.multiTargetCount),
    legalTargetIds: legal.map((hero) => hero.id).sort(),
    skippedOutOfRange: false,
  };
}
