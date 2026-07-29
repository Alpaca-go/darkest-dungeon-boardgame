import type { DungeonRoom, DungeonState } from '../../types';
import { getRoomMeta } from '../../data/rooms';

interface DungeonMapProps {
  dungeon: DungeonState;
  onRoomClick: (roomId: string) => void;
}

// 固定拓扑布局坐标（与 src/data/dungeons.ts 的邻接一致）。
const POS: Record<string, { x: number; y: number }> = {
  start: { x: 40, y: 170 },
  A: { x: 190, y: 170 },
  B: { x: 340, y: 170 },
  C: { x: 490, y: 170 },
  D: { x: 190, y: 310 },
  E: { x: 340, y: 310 },
};

const EDGES: [string, string][] = [
  ['start', 'A'],
  ['A', 'B'],
  ['B', 'C'],
  ['A', 'D'],
  ['B', 'E'],
  ['D', 'E'],
];

const STATUS_RING: Record<DungeonRoom['status'], string> = {
  hidden: 'border-dashed border-dd-border opacity-70',
  revealed: 'border-dd-muted',
  current: 'border-dd-accent ring-2 ring-dd-accent',
  visited: 'border-dd-border opacity-80',
  cleared: 'border-dd-positive',
};

const STATUS_LABEL: Record<DungeonRoom['status'], string> = {
  hidden: '?',
  revealed: '已揭示',
  current: '当前',
  visited: '已访问',
  cleared: '已清除',
};

/** 节点式地牢地图：连线表示邻接，状态用边框/透明度区分，仅相邻房间可点击。 */
export default function DungeonMap({ dungeon, onRoomClick }: DungeonMapProps) {
  const current = dungeon.rooms.find((r) => r.id === dungeon.currentRoomId);
  const adjacent = new Set(current?.adjacentRoomIds ?? []);

  return (
    <div className="relative w-full" style={{ height: 400 }}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 640 380" preserveAspectRatio="xMidYMid meet">
        {EDGES.map(([a, b]) => {
          const pa = POS[a];
          const pb = POS[b];
          const active = adjacent.has(a) && adjacent.has(b) && (current?.id === a || current?.id === b);
          return (
            <line
              key={`${a}-${b}`}
              x1={pa.x + 30}
              y1={pa.y + 30}
              x2={pb.x + 30}
              y2={pb.y + 30}
              stroke={active ? '#a83737' : '#463b34'}
              strokeWidth={active ? 3 : 2}
            />
          );
        })}
      </svg>

      {dungeon.rooms.map((room) => {
        const pos = POS[room.id];
        const meta = getRoomMeta(room.type);
        const clickable = adjacent.has(room.id);
        const statusLabel = STATUS_LABEL[room.status];
        return (
          <button
            key={room.id}
            type="button"
            disabled={!clickable}
            onClick={() => clickable && onRoomClick(room.id)}
            className={[
              'absolute w-[120px] h-[60px] -translate-x-1/2 -translate-y-1/2 rounded-md border-2 bg-dd-panel2 flex flex-col items-center justify-center text-center transition-colors',
              STATUS_RING[room.status],
              clickable ? 'cursor-pointer hover:brightness-125' : 'cursor-default',
            ].join(' ')}
            style={{
              left: `${(pos.x + 30) / 640 * 100}%`,
              top: `${(pos.y + 30) / 380 * 100}%`,
              borderLeftColor: meta?.color,
              borderLeftWidth: 6,
            }}
            title={`${meta?.label ?? room.type} · ${statusLabel}`}
          >
            <span className="text-xs font-bold text-dd-text">{meta?.label ?? room.type}</span>
            <span className="text-[10px] text-dd-muted">{statusLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
