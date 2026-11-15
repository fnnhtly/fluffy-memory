/* 帧率守卫：不许有"灾难性掉帧"，也不许有明显卡顿。
 *
 * 为什么不直接断言 60：verify 串行跑二十几个 headless 浏览器，绝对帧率会被机器负载
 * 拉低（同一份代码实测 45.6 / 51.6 / 56.0 / 60.4 都出现过）。把 60 写死
 * 只会得到一个随时间随机翻红的测试，而随机翻红的测试比没有测试更糟 ——
 * 它会训练人忽略红色。
 *
 * 所以判据是**同一次会话里测出来的比值**：
 *   先在同一台机器、同一个浏览器里量一个空页面的 rAF 基线（什么都不画），
 *   再量游戏。判据是 `游戏 / 基线`，负载被约掉了。
 *
 *   1. 行驶页 ≥ 0.75 × 基线   —— 真掉到软件光栅化时这个比值是 0.23
 *   2. 长帧（>33ms）< 25%      —— 帧数够但一顿一顿也算不通过
 *   3. 建造页 ≥ 0.70 × 基线
 * 基线本身写进日志，不写成断言。
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
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  const nav = async (url, waitMs) => {
    await send('Page.navigate', { url });
    await sleep(waitMs);
  };

  // ---- 1) 基线：同一个浏览器里跑一个"只空转 rAF"的页面 ----
  await nav('data:text/html,<body style="margin:0;background:%23222"><canvas id=c width=1280 height=720></canvas></body>', 500);
  await ev(`(()=>{
    window.__n = 0; window.__gaps = []; let prev = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = function(cb){
      return raf(function(t){ window.__n++; if(prev) window.__gaps.push(t-prev); prev = t; return cb(t); });
    };
    (function loop(){ requestAnimationFrame(loop); })();
    return 1;
  })()`);
  await sleep(2200);
  const baseFps = await ev('window.__n') / 2.2;
  const baseGaps = JSON.parse(await ev(`(()=>{
    const g=window.__gaps.slice(); if(!g.length) return JSON.stringify({n:0,longPct:0});
    return JSON.stringify({n:g.length, longPct:+(g.filter(v=>v>33.4).length/g.length*100).toFixed(1)});
  })()`));
  A.log('空转基线：' + baseFps.toFixed(1) + ' fps，长帧 ' + baseGaps.longPct + '%（同一台机器同一时刻）');
  A.chk('基线本身可用（浏览器能跑满 rAF，否则下面所有比值都没意义）',
    baseFps >= 25, baseFps.toFixed(1) + ' fps');
  // 基线不达标时不再继续（比值会失去意义），但要先如实报出发生了什么
  if (baseFps < 25) {
    A.finish(ws, child, errs);
    return;
  }

  // ---- 2) 游戏页 ----
  await nav(PAGE, 900);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await nav(PAGE, 1300);

  const measure = async (seconds) => {
    await ev(`(()=>{
      if(!window.__ft){
        window.__ft={gaps:[]}; let prev=0;
        const raf=window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame=function(cb){
          return raf(function(t){ if(prev) window.__ft.gaps.push(t-prev); prev=t; return cb(t); });
        };
      }
      window.__ft.gaps.length=0;
      return 1;
    })()`);
    const f0 = await ev('window.__rap.state.frameCount');
    await sleep(seconds * 1000);
    const f1 = await ev('window.__rap.state.frameCount');
    const stats = JSON.parse(await ev(`(()=>{
      const g=window.__ft.gaps.slice();
      if(!g.length) return JSON.stringify({n:0,med:0,longPct:0});
      const nz=g.filter(v=>v>0).sort((a,b)=>a-b);
      const med=nz.length?nz[Math.floor(nz.length/2)]:0;
      return JSON.stringify({n:g.length,med:med,longPct:+(g.filter(v=>v>33.4).length/g.length*100).toFixed(1)});
    })()`));
    return { fps: (f1 - f0) / seconds, stats };
  };

  // 行驶一局（最重：地形 + 车 + 粒子 + HUD + 进度轨 + 挑战条）
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[2];
    window.__rap.startLevel(2); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-3']);
    window.__rap.launch(); return 1;})()`);
  await sleep(700);

  const runs = [];
  for (let k = 0; k < 3; k++) runs.push(await measure(2.5));
  const fpsList = runs.map(r => r.fps).sort((a, b) => a - b);
  const median = fpsList[1];
  const ratio = median / baseFps;
  A.log('行驶帧率：' + fpsList.map(v => v.toFixed(1)).join(' / ') + '，中位数 ' + median.toFixed(1));
  A.log('帧间隔：' + runs.map(r => '中位 ' + (r.stats.med || 0).toFixed(1) + 'ms / 长帧 ' +
    (r.stats.longPct || 0) + '%').join('；'));
  A.log('游戏 / 基线 = ' + ratio.toFixed(2) + '（软件光栅化事故时是 0.23）');

  A.chk('行驶帧率 >= 0.75 × 空转基线（负载无关的灾难性回归守卫）',
    ratio >= 0.75, ratio.toFixed(2) + ' × ' + baseFps.toFixed(1) + ' fps');
  const worstLong = Math.max.apply(null, runs.map(r => r.stats.longPct || 0));
  A.chk('长帧（>33ms）比例 < 25%（卡顿守卫）', worstLong < 25, '最差一次 ' + worstLong + '%');

  /* 建造页也要量（面板 + 网格 + 全部零件图元 + 统计卡）。
   *
   * ⚠ 这里必须**丢第一轮**。第 62 轮把建造镜头改成"看全图"之后，
   * 从行驶切回建造的**头 2 秒**会读到 21~45 fps，而稳定之后是 55~60
   * （tools/dbg_build_fps3.js 连量四次：45.4 → 53.8 → 51.8 → 55.2）。
   * 原因不是这一帧画得慢 —— CPU profile 显示 83% 采样落在 (idle)，
   * 是切相那一帧的重排版/首帧光栅化成本。
   *
   * 判据该问的是"**稳态**建造页撑不撑得住"，不是"切过去那一瞬间"。
   * 所以先空转 1 秒预热，再取第二轮。这和"行驶帧率取三次中位数"
   * 是同一个道理（那边的注释也写了：单次采样会被启动抖动污染）。
   *
   * 顺带把阈值从 0.70 放松到 0.60：新的看全图视角对 1-3 这种 66 列的关卡
   * 是 zoom 0.54，像素总量比旧的 2.1 特写多 3~4 倍，是**设计上换来的代价**，
   * 不是回归。真掉到软件光栅化时是 0.23，0.60 离它仍有 2.6 倍余量。 */
  await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; s.introT=1; return 1;})()`);
  await sleep(1200);
  const warm = await measure(1.0);            // 预热轮，结果丢弃
  const b = await measure(2.0);
  const bRatio = b.fps / baseFps;
  A.log('建造帧率：' + b.fps.toFixed(1) + '，比值 ' + bRatio.toFixed(2) +
    '，长帧 ' + (b.stats.longPct || 0) + '%（预热轮 ' + warm.fps.toFixed(1) + '，已丢弃）');
  A.chk('建造页稳态 >= 0.60 × 空转基线', bRatio >= 0.60,
    bRatio.toFixed(2) + ' × ' + baseFps.toFixed(1) + ' fps');

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
