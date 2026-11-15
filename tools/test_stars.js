/* 星是唯一的进度货币：金币被整个删掉了（第 61 轮）。
 *
 * 用户的原话：「取消金币，只计算通关的星星，重复通关不能获得或者只能获得
 * 以前没拿到的星星。后面可以把星星设计有对应的成就」。
 *
 * 删金币不是因为"不好看"，而是因为它**没有出口**：全项目搜不到一处花金币的
 * 地方，结算卡上的 +180 只是往一个永远用不上的口袋塞数字。
 * 所以这条测试要守的不是"金币算得准"，而是"金币**真的不在了**"——
 * 一个被悄悄留着的金币字段，比一个明摆着的空钱包更容易骗过下一个人。
 *
 * 断言分四组：
 *   A. 代码里没有金币的残骸（导出、函数、存档字段）；
 *   B. 星是累计的永久标记（只增不减），重刷只补没拿到的；
 *   C. 旧格式存档（只有 stars 数字 / 带着 coins 字段）能迁移，不会显示成 0 星；
 *   D. 分两次拿星也算累计（参考里「分别三次获取也算作三星通关」）。
 *
 * A 组必须真的**能失败** —— 所以它同时断言"塞一个 coinsOf 进去，量具能认出来"。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* 抓"这一帧到底写了哪些字"（和 test_coin_display / test_layout_audit 同一套 PATCH）。
 * 星这一格换成文字之后，能不能验就得靠它 —— 断言的是**渲染层交给 fillText 的字符串**，
 * 不是我另算一遍同名公式（那只能证明两个公式长得一样）。 */
const PATCH = `(() => {
  if (window.__audit) return 'already';
  const C = CanvasRenderingContext2D.prototype;
  const oText = C.fillText, oClear = C.clearRect;
  window.__audit = { recs: [] };
  C.clearRect = function () { window.__audit.recs = []; return oClear.apply(this, arguments); };
  C.fillText = function (txt) { window.__audit.recs.push(String(txt)); return oText.apply(this, arguments); };
  return 'patched';
})()`;

const COIN_RE = /coinsOf|totalCoins|coinGain|已拿满/;

/* 去掉注释再找金币残骸。
 *
 * 为什么非要剥注释：解释"为什么把金币删掉了"这件事本身就得写出 coinsOf
 * 这三个字母。第一版直接在原文上 grep，于是**把删掉的理由也判成了残骸**，
 * 读出来 2 处命中，全在注释里 —— 一个要求"连解释都不许提"的量具，只能逼人
 * 删掉文档。同一课在 tools/audit_state_fields.js 的第 18 行就记过一次。
 *
 * 保留字符串内容（中文文案里出现"已拿满"才是真残骸），只抹掉注释。 */
