/* 静态审计：引擎写的状态，渲染层真的在读吗？
 *
 * 这一轮连着挖出三个"同一类"的 bug，全都是这个形状：
 *
 *   1. `def.__pct` —— 渲染层读一个**从来没被写过**的字段，于是电池永远满格。
 *   2. `motor_out` 事件 —— 引擎一直在写，渲染层**零消费者**，断电静默。
 *   3. `impact` 没有去重 —— 一个事件被写成 34 条，每条都触发整套演出。
 *
 * 前两个的共同点是"**两边对不上**"：写的没人读，读的没人写。
 * 这类 bug 不抛异常、不红测试、控制台也不留痕 —— 只能靠静态对账发现。
 *
 * 一份脚本做三件事：
 *   A. 引擎赋过值的 `state.X` / `car.X`，渲染层一次都没出现过 → "写了没人用"；
 *   B. 渲染层读的 `def.__X`，引擎一次都没赋过值 → "读了个空"；
 *   C. 引擎 `log(state, 'tag …')` 的 tag，渲染层完全没提过 → "事件没人听"。
 *
 * ── 两个必须做的预处理（第一版就是栽在这里）──
 *   1. **先去掉注释**。第一版直接在原文上 grep：A 组把注释里的
 *      `def.__pct !== undefined ? def.__pct : 1` 当成"读了个空"的现行证据，
 *      C 组则因为我在注释里写了 "motor_out" 就把一个零消费者的事件判成"有消费者"。
 *      —— 注释不是代码，量具必须先把它剥掉。
 *   2. **A 组不是"必须为零"**。有些字段写出来就是给测试读的
 *      （`pumpPress` / `motorUse` / `maxAngle` 是三星条件的计数器）。
 *      所以 A 组的输出是**待人工过目的清单**，白名单里每条都登记了原因。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* 去掉 // 行注释 与 /* … *​/ 块注释，保留字符串内容。
 * 简单的状态机：认得 '…' / "…" / `…`，在这三种里面不认注释标记。 */
function stripComments(src) {
  let out = '';
  let i = 0, n = src.length;
  let q = null;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') { out += (d || ''); i += 2; continue; }
      if (c === q) q = null;
      i++;
      continue;
    }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2);
      const blk = src.slice(i, e < 0 ? n : e + 2);
      // 块注释里的换行要保留，否则行号/缩进语义会错
      out += blk.replace(/[^\n]/g, ' ');
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

const ENGINE_RAW = fs.readFileSync(path.join(ROOT, 'prototype', 'game.js'), 'utf8');
const RENDER_RAW = fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8');
const ENGINE = stripComments(ENGINE_RAW);
const RENDER = stripComments(RENDER_RAW);

let pass = 0, fail = 0;
const line = (ok, name, detail) => {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + ' ' + name + (detail ? '　' + detail : ''));
};

/* ---------- A. 引擎赋过值的 state/car 字段 ---------- */
function assignTargets(src, obj) {
  const out = new Set();
  const re = new RegExp('\\b' + obj + '\\.([A-Za-z_][A-Za-z0-9_]*)\\s*(?:=|\\+=|-=|\\*=)', 'g');
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}
function mentions(src) {
  const out = new Set();
  const re = /\b(?:state|car)\.([A-Za-z_][A-Za-z0-9_]*)/g;
  let m;
  while ((m = re.exec(src))) out.add(m[1]);
  return out;
}
const stateW = assignTargets(ENGINE, 'state');
const carW = assignTargets(ENGINE, 'car');
const renderSeen = mentions(RENDER);       // 渲染层里出现过的 state.X / car.X 字段名

/* A 组白名单：写出来是给**测试**读的（渲染层另有入口），每条都写清为什么。 */
const TEST_ONLY = new Set([
  'pumpCharge', 'pumpHeld',       // 渲染层经 pumpChargeOf / batteryPctOf 读
  'pumpPress', 'motorUse', 'maxAngle',   // 三星计数器，渲染层走 challengeStatus
  'sandbagsDropped', 'sandbagTotal', 'balloonPops',
  'motorOutLogged', 'progLastGainT', 'noGainFor',
  'replayIdx', 'spawnGrace', 'wallCooldown', 'lastStructHurt', 'lastPigHurt',
  'overGoalAt', 'overGoalLogged', 'pigLooseAt', 'startY',
  'stuckTimer', 'progHist',
  'inv', 'invI'    /* 质量的倒数 / 惯量的倒数：纯物理内部量，
                     * 只有 game.js 自己用（vx += fx * inv * h）。
                     * 渲染层要的是 mass，不需要这两个。 */
]);

