// Phase 8A 单元测试：Quirk 数据、前置修正器、后置反应（Rule Event）、
// 获取状态机（上限 3 / 替换决策 / Madness Death）、Abbey 移除、存档迁移 v4→v5。
// 随机源统一通过 setRandomSource 注入（可回放）。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CampaignState } from '../types';
import { createNewCampaign, selectParty, applyDefaultLoadout, selectQuest } from './campaign';
import { setRandomSource } from './random';
import { ALL_QUIRKS, NEGATIVE_QUIRKS, POSITIVE_QUIRKS, normalizeQuirkId } from '../data/quirks';
import {
  applyQuirkModifiers,
  getQuirkSpeedBonus,
  getResolveTestThresholdDelta,
} from './quirk-passives';
import {
  MAX_RULE_EVENT_DEPTH,
  QUIRK_CAP,
  acquireQuirk,
  createRuleEventContext,
  emitPartyRuleEvent,
  emitRuleEvent,
  firstPendingQuirkDecision,
  removeQuirkFromHero,
  resolveQuirkDecision,
} from './quirks';
import { applyStress, recoverStress } from './stress';
import { resolveDamage } from './damage';
import { resolveHealing } from './healing';
import { performResolveTest } from './resolve-test';
import { convertResolveStatesAtQuestEnd } from './resolve-conversion';
import {
  buildingVisitError,
  abbeyRemoveQuirkError,
  visitAbbey,
  visitHamletBuilding,
  startHamletPhase,
} from './hamlet';
import { finishQuest } from './quest-result';
import { migrateSaveFile, SAVE_VERSION, clearCampaign } from './save';

const FOUR_HEROES = ['crusader', 'vestal', 'highwayman', 'hellion'];

/** 已进入地牢探索的新战役。 */
function freshCampaign(questId = 'scout-ahead'): CampaignState {
  return selectQuest(applyDefaultLoadout(selectParty(createNewCampaign(), FOUR_HEROES)), questId);
}

/** 测试专用：直接给某个英雄挂上 Quirk（绕过状态机，仅用于构造前置条件）。 */
function withQuirks(
  c: CampaignState,
  index: number,
  quirks: { pos?: string[]; neg?: string[] }
): CampaignState {
  return {
    ...c,
    heroes: c.heroes.map((h, i) =>
      i === index
        ? { ...h, positiveQuirkIds: quirks.pos ?? [], negativeQuirkIds: quirks.neg ?? [] }
        : h
    ),
  };
}

/** d10 掷出 r（1..10）所需的随机值。 */
const roll = (r: number): number => (r - 1) / 10;

beforeEach(() => {
  clearCampaign();
  setRandomSource(() => 0);
});
afterEach(() => {
  setRandomSource(null);
});

// ---------------------------------------------------------------------------
// 一、Quirk 数据完整性
// ---------------------------------------------------------------------------

