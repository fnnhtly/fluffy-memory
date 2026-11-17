/* ⚠ 这个脚本已退场（第 82 轮）。
 *
 * 它原来是"看门狗阈值 (W, D) 的扫描器"，有两个过期：
 *   1. `KEYS = ['1-1','1-2','1-3','1-4i','1-5m','1-6']` 是六关时代的手写表，
 *      1-7/1-8 不在里面，而且 **1-5m 不是标准解**（第 72 轮起只有 1-5e 能过）。
 *      它把 1-5m 的正确判负报成"标准解误杀 2"。
 *   2. 自己手写了一份"时间轴 + 逐帧 step"，没有 `_seeds`。
 *
 * 现在由 `tools/test_watchdog_health.js` 接管：走 `simulate(..., {trace})`
 * 让**引擎自己录轨迹**，关表读 `tools/lib/specmap.js`。
 *
 * 保留这个文件名是因为历史文档里有引用；它不再包含第二份实现。
 */
console.log('sweep_watchdog 已退场，实际扫描见 tools/test_watchdog_health.js');
console.log('直接运行它：node tools/test_watchdog_health.js');
process.exit(0);
