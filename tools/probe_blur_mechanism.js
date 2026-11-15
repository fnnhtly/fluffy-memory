/* 探针：在 headless 里，哪些操作会**真的**把事件送到页面上？
 *
 * 上一轮量到两件事：
 *   · 开第二个标签页 → `document.hidden` 变 true，但 **visibilitychange 事件没送到**；
 *   · `Page.setWebLifecycleState: frozen` → 同样 hidden=true，rAF 停住。
 *
 * 这直接决定了修复方案：如果"切走"在页面上根本收不到任何回调，
 * 那么光写 `visibilitychange` 监听在无头环境里是验不了的 ——
 * 我只能靠测试自己 dispatch 一个假事件，那不算证据。
 *
 * 所以先把"哪种操作能送事件"量清楚，再决定修法用哪一种机制。
 */
const path = require('path');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + os.tmpdir() + '\\edgeX-' + Date.now(),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });

  let ver = null;
  for (let i = 0; i < 60 && !ver; i++) {
    await sleep(250);
    try { ver = await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r => r.json()); } catch (e) {}
  }
  const bws = new WebSocket(ver.webSocketDebuggerUrl);
  let bid = 0; const bpend = new Map();
  await new Promise(r => { bws.onopen = r; });
  bws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && bpend.has(m.id)) {
      const { res, rej } = bpend.get(m.id); bpend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  const bsend = (method, params, sessionId) => new Promise((res, rej) => {
    const i = ++bid; bpend.set(i, { res, rej });
    bws.send(JSON.stringify({ id: i, method, params: params || {}, ...(sessionId ? { sessionId } : {}) }));
  });

  const t1 = await bsend('Target.createTarget', { url: PAGE });
  const s1 = (await bsend('Target.attachToTarget', { targetId: t1.targetId, flatten: true })).sessionId;
  await bsend('Page.enable', {}, s1);
  await bsend('Runtime.enable', {}, s1);
  await sleep(1300);

  const ev1 = async expr => {
    const r = await bsend('Runtime.evaluate', { expression: expr, returnByValue: true }, s1);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  };

  await ev1(`(()=>{window.__log=[];
    window.addEventListener('blur', ()=>window.__log.push('blur'));
    window.addEventListener('focus', ()=>window.__log.push('focus'));
    window.addEventListener('pagehide', ()=>window.__log.push('pagehide'));
    window.addEventListener('pageshow', ()=>window.__log.push('pageshow'));
    document.addEventListener('freeze', ()=>window.__log.push('freeze'));
    document.addEventListener('resume', ()=>window.__log.push('resume'));
    document.addEventListener('visibilitychange', ()=>window.__log.push('vis:'+document.visibilityState));
    /* 每帧记一次 hidden，用来判断"帧循环还跑不跑" */
    window.__frozen={frames:0,lastHidden:document.hidden};
    const tick=()=>{window.__frozen.frames++;window.__frozen.lastHidden=document.hidden;requestAnimationFrame(tick);};
    requestAnimationFrame(tick);
    return 'ok';})()`);

  async function snap(tag) {
    const s = await ev1('({log:window.__log.slice(-12), vis:document.visibilityState, hidden:document.hidden, frames:window.__frozen.frames})');
    console.log(`  [${tag}] vis=${s.vis} hidden=${s.hidden} frames=${s.frames} log=${JSON.stringify(s.log)}`);
  }

  console.log('=== 1) Page.setWebLifecycleState: frozen ===');
  await snap('切走前');
  await bsend('Page.setWebLifecycleState', { state: 'frozen' }, s1);
  await sleep(700);
  await snap('frozen 中');
  await bsend('Page.setWebLifecycleState', { state: 'active' }, s1);
  await sleep(700);
  await snap('恢复后');

  console.log('\n=== 2) 开第二个标签页 + activateTarget ===');
  await ev1('window.__log=[];window.__frozen.frames=0');
  const t2 = await bsend('Target.createTarget', { url: 'about:blank' });
  await bsend('Target.activateTarget', { targetId: t2.targetId });
  await sleep(800);
  await snap('切到标签页 2');
  await bsend('Target.activateTarget', { targetId: t1.targetId });
  await sleep(800);
  await snap('切回标签页 1');

  console.log('\n=== 3) 只关掉 target2（不切回来）===');
  await ev1('window.__log=[];window.__frozen.frames=0');
  await bsend('Target.closeTarget', { targetId: t2.targetId });
  await sleep(800);
  await snap('关掉标签页 2 后');

  console.log('\n=== 4) Emulation.setFocusEmulationEnabled / 手动 cancelFocus ===');
  await ev1('window.__log=[];window.__frozen.frames=0');
  await bsend('Emulation.setFocusEmulationEnabled', { enabled: false }, s1);
  await sleep(500);
  await snap('关掉 focus emulation');

  bws.close();
  spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
})();
