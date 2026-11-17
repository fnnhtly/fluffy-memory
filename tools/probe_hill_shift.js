/* 视差到底有没有生效？直接把山体剪影在屏幕上的左右边界量出来。 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9440 + Math.floor(Math.random() * 90);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeHP2-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(400);

  const snap = async (label) => {
    const r = JSON.parse(await ev(`(()=>{
      const R=window.__rap, S=R.state, v=S.buildView;
      const cv=document.getElementById('cv'), g=cv.getContext('2d'), vv=window.__view;
      const k = cv.width / vv.W;
      // 扫整幅图，找出"远山那个颜色"的像素范围
      const lv=R.levels[S.levelIndex];
      const bm = { field:'#6E93A6' };  // 1-1 field 的 hill 颜色
      const img = g.getImageData(0,0,cv.width,cv.height).data;
      let minX=1e9,maxX=-1,minY=1e9,maxY=-1,n=0;
      for (let y=0;y<cv.height;y+=2){
        for (let x=0;x<cv.width;x+=2){
          const i=(y*cv.width+x)*4;
          const r0=img[i],g0=img[i+1],b0=img[i+2];
          // hill #6E93A6 = (110,147,166)
          if (Math.abs(r0-110)<14 && Math.abs(g0-147)<14 && Math.abs(b0-166)<16){
            n++; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y;
          }
        }
      }
      return JSON.stringify({ camX:+v.x.toFixed(3), zoom:+v.zoom.toFixed(3),
        pixels:n, minX:+minX.toFixed(0), maxX:+maxX.toFixed(0),
        minY:+minY.toFixed(0), maxY:+maxY.toFixed(0), cvW:cv.width, cvH:cv.height });
    })()`));
    console.log(label, JSON.stringify(snap.last = r));
    return r;
  };

  await ev(`(()=>{const S=window.__rap.state; S.buildView.x = window.__rap.level().start.col + 6;
    window.__rap.clampBuildView(S.buildView, window.__rap.level()); return 1;})()`);
  await sleep(350);
  const a = await snap('A');

  await ev(`(()=>{const S=window.__rap.state; S.buildView.x += 3;
    window.__rap.clampBuildView(S.buildView, window.__rap.level()); return 1;})()`);
  await sleep(350);
  const b = await snap('B');

  console.log('cam 位移(米):', (b.camX - a.camX).toFixed(3));
  console.log('山体像素包围盒 x: A', a.minX, '..', a.maxX, '  B', b.minX, '..', b.maxX);
  console.log('山体数量: A', a.pixels, ' B', b.pixels);

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });
