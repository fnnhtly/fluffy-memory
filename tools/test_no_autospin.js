/* 打气筒：长按不自己转、单击转一次（用户原话："打气筒为什么左键长按会一直旋转，
 * 不应该是点一下转一下吗"）。
 *
 * 原来已经算出了 allSame，但只 console.log 一句 PASS/FAIL 就 exit 0 ——
 * 也就是说这条用户明确提过的问题，回归里其实是"永远通过"的。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9419;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeNs-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(800);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });

  // 切 1-2，用官方预设摆一台带打气筒的车
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[1];
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-2']); s.selected='pump';
  })()`);
  await sleep(420);

  // 找打气筒所在的格子（不写死 3,2）
  const pumpKey = await ev(`(()=>{const c=window.__rap.state.build.cells;
    for (const k in c) if (c[k] && c[k].part==='pump') return k; return null;})()`);
  A.chk('预设里能找到打气筒', !!pumpKey, 'key=' + pumpKey);
  if (!pumpKey) A.finish(ws, child, errs);
  const [pr, pc] = pumpKey.split(',').map(Number);
  const BP = await ev('window.__rap.BUILD_PX');
  const OR = JSON.parse(await ev('JSON.stringify(window.__rap.buildOrigin())'));
  const c = cl(OR.x + pc * BP + BP / 2, OR.y + pr * BP + BP / 2);

  const dirOf = () => ev(`window.__rap.state.build.cells['${pumpKey}'].dir`);
  const d0 = await dirOf();

  // 按住 1.2 秒，每秒采样 10 次
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y, button: 'none' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  const dirs = [];
  for (let i = 0; i < 12; i++) { await sleep(100); dirs.push(await dirOf()); }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  await sleep(200);
  const d1 = await dirOf();
  await shot('ns-01-no-spin');

  A.chk('长按 1.2s 期间方向完全不变（用户提过的旋转 bug）',
    dirs.every(d => d === d0), '按下前 ' + d0 + '  采样 ' + dirs.join(','));
  // 用户的诉求是"点一下转一下"：一次完整的按下+抬起 = 恰好转一格。
  // 实现把旋转放在抬手时，所以这个手势的净变化必须是 +1（而不是 0 或 +3）。
  A.chk('一次完整的点击（按下+抬起）恰好转一格', d1 === (d0 + 1) % 4,
    d0 + ' → ' + d1 + '（长按本身没转，抬手时转了一格）');
  await shot('ns-01-no-spin');

  // 再点一次再 +1（确认是循环递增，不是随机跳）
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y, button: 'none' });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  await sleep(260);
  const d2 = await dirOf();
  A.chk('第二次点击再 +1（循环递增，不乱跳）', d2 === (d1 + 1) % 4, d1 + ' → ' + d2);

  // 第三次 + 第四次：绕回 0，证明是 4 方向循环
  for (let k = 0; k < 2; k++) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await sleep(250);
  }
  const d4 = await dirOf();
  A.chk('点满 4 次绕回原方向（4 方向循环）', d4 === d0, d0 + ' → ' + d4);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
