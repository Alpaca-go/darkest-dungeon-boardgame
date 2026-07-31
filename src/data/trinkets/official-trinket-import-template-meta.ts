// Phase 8C 遗留修复（Phase 9A 基线）：官方 Trinket 导入模板的运行时摘要。
//
// 背景：`official-trinket-import-template.json` 是给人填写的模板文件，不是运行时数据源。
// 但 trinket-registry 直接 `import ... from './*.json'` 会把 JSON 拉进运行时模块图，
// 在 Node 22 的 ESM 加载器下（Playwright 直接以 ESM 加载 e2e → src 模块）会报
// `needs an import attribute of "type: json"`，导致整个 E2E 无法启动。
//
// 因此运行时只保留一份轻量摘要（TS 常量），JSON 仍是唯一的人工填写来源；
// 二者一致性由单元测试 `trinket-import-template.test.ts` 用 fs 读取 JSON 强制校验，
// 任何人改了 JSON 却忘了改这里，测试会直接失败。

export interface OfficialTrinketImportTemplateMeta {
  /** 模板 schema 版本，与 JSON 的 $schemaVersion 对齐。 */
  schemaVersion: number;
  /** 官方核心盒标称 Trinket 总数。 */
  expectedCoreCount: number;
  /** 模板槽位总数（entries.length）。 */
  totalSlots: number;
  /** 已填写完成（filled=true）的槽位。 */
  entries: ReadonlyArray<{ filled: boolean }>;
}

export const OFFICIAL_TRINKET_IMPORT_TEMPLATE_META: OfficialTrinketImportTemplateMeta = {
  schemaVersion: 1,
  expectedCoreCount: 38,
  totalSlots: 38,
  // 38 个槽位中目前仅 1 个已核实填写（Ancestor's Bottle）。
  entries: [
    { filled: true },
    ...Array.from({ length: 37 }, () => ({ filled: false })),
  ],
};
