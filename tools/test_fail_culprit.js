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
 *   3) 归因变了之后，失败卡依然不许和「成功文案」打架（+N / 已拿满 / 三星达成）；
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

  // ---------- 1. 1-6 造好车但一点不动 ----------
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[5];
    window.__rap.startLevel(5); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-6']);
    s.phase='build'; s.run=null; window.__rap.launch(); return 1;})()`);
  const r1 = await waitResult(200);
  await sleep(3400);
  const recs1 = await recsNow();
  A.chk('1-6 什么都不做真的会失败', r1 === 'fail', r1);

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
    A.chk('「还能试」点名沙袋，且数量与车上一致',
      !!tip1 && tip1.indexOf('还剩 ' + actual.bags + ' 个沙袋没扔') >= 0, tip1 || '');
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
  A.chk('失败卡上不再出现 +N', !recs1.some(t => /^\+\d+$/.test(t)),
    recs1.filter(t => /^\+\d+$/.test(t)).join(' '));
  A.chk('失败卡上不出现「已拿满」', !recs1.some(t => t.indexOf('已拿满') >= 0),
    recs1.filter(t => t.indexOf('拿满') >= 0).join(' '));
  A.chk('失败卡上不出现「本关三星达成」', !recs1.some(t => t.indexOf('三星达成') >= 0));
  await shot('fc-01-with-parts');

  // ---------- 2. 车上没有可消耗件时不许出现这句 ----------
  await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; return 1;})()`);
  await sleep(200);
  await ev(`window.__rap.launchSpec(5, '1-1')`);     // 1-1 的车：没气球没沙袋
  const r2 = await waitResult(200);
  await sleep(3400);
  const recs2 = await recsNow();
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