describe('Quirk 数据', () => {
  it('1. 共 35 个 Quirk（18 负面 + 17 正面），id 唯一且极性正确', () => {
    expect(NEGATIVE_QUIRKS).toHaveLength(18);
    expect(POSITIVE_QUIRKS).toHaveLength(17);
    expect(ALL_QUIRKS).toHaveLength(35);
    expect(new Set(ALL_QUIRKS.map((q) => q.id)).size).toBe(35);
    expect(NEGATIVE_QUIRKS.every((q) => q.polarity === 'negative')).toBe(true);
    expect(POSITIVE_QUIRKS.every((q) => q.polarity === 'positive')).toBe(true);
    // 每个 Quirk 至少有一种效果承载（modifier / reaction / statModifier）
    for (const q of ALL_QUIRKS) {
      const hasEffect =
        (q.modifiers?.length ?? 0) > 0 ||
        (q.reactions?.length ?? 0) > 0 ||
        q.statModifiers !== undefined;
      expect(hasEffect, `${q.id} 缺少效果定义`).toBe(true);
    }
  });

  it('2. normalizeQuirkId：Phase 7 占位 id 迁移为真实 id，未知 id 返回 null', () => {
    expect(normalizeQuirkId('quirk_pos_hard_skinned')).toBe('hard_skinned');
    expect(normalizeQuirkId('quirk_neg_paranoid')).toBe('fear_of_the_unknown');
    expect(normalizeQuirkId('quirk_pos_steady')).toBe('balanced');
    expect(normalizeQuirkId('nervous')).toBe('nervous');
    expect(normalizeQuirkId('not_a_quirk')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 二、前置修正器（只调数值，不派生事件）
// ---------------------------------------------------------------------------

describe('Quirk 前置修正器', () => {
  it('3. stress-applied：Nervous +1 / Resilient -1，同时拥有相互抵消', () => {
    const c = withQuirks(freshCampaign(), 0, { neg: ['nervous'] });
    const cId = c.heroes[0].instanceId;
    const cOut = applyStress(c, { heroId: cId, amount: 2, sourceType: 'debug', questId: 'q' }).campaign;
    expect(cOut.heroes[0].stress).toBe(3);

    const c2 = withQuirks(freshCampaign(), 0, { pos: ['resilient'] });
    const c2Id = c2.heroes[0].instanceId;
    const c2Out = applyStress(c2, { heroId: c2Id, amount: 2, sourceType: 'debug', questId: 'q' }).campaign;
    expect(c2Out.heroes[0].stress).toBe(1);

    const c3 = withQuirks(freshCampaign(), 0, { pos: ['resilient'], neg: ['nervous'] });
    const c3Id = c3.heroes[0].instanceId;
    const c3Out = applyStress(c3, { heroId: c3Id, amount: 2, sourceType: 'debug', questId: 'q' }).campaign;
    expect(c3Out.heroes[0].stress).toBe(2);
  });

  it('4. 光照条件：Light Sensitive 仅在光照 ≥6 生效，Night Owl 仅在光照 ≤2 生效', () => {
    const base = withQuirks(freshCampaign(), 0, { neg: ['light_sensitive'] });
    const baseId = base.heroes[0].instanceId;

    const bright = applyStress({ ...base, light: 8 }, {
      heroId: baseId, amount: 2, sourceType: 'debug', questId: 'q',
    }).campaign;
    expect(bright.heroes[0].stress).toBe(3);

    const dark = applyStress({ ...base, light: 1 }, {
      heroId: baseId, amount: 2, sourceType: 'debug', questId: 'q',
    }).campaign;
    expect(dark.heroes[0].stress).toBe(2);

    const owl = withQuirks(freshCampaign(), 0, { pos: ['night_owl'] });
    const owlId = owl.heroes[0].instanceId;
    const owlDark = applyStress({ ...owl, light: 2 }, {
      heroId: owlId, amount: 2, sourceType: 'debug', questId: 'q',
    }).campaign;
    expect(owlDark.heroes[0].stress).toBe(1);
    const owlBright = applyStress({ ...owl, light: 5 }, {
      heroId: owlId, amount: 2, sourceType: 'debug', questId: 'q',
    }).campaign;
    expect(owlBright.heroes[0].stress).toBe(2);
  });

  it('5. stress-recovered：Stress Faster +1，Nocturnal（光照 ≥5）-1', () => {
    let c = withQuirks(freshCampaign(), 0, { pos: ['stress_faster'] });
    const cId = c.heroes[0].instanceId;
    c = { ...c, heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, stress: 8 } : h)) };
    c = recoverStress(c, { heroId: cId, amount: 2, sourceType: 'debug', questId: 'q' }).campaign;
    expect(c.heroes[0].stress).toBe(5); // 8 - (2+1)

    let n = withQuirks(freshCampaign(), 0, { neg: ['nocturnal'] });
    const nId = n.heroes[0].instanceId;
    n = { ...n, light: 6, heroes: n.heroes.map((h, i) => (i === 0 ? { ...h, stress: 8 } : h)) };
    n = recoverStress(n, { heroId: nId, amount: 2, sourceType: 'debug', questId: 'q' }).campaign;
    expect(n.heroes[0].stress).toBe(7); // 8 - (2-1)
  });

  it('6. damage-taken：Fragile +1 / Hard Skinned -1；完全抵消时不扣血', () => {
    const f = withQuirks(freshCampaign(), 0, { neg: ['fragile'] });
    const fId = f.heroes[0].instanceId;
    const maxLife = f.heroes[0].maxLife;
    const fOut = resolveDamage(f, { targetId: fId, amount: 2, sourceType: 'exploration', eventId: 'e1' }).campaign;
    expect(maxLife - fOut.heroes[0].wounds).toBe(maxLife - 3);

    const h = withQuirks(freshCampaign(), 0, { pos: ['hard_skinned'] });
    const hId = h.heroes[0].instanceId;
    const hOut = resolveDamage(h, { targetId: hId, amount: 2, sourceType: 'exploration', eventId: 'e2' }).campaign;
    expect(maxLife - hOut.heroes[0].wounds).toBe(maxLife - 1);

    // 1 点伤害被 Hard Skinned 完全抵消
    const z = withQuirks(freshCampaign(), 0, { pos: ['hard_skinned'] });
    const zId = z.heroes[0].instanceId;
    const out = resolveDamage(z, { targetId: zId, amount: 1, sourceType: 'exploration', eventId: 'e3' });
    expect(z.heroes[0].wounds).toBe(0);
    expect(out.resolution.enteredDeathsDoor).toBe(false);
  });

  it('7. 伤害来源条件：Clumsy 只增加 trap 伤害，不影响 exploration', () => {
    const base = withQuirks(freshCampaign(), 0, { neg: ['clumsy'] });
    const id = base.heroes[0].instanceId;
    const maxLife = base.heroes[0].maxLife;

    const trap = resolveDamage(base, { targetId: id, amount: 2, sourceType: 'trap', eventId: 't1' }).campaign;
    expect(maxLife - trap.heroes[0].wounds).toBe(maxLife - 3);

    const expl = resolveDamage(base, { targetId: id, amount: 2, sourceType: 'exploration', eventId: 't2' }).campaign;
    expect(maxLife - expl.heroes[0].wounds).toBe(maxLife - 2);
  });

  it('8. healing-received：Fast Healer +1 / Infirm -1；抵消为 0 时不治疗', () => {
    const wound = (c: CampaignState): CampaignState => ({
      ...c,
      heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, wounds: 5 } : h)),
    });

    const fastC = wound(withQuirks(freshCampaign(), 0, { pos: ['fast_healer'] }));
    const fastId = fastC.heroes[0].instanceId;
    const fast = resolveHealing(fastC, fastId, 2).campaign;
    expect(fast.heroes[0].wounds).toBe(2); // 5 - 3

    const infirmC = wound(withQuirks(freshCampaign(), 0, { neg: ['infirm'] }));
    const infirmId = infirmC.heroes[0].instanceId;
    const infirm = resolveHealing(infirmC, infirmId, 2).campaign;
    expect(infirm.heroes[0].wounds).toBe(4); // 5 - 1

    const canceledC = wound(withQuirks(freshCampaign(), 0, { neg: ['infirm'] }));
    const canceledId = canceledC.heroes[0].instanceId;
    const canceled = resolveHealing(canceledC, canceledId, 1);
    expect(canceled.campaign.heroes[0].wounds).toBe(5);
    expect(canceled.resolution.healed).toBe(0);
  });

  it('9. resolve-test 阈值：Balanced +1 更易 Virtue，Mercurial -1 更难', () => {
    const stressed = (c: CampaignState): CampaignState => ({
      ...c,
      heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, stress: 10 } : h)),
    });

    const bal = stressed(withQuirks(freshCampaign(), 0, { pos: ['balanced'] }));
    const balId = bal.heroes[0].instanceId;
    expect(getResolveTestThresholdDelta(bal, balId)).toBe(1);
    setRandomSource(() => roll(3)); // d10 = 3：默认阈值 2 会失败，Balanced 阈值 3 成功
    const balOut = performResolveTest(bal, balId);
    expect(balOut.result?.virtueThreshold).toBe(3);
    expect(balOut.result?.outcome).toBe('virtue');

    const mer = stressed(withQuirks(freshCampaign(), 0, { neg: ['mercurial'] }));
    const merId = mer.heroes[0].instanceId;
    expect(getResolveTestThresholdDelta(mer, merId)).toBe(-1);
    setRandomSource(() => roll(2)); // d10 = 2：默认阈值 2 成功，Mercurial 阈值 1 失败
    const merOut = performResolveTest(mer, merId);
    expect(merOut.result?.virtueThreshold).toBe(1);
    expect(merOut.result?.outcome).toBe('affliction');
  });

  it('10. 速度静态修正：Quick Reflexes +1 / Slow Reflexes -1，可叠加', () => {
    expect(getQuirkSpeedBonus({ positiveQuirkIds: ['quick_reflexes'], negativeQuirkIds: [] })).toBe(1);
    expect(getQuirkSpeedBonus({ positiveQuirkIds: [], negativeQuirkIds: ['slow_reflexes'] })).toBe(-1);
    expect(
      getQuirkSpeedBonus({ positiveQuirkIds: ['quick_reflexes'], negativeQuirkIds: ['slow_reflexes'] })
    ).toBe(0);
  });

  it('11. 死亡英雄不接受任何修正；未知 Quirk id 被忽略', () => {
    let c = withQuirks(freshCampaign(), 0, { neg: ['nervous', 'not_a_quirk'] });
    const id = c.heroes[0].instanceId;
    expect(applyQuirkModifiers(c, id, 'stress-applied', 2).amount).toBe(3);
    c = { ...c, heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, dead: true, isAlive: false } : h)) };
    expect(applyQuirkModifiers(c, id, 'stress-applied', 2).amount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// 三、后置反应（Rule Event）
// ---------------------------------------------------------------------------

describe('Quirk 后置反应与 Rule Event', () => {
  it('12. hamlet-arrived：Bad Gambler -3 Gold / Skilled Gambler +3 Gold（走统一管线）', () => {
    const bad = withQuirks(freshCampaign(), 0, { neg: ['bad_gambler'] });
    const afterBad = emitPartyRuleEvent(bad, 'hamlet-arrived', createRuleEventContext());
    expect(afterBad.gold).toBe(bad.gold - 3);

    const good = withQuirks(freshCampaign(), 0, { pos: ['skilled_gambler'] });
    const afterGood = emitPartyRuleEvent(good, 'hamlet-arrived', createRuleEventContext());
    expect(afterGood.gold).toBe(good.gold + 3);
  });

  it('13. scout-attempted：Fear of the Unknown 自身 Stress +1，且与修正器叠加', () => {
    const c = withQuirks(freshCampaign(), 0, { neg: ['fear_of_the_unknown'] });
    const after = emitRuleEvent(c, { type: 'scout-attempted', heroId: c.heroes[0].instanceId });
    expect(after.heroes[0].stress).toBe(1);

    // 同时拥有 Nervous：派生的 Stress 也经过 stress-applied 修正器
    const both = withQuirks(freshCampaign(), 0, { neg: ['fear_of_the_unknown', 'nervous'] });
    const after2 = emitRuleEvent(both, { type: 'scout-attempted', heroId: both.heroes[0].instanceId });
    expect(after2.heroes[0].stress).toBe(2);
  });

  it('14. quest-completed：Hoarder +5 Gold；battle-started：Shocker 只给队友加压', () => {
    const hoard = withQuirks(freshCampaign(), 0, { pos: ['hoarder'] });
    const afterHoard = emitPartyRuleEvent(hoard, 'quest-completed', createRuleEventContext());
    expect(afterHoard.gold).toBe(hoard.gold + 5);

    const shock = withQuirks(freshCampaign(), 0, { neg: ['shocker'] });
    const afterShock = emitPartyRuleEvent(shock, 'battle-started', createRuleEventContext());
    expect(afterShock.heroes[0].stress).toBe(0);
    expect(afterShock.heroes[1].stress).toBe(1);
    expect(afterShock.heroes[2].stress).toBe(1);
    expect(afterShock.heroes[3].stress).toBe(1);
  });

  it('15. chanceD10 使用可注入 RNG：Stress Eater（≤3）命中与未命中', () => {
    const c = withQuirks(freshCampaign(), 0, { neg: ['stress_eater'] });
    const food = c.provisions.food;

    setRandomSource(() => roll(2)); // d10 = 2 ≤ 3 → 命中
    const hit = emitRuleEvent(c, { type: 'room-entered', heroId: c.heroes[0].instanceId });
    expect(hit.provisions.food).toBe(food - 1);

    setRandomSource(() => roll(9)); // d10 = 9 > 3 → 未命中
    const miss = emitRuleEvent(c, { type: 'room-entered', heroId: c.heroes[0].instanceId });
    expect(miss.provisions.food).toBe(food);
  });

  it('16. 循环保护：同一 Quirk 在同一根事件内最多触发一次', () => {
    const c = withQuirks(freshCampaign(), 0, { neg: ['bad_gambler'] });
    const ctx = createRuleEventContext();
    let next = emitRuleEvent(c, { type: 'hamlet-arrived', heroId: c.heroes[0].instanceId }, ctx);
    next = emitRuleEvent(next, { type: 'hamlet-arrived', heroId: c.heroes[0].instanceId }, ctx);
    expect(next.gold).toBe(c.gold - 3); // 只扣一次

    // 新的根事件可以再次触发
    const next2 = emitRuleEvent(next, { type: 'hamlet-arrived', heroId: c.heroes[0].instanceId });
    expect(next2.gold).toBe(c.gold - 6);
  });

  it('17. 深度保护：超过 MAX_RULE_EVENT_DEPTH 时丢弃并写开发日志', () => {
    const c = withQuirks(freshCampaign(), 0, { neg: ['bad_gambler'] });
    const deep = { ...createRuleEventContext(), depth: MAX_RULE_EVENT_DEPTH };
    const next = emitRuleEvent(c, { type: 'hamlet-arrived', heroId: c.heroes[0].instanceId }, deep);
    expect(next.gold).toBe(c.gold);
    expect(next.log[next.log.length - 1].message).toContain('派生深度超限');
  });

  it('18. 死亡英雄不触发反应；无对应 Quirk 时状态对象不变', () => {
    let c = withQuirks(freshCampaign(), 0, { neg: ['bad_gambler'] });
    c = { ...c, heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, dead: true, isAlive: false } : h)) };
    expect(emitPartyRuleEvent(c, 'hamlet-arrived', createRuleEventContext())).toBe(c);

    const clean = freshCampaign();
    expect(emitPartyRuleEvent(clean, 'hamlet-arrived', createRuleEventContext())).toBe(clean);
  });

  it('19. 场景接入：startHamletPhase 会发射 hamlet-arrived', () => {
    let c = freshCampaign();
    c = withQuirks(c, 0, { pos: ['skilled_gambler'] });
    c = { ...c, dungeon: { ...c.dungeon!, objectiveComplete: true, roomsCleared: 2 } };
    const resolved = finishQuest(c, 'left');
    const goldBefore = resolved.gold;
    const hamlet = startHamletPhase(resolved);
    expect(hamlet.gamePhase).toBe('hamlet');
    expect(hamlet.gold).toBe(goldBefore + 3);
  });
});

