# Phase 11A.2 验收闭环实现说明

基线：`8a76ca68ede5603ef1482046cd9e04a9047ccb68`。

交付分支：`phase-11a2-final-acceptance-closure`。

最终结果以同目录自动生成的 `phase-11a2-final-acceptance-report.md` 和 `docs/data/core-campaign/verification-results.json` 为准。每轮日志、测试计数及 Gate 前置证据按 runId 保留，历史运行不代替本轮证据。

## 实现与验收边界

- 检查点直接复用 Golden 循环，通过目标里程碑停止。恢复时使用已保存的 CampaignState、RNG 游标、逻辑时钟和 ID 计数器，不重放检查点之前的命令。
- M01、M02 的触发条件收紧到 Hamlet 结算完成。V-03、V-04、V-05 分别读取 M02、M03、M09 的实际状态。
- M03、M06 续跑先经过 JSON 序列化，再与连续运行比较完整最终状态、状态哈希、事务 ID、事件后缀、RNG 后缀、里程碑后缀和运行时游标。
- 普通产品存档往返在独立测试文件和独立验证步骤中运行；普通 Save Schema 不增加回放游标。
- E2E 玩家根据状态选择合法动作，仅调用 Store 公共动作。架构测试检查属性赋值、未批准的 Store 调用和危险写操作。测试错误显示在专用输出中，并由每条 E2E 强制断言为空。
- 替补起点通过真实首个任务完成、生产死亡入口和饰品结算入口生成，再经过 Save Schema 校验。候选选择、确认与恢复由产品页面完成。
- 浏览器存档测试比较除 `updatedAt` 外的完整状态哈希；产品保存会更新该时间戳。读档后还通过产品按钮执行一次英雄行动，并验证状态变化。
- 测试控件由 `VITE_E2E_MODE=1` 条件加载；普通构建不包含这些控件。显式设置的旧 `dd-fixed-rng` 测试种子仍优先于 E2E 默认种子。
- 命令路由审计基于 TypeScript 语法树，覆盖全部 15 个非动态命令，包括小写 `scout`。检查实际函数调用及该函数的导入来源；注释中的函数名不能让检查通过。

## 一键复验

```sh
npm run verify:phase11a2-final
```

脚本逐项执行测试与审计，校验结构化测试计数（失败、跳过、todo 均不能计入通过），写入本轮前置证据，再自动运行正式 `audit:release-gate`。最后校验输入哈希、runId、独立门禁字段与本轮 Gate 的一致性，生成最终报告。

Windows 沙箱内曾出现 Playwright 在六项测试结束后清理测试服务器挂起；最终验收在允许正常清理子进程的执行环境中完成。Chromium 已按实际缺失错误安装。

正式 Release Gate 保留原有退出码语义：`CONDITIONAL` 返回 1。最终验证脚本仅在本轮 Gate 为预期的 `CONDITIONAL`、独立检查全部通过、且唯一开放 P0 为 `ISSUE-P0-002` 时返回 0。

## 停止条件

本次仅关闭 Phase 11A.2 的开发验收缺口。官方 Guardian / Final Encounter 数据仍缺失，因此 `elevenQuestLoopClosed=false`、`campaignVictoryReachable=false`。等待独立远程审计，不开始 Phase 11A.3，也不声称远程 CI 已通过。
