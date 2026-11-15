/* 关卡 schema 校验：真数据全通过，**假数据必须被拦下**。
 *
 * 这条测试存在的理由：校验函数本身如果坏了（比如遍历时拼错字段名、
 * 或者 arrays 分支根本没走），真数据照样全绿 —— 因为它本来就是干净的。
 * 所以必须喂它几份"我故意弄脏"的关卡，逐个证明它抓得到。
 */
const path = require('path');
const { validate, SCHEMA } = require('./lib/level_schema.js');
const LEVELS = require(path.join(__dirname, '..', 'prototype', 'levels.js'));

let pass = 0, fail = 0;
const fails = [];
function chk(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✓ ${name}` + (detail ? ` — ${detail}` : '')); }
  else { fail++; fails.push(name); console.log(`  ✗ ${name}` + (detail ? ` — ${detail}` : '')); }
}

console.log('=== A. 真实的六关必须通过 ===');
{
  const p = validate(LEVELS, (i, lv) => `${lv.levelId}`);
  chk('六份关卡数据全部通过 schema 校验', p.length === 0,
    p.length ? p.join(' | ') : `${LEVELS.length} 份全部干净`);
  const allKeys = {};
  LEVELS.forEach(lv => Object.keys(lv).forEach(k => allKeys[k] = 1));
  console.log('  数据里实际出现的字段：' + Object.keys(allKeys).sort().join(' '));
  console.log('  schema required：' + SCHEMA.required.join(' '));
  console.log('  schema optional：' + SCHEMA.optional.join(' '));
  console.log('  schema forbidden：' + SCHEMA.forbidden.join(' '));
}

/* 拿一份真实关卡当底稿，逐项弄脏。用深拷贝，绝不能污染 LEVELS。 */
const base = () => JSON.parse(JSON.stringify(LEVELS[0]));

console.log('\n=== B. 假数据必须被拦下（每一项都要能被抓出来） ===');
{
  const lv = base(); lv.physics = { gravity: 16 };
  chk('加了 physics 会被拦', validate([lv], () => 'X').some(p => p.includes('physics')),
    validate([lv], () => 'X').join(' | '));
}
{
  const lv = base(); lv.buildArea = { cols: 6, rows: 8 };
  chk('加了 buildArea 会被拦', validate([lv], () => 'X').some(p => p.includes('buildArea')));
}
{
  const lv = base(); lv.chapter = 1;
  chk('加了 chapter 会被拦', validate([lv], () => 'X').some(p => p.includes('chapter')));
}
{
  const lv = base(); lv.note = '随便写';
  chk('加了 note 会被拦', validate([lv], () => 'X').some(p => p.includes('note')));
}
{
  const lv = base(); lv.speedHint = 3;
  chk('加了**没登记的**新字段也会被拦', validate([lv], () => 'X').some(p => p.includes('speedHint')),
    '拼错的字段名不会静默通过');
}
{
  const lv = base(); delete lv.timeLimit;
  chk('缺必填字段会被拦', validate([lv], () => 'X').some(p => p.includes('缺必填字段 timeLimit')));
}
{
  const lv = base(); lv.grid.cell = 1.0;
  chk('grid.cell（第二份真相）会被拦', validate([lv], () => 'X').some(p => p.includes('grid 里有多余字段 cell')));
}
{
  const lv = base(); lv.grid.px = 32;
  chk('grid.px 会被拦', validate([lv], () => 'X').some(p => p.includes('grid 里有多余字段 px')));
}
{
  const lv = base(); lv.start.row = 4;
  chk('start.row 会被拦', validate([lv], () => 'X').some(p => p.includes('start 里有多余字段 row')));
}
{
  const lv = base(); lv.goal.row = 7;
  chk('goal.row 会被拦', validate([lv], () => 'X').some(p => p.includes('goal 里有多余字段 row')));
}
{
  const lv = base(); lv.materials[0].surfaceRow = 8;
  chk('materials[].surfaceRow 会被拦（那个数字有 2/3 场合是假的）',
    validate([lv], () => 'X').some(p => p.includes('materials[0] 里有多余字段 surfaceRow')));
}
{
  const lv = base(); lv.materials.push({ cols: [0, 1], type: 'ice', surfaceRow: 9 });
  chk('第二段材质里的 surfaceRow 也会被拦（不是只看第 0 段）',
    validate([lv], () => 'X').some(p => p.includes('materials[1] 里有多余字段 surfaceRow')));
}
{
  /* 一份干净的副本上只改**值**（不是字段集），必须仍然通过 ——
   * 否则校验就变成了"只要有改动就报错"，而不是"按 schema 报错"。 */
  const lv = base(); lv.timeLimit = 999; lv.name = '改个名'; lv.goal.col = 3;
  chk('只改值不改变字段集时仍然通过', validate([lv], () => 'X').length === 0,
    '防止校验变成"任何改动都拒绝"');
}

console.log('\n=== C. 六个真关卡逐个单独校验 ===');
LEVELS.forEach(lv => {
  const p = validate([lv], () => lv.levelId);
  chk(`${lv.levelId} 单独校验通过`, p.length === 0, p.join(' | '));
});

console.log(`\nASSERTS ${pass} / ${pass + fail}`);
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
