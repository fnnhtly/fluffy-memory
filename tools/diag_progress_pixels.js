/* 诊断：进度轨那一条横线上到底画了什么颜色。 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9440;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgePt-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch(); s.runBanner=0; return 1;})()`);
  await sleep(700);
  const dump = async () => JSON.parse(await ev(`(()=>{
    const cv=document.querySelector('canvas');
    const dpr=cv.width/1280;
    const g=cv.getContext('2d',{willReadFrequently:true});
    const tr=window.__rap.runProgressRect().track;
    const y=Math.round((tr.y+tr.h/2)*dpr);
    const out={dpr, cw:cv.width, ch:cv.height, y, samples:[]};
    for(const x of [tr.x+2, tr.x+20, tr.x+60, tr.x+120, tr.x+200, tr.x+280, tr.x+400, tr.x+560]){
      const d=g.getImageData(Math.round(x*dpr), y, 1,1).data;
      out.samples.push(x + ':(' + d[0] + ',' + d[1] + ',' + d[2] + ',' + d[3] + ')');
    }
    return JSON.stringify(out);
  })()`));
  let r = await dump();
  console.log('起点 dpr=' + r.dpr + ' canvas=' + r.cw + 'x' + r.ch + ' 采样行 y=' + r.y);
  console.log('  ', r.samples.join('  '));
  await ev(`(()=>{const s=window.__rap.state; s.run.car.x=14.5; return 1;})()`);
  await sleep(260);
  r = await dump();
  console.log('前进后：');
  console.log('  ', r.samples.join('  '));
  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e); process.exit(1); });
