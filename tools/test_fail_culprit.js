/* 失败归因必须说清"这一局还剩什么没做"。
 *
 * 第 42 轮的量（probe_1_6_inaction.js）：1-6 里三种玩家的结局是——
 *   一个沙袋都不扔       → fail stuck @14.27s
 *   扔了但没扎气球       → fail flew_away @11.87s
 *   扔了也扎了（标准解） → win  @12.53s
 *
 * 也就是说"啥也不干"的失败文案原本是「卡住了：动力或重心不对」。
 * 车上挂着 3 个沙袋、6 个气球，一个都没动 —— 这句诊断是**错的**，
 * 而 1-6 根本没有马达，玩家照着这句去改动力只会更迷茫。
 *
 * 这条测试守：
 *   1) 车上还剩沙袋/气球时，失败卡上必须出现「还能试」和剩余数量；
 *      数量必须与车上实际情况一致（写 3 就真的是 3，不是文案里写死）；
 *   2) 车上没有可消耗件时，不许出现这句（否则它是句永远为真的噪音）；
 *   3) 归因变了之后，失败卡依然不许和「成功文案」打架（+N / 无新星 / 三星达成）；
 *   4) 回放标题那一行**不**追归因（760px 会装不下，probe_hud_text 量过）。
 */
const A = require('./lib/asserts');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PATCH = `(() => {
  if (window.__audit) return 'already';
  const C = CanvasRenderingContext2D.prototype;
  const oText = C.fillText, oClear = C.clearRect;
  window.__audit = { recs: [], byPhase: { run: [], select: [] } };
  C.clearRect = function () { window.__audit.recs = []; return oClear.apply(this, arguments); };
  C.fillText = function (txt) {
    const t = String(txt);
    window.__audit.recs.push(t);
    const st = window.__rap && window.__rap.state;
    if (st && st.phase === 'run') window.__audit.byPhase.run.push(t);
    return oText.apply(this, arguments);
  };
  return 'patched';
})()`;

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeFC2-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page');
      if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression:
    "localStorage.setItem('rap-welcomed-v1','1');localStorage.removeItem('rap-progress-v1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); };
  await ev(PATCH);
  await ev('window.__rap.state.introT=1');
  await sleep(250);

  const recsNow = async () => JSON.parse(await ev('JSON.stringify(window.__audit.recs)'));
  const near = (a, b, tol) => Math.abs(a - b) <= (tol || 0);
  async function waitResult(max) {
    for (let i = 0; i < (max || 200); i++) {
      await sleep(200);
      const r = await ev('window.__rap.state.run ? (window.__rap.state.run.result || "") : ""');
      if (r) return r;
    }
    return '';
  }

  /* 等结算卡真正画出来，而不是"睡 3.4 秒"。
   *
   * 失败结算卡要等回放播完才出现，而回放进度是按**帧时间**推进的：
   * `state.replayT += elapsed`，单帧 dt 上限 0.05（20 Hz 以下就被截断）。
   * 也就是说机器一忙、帧率掉下来，2.8 秒的回放可能要 10 秒真实时间。
   * 原来这里写死 `sleep(3400)`，在 verify 并发跑其它 headless 浏览器时
   * 就会读到一个"卡片还没出现"的画面，于是连红 5 条 ——
   * 那一次是量具等得太短，不是卡片坏了（单独跑 13/13 全绿）。
   *
   * 改成轮询：只要"原因："那一行出现就立刻往下走，最多等 20 秒。
   * 超时才是真回归。 */
  async function waitCard(maxMs) {
    const deadline = Date.now() + (maxMs || 20000);
    while (Date.now() < deadline) {
      const recs = await recsNow();
      if (recs.some(t => t.indexOf('原因：') >= 0 || t.indexOf('还能试') >= 0 ||
                         t.indexOf('本关三星达成') >= 0 || t.indexOf('还差：') >= 0)) return recs;
      await sleep(150);
    }
    return await recsNow();
  }

  /* ---------- 1. 1-6 造好车但**不给气球** → 飞不起来，必然失败 ----------
   *
   * 旧写法用的是 1-6 的**完整**标准解，然后"什么都不做"期待它失败。
   * 第 63 轮重建 1-6 之后，那个造法光靠浮力就能飘到终点 ——
   * 于是 `r1 === 'fail'` 红，而后面四条「还能试」的断言全都读不到卡。
   *
   * 真正的意图是"造一个**注定失败**的车，看失败卡会不会归因"。
   * 所以这里显式地把气球去掉（去掉升力 = 爬不上高台），
   * 而不是指望"不动"能制造失败 —— 那是旧物理的巧合，不是这条测试要验的东西。 */
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[5];
    window.__rap.startLevel(5); s.welcome=0; s.introT=1;
    const spec = JSON.parse(JSON.stringify(R.SPECS['1-6']));
    delete spec.balloon; delete spec._pops;
    if (spec._stacks) delete spec._stacks.balloon;
    R.applySpec(lv, s.build, spec);
    s.phase='build'; s.run=null; window.__rap.launch(); return 1;})()`);
  const r1 = await waitResult(200);
  const recs1 = await waitCard(20000);
  A.chk('1-6 不给气球 → 爬不上高台，真的会失败', r1 === 'fail', r1);

  const tip1 = recs1.find(t => t.indexOf('还能试') >= 0);
  A.chk('失败卡上出现「还能试」', !!tip1, tip1 || '没有这句');
  /* 数量必须与车上实际情况一致 —— 所以先读回来再比，而不是把 3 和 6 写死在断言里。
   * 第一版这里把"还剩 6 个气球"写死了，结果失败：1-6 的气球离地 0.3 m 内会**自动**
   * 扎破（引擎行为），跑到 8.6 s 时 6 个气球已经全爆了，车上真的只剩沙袋。
   * 文案是对的，断言是错的 —— 这正是"开关一个因子"的教训：
   * 写死的期望值把两个事实（引擎自动扎破 + 归因文案）混成了一条断言。 */
  const actual = JSON.parse(await ev(`(()=>{const c=window.__rap.state.run.car;
    return JSON.stringify({bags: c.sandbagCount||0,
      bal:(c.parts||[]).filter(p=>p.def&&p.def.liftMass).reduce((a,p)=>a+(p.n||0),0)});})()`));
  console.log('    车上实际剩余：沙袋 ' + actual.bags + '，气球 ' + actual.bal);
  if (actual.bags > 0) {
    /* 文案里的零件名跟着**零件表**走（第 63 轮把「沙袋」改名成「压舱石」）。
     * 写死 '个沙袋' 会在改名后永远红 —— 而信息一点没少。
     * 这里从 PARTS.sandbag.label 现取，改名时自动跟着。 */
    const bagLabel = await ev('window.__rap.RAP.PARTS.sandbag.label');
    A.chk('「还能试」点名压舱石，且数量与车上一致',
      !!tip1 && tip1.indexOf('还剩 ' + actual.bags + ' 个' + bagLabel + '没扔') >= 0,
      (tip1 || '') + '（零件名应为「' + bagLabel + '」）');
  } else {
    A.chk('车上没有沙袋时，不许点名沙袋',
      !!tip1 && tip1.indexOf('沙袋') < 0, tip1 || '');
  }
  if (actual.bal > 0) {
    A.chk('「还能试」点名气球，且数量与车上一致',
      !!tip1 && tip1.indexOf('还剩 ' + actual.bal + ' 个气球没扎') >= 0, tip1 || '');
  } else {
    A.chk('车上没有气球时，不许点名气球',
      !!tip1 && tip1.indexOf('气球') < 0, tip1 || '');
  }
  A.chk('「还能试」说明怎么操作（点车身）',
    !!tip1 && tip1.indexOf('点车身') >= 0, tip1 || '');
  // 归因是"引擎的诊断 + 具体剩余"，不是把诊断替换掉
  A.chk('仍保留引擎的诊断类别', recs1.some(t => t.indexOf('原因：') >= 0),
    recs1.filter(t => t.indexOf('原因：') >= 0).join(' '));
  A.chk('失败卡上不再出现 +N（新星）', !recs1.some(t => /^\+\d+$/.test(t)),
    recs1.filter(t => /^\+\d+$/.test(t)).join(' '));
  /* 原来这条守的是「已拿满」—— 那是金币时代的文案（钱包已满）。
   * 金币第 61 轮删掉之后，同一位置换成「无新星」，语义不变：
   * 失败局不该出现任何"这一关你又推进了"的说法。 */
  A.chk('失败卡上不出现「无新星」（那颗星不是这一局点亮的）',
    !recs1.some(t => t.indexOf('无新星') >= 0),
    recs1.filter(t => t.indexOf('新星') >= 0).join(' '));
  A.chk('失败卡上不出现「本关三星达成」', !recs1.some(t => t.indexOf('三星达成') >= 0));
  await shot('fc-01-with-parts');

  // ---------- 2. 车上没有可消耗件时不许出现这句 ----------
  await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; return 1;})()`);
  await sleep(200);
  await ev(`window.__rap.launchSpec(5, '1-1')`);     // 1-1 的车：没气球没沙袋
  const r2 = await waitResult(200);
  const recs2 = await waitCard(20000);
  A.chk('1-1 的车放 1-6 也失败', r2 === 'fail', r2);
  A.chk('车上没有可消耗件时，不出现「还能试」',
    !recs2.some(t => t.indexOf('还能试') >= 0),
    recs2.filter(t => t.indexOf('还能试') >= 0).join(' '));
  await shot('fc-02-no-parts');

  // ---------- 3. 回放标题不追归因 ----------
  const replayTitles = recs1.filter(t => t.indexOf('回放 ·') >= 0);
  A.chk('回放标题只写诊断类别，不追"还剩几个"',
    replayTitles.length > 0 && replayTitles.every(t => t.indexOf('还剩') < 0),
    replayTitles.slice(0, 2).join(' | ') || '没抓到回放标题');

  A.chk('无 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
