/* 第二次点击为什么把格子清空了？把 mousedown/mouseup/tryPlace 全打点。 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9800 + Math.floor(Math.random() * 150);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeQ-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  await ev('(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; return 1;})()');
  await sleep(300);

  // 装一个探针：记录每次 addEventListener 里 build 分支的进入与离开
  await ev(`(()=>{
    const S=window.__rap.state, R=window.__rap.RAP;
    window.__trace=[];
    const oPlace=R.tryPlace, oRemove=R.removeAt, oUndo=R.undo, oClear=R.clearBuild;
    R.tryPlace=function(lv,b,p,r,c){const res=oPlace.apply(this,arguments);
      window.__trace.push('tryPlace('+p+','+r+','+c+')->'+JSON.stringify(res));return res;};
    R.removeAt=function(lv,b,r,c){window.__trace.push('removeAt('+r+','+c+')');
      return oRemove.apply(this,arguments);};
    R.undo=function(b){window.__trace.push('undo()');return oUndo.apply(this,arguments);};
    R.clearBuild=function(b){window.__trace.push('clearBuild()');return oClear.apply(this,arguments);};
    return 1;})()`);

  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();
    return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });

  async function clickAt(dx, dy, label) {
    const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await sleep(30);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(60);
    const mid = await ev(`(()=>{const S=window.__rap.state;return JSON.stringify({dragPart:S.dragPart,pending:S.pendingClick&&{r:S.pendingClick.r,c:S.pendingClick.c},cells:Object.keys(S.build.cells)});})()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(200);
    const after = await ev(`(()=>{const S=window.__rap.state;return JSON.stringify({cells:Object.keys(S.build.cells),sel:S.selected,byUser:S.selectedByUser});})()`);
    console.log(`${label}: afterDown=${mid}`);
    console.log(`${' '.repeat(label.length)}  afterUp  =${after}`);
  }

  const geom = JSON.parse(await ev(`(()=>{const o=window.__rap.buildOrigin(), px=window.__rap.buildCellPx();
    return JSON.stringify({o:o, px:px});})()`));
  const cell = (r, c) => ({ x: geom.o.x + c * geom.px + geom.px / 2, y: geom.o.y + r * geom.px + geom.px / 2 });

  let q = cell(4, 1); await clickAt(q.x, q.y, 'cell(4,1)');
  q = cell(4, 2); await clickAt(q.x, q.y, 'cell(4,2)');

  console.log('trace:', await ev('JSON.stringify(window.__trace)'));
  console.log('final cells:', await ev('JSON.stringify(window.__rap.state.build.cells)'));

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });
