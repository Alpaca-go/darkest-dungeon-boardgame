/** Source-backed Room 9/10/11 topology and physical Monster card attributes from the accepted Complete Edition intake. */

import { requirement } from './normalized';

export const COMMUNITY_SOURCE_GEOMETRY_ID = 'phase11a4r1-community-source-geometry.v1' as const;

export const COMMUNITY_ROOM10_STANCE_AREAS = {
  monster: {
    aggressive: 'r10-S',
    defensive: 'r10-S',
    ranged: 'r10-W',
    support: 'r10-NE',
  },
  hero: {
    aggressive: 'r10-SW',
    defensive: 'r10-SE',
    ranged: 'r10-SE',
    support: 'r10-N',
  },
} as const;

export const COMMUNITY_HORROR_MONSTER_AGGRESSIVE_AREA_ID = COMMUNITY_ROOM10_STANCE_AREAS.monster.aggressive;

export type CommunityMonsterPlacementSide = 'front' | 'back';

export interface CommunityPhysicalMonsterCardAttribute {
  sourceLocalMonsterDefinitionId: string;
  placementSide: CommunityMonsterPlacementSide;
  large: false;
  slotCount: 1;
  sourceReference: string;
}

/** Printed type-line Front/Back from accepted monster-card faces. No card prints Large. */
export const COMMUNITY_PHYSICAL_MONSTER_CARD_ATTRIBUTES: CommunityPhysicalMonsterCardAttribute[] = [
  { sourceLocalMonsterDefinitionId: 'antibody', placementSide: 'front', large: false, slotCount: 1, sourceReference: 'asset:monster-antibody:face' },
  { sourceLocalMonsterDefinitionId: 'polyp', placementSide: 'back', large: false, slotCount: 1, sourceReference: 'asset:monster-polyp:face' },
  { sourceLocalMonsterDefinitionId: 'flesh-hound', placementSide: 'front', large: false, slotCount: 1, sourceReference: 'asset:monster-flesh-hound:face' },
  { sourceLocalMonsterDefinitionId: 'defensive-growth', placementSide: 'back', large: false, slotCount: 1, sourceReference: 'asset:monster-defensive-growth:face' },
  { sourceLocalMonsterDefinitionId: 'ascended-brawler', placementSide: 'front', large: false, slotCount: 1, sourceReference: 'asset:monster-ascended-brawler:face' },
  { sourceLocalMonsterDefinitionId: 'ascended-witch', placementSide: 'back', large: false, slotCount: 1, sourceReference: 'asset:monster-ascended-witch:face' },
  { sourceLocalMonsterDefinitionId: 'rapturous-cultist', placementSide: 'front', large: false, slotCount: 1, sourceReference: 'asset:monster-rapturous-cultist:face' },
  { sourceLocalMonsterDefinitionId: 'cultist-priest', placementSide: 'back', large: false, slotCount: 1, sourceReference: 'asset:monster-cultist-priest:face' },
  { sourceLocalMonsterDefinitionId: 'malignant-growth', placementSide: 'front', large: false, slotCount: 1, sourceReference: 'asset:monster-malignant-growth:face' },
];

const STANCE_FROM_AGGRESSIVE = ['aggressive', 'ranged', 'defensive', 'support'] as const;
const STANCE_FROM_SUPPORT = ['support', 'defensive', 'ranged', 'aggressive'] as const;

export function communityMonsterCardAttribute(definitionId: string): CommunityPhysicalMonsterCardAttribute | null {
  const local = definitionId.replace(/^community-dd-monster-/, '');
  return COMMUNITY_PHYSICAL_MONSTER_CARD_ATTRIBUTES.find((item) => item.sourceLocalMonsterDefinitionId === local) ?? null;
}

export function firstEmptyStanceForPlacement(
  occupied: ReadonlySet<string>,
  side: CommunityMonsterPlacementSide,
): (typeof STANCE_FROM_AGGRESSIVE)[number] | null {
  const order = side === 'front' ? STANCE_FROM_AGGRESSIVE : STANCE_FROM_SUPPORT;
  return order.find((stance) => !occupied.has(stance)) ?? null;
}

type Point = [number, number];
export interface SourceAreaOutline {
  sourceLocalAreaId: string;
  outlineOn1600Canvas: Point[];
  capacityDots: number;
}

function almostEqual(a: number, b: number, tolerance = 12): boolean {
  return Math.abs(a - b) <= tolerance;
}

