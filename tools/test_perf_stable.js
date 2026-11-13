/* 帧率守卫：不许有"灾难性掉帧"，也不许有明显卡顿。
 *
 * 为什么阈值不是 60：verify 串行跑 20+ 个 headless 浏览器，绝对帧率会被机器负载拉低
 * （同一份代码实测 45.6 / 51.6 / 56.0 / 60.4 都出现过）。把 60 当断言
 * 只会得到一个随时间随机翻红的测试 —— 那种测试比没有更糟。
 *
 * 所以拆成三条，各自有明确语义：
 *   1. 中位帧率 >= 45   —— 灾难性回归守卫（真掉到软件光栅化时是 14）
 *   2. 长帧比例 < 25%   —— 卡顿守卫（单帧 > 33ms 算卡）
 *   3. 建造页 >= 45     —— 两屏都要管
 * 实测基线（空闲机器)写进日志，不写成断言。
 *
 * 绝对不能加 --disable-gpu：那会走软件光栅化，量到的不是游戏。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);   // 随机端口：避免残留进程撞车
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeS2-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(900);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  // 记录每一帧的间隔（rAF 时间戳）：比"数帧数 / 秒"更能说明卡顿
  await ev(`(()=>{
    if (window.__ft) return 1;
    window.__ft = { gaps: [] };
    let prev = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function(cb){
      return raf(function(t){
        if (prev) window.__ft.gaps.push(t - prev);
        prev = t;
        return cb(t);
      });
    };
    return 1;
  })()`);

  const measure = async (seconds) => {
    await ev(`(()=>{ window.__ft.gaps.length = 0; return 1; })()`);
    const f0 = await ev('window.__rap.state.frameCount');
    await sleep(seconds * 1000);
    const f1 = await ev('window.__rap.state.frameCount');
    const stats = JSON.parse(await ev(`(()=>{
      const g = window.__ft.gaps.slice();
      if (!g.length) return JSON.stringify({n:0, med:0, longPct:0});
      const sorted = g.slice().sort((a,b)=>a-b);
      const nz = sorted.filter(v => v > 0);
      const med = nz.length ? nz[Math.floor(nz.length/2)] : 0;
      const long = g.filter(v => v > 33.4).length;
      return JSON.stringify({n:g.length, med:med, longPct:+(long/g.length*100).toFixed(1)});
    })()`));
    return { fps: (f1 - f0) / seconds, stats };
  };

  // 行驶一局（最重：地形 + 车 + 粒子 + HUD + 进度轨）
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[2];
    window.__rap.startLevel(2); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-3']);
    window.__rap.launch(); return 1;})()`);
  await sleep(600);

  const runs = [];
  for (let k = 0; k < 3; k++) runs.push(await measure(2.5));
  const fpsList = runs.map(r => r.fps).sort((a, b) => a - b);
  const median = fpsList[1];
  A.log('三次帧率：' + fpsList.map(v => v.toFixed(1)).join(' / ') + '，中位数 ' + median.toFixed(1));
  A.log('帧间隔：' + runs.map(r => '中位 ' + (r.stats.med || 0).toFixed(1) + 'ms / 长帧 ' +
    (r.stats.longPct || 0) + '%').join('；'));
  A.log(median >= 55 ? '（空闲机器基线是 60.0）' : '（本机负载偏高：这台机器上 45~60 都属正常，判据取 45）');

  A.chk('行驶阶段中位帧率 >= 45（灾难性回归守卫）', median >= 45, median.toFixed(1) + ' fps');
  const worstLong = Math.max.apply(null, runs.map(r => r.stats.longPct || 0));
  A.chk('长帧（>33ms）比例 < 25%（卡顿守卫）', worstLong < 25, '最差一次 ' + worstLong + '%');

  // 建造页也要量一次（面板 + 网格 + 全部零件图元）
  await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; s.introT=1; return 1;})()`);
  await sleep(700);
  const b = await measure(2.0);
  A.log('建造页帧率：' + b.fps.toFixed(1) + '，长帧 ' + (b.stats.longPct || 0) + '%');
  A.chk('建造页中位帧率 >= 45', b.fps >= 45, b.fps.toFixed(1) + ' fps');

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
