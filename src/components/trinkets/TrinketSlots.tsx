import { useState } from 'react';
import type { HeroInstance } from '../../types';
import { useGameStore } from '../../store/useGameStore';
import { currentTrinketTurnId } from '../../game-engine/trinkets/trinket-state';
import { getTrinketCapacity, getFreeTrinketCapacity } from '../../game-engine/trinkets/capacity';
import TrinketCard from './TrinketCard';

interface Props {
  hero: HeroInstance;
  /** manage = 允许转交/丢弃（仅非战斗阶段启用）。 */
  mode?: 'manage' | 'view';
}

/**
 * 英雄饰品槽位：显示容量（= 等级）与每件饰品。
 * manage 模式下提供「转交」（给其他有空位的存活英雄）与「丢弃」（两次点击确认）。
 * 战斗中禁用管理操作（转移只允许非战斗，丢弃权由引擎在丢弃语义下处理）。
 */
export default function TrinketSlots({ hero, mode = 'view' }: Props) {
  const campaign = useGameStore((s) => s.campaign);
  const transferTrinket = useGameStore((s) => s.transferTrinket);
  const discardTrinket = useGameStore((s) => s.discardTrinket);
  const [transferFor, setTransferFor] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);

  const inBattle = !!campaign?.battle && campaign.battle.status === 'active';
  const canManage = mode === 'manage' && !inBattle && hero.isAlive && !hero.dead;
  const cap = getTrinketCapacity(hero);
  const free = getFreeTrinketCapacity(hero);
  const trinkets = hero.equippedTrinkets ?? [];
  const turnId = campaign ? currentTrinketTurnId(campaign) : null;

  const candidates =
    canManage && campaign
      ? campaign.heroes.filter(
          (h) =>
            h.instanceId !== hero.instanceId &&
            h.isAlive &&
            !h.dead &&
            getFreeTrinketCapacity(h) > 0
        )
      : [];

  return (
    <div
      className="mt-1.5 border-t border-dd-border pt-1.5"
      data-testid={`trinket-slots-${hero.instanceId}`}
    >
      <div className="flex items-center justify-between text-[10px] text-dd-muted">
        <span>饰品容量（= 等级）</span>
        <span className={free === 0 ? 'text-amber-400 font-semibold' : 'text-dd-text'}>
          {trinkets.length}/{cap}
        </span>
      </div>
      {trinkets.length === 0 ? (
        <div className="text-[10px] text-dd-muted mt-1">无饰品</div>
      ) : (
        <div className="space-y-1.5 mt-1">
          {trinkets.map((t) => {
            const usedNow = turnId !== null && t.usedTurnId === turnId;
            return (
              <div key={t.instanceId}>
                <TrinketCard trinketId={t.trinketId} currentSide={t.currentSide} usedThisTurn={usedNow} />
                {canManage && (
                  <div className="flex gap-1 mt-1">
                    <button
                      type="button"
                      onClick={() => setTransferFor(transferFor === t.instanceId ? null : t.instanceId)}
                      className="px-1.5 rounded bg-dd-panel2 border border-dd-border text-[10px] text-dd-muted hover:text-dd-text transition-colors"
                      data-testid={`trinket-transfer-${t.instanceId}`}
                    >
                      转交
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirmDiscard === t.instanceId) {
                          discardTrinket(hero.instanceId, t.instanceId);
                          setConfirmDiscard(null);
                        } else {
                          setConfirmDiscard(t.instanceId);
                        }
                      }}
                      className="px-1.5 rounded bg-dd-panel2 border border-dd-border text-[10px] text-dd-muted hover:text-red-300 transition-colors"
                      data-testid={`trinket-discard-${t.instanceId}`}
                    >
                      {confirmDiscard === t.instanceId ? '确认丢弃' : '丢弃'}
                    </button>
                  </div>
                )}
                {canManage && transferFor === t.instanceId && (
                  <div className="mt-1">
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) {
                          transferTrinket(hero.instanceId, e.target.value, t.instanceId);
                          setTransferFor(null);
                        }
                      }}
                      className="w-full rounded bg-dd-panel2 border border-dd-border text-[10px] text-dd-text px-1 py-0.5"
                      data-testid={`trinket-transfer-select-${t.instanceId}`}
                    >
                      <option value="">转交给…</option>
                      {candidates.map((c) => (
                        <option key={c.instanceId} value={c.instanceId}>
                          {c.name}（空 {getFreeTrinketCapacity(c)}）
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {canManage && confirmDiscard === t.instanceId && (
                  <div
                    className="mt-1 text-[10px] text-red-400"
                    data-testid={`trinket-discard-confirm-${t.instanceId}`}
                  >
                    再次点击「确认丢弃」以移除该饰品。
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