function pointOnSegment(point: Point, start: Point, end: Point, tolerance = 12): boolean {
  const minX = Math.min(start[0], end[0]) - tolerance;
  const maxX = Math.max(start[0], end[0]) + tolerance;
  const minY = Math.min(start[1], end[1]) - tolerance;
  const maxY = Math.max(start[1], end[1]) + tolerance;
  if (point[0] < minX || point[0] > maxX || point[1] < minY || point[1] > maxY) return false;
  const area = Math.abs((end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]));
  const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
  return length === 0 ? almostEqual(point[0], start[0]) && almostEqual(point[1], start[1]) : area / length <= tolerance;
}

function segmentsShareLength(a: SourceAreaOutline, b: SourceAreaOutline): boolean {
  const as = a.outlineOn1600Canvas;
  const bs = b.outlineOn1600Canvas;
  for (let i = 0; i < as.length; i += 1) {
    const a1 = as[i];
    const a2 = as[(i + 1) % as.length];
    if (Math.hypot(a2[0] - a1[0], a2[1] - a1[1]) < 20) continue;
    for (let j = 0; j < bs.length; j += 1) {
      const b1 = bs[j];
      const b2 = bs[(j + 1) % bs.length];
      if (Math.hypot(b2[0] - b1[0], b2[1] - b1[1]) < 20) continue;
      const shared = [a1, a2].filter((point) => pointOnSegment(point, b1, b2)).length
        + [b1, b2].filter((point) => pointOnSegment(point, a1, a2)).length;
      if (shared >= 2) return true;
    }
  }
  return false;
}

export function adjacencyEdgesFromOutlines(areas: SourceAreaOutline[]): Array<[string, string]> {
  const edges: Array<[string, string]> = [];
  for (let i = 0; i < areas.length; i += 1) {
    for (let j = i + 1; j < areas.length; j += 1) {
      if (segmentsShareLength(areas[i], areas[j])) edges.push([areas[i].sourceLocalAreaId, areas[j].sourceLocalAreaId]);
    }
  }
  return edges;
}

export const COMMUNITY_ROOM11_AREAS: SourceAreaOutline[] = [
  { sourceLocalAreaId: 'r11-teleport-1-2', capacityDots: 2, outlineOn1600Canvas: [[25, 25], [370, 25], [370, 330], [25, 330]] },
  { sourceLocalAreaId: 'r11-teleport-5-6', capacityDots: 3, outlineOn1600Canvas: [[540, 25], [1070, 25], [1070, 540], [540, 540]] },
  { sourceLocalAreaId: 'r11-teleport-3-4', capacityDots: 2, outlineOn1600Canvas: [[1240, 25], [1575, 25], [1575, 330], [1240, 330]] },
  { sourceLocalAreaId: 'r11-W', capacityDots: 3, outlineOn1600Canvas: [[25, 330], [370, 330], [370, 900], [25, 900]] },
  { sourceLocalAreaId: 'r11-C', capacityDots: 4, outlineOn1600Canvas: [[370, 540], [1240, 540], [1240, 900], [370, 900]] },
  { sourceLocalAreaId: 'r11-E', capacityDots: 3, outlineOn1600Canvas: [[1240, 330], [1575, 330], [1575, 900], [1240, 900]] },
  { sourceLocalAreaId: 'r11-teleport-7-8', capacityDots: 2, outlineOn1600Canvas: [[25, 900], [270, 900], [270, 1245], [25, 1245]] },
  { sourceLocalAreaId: 'r11-S', capacityDots: 5, outlineOn1600Canvas: [[425, 900], [1180, 900], [1180, 1420], [425, 1420]] },
  { sourceLocalAreaId: 'r11-teleport-9-10', capacityDots: 2, outlineOn1600Canvas: [[1320, 900], [1575, 900], [1575, 1245], [1320, 1245]] },
  { sourceLocalAreaId: 'r11-SW', capacityDots: 2, outlineOn1600Canvas: [[25, 1245], [270, 1245], [270, 1575], [25, 1575]] },
  { sourceLocalAreaId: 'r11-SE', capacityDots: 2, outlineOn1600Canvas: [[1320, 1245], [1575, 1245], [1575, 1575], [1320, 1575]] },
  { sourceLocalAreaId: 'r11-bottom', capacityDots: 4, outlineOn1600Canvas: [[270, 1420], [1320, 1420], [1320, 1575], [270, 1575]] },
];

export const COMMUNITY_ROOM11_EDGES = adjacencyEdgesFromOutlines(COMMUNITY_ROOM11_AREAS);

