/** Isolated synthetic adapter, never an encounter definition or production spawning path. */
import type { ActiveEffect, BattleUnit } from '../types';
import type { CompactMonsterAction, ProductionMonsterDefinition } from '../data/monsters/production-monster-definition-types';
import type { MonsterRuntimeOperation, ProductionMonsterExecutionAdapter } from '../game-engine/monsters/production-runtime-types';
import { grantTimedProtection, MONSTER_EFFECT_DISPATCH, type TimedProtection } from '../game-engine/monsters/production-runtime-primitives';
import { applyBattleUnitDamage } from '../game-engine/damage';
import { applyBattleUnitHealing } from '../game-engine/healing';
import { resolvePrintedAttackFromRoll } from '../game-engine/combat-resolution';
import { applyEffectsWithResistance, synchronizePrintedConditionTokens } from '../game-engine/status-effects';
import { shuffleAtomicStanceBlocks } from '../game-engine/ruins/stance-shuffle';
import { clampStressValue } from '../game-engine/stress-constants';
import { drawDisease } from '../game-engine/diseases/draw-disease';
import { SeededRandom, getRuntimeSources, withRuntimeSources } from '../game-engine/runtime-sources';

const stances = ['aggressive', 'defensive', 'ranged', 'support'] as const;
function unit(id: string, side: 'hero' | 'monster', position: number): BattleUnit {
  return { id, name: id, side, sourceId: id, maxHp: 100, hp: 80 - position, stress: position,
    position, speed: 3, stance: stances[position - 1], isAlive: true, atDeathsDoor: false,
    deathblowRollCount: 0, stunned: 0, bleed: 0, blight: 0, marked: position === 1,
    buffs: [], debuffs: [], actionPoints: 0, resolveTestedThisQuest: false, resolveState: 'normal',
    virtueId: null, afflictionId: null, mentalEffectResolvedTurnId: null, printedConditionTokens: [] };
}

