import { useState } from 'react';
import { useGameStore } from '../../store/useGameStore';
import { nextPendingAllocation } from '../../game-engine/trinkets/allocate-trinket';
import { getTrinketById } from '../../data/trinkets/trinket-registry';
import { getFreeTrinketCapacity } from '../../game-engine/trinkets/capacity';
import TrinketCard from './TrinketCard';

/**
 * Phase 8C：待分配饰品浮层（阻塞式，全局挂载）。
 * 覆盖两类待分配：普通获取分配 与 死亡转移（isDeathTransfer，必须先于 Replacement 结算）。
 * 玩家选择：装备到空位 / 替换目标英雄的一件饰品 / 直接丢弃。
 */
export default function TrinketAllocationOverlay() {
  const campaign = useGameStore((s) => s.campaign);
  const resolve = useGameStore((s) => s.resolveTrinketAllocation);
  const [replaceHeroId, setReplaceHeroId] = useState<string | null>(null);

  if (!campaign) return null;
  const alloc = nextPendingAllocation(campaign);
  if (!alloc) return null;

  const candidates = campaign.heroes.filter((h) => alloc.candidateHeroIds.includes(h.instanceId));

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      data-testid="trinket-allocation-overlay"
    >
      <div className="w-full max-w-md rounded-lg border-2 border-sky-500/70 bg-dd-panel p-5 shadow-2xl">
        <div className="text-lg font-bold text-dd-text mb-1">
          {alloc.isDeathTransfer ? '阵亡英雄的饰品转移' : '待分配饰品'}
        </div>
        <p className="text-xs text-dd-muted mb-3">
          {alloc.isDeathTransfer
            ? `来自 ${alloc.fromHeroName ?? '阵亡英雄'} 的饰品需要分配给一名存活英雄（须在替补流程之前完成）。`
            : '新获得的饰品需要分配归属。'}
        </p>
        <div className="mb-3">
          {getTrinketById(alloc.trinketId) ? (
            <TrinketCard trinketId={alloc.trinketId} currentSide="positive" />
          ) : (
            <div className="text-[11px] text-red-300">未知饰品（{alloc.trinketId}）</div>
          )}
        </div>

        <div className="space-y-2 max-h-[50vh] overflow-auto">
          {candidates.map((h) => {
            const free = getFreeTrinketCapacity(h);
            const canAssign = free > 0;
            return (
              <div
                key={h.instanceId}
                className="rounded border border-dd-border bg-dd-panel2 p-2"
                data-testid={`alloc-candidate-${h.instanceId}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-dd-text">{h.name}</span>
                  <span className="text-[11px] text-dd-muted">空位 {free}/{h.level}</span>
                </div>
                <div className="flex gap-2 mt-1.5">
                  <button
                    type="button"
                    disabled={!canAssign}
                    onClick={() => resolve(alloc.allocationId, { type: 'assign', heroId: h.instanceId })}
                    className={
                      canAssign
                        ? 'px-2 py-1 rounded bg-sky-700 text-white text-xs font-semibold hover:brightness-110'
                        : 'px-2 py-1 rounded bg-dd-panel2 text-dd-muted cursor-not-allowed opacity-60 text-xs'
                    }
                    data-testid={`alloc-assign-${h.instanceId}`}
                  >
                    装备（有空位）
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplaceHeroId(replaceHeroId === h.instanceId ? null : h.instanceId)}
                    className="px-2 py-1 rounded bg-dd-panel2 border border-dd-border text-dd-muted text-xs hover:text-dd-text"
                    data-testid={`alloc-replace-open-${h.instanceId}`}
                  >
                    替换其一件饰品
                  </button>
                </div>
                {replaceHeroId === h.instanceId && (
                  <div className="mt-2 space-y-1">
                    <div className="text-[10px] text-dd-muted">选择要被替换掉（丢弃）的饰品：</div>
                    {(h.equippedTrinkets ?? []).map((t) => (
                      <button
                        key={t.instanceId}
                        type="button"
                        onClick={() =>
                          resolve(alloc.allocationId, {
                            type: 'replace',
                            heroId: h.instanceId,
                            replaceInstanceId: t.instanceId,
                          })
                        }
                        className="w-full text-left px-2 py-1 rounded bg-dd-panel border border-dd-border text-[11px] text-dd-text hover:border-rose-500"
                        data-testid={`alloc-replace-${h.instanceId}-${t.instanceId}`}
                      >
                        {getTrinketById(t.trinketId)?.name ?? t.trinketId}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => resolve(alloc.allocationId, { type: 'discard' })}
            className="w-full px-2 py-1.5 rounded border border-red-800/60 text-red-300 text-xs hover:bg-red-500/10"
            data-testid="alloc-discard"
          >
            丢弃这件饰品
          </button>
        </div>
      </div>
    </div>
  );
}
