/* 第 63 轮：改名两关（内容跟着机制变了）。
 *
 * 1-3 原名「电池够不够」—— 电池这个零件已经删了，名字必须跟着改。
 * 1-5 原名「第一道坎」，第三星从"不用马达"变成"不用驱动件"。
 *
 * 只改 name 字段，其他一概不动。
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'levels');
const RENAME = {
  '03.json': '动力接上了吗',
  '05.json': '不用机械'
};
Object.keys(RENAME).forEach(f => {
  const p = path.join(dir, f);
  const lv = JSON.parse(fs.readFileSync(p, 'utf8'));
  const before = lv.name;
  lv.name = RENAME[f];
  fs.writeFileSync(p, JSON.stringify(lv, null, 2) + '\n', 'utf8');
  console.log(f + '  ' + lv.levelId + '  「' + before + '」→「' + lv.name + '」');
});