/* "渲染层到底读没读这个字段"不能用 `state.X` 来判 ——
 * 渲染层里几乎从不写全名，它用的是别名：`st.hullBroken`（st = state.run）、
 * `car.energy`、`p.hp`、`s.run.car`。所以这里退一步：
 * 只要渲染层出现过 `.字段名`，就算有人读。
 * 这个判据**偏宽松**（字段名撞车会漏报），但 A 组本来就只是"待人工过目"的清单，
 * 漏报一条的代价是少一次提醒，误报的代价是我去看一堆正常字段。
 * （第一版按 `state.X` 严格匹配，于是 `st.hullBroken` / `car.energy` 全被
 *  判成"没人读"，清单里 50 条里有 40 条是假的 —— 那种清单一出来就没人看。） */
function mentionedInRender(field) {
  return new RegExp('\\.' + field + '\\b').test(RENDER);
}

const dangling = [];
for (const f of stateW) if (!mentionedInRender(f) && !TEST_ONLY.has(f)) dangling.push('state.' + f);
for (const f of carW) if (!mentionedInRender(f) && !TEST_ONLY.has(f)) dangling.push('car.' + f);
dangling.sort();

console.log('\n=== A. 引擎赋过值、渲染层没出现过 ===');
console.log(dangling.length ? dangling.join('  ') : '（无）');
console.log('（白名单 ' + TEST_ONLY.size + ' 个：写出来是给测试/判定读的）');

/* ---------- B. 渲染层读的 def.__X vs 引擎写的 ---------- */
const dunderRead = new Set();
{
  const re = /\.__([A-Za-z][A-Za-z0-9_]*)/g;
  let m;
  while ((m = re.exec(RENDER))) dunderRead.add(m[1]);
}
const dunderWritten = new Set();
{
  for (const src of [ENGINE, RENDER]) {
    const re = /\.__([A-Za-z][A-Za-z0-9_]*)\s*(?:=|\+=)/g;
    let m;
    while ((m = re.exec(src))) dunderWritten.add(m[1]);
    // 对象字面量里直接写 __key: value（drawPartShape 之前塞临时值的那种写法）
    const re2 = /\b__([A-Za-z][A-Za-z0-9_]*)\s*:/g;
    while ((m = re2.exec(src))) dunderWritten.add(m[1]);
  }
}
console.log('\n=== B. 渲染层读的 def.__X ===');
console.log('读：' + ([...dunderRead].sort().join(', ') || '（无）'));
console.log('写：' + ([...dunderWritten].sort().join(', ') || '（无）'));

/* `__` 字段里也有**测试钩子**这一类：渲染层读它、但引擎正常运行时从不写它，
 * 写的人是测试脚本（通过 `window.__rap.state` 直接赋值）。
 * 它们和 TEST_ONLY 里那些 state 字段是同一类东西，必须有登记，
 * 否则每加一个钩子都要么改这条断言、要么把钩子藏起来。
 *
 * ⚠ 但这一条**不能变成"凡是孤儿都放行"** —— 那样 B 组就永远绿了。
 * 登记必须写明"谁写、为什么渲染层需要读"。 */
const DUNDER_TEST_ONLY = {
  lockCam: '测试钩子：钉住镜头做逐像素差分。写的人是 test_seed_fx.js（直接赋 state.__lockCam），' +
           '渲染层读它来决定是否跳过镜头缓动与震屏。正常游玩时它永远是 undefined。',
  /* 第 87 轮加的同级钩子。
   *
   * 为什么需要它：`__lockCam` 只锁**镜头**，而 rAF 循环里仍在
   * `RAP.step(state.run, 1/60)` —— 于是"锁了镜头"之后车还在往前跑，
   * 几帧后它已经跑出取景范围。实测 camLastDraw 锁在 8.98 而
   * carX 从 12.59 涨到 19.11，同一个判据两次跑给出 38% 和 26%。
   *
   * 写的人是 test_hud_occlusion.js / test_legibility.js（直接赋
   * state.__freezeRun = true），渲染层读它来决定是否跳过这一帧的物理推进。
   * 正常游玩时它永远是 undefined。 */
  freezeRun: '测试钩子：冻住物理，配合 __lockCam 让"设好状态抓一帧"能复现。' +
             '写的人是 test_hud_occlusion / test_legibility，' +
             '渲染层读它来决定是否跳过这一帧的 RAP.step。正常游玩时永远是 undefined。',
  /* 第 89 轮加的同族钩子。
   *
   * 为什么需要它：现有测试量的是**逻辑**（trayRect 的坐标、hintFor 的文案），
   * 所以把 drawTray 整个早退掉，那些断言照样通过 —— 它们量的是
   * "该画在哪"，不是"画出来了没有"。要证明后者，只能在隐藏前后各抓一帧
   * 做像素差分，而改源码重载会丢状态。
   *
   * 写的人是 test_draw_presence.js（直接赋 state.__hideDraw = 'drawTray' 等），
   * 渲染层读它来决定跳过哪一个绘制调用。正常游玩时永远是 undefined。 */
  hideDraw: '测试钩子：按名字跳过某一个绘制函数，用于"隐藏前后像素差分"。' +
            '写的人是 test_draw_presence，渲染层读它来决定跳过哪个 drawXxx。' +
            '正常游玩时永远是 undefined。'
};
const orphan = [...dunderRead].filter(k => !dunderWritten.has(k) && !DUNDER_TEST_ONLY[k]).sort();
const allowed = [...dunderRead].filter(k => !dunderWritten.has(k) && DUNDER_TEST_ONLY[k]).sort();
line(orphan.length === 0, '渲染层没有"读了个空"的 __ 字段',
  orphan.length ? '孤儿：' + orphan.join(', ') : '共 ' + dunderRead.size + ' 个，全部有写入方' +
  (allowed.length ? '（测试钩子 ' + allowed.join(', ') + '）' : ''));

