import { Navigate, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useGameStore } from '../store/useGameStore';
import { getHeroById } from '../data/heroes';
import { getSkillsByHero } from '../data/skills';
import { isLoadoutComplete } from '../game-engine/campaign';
import HeroCard from '../components/hero/HeroCard';
import SkillCard from '../components/skill/SkillCard';

export default function SkillLoadoutPage() {
  const navigate = useNavigate();
  const campaign = useGameStore((s) => s.campaign);
  const equipSkill = useGameStore((s) => s.equipSkill);
  const applyDefaultLoadout = useGameStore((s) => s.applyDefaultLoadout);
  const proceedToQuests = useGameStore((s) => s.proceedToQuests);

  const [activeIdx, setActiveIdx] = useState(0);

  if (!campaign) return <Navigate to="/" replace />;
  if (campaign.heroes.length < 4) return <Navigate to="/setup" replace />;

  const heroes = campaign.heroes;
  const idx = Math.min(activeIdx, heroes.length - 1);
  const active = heroes[idx];
  const def = getHeroById(active.heroId);
  const allSkills = def ? getSkillsByHero(def.id) : [];
  const canProceed = isLoadoutComplete(campaign);

  const onContinue = () => {
    if (!canProceed) return;
    proceedToQuests();
    navigate('/quests');
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-dd-text mb-1">技能配置</h1>
      <p className="text-dd-muted text-sm mb-4">
        每名英雄需装备恰好 3 个技能。已配置：
        {heroes.filter((h) => h.equippedSkillIds.length === 3).length} / 4。
      </p>

      {/* 英雄切换 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {heroes.map((h, i) => {
          return (
            <button
              key={h.instanceId}
              onClick={() => setActiveIdx(i)}
              className={[
                'px-3 py-1.5 rounded border text-sm transition-colors',
                i === idx
                  ? 'border-dd-accent bg-dd-accent/20 text-dd-text'
                  : 'border-dd-border text-dd-muted hover:text-dd-text',
              ].join(' ')}
            >
              {h.name}
              <span className="ml-1 text-[11px] text-dd-warn">
                {h.equippedSkillIds.length}/3
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid md:grid-cols-[260px_1fr] gap-6">
        <HeroCard
          name={active.name}
          color={def?.color ?? '#463b34'}
          life={active.maxLife}
          wounds={active.wounds}
          stress={active.stress}
          speed={active.speed}
          stance={active.stance}
          tags={def?.tags}
          selected
          footer={
            <div className="text-[11px] text-dd-muted">
              已装备 {active.equippedSkillIds.length} / 3
            </div>
          }
        />

        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-dd-text">{active.name} 的可用技能</h2>
            <button
              onClick={applyDefaultLoadout}
              className="px-3 py-1.5 rounded border border-dd-border text-sm text-dd-text hover:bg-dd-panel2 transition-colors"
            >
              使用默认配置（全部英雄）
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {allSkills.map((skill) => {
              const equipped = active.equippedSkillIds.includes(skill.id);
              const full = active.equippedSkillIds.length >= 3 && !equipped;
              return (
                <SkillCard
                  key={skill.id}
                  skill={skill}
                  equipped={equipped}
                  disabled={full}
                  onClick={() => equipSkill(active.heroId, skill.id)}
                />
              );
            })}
          </div>
        </div>
      </div>

      <button
        onClick={onContinue}
        disabled={!canProceed}
        className={[
          'mt-6 w-full px-4 py-2 rounded font-semibold transition-colors',
          canProceed
            ? 'bg-dd-accent text-white hover:bg-dd-accent2'
            : 'bg-dd-panel2 text-dd-muted cursor-not-allowed',
        ].join(' ')}
      >
        继续（任务选择）
      </button>
      {!canProceed && (
        <p className="text-xs text-dd-warn mt-2">每名英雄都需装备 3 个技能才能继续。</p>
      )}
    </div>
  );
}