// ---------------------------------------------------------------------------
// 四、Quirk 获取状态机
// ---------------------------------------------------------------------------

describe('Quirk 获取状态机（上限 3）', () => {
  it('20. 未达上限直接加入；重复获取为 duplicate（无副作用）', () => {
    const c = freshCampaign();
    const id = c.heroes[0].instanceId;
    const first = acquireQuirk(c, id, 'balanced', { source: 'debug' });
    expect(first.outcome).toBe('added');
    expect(first.campaign.heroes[0].positiveQuirkIds).toEqual(['balanced']);

    const again = acquireQuirk(first.campaign, id, 'balanced', { source: 'debug' });
    expect(again.outcome).toBe('duplicate');
    expect(again.campaign.heroes[0].positiveQuirkIds).toEqual(['balanced']);
  });

  it('21. 已满 + 新 Positive（有 Positive 可换）→ 决策，可放弃', () => {
    const c = withQuirks(freshCampaign(), 0, { pos: ['balanced', 'clotter'], neg: ['nervous'] });
    const id = c.heroes[0].instanceId;
    const out = acquireQuirk(c, id, 'hoarder', { source: 'debug' });
    expect(out.outcome).toBe('decision-pending');
    const d = firstPendingQuirkDecision(out.campaign)!;
    expect(d.canDiscardIncoming).toBe(true);
    expect(d.replaceableQuirkIds).toEqual(['balanced', 'clotter']);
    // 决策未结算前不改变英雄 Quirk
    expect(out.campaign.heroes[0].positiveQuirkIds).toEqual(['balanced', 'clotter']);
  });

  it('22. 已满且全是 Negative + 新 Positive → 自动放弃（discarded）', () => {
    const c = withQuirks(freshCampaign(), 0, { neg: ['nervous', 'fragile', 'clumsy'] });
    const id = c.heroes[0].instanceId;
    const out = acquireQuirk(c, id, 'hoarder', { source: 'debug' });
    expect(out.outcome).toBe('discarded');
    expect(out.campaign.heroes[0].positiveQuirkIds).toEqual([]);
    expect(out.campaign.pendingQuirkDecisions).toHaveLength(0);
  });

  it('23. 已满 + 新 Negative（有 Positive）→ 必须替换，不可放弃', () => {
    const c = withQuirks(freshCampaign(), 0, { pos: ['balanced'], neg: ['nervous', 'fragile'] });
    const id = c.heroes[0].instanceId;
    const out = acquireQuirk(c, id, 'clumsy', { source: 'debug' });
    expect(out.outcome).toBe('decision-pending');
    const d = firstPendingQuirkDecision(out.campaign)!;
    expect(d.canDiscardIncoming).toBe(false);
    expect(d.replaceableQuirkIds).toEqual(['balanced']);
    // 非法的放弃请求被拒绝（状态不变）
    expect(resolveQuirkDecision(out.campaign, d.id, { action: 'discard-incoming' })).toBe(out.campaign);
  });

  it('24. 3 个 Negative + 第 4 个 Negative → Madness Death（绕过 Death\u0027s Door）', () => {
    const c = withQuirks(freshCampaign(), 0, { neg: ['nervous', 'fragile', 'clumsy'] });
    const id = c.heroes[0].instanceId;
    const before = c.heroes[0].deathblowRollCount;
    const out = acquireQuirk(c, id, 'soft', { source: 'debug', deathSource: 'quest-result', deathResumePhase: 'quest-result' });
    expect(out.outcome).toBe('madness-death');
    const hero = out.campaign.heroes[0];
    expect(hero.dead).toBe(true);
    expect(hero.isAlive).toBe(false);
    expect(hero.atDeathsDoor).toBe(false);
    expect(hero.deathblowRollCount).toBe(before); // 没有掷 Deathblow
    const record = out.campaign.deathRecords[out.campaign.deathRecords.length - 1];
    expect(record.cause).toBe('madness');
    expect(record.campaignHeroId).toBe(id);
    // 第 4 个 Negative 未被加入
    expect(hero.negativeQuirkIds).toEqual(['nervous', 'fragile', 'clumsy']);
    expect(out.campaign.mentalEvents.some((e) => e.type === 'madness-death')).toBe(true);
  });

  it('25. resolveQuirkDecision：replace 移除旧的加入新的，且幂等', () => {
    const c = withQuirks(freshCampaign(), 0, { pos: ['balanced', 'clotter'], neg: ['nervous'] });
    const id = c.heroes[0].instanceId;
    const pending = acquireQuirk(c, id, 'hoarder', { source: 'debug' }).campaign;
    const d = firstPendingQuirkDecision(pending)!;

    const done = resolveQuirkDecision(pending, d.id, { action: 'replace', removeQuirkId: 'balanced' });
    const hero = done.heroes[0];
    expect(hero.positiveQuirkIds).toEqual(['clotter', 'hoarder']);
    expect(hero.negativeQuirkIds).toEqual(['nervous']);
    expect(hero.positiveQuirkIds.length + hero.negativeQuirkIds.length).toBe(QUIRK_CAP);
    expect(firstPendingQuirkDecision(done)).toBeNull();

    // 幂等：已结算的决策再次提交无效
    expect(resolveQuirkDecision(done, d.id, { action: 'replace', removeQuirkId: 'clotter' })).toBe(done);
    // 非法的替换目标被拒绝
    const pending2 = acquireQuirk(done, id, 'evasive', { source: 'debug' }).campaign;
    const d2 = firstPendingQuirkDecision(pending2)!;
    expect(resolveQuirkDecision(pending2, d2.id, { action: 'replace', removeQuirkId: 'nervous' })).toBe(pending2);
  });

  it('26. resolveQuirkDecision：discard-incoming 放弃新 Quirk，不改变既有 Quirk', () => {
    const c = withQuirks(freshCampaign(), 0, { pos: ['balanced', 'clotter'], neg: ['nervous'] });
    const id = c.heroes[0].instanceId;
    const pending = acquireQuirk(c, id, 'hoarder', { source: 'debug' }).campaign;
    const d = firstPendingQuirkDecision(pending)!;
    const done = resolveQuirkDecision(pending, d.id, { action: 'discard-incoming' });
    expect(done.heroes[0].positiveQuirkIds).toEqual(['balanced', 'clotter']);
    expect(done.heroes[0].negativeQuirkIds).toEqual(['nervous']);
    expect(firstPendingQuirkDecision(done)).toBeNull();
  });

  it('27. removeQuirkFromHero：移除存在的 Quirk，不存在时 no-op', () => {
    const c = withQuirks(freshCampaign(), 0, { pos: ['balanced'], neg: ['nervous'] });
    const id = c.heroes[0].instanceId;
    const removed = removeQuirkFromHero(c, id, 'nervous');
    expect(removed.heroes[0].negativeQuirkIds).toEqual([]);
    expect(removed.heroes[0].positiveQuirkIds).toEqual(['balanced']);
    expect(removeQuirkFromHero(c, id, 'hoarder')).toBe(c);
  });

  it('28. Quest 结束 Resolve 转换发放真实 Quirk（受上限约束）', () => {
    let c = freshCampaign();
    const id = c.heroes[0].instanceId;
    c = {
      ...c,
      heroes: c.heroes.map((h, i) =>
        i === 0 ? { ...h, resolveState: 'virtuous' as const, virtueId: 'focused', stress: 0 } : h
      ),
    };
    const after = convertResolveStatesAtQuestEnd(c);
    const hero = after.heroes[0];
    expect(hero.resolveState).toBe('normal');
    const granted = [...hero.positiveQuirkIds, ...hero.negativeQuirkIds];
    expect(granted).toHaveLength(1);
    expect(ALL_QUIRKS.some((q) => q.id === granted[0])).toBe(true);
    expect(POSITIVE_QUIRKS.some((q) => q.id === granted[0])).toBe(true);
    // 幂等：重复调用不再发放
    const again = convertResolveStatesAtQuestEnd(after);
    expect([...again.heroes[0].positiveQuirkIds, ...again.heroes[0].negativeQuirkIds]).toHaveLength(1);
    expect(id).toBe(after.heroes[0].instanceId);
  });
});

