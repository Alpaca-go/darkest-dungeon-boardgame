import { useState } from 'react';
import type { CampaignState, HeroInstance } from '../../types';
import { useGameStore } from '../../store/useGameStore';
import { getSkillById } from '../../data/skills';
import {
  getPermanentSkillLevel,
  pendingCostTotals,
  projectedHeroLevel,
  projectedSkillLevel,
} from '../../game-engine/progression/upgrade-core';
import { getHeroXp } from '../../game-engine/progression/xp-ledger';
import { validateGuildUpgrade, getGuildSession } from '../../game-engine/hamlet/guild';
import { GUILD_UPGRADE_COSTS } from '../../data/progression/guild-costs';

const ROMAN = ['', 'I', 'II', 'III'];

/**
 * Phase 8D · Guild 升级面板。
 *
 * 组件只做展示与触发：
 * - 可用性、成本、目标等级全部来自 validateGuildUpgrade（引擎唯一裁决）；
 * - 未提交前不修改任何英雄数据，Commit 由 commitGuildVisit 原子完成；
 * - 「本次最多 2 次升级」由会话的 maxUpgrades 决定，组件不硬编码。
 */
export default function GuildPanel({
  campaign,
  hero,
  onClose,
}: {
  campaign: CampaignState;
  hero: HeroInstance;
  onClose: () => void;
}) {
  const addGuildUpgrade = useGameStore((s) => s.addGuildUpgrade);
  const removeGuildUpgrade = useGameStore((s) => s.removeGuildUpgrade);
  const commitGuildVisit = useGameStore((s) => s.commitGuildVisit);
  const cancelGuildVisit = useGameStore((s) => s.cancelGuildVisit);
  const [error, setError] = useState<string | null>(null);

  const session = getGuildSession(campaign);
  if (!session) return null;

  const choices = session.choices;
  const totals = pendingCostTotals(choices);
  const xpNow = getHeroXp(hero);
  const heroValidation = validateGuildUpgrade(campaign, { type: 'hero-level' });

  const onCommit = () => {
    const err = commitGuildVisit();
    setError(err);
    if (!err) onClose();
  };

  const onCancel = () => {
    cancelGuildVisit();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      data-testid="guild-modal"
    >
      <div className="w-full max-w-lg rounded-lg border-2 border-cyan-500/70 bg-dd-panel p-5 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="text-lg font-bold text-dd-text mb-1">Guild · 训练升级</div>
        <p className="text-xs text-dd-muted mb-3">
          {hero.name}（当前等级 {ROMAN[hero.level] ?? hero.level}） · 可用 XP{' '}
          <span className="text-sky-400 font-bold" data-testid="guild-xp">
            {xpNow - totals.xp}
          </span>{' '}
          / Gold{' '}
          <span className="text-dd-warn font-bold" data-testid="guild-gold">
            {campaign.gold - totals.gold}
          </span>
          。本次访问最多 {session.maxUpgrades} 次升级（已选 {choices.length}）。
        </p>

        {/* 英雄等级升级 */}
        <div className="mb-3">
          <div className="text-xs font-bold text-dd-text mb-1">英雄等级</div>
          <button
            type="button"
            disabled={!heroValidation?.ok}
            title={heroValidation?.reason ?? undefined}
            onClick={() => {
              setError(null);
              addGuildUpgrade({ type: 'hero-level' });
            }}
            className={[
              'w-full rounded border px-3 py-2 text-left text-sm transition-colors',
              heroValidation?.ok
                ? 'border-dd-border bg-dd-panel2 text-dd-text hover:border-cyan-400'
                : 'border-dd-border bg-dd-panel2 text-dd-muted cursor-not-allowed opacity-60',
            ].join(' ')}
            data-testid="guild-upgrade-hero-level"
          >
            <span className="font-semibold">
              Level {ROMAN[projectedHeroLevel(hero, choices)]} →{' '}
              {ROMAN[Math.min(3, projectedHeroLevel(hero, choices) + 1)]}
              <span className="ml-1.5 text-[10px] text-dd-warn">
                {GUILD_UPGRADE_COSTS.heroLevel.xp} XP + {GUILD_UPGRADE_COSTS.heroLevel.gold} Gold
              </span>
            </span>
            {!heroValidation?.ok && heroValidation?.reason && (
              <span className="block text-[11px] text-red-400">{heroValidation.reason}</span>
            )}
          </button>
        </div>

        {/* 技能等级升级 */}
        <div className="mb-3">
          <div className="text-xs font-bold text-dd-text mb-1">技能等级（仅已装备技能）</div>
          <div className="space-y-1.5">
            {hero.equippedSkillIds.map((skillId) => {
              const skill = getSkillById(skillId);
              const v = validateGuildUpgrade(campaign, { type: 'skill-level', skillId });
              const from = projectedSkillLevel(hero, skillId, choices);
              return (
                <button
                  key={skillId}
                  type="button"
                  disabled={!v?.ok}
                  title={v?.reason ?? undefined}
                  onClick={() => {
                    setError(null);
                    addGuildUpgrade({ type: 'skill-level', skillId });
                  }}
                  className={[
                    'w-full rounded border px-3 py-2 text-left text-sm transition-colors',
                    v?.ok
                      ? 'border-dd-border bg-dd-panel2 text-dd-text hover:border-cyan-400'
                      : 'border-dd-border bg-dd-panel2 text-dd-muted cursor-not-allowed opacity-60',
                  ].join(' ')}
                  data-testid={`guild-upgrade-skill-${skillId}`}
                >
                  <span className="font-semibold">
                    {skill?.name ?? skillId}{' '}
                    <span className="text-[11px] text-dd-muted">
                      {ROMAN[from]} → {ROMAN[Math.min(3, from + 1)]}
                      {getPermanentSkillLevel(hero, skillId) !== from && '（含待提交）'}
                    </span>
                    <span className="ml-1.5 text-[10px] text-dd-warn">
                      {GUILD_UPGRADE_COSTS.skillLevel.xp} XP +{' '}
                      {GUILD_UPGRADE_COSTS.skillLevel.gold} Gold
                    </span>
                  </span>
                  {!v?.ok && v?.reason && (
                    <span className="block text-[11px] text-red-400">{v.reason}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 待提交列表 */}
        <div className="mb-3 rounded border border-dd-border bg-dd-panel2 p-2.5">
          <div className="text-xs font-bold text-dd-text mb-1">
            待提交（{choices.length}/{session.maxUpgrades}）
          </div>
          {choices.length === 0 ? (
            <p className="text-[11px] text-dd-muted">尚未选择任何升级。</p>
          ) : (
            <ul className="space-y-1">
              {choices.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between text-[11px] text-dd-text"
                >
                  <span>
                    {c.type === 'hero-level'
                      ? `英雄等级 ${ROMAN[c.fromLevel]} → ${ROMAN[c.toLevel]}`
                      : `技能「${getSkillById(c.skillId ?? '')?.name ?? c.skillId}」 ${ROMAN[c.fromLevel]} → ${ROMAN[c.toLevel]}`}
                    <span className="ml-1 text-dd-muted">
                      （-{c.xpCost} XP，-{c.goldCost} Gold）
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      removeGuildUpgrade(c.id);
                    }}
                    className="text-dd-muted hover:text-red-400 px-1"
                    data-testid={`guild-remove-${c.id}`}
                  >
                    移除
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-1.5 text-[11px] text-dd-muted">
            合计 <span className="text-sky-400 font-bold">-{totals.xp} XP</span>，
            <span className="text-dd-warn font-bold"> -{totals.gold} Gold</span>
          </div>
        </div>

        {error && (
          <p className="mb-2 text-[11px] text-red-400" data-testid="guild-error">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            disabled={choices.length === 0}
            onClick={onCommit}
            className={[
              'flex-1 rounded px-3 py-2 text-sm font-semibold transition-colors',
              choices.length > 0
                ? 'bg-dd-accent text-white hover:brightness-110'
                : 'bg-dd-panel2 text-dd-muted cursor-not-allowed',
            ].join(' ')}
            data-testid="guild-commit"
          >
            确认升级
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded border border-dd-border bg-dd-panel2 px-3 py-2 text-sm text-dd-muted hover:text-dd-text transition-colors"
            data-testid="guild-cancel"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
