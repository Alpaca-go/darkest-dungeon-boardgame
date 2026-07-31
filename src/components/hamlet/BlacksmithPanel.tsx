import type { CampaignState, HeroInstance } from '../../types';
import { useGameStore } from '../../store/useGameStore';
import { getSkillById } from '../../data/skills';
import { getHamletBuildingById } from '../../data/hamlet-buildings';
import { blacksmithVisitError } from '../../game-engine/hamlet/blacksmith';
import {
  getEffectiveSkillLevel,
  getPermanentSkillLevel,
} from '../../game-engine/progression/upgrade-core';

const ROMAN = ['', 'I', 'II', 'III'];

/**
 * Phase 8D · Blacksmith 临时 Skill Form 面板。
 *
 * 与 Guild 的永久升级严格区分：
 * - 这里买到的是「临时 Form」，只在下一次任务的战斗中生效；
 * - 不修改 hero.skillLevels，也不写入成长事务记录；
 * - 任务结束即失效，下次进入 Hamlet 时清理。
 */
export default function BlacksmithPanel({
  campaign,
  hero,
  onClose,
}: {
  campaign: CampaignState;
  hero: HeroInstance;
  onClose: () => void;
}) {
  const visitBlacksmith = useGameStore((s) => s.visitBlacksmith);
  const cost = getHamletBuildingById('blacksmith')?.cost ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      data-testid="blacksmith-modal"
    >
      <div className="w-full max-w-md rounded-lg border-2 border-red-500/70 bg-dd-panel p-5 shadow-2xl">
        <div className="text-lg font-bold text-dd-text mb-1">Blacksmith · 临时 Skill Form</div>
        <p className="text-xs text-dd-muted mb-3">
          为 {hero.name} 的一个技能临时提升一级 Form（花费 {cost} Gold）。
          <span className="text-amber-400">
            {' '}
            仅下次任务生效，不改变永久技能等级。
          </span>
        </p>
        <div className="space-y-1.5">
          {hero.equippedSkillIds.map((skillId) => {
            const skill = getSkillById(skillId);
            const err = blacksmithVisitError(campaign, hero.instanceId, skillId);
            const permanent = getPermanentSkillLevel(hero, skillId);
            const effective = getEffectiveSkillLevel(campaign, hero, skillId);
            const disabled = err !== null;
            return (
              <button
                key={skillId}
                type="button"
                disabled={disabled}
                title={err ?? undefined}
                onClick={() => {
                  visitBlacksmith(hero.instanceId, skillId);
                  onClose();
                }}
                className={[
                  'w-full rounded border px-3 py-2 text-left text-sm transition-colors',
                  disabled
                    ? 'border-dd-border bg-dd-panel2 text-dd-muted cursor-not-allowed opacity-60'
                    : 'border-dd-border bg-dd-panel2 text-dd-text hover:border-red-400',
                ].join(' ')}
                data-testid={`blacksmith-skill-${skillId}`}
              >
                <span className="font-semibold">
                  {skill?.name ?? skillId}
                  <span className="ml-1.5 text-[11px] text-dd-muted">
                    永久 {ROMAN[permanent]}
                    {effective > permanent && (
                      <span className="text-amber-400"> · 临时 Form {ROMAN[effective]}</span>
                    )}
                  </span>
                </span>
                {!disabled && (
                  <span className="block text-[11px] text-dd-muted">
                    临时提升到 Form {ROMAN[permanent + 1]}（仅下次任务）
                  </span>
                )}
                {disabled && <span className="block text-[11px] text-red-400">{err}</span>}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded border border-dd-border bg-dd-panel2 px-3 py-1.5 text-sm text-dd-muted hover:text-dd-text transition-colors"
          data-testid="blacksmith-cancel"
        >
          取消
        </button>
      </div>
    </div>
  );
}