// ---------------------------------------------------------------------------
// Phase 11A.4R1 WP-5：Room 9（The Templars）拓扑。
//
// 唯一数据源是已接受的 normalized `tierB-templars-room-tile.tileGeometry`
// （evidenceType: confirmed_from_visual，含 14 个 Area 轮廓、容量点、Stance Marker、
// pit 洞与 blackRegions 记录）。edges 由与 Room 11 相同的
// `adjacencyEdgesFromOutlines` 共享边界推导产生 —— 不手写、不从美术想象补边。
// pit 与包围/相邻普通 Area 的边与 ordinary-area edge 进入同一 graph；
// 「能否沿边离开 pit」是 movement policy 问题（TEMPLARS_PIT_EXIT_RULE_UNRESOLVED
// 保持 SOURCE-BLOCKED），不在拓扑层发明。
// ---------------------------------------------------------------------------

interface Room9TileGeometry {
  areas: Array<{ sourceLocalAreaId: string; capacityDots: number; outlineOn1600Canvas: Point[] }>;
  outlineHoles?: Record<string, string[]>;
  blackRegions?: string;
}

const room9TileGeometry = requirement('tierB-templars-room-tile').fields.tileGeometry;
if (room9TileGeometry.evidenceType !== 'confirmed_from_visual' || room9TileGeometry.status !== 'confirmed') {
  throw new Error('Room 9 tile geometry must come from the accepted confirmed_from_visual record');
}

const room9Geometry = room9TileGeometry.value as Room9TileGeometry;

export const COMMUNITY_ROOM9_AREAS: SourceAreaOutline[] = room9Geometry.areas.map((area) => ({
  sourceLocalAreaId: area.sourceLocalAreaId,
  outlineOn1600Canvas: area.outlineOn1600Canvas.map((point) => [...point] as Point),
  capacityDots: area.capacityDots,
}));

/** Pit 洞记录（r9-SW ⊃ r9-pit-7-8、r9-SE ⊃ r9-pit-9-10），来自同一已接受字段。 */
export const COMMUNITY_ROOM9_OUTLINE_HOLES: Record<string, string[]> = { ...(room9Geometry.outlineHoles ?? {}) };

const room9SharedEdges = adjacencyEdgesFromOutlines(COMMUNITY_ROOM9_AREAS);

// 完全内嵌的 pit 洞（如 r9-pit-7-8 内嵌于 r9-SW）与包围 Area 没有共享边界，
// 连接关系由已接受字段 `outlineHoles` 显式记录 —— 直接消费该记录，不做几何猜测。
const room9HoleEdges: Array<[string, string]> = Object.entries(COMMUNITY_ROOM9_OUTLINE_HOLES).flatMap(
  ([container, holes]) =>
    holes
      .filter((hole) => !room9SharedEdges.some(([a, b]) => (a === container && b === hole) || (a === hole && b === container)))
      .map((hole): [string, string] => [container, hole]),
);

export const COMMUNITY_ROOM9_EDGES = [...room9SharedEdges, ...room9HoleEdges];

if (COMMUNITY_ROOM9_AREAS.length !== 14 || COMMUNITY_ROOM9_EDGES.length === 0) {
  throw new Error('Room 9 topology derivation failed: expected 14 areas and a non-empty edge set');
}
// 每个 Area（含全部 5 个 pit）都必须至少有一条边 —— 孤立节点意味着拓扑推导漏边。
for (const area of COMMUNITY_ROOM9_AREAS) {
  if (!COMMUNITY_ROOM9_EDGES.some(([a, b]) => a === area.sourceLocalAreaId || b === area.sourceLocalAreaId)) {
    throw new Error(`Room 9 topology derivation left ${area.sourceLocalAreaId} isolated`);
  }
}

export function nearestAvailableAreas(
  fromAreaId: string,
  occupancy: Record<string, number>,
  capacities: Record<string, number>,
  edges: Array<[string, string]>,
): string[] {
  const graph = new Map<string, string[]>();
  for (const [from, to] of edges) {
    graph.set(from, [...(graph.get(from) ?? []), to]);
    graph.set(to, [...(graph.get(to) ?? []), from]);
  }
  const visited = new Set<string>([fromAreaId]);
  let frontier = [fromAreaId];
  while (frontier.length > 0) {
    const next: string[] = [];
    const available: string[] = [];
    for (const node of frontier) {
      for (const neighbor of graph.get(node) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        next.push(neighbor);
        if ((occupancy[neighbor] ?? 0) < (capacities[neighbor] ?? 0)) available.push(neighbor);
      }
    }
    if (available.length > 0) return available.sort();
    frontier = next;
  }
  return [];
}
