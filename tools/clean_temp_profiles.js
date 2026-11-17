/* 临时目录清扫器的一次性回收入口（第 75 轮）。
 *
 * 用法：
 *   node tools/clean_temp_profiles.js            列出能回收多少
 *   node tools/clean_temp_profiles.js --apply    真的删
 *
 * ⚠ 只认本项目产生的目录形状（`edge<前缀>-<毫秒时间戳>`，见
 * `tools/lib/temp_sweeper.js` 的 NAME_RE）。别人的临时目录一律不碰 ——
 * 一个误删别人目录的清扫器比不清理更坏。
 */
const { sweep, looksLikeProfileDir } = require('./lib/temp_sweeper.js');

const apply = process.argv.includes('--apply');
const r = sweep({ dryRun: !apply });
console.log('扫了 ' + r.scanned + ' 个临时目录，其中符合本项目形状的 ' + r.matched + ' 个');
console.log((apply ? '已删除 ' : '可回收 ') + r.removed + ' 个，' +
  (r.bytesFreed / 1024 / 1024).toFixed(1) + ' MB');
if (r.errors.length) {
  console.log('删不掉的 ' + r.errors.length + ' 个（多半还被进程占着）：');
  r.errors.slice(0, 5).forEach(e => console.log('  ' + e));
}
if (!apply && r.matched > 0) console.log('\n加 --apply 真的删。');
if (r.matched === 0) console.log('没有需要回收的 —— 说明收尾清理在工作。');
void looksLikeProfileDir;