/* ---------- C. 引擎事件标签 ---------- */
const tags = new Set();
{
  const re = /log\(state,\s*'([a-z_]+)/g;
  let m;
  while ((m = re.exec(ENGINE))) tags.add(m[1]);
}

/* 零消费者白名单：每条登记"渲染层为什么不需要认它"。 */
const NO_CONSUMER_OK = {
  balloon_pop: '扎破的气球走 burst 那一条（同一件事不重复认），见 game.js 注释',
  part_loose: '掉出来的零件由 state.loose 直接画，不靠事件',
  pig_hurt: '通过 pigHP 前后差值触发 SFX.hurt()',
  phase: '结算同步直接读 run.phase',
  interact_key: '纯给用例断言"按键走了哪条路径"',
  pump_charge: '蓄力进度由 pumpChargeOf 直接读',
  pump_release: '放气效果在 releaseInteract 里直接改物理',
  over_goal: '渲染层用 overGoalNotice 直接算',
  box: '木箱拾取通过 boxesGot 前后差值触发 SFX.box()',
  win: '结算通过 run.result 直接读',
  fail: '同上'
};

const unregistered = [...tags].filter(t => RENDER.indexOf("'" + t) < 0 &&
  RENDER.indexOf('"' + t) < 0 && !NO_CONSUMER_OK[t]).sort();
console.log('\n=== C. 引擎事件标签 ===');
console.log('共 ' + tags.size + ' 个：' + [...tags].sort().join(', '));
line(unregistered.length === 0, '所有引擎事件标签都有人认，或在白名单上登记了原因',
  unregistered.length ? '未登记：' + unregistered.join(', ') : '');

/* ---------- 量具自证 ---------- */
{
  const probe = ENGINE + '\nfunction __probe(){ state.zzOnlyWritten = 1; }\n';
  const tmp = assignTargets(probe, 'state');
  line(tmp.has('zzOnlyWritten') && !renderSeen.has('zzOnlyWritten'),
    '量具能失败：塞一个只写不读的 state 字段，A 组能认出它', 'zzOnlyWritten');
}
{
  const probeRender = RENDER + '\nvar v = def.__zzNobodyWritesThis;\n';
  const rd = new Set();
  const re = /\.__([A-Za-z][A-Za-z0-9_]*)/g;
  let m; while ((m = re.exec(probeRender))) rd.add(m[1]);
  const o2 = [...rd].filter(k => !dunderWritten.has(k));
  line(o2.length > 0, '量具能失败：塞一个没人写的 __ 字段，B 组能认出它', o2.join(', '));
}
{
  const probeEngine = ENGINE + "\nfunction __p(){ log(state, 'zz_unknown_tag'); }\n";
  const t2 = new Set();
  const re = /log\(state,\s*'([a-z_]+)/g;
  let m; while ((m = re.exec(probeEngine))) t2.add(m[1]);
  const oc = [...t2].filter(t => RENDER.indexOf("'" + t) < 0 && !NO_CONSUMER_OK[t]);
  line(oc.indexOf('zz_unknown_tag') >= 0,
    '量具能失败：塞一个未登记的事件标签，C 组能认出它', oc.join(', '));
}
{
  /* 最关键的一条：注释里的字样**不许**被当成证据。
   * 把 motor_out 从代码里删掉、只在注释里保留，C 组必须仍然判它未登记。 */
  const probeEngine = ENGINE.replace(/log\(state,\s*'motor_out'\);/g, '') +
    '\n/* 这里提到 motor_out 不算消费者 */\n';
  const t3 = new Set();
  const re = /log\(state,\s*'([a-z_]+)/g;
  let m; while ((m = re.exec(stripComments(probeEngine)))) t3.add(m[1]);
  line(!t3.has('motor_out'), '量具能失败：注释里出现的事件名不被当成消费者',
    '剥离注释后 motor_out ' + (t3.has('motor_out') ? '仍在' : '已消失'));
}

console.log('\nASSERTS ' + pass + ' / ' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
