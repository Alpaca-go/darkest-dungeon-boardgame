// 确定性字符串哈希（用于 Snapshot 比对，检测 Registry 变更）。FNV-1a 变体，稳定可复现。

export function stableHash(input: unknown): string {
  const json = JSON.stringify(input ?? null);
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // 转无符号 32 位十六进制
  return (h >>> 0).toString(16).padStart(8, '0');
}