// ---------------------------------------------------------------------------
// 五、Abbey（移除 Quirk）
// ---------------------------------------------------------------------------

describe('Abbey 移除 Quirk', () => {
  /** 进入 Hamlet 且 Caretaker 不阻塞 Abbey 的战役。 */
  function hamletCampaign(): CampaignState {
    let c = freshCampaign();
    c = { ...c, dungeon: { ...c.dungeon!, objectiveComplete: true, roomsCleared: 2 } };
    c = startHamletPhase(finishQuest(c, 'left'));
    return { ...c, hamlet: { ...c.hamlet, caretakerBlockedBuildingId: null } };
  }

  it('29. 无 Quirk 时不可访问；visitHamletBuilding 无法直接结算 Abbey', () => {
    const c = hamletCampaign();
    const id = c.heroes[0].instanceId;
    expect(buildingVisitError(c, id, 'abbey')).toBe('该英雄没有可移除的怪癖');
    expect(visitHamletBuilding(c, id, 'abbey')).toBe(c);
  });

  it('30. visitAbbey：移除指定 Quirk、扣 Gold、标记已行动并占用建筑', () => {
    let c = hamletCampaign();
    c = withQuirks(c, 0, { pos: ['balanced'], neg: ['nervous'] });
    c = { ...c, gold: 20 };
    const id = c.heroes[0].instanceId;
    expect(abbeyRemoveQuirkError(c, id, 'nervous')).toBeNull();
    expect(abbeyRemoveQuirkError(c, id, 'hoarder')).toBe('该英雄没有这个怪癖');

    const after = visitAbbey(c, id, 'nervous');
    expect(after.heroes[0].negativeQuirkIds).toEqual([]);
    expect(after.heroes[0].positiveQuirkIds).toEqual(['balanced']);
    expect(after.gold).toBe(16); // Abbey 花费 4
    expect(after.heroes[0].hasActedToday).toBe(true);
    expect(after.hamlet.occupiedBuildingIds).toContain('abbey');
    // 同一天不能重复使用
    expect(visitAbbey(after, id, 'balanced')).toBe(after);
  });

  it('31. Gold 不足时不产生任何消费', () => {
    let c = hamletCampaign();
    c = withQuirks(c, 0, { neg: ['nervous'] });
    c = { ...c, gold: 1 };
    const id = c.heroes[0].instanceId;
    expect(abbeyRemoveQuirkError(c, id, 'nervous')).toBe('Gold 不足');
    expect(visitAbbey(c, id, 'nervous')).toBe(c);
  });
});

