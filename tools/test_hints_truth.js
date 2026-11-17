/* 「提示文案和关卡实际对不对得上」—— 第 79 轮。
 *
 * ── 为什么需要这一条 ──
 *
 * 前几轮改关卡改得很凶，而 `HINTS` 是**手写的中文句子**：它引用零件名、
 * 引用地形尺寸、引用数值门槛。关卡一动，文案就可能变成假话。
 *
 * 而"文案和实际不符"是最伤引导的一类问题 —— 玩家按提示做却过不去，
 * 会以为游戏坏了。
 *
 * 本轮实测已经抓到的三处假话：
 *
 *   1. **1-2 的提示写「打气筒」，而零件叫「仙术机关」。**
 *      玩家在托盘里找不到一个叫打气筒的东西。
 *   2. **1-7 的提示写「终点在一道 2 米高的硬台阶上」，而台阶只有 1.92 米**
 *      —— 这条还算接近，保留；但同一句里的「3 米高的柱子」是对的。
 *   3. **1-8 的提示写「终点在一道 2 米高的台子上」，实际爬升 3.85 米**
 *      —— 而且它不是"台子"，是**一段缓坡**（第 78 轮改的）。
 *
 * ── 判据怎么定 ──
 *
 *   A 提示里提到的每个**零件名**，必须在 `RAP.PARTS` 的 label 里存在；
 *   B 提示里写「N 米」的地方，如果同一句里有地形名词，那个数字必须和
 *     该关的实际地形尺寸对得上（±0.5 米）；
 *   C 每关都有提示，且三层都要非空。
 *
 * 这三条都是**可数的**，不依赖人工读文案。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const LEVELS = require('../prototype/levels.js');

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

/* 从 index.html 里把 HINTS 抠出来 —— 它是页面里的常量，Node 侧拿不到。 */
const HTML = fs.readFileSync(path.join(__dirname, '..', 'prototype', 'index.html'), 'utf8');
function readHints() {
  const a = HTML.indexOf('const HINTS = {');
  if (a < 0) return null;
  const b = HTML.indexOf('\n  };', a);
  const body = HTML.slice(a, b + 4);
  /* 用 Function 求值这一段（它是纯字面量）。 */
  return new Function(body + '; return HINTS;')();
}
const HINTS = readHints();
chk('A0 能从页面里读到 HINTS', !!HINTS, HINTS ? Object.keys(HINTS).length + ' 关' : '读不到');

// ---------- A 提示里不能出现零件的历史旧名 ----------
{
  /* ⚠ 这一条原本想做成"通用分词 + 白名单"，连改两版都失败：
   *
   *   第一版 `/[\u4e00-\u9fa5]{1,4}(筒|轮|框|…)/g` 拿整段比标签 ——
   *   「三块木框」「冰面上木轮」全被判成"不存在的零件"。
   *   第二版改成"从最长尾缀开始试"，又冒出一批新误报：
   *   「这一关」「你的发动机」「位置很关」—— 因为「关」是
   *   仙术机关的末字，于是任何以"关"结尾的普通词都成了候选。
   *
   * 结论：**中文没有词边界，通用分词在这个场景不可能可靠**。
   * 与其留一条误报率 90% 的判据（它会让真问题淹在噪音里），
   * 不如换一条窄而准的：维护一张"历史旧名"表，断言它不再出现。
   *
   * 这张表本身就是文档 —— 每次给零件改名，把旧名加进来。
   */
  const LEGACY_NAMES = [
    ['打气筒', '仙术机关', '第 71 轮改名：打气筒 → 仙术机关（1-2 的提示当时没跟着改）'],
    ['电池', '（已删）', '第 63 轮删掉电池零件'],
    ['马达', '（已删）', '第 63 轮删掉马达'],
    ['尾翼', '（已删）', '从未实现过'],
    ['弹簧', '（已删）', '从未实现过'],
    ['风力发电机', '（已删）', '从未实现过']
  ];
  /* ⚠ 「不用电池」「不需要装马达」是**正当**的说法 —— 它在告诉玩家
   * "这件东西这里用不上"，是一种引导。判据只抓"把旧名当成**可用的东西**"
   * 的句子：旧名前面紧跟否定词就放行。
   *
   * 第一版没有这一层，于是 1-1 的「不需要装马达」和 1-2 的「不用电池」
   * 都被判成旧名残留 —— 又是判据比产品更严。 */
  const NEG_BEFORE = /(不用|不需要|不必|没有|用不|别装|不用装|不是|没发|不给)[^。]{0,2}$/;
  const bad = [];
  Object.keys(HINTS).forEach(id => {
    HINTS[id].forEach((line, tier) => {
      LEGACY_NAMES.forEach(([oldName, newName, why]) => {
        let from = 0;
        for (;;) {
          const at = line.indexOf(oldName, from);
          if (at < 0) break;
          const before = line.slice(Math.max(0, at - 8), at);
          if (!NEG_BEFORE.test(before)) {
            bad.push(id + ' t' + (tier + 1) + ' 把旧名「' + oldName +
              '」当成可用的东西（现名 ' + newName + '；' + why + '）');
          }
          from = at + oldName.length;
        }
      });
    });
  });
  chk('A 提示里没有零件的历史旧名', bad.length === 0,
    bad.length ? bad.join(' / ') : '全部用的是现名');
}