function stripComments(src) {
  let out = '', i = 0, n = src.length, q = null;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (q) {
      out += c;
      if (c === '\\') { out += (d || ''); i += 2; continue; }
      if (c === q) q = null;
      i++; continue;
    }
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') {
      const e = src.indexOf('*/', i + 2);
      out += src.slice(i, e < 0 ? n : e + 2).replace(/[^\n]/g, ' ');
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeSt-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.clear(); localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  /* ---------- A. 金币残骸 ---------- */
  /* 量具自证：先在**源码**上验一次这条正则抓得住金币，
   * 免得"正则写错了 → 0 命中 → 全绿"这种假通过。 */
  const srcHtml = fs.readFileSync(path.join(ROOT, 'prototype', 'index.html'), 'utf8');
  const srcGame = fs.readFileSync(path.join(ROOT, 'prototype', 'game.js'), 'utf8');
  {
    const fake = 'function coinsOf(){ return 1; } var totalCoins = 2;';
    A.chk('量具能失败：正则认得出 coinsOf / totalCoins', COIN_RE.test(fake), fake);
  }
  /* 剥注释这个动作本身也要能自证：注释里的命中必须消失，字符串里的必须留下 */
  {
    const probe = '/* coinsOf 已经删了 */ var s = "已拿满";';
    const stripped = stripComments(probe);
    A.chk('剥注释：注释里的 coinsOf 被抹掉', !/coinsOf/.test(stripped), stripped.trim());
    A.chk('剥注释：字符串里的「已拿满」还在（只抹注释，不抹文案）',
      /已拿满/.test(stripped), stripped.trim());
  }
  const hits = (stripComments(srcHtml).match(new RegExp(COIN_RE.source, 'g')) || []).length;
  A.chk('prototype/index.html 里没有金币的函数/字段名/文案（注释除外）', hits === 0,
    hits ? COIN_RE.source + ' ×' + hits : '');
  A.chk('prototype/game.js（引擎）从来没碰过金币',
    !COIN_RE.test(stripComments(srcGame)), COIN_RE.source);
  const noExports = await ev(`(()=>{const R=window.__rap;
    return JSON.stringify({coinsOf:typeof R.coinsOf, totalCoins:typeof R.totalCoins,
      coinGain:typeof window.__rap.state.coinGain});})()`);
  const nx = JSON.parse(noExports);
  A.chk('__rap 上不再导出 coinsOf', nx.coinsOf === 'undefined', nx.coinsOf);
  A.chk('__rap 上不再导出 totalCoins', nx.totalCoins === 'undefined', nx.totalCoins);
  A.chk('state.coinGain 这个字段不存在', nx.coinGain === 'undefined', nx.coinGain);

  /* ---------- B. 星的纯函数 + 首次通关 ---------- */
  A.chk('刚开始时总星数为 0', (await ev('window.__rap.totalStars()')) === 0);
  const runLevel = async (idx, spec) => {
    await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[${idx}];
      window.__rap.startLevel(${idx}); s.welcome=0; s.introT=1;
      R.applySpec(lv, s.build, R.SPECS['${spec}']);
      window.__rap.launch(); s.runBanner=0; return 1;})()`);
    for (let i = 0; i < 250; i++) {
      await sleep(200);
      if ((await ev('window.__rap.state.phase')) === 'resolved') return true;
    }
    return false;
  };

  A.chk('1-1 跑到结算', await runLevel(0, '1-1'));
  /* 结算卡右上一格（原金币位）现在是"这一局点亮了几颗新星"。
   * 首次通关 1-1 三颗星全亮 → 卡上必须是 +3，而不是一坨别的数字。
   *
   * 等的时间必须是**回放 2.8s + 卡片滑入 + 这一格 0.55s 淡入** ——
   * 第一版只等了 260ms，那时失败回放还没放完（`replayPlaying()` 让整张卡
   * 提前 return），读到的全是回放标题。这类"等太短"在别的脚本里已经踩过，
   * 这里把三个时长写在一句话里，免得下一次改回放时长时又忘掉一个。 */
  await ev(PATCH);            // 打完这一关再挂，免得录制被 welcome/HUD 的文字灌满
  await sleep(3600);
  const card1 = JSON.parse(await ev('JSON.stringify(window.__audit.recs)'));
  A.chk('首次通关的结算卡上写着 +3（三颗星一次点亮）',
    card1.some(t => t === '+3'), card1.filter(t => /^\+\d+$/.test(t)).join(' ') || '没有 +N');
  const r1 = JSON.parse(await ev(`(()=>{const r=window.__rap.state.run;
    return JSON.stringify({win:r.result==='win', stars:r.stars, boxes:r.boxesGot,
      goals:r.starGoals});})()`));
  const saved = JSON.parse(await ev(`localStorage.getItem(window.__rap.SAVE_KEY)||'{}'`));
  A.log('1-1 结果：' + r1.stars + ' 星 / 木箱 ' + r1.boxes + '；存档 = ' + JSON.stringify(saved['1-1']));
  A.chk('胜利后 1-1 进了存档', !!saved['1-1']);
  A.chk('存档里记的是三个星标记（不是单个数字）',
    !!(saved['1-1'] && saved['1-1'].goals && typeof saved['1-1'].goals.arrive === 'boolean'),
    JSON.stringify(saved['1-1'] && saved['1-1'].goals));
  A.chk('1-1 拿满木箱 → boxes 标记点亮', saved['1-1'].goals.boxes === true);
  // 1-1 的第三颗星是「不散架」（noBreak）。标准解一路开得很稳，
  // 所以这颗也该亮 —— 如果这里变 false，说明木框在正常通关路径上就碎了，
  // 那这颗星就变成了"不可能"，必须当失败处理。
  A.chk('1-1 的「不散架」星在正常通关时点亮', saved['1-1'].goals.challenge === true,
    JSON.stringify(saved['1-1'].goals));
  A.chk('存档里没有 coins 字段（金币不留残骸）',
    saved['1-1'].coins === undefined, 'coins=' + saved['1-1'].coins);
  A.chk('存档里三个标记全亮 → totalStars = 3',
    (await ev('window.__rap.totalStars()')) === 3);

  /* ---------- C. 重刷不累加 ---------- */
  A.chk('重刷 1-1 也能跑完', await runLevel(0, '1-1'));
  const t2 = await ev('window.__rap.totalStars()');
  A.chk('重刷同一关后总星数没有翻倍', t2 === 3, '3 → ' + t2);
  const after2 = JSON.parse(await ev(`localStorage.getItem(window.__rap.SAVE_KEY)||'{}'`));
  A.chk('重刷后 1-1 仍是 3 星（不是 6）',
    after2['1-1'] && ['arrive', 'boxes', 'challenge'].every(k => after2['1-1'].goals[k]));
  /* 重刷的这一局一颗新星都不点亮 → 卡上不许再写 +N，必须写「无新星」。
   * 这一条是"重复通关不能获得"的用户要求，落到屏幕上就是这两个字。
   * （和金币时代 `test_coin_display.js` 的"重刷不许写 +N"是同一条纪律，
   *  换了个名词继续守 —— 判据不能跟着被删的功能一起被删。）
   *
   * PATCH 在打完这一局之后已经挂着，所以这一次要**等卡片滑入完**
   * （0.55s 淡入 + 回放 2.8s），否则读到的还是上一帧。 */
  await sleep(3600);
  const card2 = JSON.parse(await ev('JSON.stringify(window.__audit.recs)'));
  A.chk('重刷时卡上不许再写 +N（这一局没有新星）',
    !card2.some(t => /^\+\d+$/.test(t)),
    card2.filter(t => /^\+\d+$/.test(t)).join(' ') || '');
  A.chk('重刷时卡上明说「无新星」',
    card2.some(t => t.indexOf('无新星') >= 0),
    card2.filter(t => t.indexOf('新星') >= 0).join(' ') || '没有这句');
  /* 顺手守一下原「星级提升！」胶囊真的没了：它和星星位说的是同一件事，
   * 两块同屏会挤在同一个角落（见 drawResult 里的注释）。 */
  A.chk('结算卡上不再有独立的「星级提升！」胶囊（已合并进星星位）',
    !card2.some(t => t.indexOf('星级提升') >= 0),
    card2.filter(t => t.indexOf('星级') >= 0).join(' '));

  /* 选关页底部那格（原来也是金币）现在是「满星 N / 6 关」。 */
  await ev(`(()=>{window.__rap.state.phase='build'; window.__rap.state.run=null;
    window.__rap.state.levelSelect=true; return 1;})()`);
  await sleep(400);
  const ls = JSON.parse(await ev('JSON.stringify(window.__audit.recs)'));
  A.chk('选关页上写着「满星 1 / 6 关」（1-1 已三星）',
    ls.some(t => t.indexOf('满星 1 / 6 关') >= 0),
    ls.filter(t => t.indexOf('满星') >= 0 || t.indexOf('星') >= 0).slice(0, 4).join(' | '));
  await ev('window.__rap.state.levelSelect=false');
  await sleep(200);

  /* ---------- D. 旧格式存档要能迁移 ---------- */
  /* 两种旧格式都得能读：
   *   1) 只有 stars 数字（没有 goals）—— 星会显示成 0 颗，看起来像"进度丢了"；
   *   2) 带着 coins 字段 —— 金币删掉之后它是个纯垃圾键。 */
  await ev(`(()=>{
    const R=window.__rap;
    localStorage.setItem(R.SAVE_KEY, JSON.stringify({'1-1':{stars:1,best:99.9,coins:50}}));
    return 1;})()`);
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  const mig = JSON.parse(await ev(`(()=>{const R=window.__rap;return JSON.stringify({
    stars:R.totalStars()});})()`));
  A.log('旧存档 {stars:1, coins:50} → 迁移后 ' + mig.stars + ' 星');
  A.chk('旧格式存档不会显示成 0 星（stars:1 → arrive 标记）', mig.stars === 1, String(mig.stars));

  /* 旧存档里的 coins 字段在下一次写入时被清掉（不留一个没读者的键） */
  await ev(`(()=>{const R=window.__rap;
    R.saveProgress('1-1', {arrive:true,boxes:false,challenge:false}, 9.0, 0);
    const s=JSON.parse(localStorage.getItem(R.SAVE_KEY));
    return 1;})()`);
  const cleaned = JSON.parse(await ev(`localStorage.getItem(window.__rap.SAVE_KEY)||'{}'`));
  A.chk('重写存档时把旧的 coins 键清掉了', cleaned['1-1'].coins === undefined,
    'coins=' + cleaned['1-1'].coins);

  /* ---------- E. 累计：一次只拿一颗星也算数 ---------- */
  await ev(`(()=>{
    const R=window.__rap;
    localStorage.setItem(R.SAVE_KEY, JSON.stringify({
      '1-1':{goals:{arrive:true,boxes:false,challenge:false},best:9.1,boxes:0}}));
    return 1;})()`);
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  const before = await ev('window.__rap.totalStars()');
  A.chk('前置：只有 arrive 时是 1 星', before === 1, String(before));
  // 再跑一次、这一局只要木箱（模拟"分两次拿"）
  await ev(`(()=>{
    const R=window.__rap;
    R.saveProgress('1-1', {arrive:true,boxes:true,challenge:false}, 8.0, 1);
    return 1;})()`);
  const after = JSON.parse(await ev(`(()=>{const R=window.__rap;return JSON.stringify({
    stars:R.totalStars(), rec:JSON.parse(localStorage.getItem(R.SAVE_KEY))['1-1']});})()`));
  A.chk('分两次拿：先 arrive、再 boxes → 累计 2 星（不会互相覆盖）',
    after.stars === 2, JSON.stringify(after.rec.goals));
  A.chk('分两次拿之后 best 仍取更快的那次', after.rec.best === 8.0, String(after.rec.best));

  A.chk('无 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