// ---------------------------------------------------------------------------
// 六、存档迁移 v4 → v5
// ---------------------------------------------------------------------------

describe('存档迁移 v4 → v5', () => {
  it('32. 归一化旧 Quirk id、去重、裁剪到上限并初始化决策队列', () => {
    const modern = freshCampaign();
    const legacyCampaign = {
      ...modern,
      saveVersion: 4,
      pendingQuirkDecisions: undefined,
      heroes: modern.heroes.map((h, i) =>
        i === 0
          ? {
              ...h,
              // 旧占位 id + 重复 + 超出上限 + 未知 id
              positiveQuirkIds: ['quirk_pos_hard_skinned', 'hard_skinned', 'quirk_pos_quick_reflexes'],
              negativeQuirkIds: ['quirk_neg_nervous', 'quirk_neg_fragile', 'ghost_quirk'],
            }
          : h
      ),
    };
    delete (legacyCampaign as Record<string, unknown>).pendingQuirkDecisions;

    const migrated = migrateSaveFile({
      version: 4,
      savedAt: new Date().toISOString(),
      gamePhase: modern.gamePhase,
      campaign: legacyCampaign,
      dungeon: modern.dungeon,
      battle: null,
      questResult: null,
      hamlet: modern.hamlet,
    });

    expect(migrated).not.toBeNull();
    const c = migrated!.campaign;
    expect(migrated!.version).toBe(SAVE_VERSION);
    expect(c.saveVersion).toBe(SAVE_VERSION);
    expect(c.pendingQuirkDecisions).toEqual([]);

    const hero = c.heroes[0];
    const all = [...hero.positiveQuirkIds, ...hero.negativeQuirkIds];
    expect(all.length).toBeLessThanOrEqual(QUIRK_CAP);
    expect(new Set(all).size).toBe(all.length); // 去重
    expect(all.every((id) => ALL_QUIRKS.some((q) => q.id === id))).toBe(true); // 无未知 id
    expect(hero.positiveQuirkIds).toContain('hard_skinned');
  });
});
