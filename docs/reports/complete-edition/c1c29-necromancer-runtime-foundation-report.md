# C1C29 Necromancer Runtime Foundation

日期：2026-09-29。基线：`codex/phase-11a4-c1c28-necromancer-digital-rulings`，commit `b6fa9180b44cd4a33f9fd4ceed97f179e64fbd0f`。
工作分支：`codex/phase-11a4-c1c29-necromancer-runtime-foundation`。

**结论：C1C29-NECROMANCER-RUNTIME-FOUNDATION-PARTIAL-NOT-ACCEPTED。**
九张核心卡已绑定真实 runtime executor；通过显式合成依赖夹具验证了状态机、选择、供给账本、死亡事件和存档重放。
尚不能把这些证明等同于正式组件数据完整的 production encounter。下一工作流为
`NECROMANCER_RUNTIME_FOUNDATION_CONTINUATION`，Production Ready 保持 **0/9**。

## 规则与冻结边界

Runtime adapter 唯一导入的规则数据是冻结的
`docs/data/complete-edition/c1c28-necromancer-runtime-semantic-contract.json`；从结构化字段重建定义，运行时不解析印刷文本。
固定 `C1C28-DIGITAL-DEFAULT-v1`，不修改其 ruling，也未获取 FAQ、社区解释、视频、TTS/Lua 或电子游戏规则。
全局 `RULEBOOK_ONLY_SOURCE_POLICY_V1` 已写入 `rule-source-policy.json` 和根目录 `AGENTS.md`。
绑定 evidence 保存上游 C1C20–28 JSON 的 SHA-256，并验证相对基线无改动；历史覆盖率与 census 未提升。

| Level | Identity | Threat/Ability | Battle | HP |
| --- | --- | --- | --- | --- |
| I | 42000 | 42003 | 46037 | 77 |
| II | 42001 | 42004 | 46038 | 103 |
| III | 42002 | 42005 | 46039 | 144 |

## 已实现的可复用基础

`src/game-engine/bosses/foundation.ts` 为现有 `BattleState` 提供 Boss overlay；
`necromancer/contract-adapter.ts` 负责 family 定义，常规战斗路径不添加 Necromancer family 分支。
复用现有 damage、seeded runtime sources、initiative shuffle 和 campaign transaction helpers。

- Level I/II/III Room 10 setup、Threat/Ability 互斥翻面、旧 Threat collector 即时停用。
- 最低 Hero roll、Crowded Area、同时死亡、最近放置区域等不可变 PendingChoice；冻结候选、确认输入与 causal event，阻止未决选择期间推进战斗。
- Skill 表、Target/Range/Movement、Self Push、共享一次 D10、逐 Hero Dodge 判定与一次成功 activation 的召唤门控；全 miss 不召唤。
- 有限物理 token 账本、同 Battle 死亡不返还、Battle reset 与永久移除；原子 summon、Stance/Area capacity、正式 occupant displacement 与 no-space suppression。
- Reanimation 捕获最早死亡窗口、显式同时死亡选择、必需 dying-instance effect 顺序、嵌套事件锁、新 instance ID、清空旧伤害/状态、token transfer 与 fresh initiative。
- Boss 死亡立即结束 Battle 并清除剩余 summons；cleanup 幂等；通过现有 command 执行 Room 标记和 campaign progression，而不是自增一个替代计数器。
- 版本化 event/input log、seed/clock/ID cursors、真实 SaveFile roundtrip 和四类 tie 的 save/replay hash 对照。
- `BossChoicePanel` 接入真实 Store，提供候选高亮、确认、清除未提交选择；已提交决定不可任意取消。

规则作用域按冻结 contract 执行：**Reanimation 仅为 Level III Dungeon Threat，翻到 Ability 后停用**；
Bone Captain 仅走 Level II 首次 Dungeon Battle 独立路径，不进入普通 Skill summon pool。
`Bone Rubble` / `Bone Rabble` 的印刷别名与 project ruling provenance 保留。

## 未完成的验收门槛

C1C28 的可达 Bone binding 含组件身份与 copy policy，但不含可执行的数值 Life/Skill 定义；
现有 Hero registry 也没有正式 Dodge binding。Runtime 不回退到 prototype 怪物数值，不猜测缺失字段；
未绑定 spawn 明确产生 `SPAWN_DEFINITION_UNBOUND`，不消耗 token 或插入 initiative。
测试中的 Bone Life=12、空 Skill 列表与 Hero Dodge=0 是显式合成夹具，绝非官方规则或新 project ruling。

后续必须完成现有锁定正式组件数据的语义依赖 adapter、召唤单位真实 Skill executor、Hero Dodge binding、
normal selector/Room entry 与保存的 Threat checkpoint 恢复、Hamlet/Graveyard production effect application、incoming Boss attack Trinket reaction windows、
实体 Room card/tile deck storage、Boss Debuff/Shuffle resistance integration。
Threat Battle settlement 已保存 checkpoint，但生产重新进入 Room 的恢复桥尚未实现；entry 会拒绝覆盖旧 checkpoint。
最小 choice UI 已实现，浏览器行为尚未验证成功。
Preparation Day 的最低 roll 选择与 forcedHeroId 已保存；实际 Graveyard visit/use 和 Level benefit 尚未接入生产 Hamlet command。

这些缺口登记在 `c1c29-necromancer-contract-review.json` 与 capability matrix。
不得因 fixture 测试通过而声称完整 source-bound gameplay、正式 Room deck cleanup、9/9 production acceptance 或全套 UI/E2E PASS。
继续 runtime foundation；不重新进入外部 source acquisition，不静默扩展 v1 ruling。

## Evidence 与验证

`npm run audit:complete-edition-c1c29` 从真实 executor 生成 binding、capability、runtime traces、
save/replay、contract review 和 next-workstream decision；`npm run verify:complete-edition-c1c29` 重算并比较内容。
合成依赖 authority 在 traces 中显式记录。

最终 focused tests：72/72 PASS；受影响既有 gameplay/save/campaign regression：194/194 PASS；
typecheck 和 evidence verify：PASS。全量测试、构建和浏览器失败及其限制见
[validation report](c1c29-validation-report.md)。

无需新外部规则获取；本阶段没有改变 C1C20 Trinket 15/37、C1C21 Quest 3/75、
C1C22 census 278、C1C23 Hamlet Event、C1C24 Boss census 231/20 families 或 C1C25–28 canonical/ruling artifacts。
