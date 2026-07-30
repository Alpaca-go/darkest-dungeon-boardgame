import { Navigate, useNavigate } from 'react-router-dom';
import { useGameStore, routeForPhase } from '../store/useGameStore';
import { getHeroById } from '../data/heroes';
import { getSkillsByHero } from '../data/skills';
import {
  getReplacementCandidates,
  replacementBlockReason,
} from '../game-engine/stagecoach';
import { upgradeXpSpent } from '../game-engine/replacement';
import type { ReplacementSlot } from '../types';

/**
 * 替补招募页 /replacement（Phase 6 §15/§19）。
 * 每名阵亡英雄一个槽位：选择候选 → 最多 2 次免 Gold 升级 → 确认（扣 1 Token）。
 * 全部确认后自动跳回 resumePhase。
 * 规则全部在 game-engine，此页面只做展示与触发 store actions。
 */
export default function ReplacementPage() {
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const selectReplacementHero = useGameStore((s) => s.selectReplacementHero);
  const addReplacementUpgrade = useGameStore((s) => s.addReplacementUpgrade);
  const removeReplacementUpgrade = useGameStore((s) => s.removeReplacementUpgrade);
  const confirmReplacement = useGameStore((s) => s.confirmReplacement);

  if (!campaign) return <Navigate to="/" replace />;
  if (campaign.gamePhase !== 'replacement' || !campaign.stagecoach.pendingReplacement) {
    return <Navigate to={routeForPhase(campaign.gamePhase)} replace />;
  }

  const pending = campaign.stagecoach.pendingReplacement;
  const stagecoach = campaign.stagecoach;
  const candidates = getReplacementCandidates(campaign);
  const blockReason = replacementBlockReason(campaign);
  const confirmedCount = pending.slots.filter((s) => s.confirmed).length;

  const onConfirm = (slot: ReplacementSlot) => {
    confirmReplacement(slot.deadCampaignHeroId);
    const next = useGameStore.getState().campaign;
    if (next && next.gamePhase !== 'replacement') {
      navigate(routeForPhase(next.gamePhase));
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4" data-testid="replacement-page">
      <h1 className="text-2xl font-bold text-dd-text">Stagecoach 替补招募</h1>

      {/* Stagecoach 摘要 */}
      <div
        className="rounded-lg border border-dd-border bg-dd-panel p-4 flex flex-wrap gap-6 text-sm"
        data-testid="stagecoach-summary"
      >
        <p className="text-dd-text">
          Waiting Hero Token：
          <span className="font-bold text-dd-warn" data-testid="waiting-tokens">
            {stagecoach.waitingTokens}
          </span>
        </p>
        <p className="text-dd-text">
          累计 XP：
          <span className="font-bold text-dd-warn" data-testid="stagecoach-xp">
            {stagecoach.accumulatedXp}
          </span>
        </p>
        <p className="text-dd-muted text-xs self-center">
          替补进度：{confirmedCount}/{pending.slots.length}（每名确认消耗 1 Token；最多 2 次免
          Gold 升级：英雄等级 4 XP / 技能等级 2 XP）
        </p>
      </div>

      {blockReason && (
        <div className="rounded border border-dd-danger bg-dd-panel p-3 text-sm text-dd-danger" data-testid="replacement-block">
          {blockReason}
        </div>
      )}

      {pending.slots.map((slot) => {
        const record = campaign.deathRecords.find((r) => r.id === slot.deathRecordId);
        const spent = upgradeXpSpent(slot.upgradeOperations);
        const available = stagecoach.accumulatedXp - spent;
        const draft = slot.draftHero;
        const draftSkills = draft ? getSkillsByHero(draft.heroId).slice(0, 3) : [];
        const heroLevelUps = slot.upgradeOperations.filter((o) => o.type === 'hero-level').length;

        return (
          <div
            key={slot.deadCampaignHeroId}
            className={`rounded-lg border p-4 space-y-3 ${
              slot.confirmed ? 'border-dd-success bg-dd-panel/60' : 'border-dd-border bg-dd-panel'
            }`}
            data-testid={`replacement-slot-${slot.partySlot}`}
          >
            {/* 阵亡英雄摘要 */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-dd-text">
                  槽位 {slot.partySlot} — 阵亡：{record?.heroName ?? '未知英雄'}
                </h2>
                <p className="text-xs text-dd-muted">
                  死因：{record?.cause ?? 'unknown'} · 第 {record?.sequence ?? '?'} 位阵亡者
                </p>
              </div>
              {slot.confirmed && (
                <span className="text-xs font-bold text-dd-success" data-testid="slot-confirmed">
                  已确认
                </span>
              )}
            </div>

            {!slot.confirmed && (
              <>
                {/* 候选列表 */}
                <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-2">
                  {candidates.map(({ hero, selectable, reason }) => {
                    const picked = slot.selectedHeroClassId === hero.id;
                    const disabled = !selectable && !picked;
                    return (
                      <button
                        key={hero.id}
                        disabled={disabled}
                        onClick={() => selectReplacementHero(slot.deadCampaignHeroId, hero.id)}
                        title={reason ?? undefined}
                        className={`rounded border p-2 text-left text-xs transition-all ${
                          picked
                            ? 'border-dd-accent ring-1 ring-dd-accent bg-dd-panel'
                            : disabled
                              ? 'border-dd-border opacity-40 cursor-not-allowed'
                              : 'border-dd-border hover:border-dd-accent'
                        }`}
                        data-testid={`candidate-${hero.id}`}
                      >
                        <span
                          className="block w-full h-2 rounded mb-1"
                          style={{ backgroundColor: hero.color }}
                        />
                        <span className="font-semibold text-dd-text">{hero.name}</span>
                        <span className="block text-dd-muted">
                          HP {hero.baseLife} · 速度 {hero.speed}
                        </span>
                        {disabled && <span className="block text-dd-danger mt-1">{reason}</span>}
                      </button>
                    );
                  })}
                </div>

                {/* 升级面板 */}
                {draft && (
                  <div className="rounded border border-dd-border p-3 space-y-2" data-testid="upgrade-panel">
                    <p className="text-xs text-dd-text">
                      新英雄：<span className="font-bold">{draft.name}</span> · 等级{' '}
                      {Math.min(3, 1 + heroLevelUps)} · HP {draft.maxLife} · 可用 XP{' '}
                      <span className="font-bold text-dd-warn" data-testid="available-xp">{available}</span>{' '}
                      · 已用升级 {slot.upgradeOperations.length}/2
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => addReplacementUpgrade(slot.deadCampaignHeroId, { type: 'hero-level' })}
                        disabled={
                          slot.upgradeOperations.length >= 2 || available < 4 || 1 + heroLevelUps >= 3
                        }
                        className="px-3 py-1 rounded border border-dd-border text-xs text-dd-text hover:border-dd-accent disabled:opacity-40 disabled:cursor-not-allowed"
                        data-testid="upgrade-hero-level"
                      >
                        英雄等级 +1（4 XP）
                      </button>
                      {draftSkills.map((sk) => {
                        const ups = slot.upgradeOperations.filter(
                          (o) => o.type === 'skill-level' && o.skillId === sk.id
                        ).length;
                        return (
                          <button
                            key={sk.id}
                            onClick={() =>
                              addReplacementUpgrade(slot.deadCampaignHeroId, {
                                type: 'skill-level',
                                skillId: sk.id,
                              })
                            }
                            disabled={slot.upgradeOperations.length >= 2 || available < 2 || 1 + ups >= 3}
                            className="px-3 py-1 rounded border border-dd-border text-xs text-dd-text hover:border-dd-accent disabled:opacity-40 disabled:cursor-not-allowed"
                            data-testid={`upgrade-skill-${sk.id}`}
                          >
                            {sk.name} Lv{1 + ups}→{Math.min(3, 2 + ups)}（2 XP）
                          </button>
                        );
                      })}
                    </div>
                    {slot.upgradeOperations.length > 0 && (
                      <ul className="space-y-1">
                        {slot.upgradeOperations.map((op) => (
                          <li key={op.id} className="flex items-center gap-2 text-xs text-dd-muted">
                            <span>
                              {op.type === 'hero-level'
                                ? `英雄等级 ${op.fromLevel}→${op.toLevel}`
                                : `技能 ${op.skillId} ${op.fromLevel}→${op.toLevel}`}
                              （{op.xpCost} XP）
                            </span>
                            <button
                              onClick={() => removeReplacementUpgrade(slot.deadCampaignHeroId, op.id)}
                              className="text-dd-danger hover:underline"
                              data-testid={`remove-upgrade-${op.id}`}
                            >
                              撤销
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      onClick={() => onConfirm(slot)}
                      disabled={stagecoach.waitingTokens < 1}
                      className="px-5 py-2 rounded bg-dd-accent text-white text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      data-testid={`confirm-replacement-${slot.partySlot}`}
                    >
                      确认替补（消耗 1 Token）
                    </button>
                  </div>
                )}
              </>
            )}

            {slot.confirmed && draft && (
              <p className="text-xs text-dd-muted">
                {getHeroById(draft.heroId)?.name ?? draft.name} 已加入队伍（槽位 {slot.partySlot}）。
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