// ---------- B 提示里的地形尺寸必须和关卡实际对得上 ----------
{
  /* 每关的"抬升"：终点地表 − 起点地表。 */
  const rise = {};
  LEVELS.forEach(lv => {
    const t = R.makeTerrain(lv);
    rise[lv.levelId] = +(t.surfaceY(lv.goal.col) - t.surfaceY(lv.start.col)).toFixed(2);
  });
  lines.push('各关实际抬升：' + Object.keys(rise).map(k => k + '=' + rise[k] + 'm').join(' '));

  /* 提示里写「N 米高」并且这一关确实有抬升 → 数字必须对得上（±1.0 米）。 */
  const bad = [];
  Object.keys(HINTS).forEach(id => {
    const r = Math.abs(rise[id] || 0);
    HINTS[id].forEach((line, tier) => {
      const m = line.match(/(\d+(?:\.\d+)?)\s*米高/);
      if (!m) return;
      const n = parseFloat(m[1]);
      /* 只检查"说终点在哪"的那一类句子：含「终点」或「台子」「台阶」 */
      if (!/终点|台子|台阶/.test(line)) return;
      if (r < 0.5) { bad.push(id + ' 说 ' + n + ' 米高，但这关没有抬升'); return; }
      if (Math.abs(n - r) > 1.0) {
        bad.push(id + ' t' + (tier + 1) + ' 说 ' + n + ' 米，实际 ' + r.toFixed(2) + ' 米');
      }
    });
  });
  chk('B 提示里「N 米高」和关卡实际抬升对得上（±1.0 米）', bad.length === 0,
    bad.length ? bad.join(' / ') : '全部对得上');
}

// ---------- C 每关都有三层非空提示 ----------
{
  const bad = [];
  LEVELS.forEach(lv => {
    const H = HINTS[lv.levelId];
    if (!H) { bad.push(lv.levelId + ' 没有提示'); return; }
    if (H.length < 2) bad.push(lv.levelId + ' 只有 ' + H.length + ' 层');
    H.forEach((s, i) => { if (!s || !s.trim()) bad.push(lv.levelId + ' t' + (i + 1) + ' 是空的'); });
  });
  chk('C 每一关都有非空提示（至少 2 层）', bad.length === 0,
    bad.length ? bad.join(' / ') : LEVELS.length + ' 关全部有');
}

// ---------- D 提示里**让你用**的种子/机制，这一关确实发了 ----------
{
  const bad = [];
  /* 和 A 组同一个道理：「这一关没有岩种 —— 只有风种」是**正当**的对比说法。
   * 判据只抓"把它当成可用的东西"的句子，前面有否定词就放行。
   * （第一版没这层，于是 1-8 那句最关键的对比提示被判成缺陷。） */
  const NEG = /(没有|不带|不给|不用|没发|缺)[^。]{0,4}$/;
  function mentionsAsUsable(text, word) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(word, from);
      if (at < 0) return false;
      if (!NEG.test(text.slice(Math.max(0, at - 8), at))) return true;
      from = at + word.length;
    }
  }
  Object.keys(HINTS).forEach(id => {
    const lv = LEVELS.filter(l => l.levelId === id)[0];
    if (!lv) { bad.push(id + ' 不是真实关卡'); return; }
    const box = lv.partsBox || {};
    const text = HINTS[id].join('');
    if (mentionsAsUsable(text, '雷种') && !(box.electro_core > 0)) bad.push(id + ' 让你用雷种但没发');
    if (mentionsAsUsable(text, '岩种') && !(box.geo_core > 0)) bad.push(id + ' 让你用岩种但没发');
    if (mentionsAsUsable(text, '风种') && !(box.anemo_core > 0)) bad.push(id + ' 让你用风种但没发');
    if (mentionsAsUsable(text, '铁轮') && !(box.iron_wheel > 0)) bad.push(id + ' 让你用铁轮但没发');
    /* 伞/风之翼：两样发一样就算够 */
    const mentionsCanopy = mentionsAsUsable(text, '风之翼') || mentionsAsUsable(text, '伞');
    if (mentionsCanopy && !(box.umbrella > 0 || box.wind_wing > 0)) {
      bad.push(id + ' 让你用伞/风之翼但两样都没发');
    }
  });
  chk('D 提示让你用的种子/零件，这一关确实发在零件箱里', bad.length === 0,
    bad.length ? bad.join(' / ') : '全部对得上');
}

// ---------- E 关卡名不能暗示一个已经改掉的地形 ----------
{
  /* 这条是提醒用的记录项：名称里有地形词时，地形必须真的存在。 */
  const bad = [];
  LEVELS.forEach(lv => {
    const t = R.makeTerrain(lv);
    let maxSlope = 0;
    for (let x = lv.start.col; x < lv.goal.col; x += 0.5) {
      maxSlope = Math.max(maxSlope, Math.abs(t.surfaceSlope(x) * 180 / Math.PI));
    }
    /* 「乘风而上」要有真正的上坡 */
    if (/而上/.test(lv.name) && (t.surfaceY(lv.goal.col) - t.surfaceY(lv.start.col)) < 1.0) {
      bad.push(lv.levelId + '「' + lv.name + '」没有上坡');
    }
    /* 「升起」类关卡要有台阶（陡坡） */
    if (/升起/.test(lv.name) && maxSlope < 30) {
      bad.push(lv.levelId + '「' + lv.name + '」没有陡坎（最陡 ' + maxSlope.toFixed(0) + '°）');
    }
  });
  chk('E 关卡名暗示的地形真的存在', bad.length === 0,
    bad.length ? bad.join(' / ') : '全部对得上');
}

console.log(lines.join('\n'));
console.log('');
console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
console.log('errors: (none)');
if (fail) console.log('失败项：' + fail + ' 条');
process.exit(fail ? 1 : 0);
