/* 行驶期进度轨：小猪标记必须随车前进、必须落在轨道内、必须真的被画出来。
 *
 * 判据分三层：
 *   1. 几何：标记的 x 由车心换算，车越往前 x 越大，且始终在轨道两端之间；
 *   2. 像素：轨道已走部分（金色）的长度必须随车前进而变长；
 *   3. 自证：把车人为放回起点，金色长度必须回到 ~0（否则说明读的不是这条轨道）。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgePr-' + Date.now()),
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
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  // 注意：不要在这里动 state.camState —— drawRun 每帧读它，置 null 会让整帧抛异常、
  // 画面停在 clearRect 之后的黑屏上，于是"金色像素 0"这种读数全都是假的。
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch(); s.runBanner=0; return 1;})()`);
  await sleep(500);

  // 先确认这一帧真的画了东西：画面全黑时下面所有像素断言都无意义
  const notBlank = await ev(`(()=>{
    const cv=document.querySelector('canvas');
    const g=cv.getContext('2d',{willReadFrequently:true});
    const d=g.getImageData(0, 0, cv.width, cv.height).data;
    let bright=0;
    for(let i=0;i<d.length;i+=4*97){ if(d[i]+d[i+1]+d[i+2] > 60) bright++; }
    return bright;
  })()`);
  A.chk('行驶画面不是黑屏（像素断言的前提）', notBlank > 50, notBlank + ' 个亮像素采样');

  // 标记位置（按渲染同一套公式算出来，用于几何断言）
  const markerX = () => ev(`(()=>{
    const s=window.__rap.state, lv=window.__rap.level(), tr=window.__rap.runProgressRect().track;
    const c0=lv.start.col, c1=lv.goal.col, span=Math.max(1,c1-c0);
    const c=s.run.car.x;
    return tr.x + Math.max(0,Math.min(1,(c-c0)/span))*tr.w;
  })()`);
  const track = await ev('JSON.stringify(window.__rap.runProgressRect().track)').then(JSON.parse);

  // 像素：轨道中"已走过"的金色像素数（用每列取样，避免整块 getImageData）
  const goldLen = () => ev(`(()=>{
    const cv=document.querySelector('canvas');
    const dpr=cv.width/1280;
    const g=cv.getContext('2d',{willReadFrequently:true});
    const tr=window.__rap.runProgressRect().track;
    const y=Math.round((tr.y+tr.h/2)*dpr);
    let n=0;
    for(let x=Math.round(tr.x*dpr); x<=Math.round((tr.x+tr.w)*dpr); x++){
      const d=g.getImageData(x,y,1,1).data;
      if(d[0]>180 && d[1]>160 && d[2]<210 && d[0]>d[2]+30) n++;
    }
    window.__goldDbg = {dpr:dpr, y:y, cw:cv.width, ch:cv.height};
    return n;
  })()`);

  const x0 = await markerX();
  const g0 = await goldLen();
  A.log('起点：标记 x=' + x0.toFixed(1) + '，金色像素 ' + g0);
  A.chk('刚出发时标记靠近轨道左端', x0 - track.x < track.w * 0.15,
    (x0 - track.x).toFixed(1) + ' px 距左端');
  A.chk('刚出发时金色几乎为零（判据能反映"没走"）', g0 <= 20, g0 + ' px');

  // 跑一段
  for (let i = 0; i < 60; i++) {
    await sleep(200);
    if ((await ev('window.__rap.state.phase')) !== 'run') break;
    if ((await ev('(window.__rap.state.run||{}).car.x||0')) > 12) break;
  }
  const carX = await ev('window.__rap.state.run.car.x');
  const x1 = await markerX();
  const g1 = await goldLen();
  A.log('前进后：车 x=' + carX.toFixed(1) + ' m，标记 x=' + x1.toFixed(1) + '，金色像素 ' + g1);
  A.log('取样参数：' + JSON.stringify(await ev('window.__goldDbg')) +
    '  行内实测 ' + await ev(`(()=>{const cv=document.querySelector('canvas');
      const dpr=cv.width/1280, g=cv.getContext('2d',{willReadFrequently:true});
      const tr=window.__rap.runProgressRect().track, y=Math.round((tr.y+tr.h/2)*dpr);
      const d=g.getImageData(Math.round((tr.x+80)*dpr),y,1,1).data; return d[0]+','+d[1]+','+d[2];})()`));
  A.chk('车确实前进了（否则测的不是进度轨）', carX > 4, carX.toFixed(1) + ' m');
  A.chk('标记跟着车往右走', x1 > x0 + 20, (x1 - x0).toFixed(1) + ' px');
  A.chk('金色进度跟着变长', g1 > g0 + 40, g0 + ' → ' + g1);
  A.chk('标记始终在轨道内',
    x1 >= track.x - 1 && x1 <= track.x + track.w + 1,
    x1.toFixed(1) + ' ∈ [' + track.x + ',' + (track.x + track.w) + ']');

  // 自证：把车硬塞回起点，金色长度必须回落（说明读的确实是这条轨道）。
  // 注意不能要求回到 0：重置之后物理还在跑，260ms 里车会自己滚出一点（约 20px）。
  await ev(`(()=>{const s=window.__rap.state; s.run.car.x=window.__rap.level().start.col+0.5; return 1;})()`);
  await sleep(260);
  const g2 = await goldLen();
  A.chk('把车放回起点后金色长度大幅回落（度量尺能失败）',
    g2 < g1 / 4, g1 + ' → ' + g2 + '（阈值 ' + (g1 / 4).toFixed(0) + '）');

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
