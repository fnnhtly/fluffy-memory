/* 设计坐标 ↔ 画布像素的换算到底有没有偏移？
 *
 * 这个问题的答案决定**所有像素量具**能不能用 design 坐标直接读 getImageData。
 * 现有的 test_hud_overlap 里那段金圈覆盖测试就是直接拿 design 坐标读像素的，
 * 如果 headless 窗口 1280×800 让 VIEW_OFF_Y=40，那段测试其实一直读错了位置
 * —— 一个"永远绿"的量具本项目的教训已经够多了。
 *
 * 所以这里不靠推理：把 window.__view 打出来，再用两种坐标各扫一遍
 * 「?」按钮的圆环，看哪一种真的能扫到金色。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeVO-' + Date.now()),
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
  ws.onmessage = e => { const m = JSON.parse(e.data);
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

  // 进 1-1 的行驶期（「?」按钮只在行驶期画）
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch(); s.runBanner=0; s.paused=false; return 1;})()`);
  await sleep(600);

  console.log('window.__view =', JSON.stringify(await ev('JSON.stringify(window.__view)')));
  console.log('canvas w/h   =', await ev('document.querySelector("canvas").width + " × " + document.querySelector("canvas").height'));
  console.log('cv css w/h   =', await ev('(()=>{const r=document.querySelector("canvas").getBoundingClientRect(); return r.width + " × " + r.height;})()'));

  // 两种坐标各扫一遍圆环
  const ring = (useOffset) => ev(`(()=>{
    const cv=document.querySelector('canvas'), V=window.__view;
    const sx=cv.width/V.W, sy2=cv.height/V.H;
    const b=window.__rap.btnRect('help');
    const cx=(b.x+b.w/2+(${useOffset}?V.offX:0))*sx;
    const cy=(b.y+b.h/2+(${useOffset}?V.offY:0))*sy2;
    const g=cv.getContext('2d',{willReadFrequently:true});
    let gold=0, N=72;
    for(let k=0;k<N;k++){
      const a=k/N*Math.PI*2;
      for(let rr=19*sx; rr<=25*sx; rr+=0.5*sx){
        const d=g.getImageData(Math.round(cx+Math.cos(a)*rr), Math.round(cy+Math.sin(a)*rr),1,1).data;
        if(d[0]>110 && d[0]>d[2]+20){ gold++; break; }
      }
    }
    return JSON.stringify({gold, cx:Math.round(cx), cy:Math.round(cy)});
  })()`);
  console.log('金圈（design 直读）      =', await ring(false));
  console.log('金圈（design + __view 偏移） =', await ring(true));

  ws.close();
  child.kill();
  if (errs.length) console.log('errors:', errs.join(' | '));
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
