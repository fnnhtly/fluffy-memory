/* 关 → 标准解 key —— **全项目唯一一份**（第 73 轮抽出来）。
 *
 * 为什么必须是单一来源：第 72 轮加第 7 关时，有 8 个脚本各写了一张
 * 自己的表（或更糟：按下标取 `['1-1',...,'1-6'][i]`），于是加一关
 * 红了 8 处，而且每处的修法都不一样。第 73 轮加第 8 关之前先把表抽出来。
 *
 * 约定：
 *   · 键是 levelId，值是**这条关能通关的**标准解 key；
 *   · 同一关有多个变体时挑**正式标准解**（不是对照解）。
 *     1-4 有 i/w 两个（铁轮/木轮），挑 i；1-5 有 n/m/e 三个，
 *     n/m 不带雷种会撞屏障，只有 e 能过。
 *   · 新加关卡时只改这里。
 */
const SPEC_OF = {
  '1-1': '1-1',
  '1-2': '1-2',
  '1-3': '1-3',
  '1-4': '1-4i',
  '1-5': '1-5e',
  '1-6': '1-6',
  '1-7': '1-7',
  '1-8': '1-8'
};

/* 取某一关的标准解 key。找不到时**抛出**而不是返回 undefined ——
 * 返回 undefined 的后果是调用方拿到 `SPECS[undefined]`，
 * 然后在 applySpec 里抛一个和真实原因无关的 TypeError。 */
function specKeyOf(levelId) {
  const k = SPEC_OF[levelId];
  if (!k) throw new Error('没有给关卡 ' + levelId + ' 登记标准解 key（见 tools/lib/specmap.js）');
  return k;
}

module.exports = { SPEC_OF, specKeyOf };
