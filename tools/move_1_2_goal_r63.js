/* 第 63 轮：1-2 的终点从 col 14 挪到 col 18。
 *
 * 为什么：换了零件表之后 1-2 的车变轻了（马达 1.8 kg + 电池 1.0 kg 都没了），
 * 一路滑到 14.07 就过线 —— "按一下"这个教学点直接失效
 * （tools/test_launch_spec 报红；tools/tune_1_2_goal_r63.js 扫出：
 *   goal≤16 不按也能赢，goal≥18 不按停在 x=16.4，按了才到）。
 *
 * 取 18 而不是 20/22：越远的终点要求越多次按压（教学负担越重），
 * 而这一关只需要教"有那么一个键"。
 */
const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'levels', '02.json');
const lv = JSON.parse(fs.readFileSync(p, 'utf8'));
const before = lv.goal.col;
lv.goal = { col: 18 };
fs.writeFileSync(p, JSON.stringify(lv, null, 2) + '\n', 'utf8');
console.log('02.json  1-2  goal.col ' + before + ' → ' + lv.goal.col);
