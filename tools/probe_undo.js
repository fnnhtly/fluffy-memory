/* 探针：撤销（Z）到底撤的是"最后一次操作"，还是"最后放下的那件"？
 *
 * 疑点：RAP.undo 的实现是 `build.order.pop()` 然后删掉那一格。
 * 而 order 只在**放下**时 push、在**拆掉**时 splice —— 拆掉的东西不会留在 order 里。
 * 所以：
 *   · 放下 A、放下 B，按 Z → 删 B（对）
 *   · 放下 A、把 B 拖出网格卸下，按 Z → order 里只剩 A，**A 被删掉**，
 *     而 B 并没有回来（错：玩家想找回 B，结果丢了 A）
 *   · 橡皮擦掉 A，按 Z → 同上（错）
 *
 * 这不是"少个功能"，是**撤销按钮会主动毁掉玩家的东西** ——
 * 对"正常游戏"的底线来说，这是 bug，不是缺功能。
 */
const fs = require('fs');
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeUD-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  await ev('window.__rap.state.introT=1');
  await sleep(250);

  const box = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();
    return JSON.stringify({left:r.left,top:r.top,w:r.width,h:r.height});})()`));
  const toClient = (x, y) => ({ x: box.left + x * box.w / 1280, y: box.top + y * box.h / 720 });
  async function mouse(type, x, y) {
    const c = toClient(x, y);
    await send('Input.dispatchMouseEvent', { type, x: c.x, y: c.y,
      button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mouseMoved' ? 0 : 1, clickCount: 1 });
  }
  async function drag(from, to) {
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y);
    for (let i = 1; i <= 10; i++) {
      await mouse('mouseMoved', from.x + (to.x - from.x) * i / 10, from.y + (to.y - from.y) * i / 10);
      await sleep(28);
    }
    await mouse('mouseReleased', to.x, to.y);
    await sleep(220);
  }
  async function key(name) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, windowsVirtualKeyCode: name === 'z' ? 90 : 0 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, windowsVirtualKeyCode: name === 'z' ? 90 : 0 });
    await sleep(220);
  }

  const geo = JSON.parse(await ev(`(()=>{const R=window.__rap,RAP=R.RAP,o=R.buildOrigin();
    return JSON.stringify({ox:o.x,oy:o.y,px:R.BUILD_PX,rows:RAP.BUILD_ROWS});})()`));
  const cc = (r, c) => ({ x: geo.ox + c * geo.px + geo.px / 2, y: geo.oy + r * geo.px + geo.px / 2 });
  const OUT_L = { x: geo.ox - 140, y: geo.oy + geo.px * 2 };
  const board = async () => JSON.parse(await ev(`(()=>{const s=window.__rap.state;
    const m={}; Object.keys(s.build.cells).sort().forEach(k=>{const c=s.build.cells[k];
      m[k]=c.part+(c.n>1?'x'+c.n:'')+(c.inner?'/'+c.inner:'');});
    return JSON.stringify({cells:m, order:s.build.order.join('|')});})()`));
  const setup = async () => {
    await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[5];
      window.__rap.startLevel(5); s.welcome=0; s.introT=1;
      R.applySpec(lv,s.build,R.SPECS['1-6']);
      /* 留一格气球在 (1,1) 当"会被卸下的那件"，
       * 另外 (2,1)(2,2) 两块木框当"无辜的旁观者" ——
       * 如果撤销把旁观者删了，就能一眼看见。 */
      s.build.cells['1,1']={part:'balloon',dir:0,n:1};
      if(s.build.order.indexOf('1,1')<0) s.build.order.push('1,1');
      return 1;})()`);
    await sleep(160);
  };

  // ---------- A. 卸下之后按 Z ----------
  await setup();
  const a0 = await board();
  console.log('\n[A] 初始：' + JSON.stringify(a0.cells));
  await drag(cc(1, 1), OUT_L);
  const a1 = await board();
  console.log('[A] 把 (1,1) 的气球拖出网格卸下：' + JSON.stringify(a1.cells));
  console.log('    order：' + a1.order);
  await key('z');
  const a2 = await board();
  console.log('[A] 按 Z 之后：' + JSON.stringify(a2.cells));
  const restored = !!a2.cells['1,1'];
  const lost = Object.keys(a0.cells).filter(k => !a2.cells[k]);
  console.log('   气球回来了吗：' + (restored ? '回来了' : '**没有**'));
  console.log('   反而少了什么：' + (lost.length ? lost.map(k => k + '=' + a0.cells[k]).join(' ') : '（没有）'));

  // ---------- B. 橡皮擦掉之后按 Z ----------
  await setup();
  const b0 = await board();
  await ev(`window.__rap.state.selected = 'eraser'`);
  await sleep(120);
  await drag(cc(1, 1), cc(1, 1));
  // 橡皮是按下即擦；上面那个 drag 里 mousePressed 就会擦掉
  const b1 = await board();
  console.log('\n[B] 用橡皮擦掉 (1,1)：' + JSON.stringify(b1.cells));
  await key('z');
  const b2 = await board();
  console.log('[B] 按 Z 之后：' + JSON.stringify(b2.cells));
  const bLost = Object.keys(b0.cells).filter(k => !b2.cells[k]);
  console.log('   擦掉的那件回来了吗：' + (!!b2.cells['1,1'] ? '回来了' : '**没有**'));
  console.log('   反而少了什么：' + (bLost.length ? bLost.map(k => k + '=' + b0.cells[k]).join(' ') : '（没有）'));

  console.log('\nerrors:', errs.length ? errs.slice(0, 3) : '(none)');
  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
