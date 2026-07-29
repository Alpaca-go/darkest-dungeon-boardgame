import type { BattleUnit } from '../../types';
import { getMonsterById } from '../../data/monsters';

const RULE_LABEL: Record<string, string> = {
  closest: '优先攻击最近的英雄',
  furthest: '优先攻击最远的英雄',
  mostWounded: '优先攻击伤势最重的英雄',
  mostStressed: '优先攻击压力最高的英雄',
  random: '随机选择目标',
};

/** 单位详情面板：展示选中/当前单位的属性与状态。 */
export default function ActorDetails({ unit }: { unit: BattleUnit | null }) {
  if (!unit) {
    return (
      <div className="rounded-lg border border-dd-border bg-dd-panel p-3 text-xs text-dd-muted">
        点击战场上的单位查看详情。
      </div>
    );
  }
  const monster = unit.side === 'monster' ? getMonsterById(unit.sourceId) : undefined;
  return (
    <div className="rounded-lg border border-dd-border bg-dd-panel p-3">
      <h3 className="text-xs font-bold text-dd-text mb-1">
        {unit.name}
        <span className="ml-2 text-[10px] text-dd-muted">{unit.side === 'hero' ? '英雄' : '怪物'} · 位置 {unit.position}</span>
      </h3>
      <ul className="text-[11px] text-dd-muted space-y-0.5">
        <li>
          生命：{Math.max(0, unit.hp)}/{unit.maxHp}
          {!unit.isAlive && <span className="text-red-400 ml-1">（已倒下）</span>}
        </li>
        {unit.side === 'hero' && <li>压力：{unit.stress}</li>}
        <li>速度：{unit.speed}</li>
        {unit.targetRule && <li>AI：{RULE_LABEL[unit.targetRule] ?? unit.targetRule}</li>}
        {monster && <li>技能数：{monster.skillIds.length}</li>}
        {(unit.bleed > 0 || unit.blight > 0 || unit.stunned > 0 || unit.marked) && (
          <li className="text-amber-400">
            状态：
            {unit.bleed > 0 && ` 流血×${unit.bleed}`}
            {unit.blight > 0 && ` 腐蚀×${unit.blight}`}
            {unit.stunned > 0 && ' 眩晕'}
            {unit.marked && ' 被标记'}
          </li>
        )}
      </ul>
    </div>
  );
}