export class SyntheticMonsterAdapter implements ProductionMonsterExecutionAdapter {
  readonly fixtureAuthority = 'SYNTHETIC_RUNTIME_ONLY';
  heroes = [1, 2, 3, 4].map(i => unit(`hero-${i}`, 'hero', i));
  monsters = [unit('actor', 'monster', 1), unit('ally-1', 'monster', 2), unit('ally-2', 'monster', 3)];
  placements: Record<string, string> = {};
  /** Linear synthetic area coordinates. Spatial behavior is intentionally confined to this harness. */
  coordinates: Record<string, number> = { actor: 0 };
  protection: TimedProtection[] = [];
  guard: Record<string, number> = {};
  riposte: Record<string, number> = {};
  light = 5;
  events: Array<{ kind: string; targetId: string; detail: unknown }> = [];
  infections: Array<{ heroId: string; diseaseId: string }> = [];
  dispatched = new Set<string>();
  random = new SeededRandom(42);
  dodge = 0;
  constructor(readonly definition: ProductionMonsterDefinition, action: CompactMonsterAction) {
    const distance = action.range?.kind === 'EXACT' ? action.range.distance : 0;
    for (const u of [...this.heroes, ...this.monsters]) {
      this.placements[u.id] = u.id === 'actor' ? 'actor-area' : 'target-area';
      this.coordinates[u.id] = u.id === 'actor' ? 0 : distance;
    }
  }
  units() {
    return [...this.heroes, ...this.monsters].map(u => ({ ...u, areaId: this.placements[u.id], guardStacks: this.guard[u.id] ?? 0 }));
  }
  distance(a: string, b: string) { return Math.abs(this.coordinates[a] - this.coordinates[b]); }
  find(id: string) { return [...this.heroes, ...this.monsters].find(u => u.id === id)!; }
  replace(u: BattleUnit) {
    this.heroes = this.heroes.map(old => old.id === u.id ? u : old);
    this.monsters = this.monsters.map(old => old.id === u.id ? u : old);
  }
  snapshot() {
    return JSON.stringify({ heroes: this.heroes, monsters: this.monsters, placements: this.placements,
      coordinates: this.coordinates, protection: this.protection, guard: this.guard, riposte: this.riposte,
      light: this.light, events: this.events, infections: this.infections, dispatched: [...this.dispatched],
      rngCursor: this.random.snapshot() });
  }
  deterministic<T>(work: () => T): T {
    return withRuntimeSources({ ...getRuntimeSources(), random: this.random }, work);
  }
  preflight(operations: readonly MonsterRuntimeOperation[]) {
    for (const op of operations) {
      if (!this.find(op.actorId) || !this.find(op.targetId)) throw new Error('Unbound synthetic unit');
      if (op.kind === 'EFFECT' && !(op.primitiveId in MONSTER_EFFECT_DISPATCH)) throw new Error('Unknown effect dispatch');
    }
  }
  attack(op: Extract<MonsterRuntimeOperation, { kind: 'ATTACK' }>) {
    this.dispatched.add('attack-roll'); this.dispatched.add('damage');
    const target = this.find(op.targetId), actor = this.find(op.actorId);
    if (!target.isAlive) return { hit: false };
    const result = resolvePrintedAttackFromRoll(op.attack, op.roll, this.dodge,
      target.marked ? 1 : 0, actor.buffs.reduce((n, e) => n + e.amount, 0) + target.debuffs.reduce((n, e) => n + e.amount, 0));
    const amount = result.damage + (result.hit && target.marked ? op.markedDamageBonus : 0);
    if (result.hit) this.replace(this.deterministic(() => applyBattleUnitDamage(target, amount).unit));
    this.events.push({ kind: 'ATTACK', targetId: target.id, detail: { ...result, damage: amount } });
    return { hit: result.hit };
  }
  effect(op: Extract<MonsterRuntimeOperation, { kind: 'EFFECT' }>) {
    const p = op.parameters, target = this.find(op.targetId);
    const ids = MONSTER_EFFECT_DISPATCH[op.primitiveId as keyof typeof MONSTER_EFFECT_DISPATCH];
    if (!ids) throw new Error('Unknown primitive');
    ids.forEach(id => this.dispatched.add(id));
    this.events.push({ kind: op.primitiveId, targetId: op.targetId, detail: { parameters: p, effectIndex: op.effectIndex, timing: op.timing } });
    switch (op.primitiveId) {
      case 'markedDamageBonus': break; // Already consumed by ATTACK, matching the printed effect log contract.
      case 'self-wound-sequencing':
        this.replace(applyBattleUnitDamage(target, Number(p.amount)).unit); break;
      case 'timed-protection':
        this.protection = grantTimedProtection(this.protection, op.actorId, target.id, Number(p.turns)); break;
      case 'condition': {
        const effect = { type: p.condition, amount: p.amount, durationTurns: p.turns } as ActiveEffect;
        const resolved = this.deterministic(() => applyEffectsWithResistance(target, [effect]));
        this.replace(resolved.unit);
        const blocked = resolved.blocked[0];
        const turns = blocked?.durationReducedTo ?? (blocked ? 0 : Number(p.turns));
        if (turns > 0) {
          const next = this.find(target.id);
          this.replace(synchronizePrintedConditionTokens({ ...next, printedConditionTokens: [...(next.printedConditionTokens ?? []), {
            eventId: `synthetic:${this.events.length}`, type: String(p.condition),
            magnitude: { presence: 'PRINTED_VALUE', value: Number(p.amount) }, turns,
          }] }));
        }
        break;
      }
      case 'heal': this.replace(applyBattleUnitHealing(target, p.amount === 'ALL_WOUNDS' ? target.maxHp - target.hp : Number(p.amount)).unit); break;
      case 'stress': this.replace({ ...target, stress: clampStressValue(target.stress + Number(p.amount)) }); break;
      case 'light': this.light = Math.max(0, Math.min(10, this.light + Number(p.amount))); break;
      case 'guard': this.guard[target.id] = (this.guard[target.id] ?? 0) + Number(p.amount); break;
      case 'riposte': this.riposte[target.id] = (this.riposte[target.id] ?? 0) + Number(p.amount); break;
      case 'disease': this.infections.push({ heroId: target.id, diseaseId: drawDisease(() => this.random.next()) }); break;
      case 'removeCondition': this.replace(synchronizePrintedConditionTokens({ ...target,
        printedConditionTokens: target.printedConditionTokens?.filter(t => t.type !== p.condition) })); break;
      case 'shuffle': {
        const side = target.side === 'hero' ? this.heroes : this.monsters;
        const positions = shuffleAtomicStanceBlocks(side.filter(u => u.isAlive).map(u => ({
          id: u.id, start: u.position - 1, width: 1,
        })), target.id, p.direction as 'push' | 'pull', Number(p.distance));
        for (const u of side) if (positions[u.id] !== undefined)
          this.replace({ ...u, position: positions[u.id] + 1, stance: stances[positions[u.id]] });
        // Unique synthetic displacement; the production adapter will bind the accepted spatial candidate helper.
        const relative = this.coordinates[op.relativeToId], from = this.coordinates[target.id];
        const direction = from >= relative ? 1 : -1;
        this.coordinates[target.id] = p.direction === 'push' ? from + direction * Number(p.distance)
          : from - direction * Math.min(Number(p.distance), Math.abs(from - relative));
        this.placements[target.id] = `synthetic-area:${this.coordinates[target.id]}`;
        break;
      }
      default: throw new Error('Unsupported synthetic effect');
    }
  }
}
