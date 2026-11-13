/* 结算页的键盘：按钮上画了键帽（空格 / N），键盘就必须真的按得动。
 *
 * 这一条是照着"panel 上写了就得兑现"的既有教训来的 ——
 * 之前暂停面板写了"空格继续 / R 回建造"，但键盘分支是空的。
 * 结算页当初也漏了：README 说"空格重开"，实际按下去什么都不发生。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9432;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeRk-' + Date.now()),
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
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }
  async function key(k, code, keyCode) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: code, windowsVirtualKeyCode: keyCode });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code, windowsVirtualKeyCode: keyCode });
    await sleep(300);
  }
  // 快速跑一关到结算（用官方预设 + 直接推进）
  // 注意 SPECS 的键不等于 levelId：1-4 有两套（1-4i 冰面 / 1-4w 木轮），
  // 1-5 也有两套（1-5m 用马达 / 1-5n 不用马达）。
  const SPEC_OF = ['1-1', '1-2', '1-3', '1-4i', '1-5m'];
  async function runToResult(levelIdx) {
    await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[${levelIdx}];
      window.__rap.startLevel(${levelIdx}); s.welcome=0; s.introT=1;
      R.applySpec(lv, s.build, R.SPECS['${SPEC_OF[levelIdx]}']);
      window.__rap.launch(); return 1;})()`);
    for (let i = 0; i < 160; i++) {
      await sleep(200);
      if ((await ev('window.__rap.state.phase')) === 'resolved') return true;
    }
    return false;
  }

  A.chk('能跑到 1-1 的结算页', await runToResult(0));
  await sleep(900);
  A.chk('结算页确实显示了两个按钮的键帽信息',
    (await ev('window.__rap.state.resultBtnY')) > 0,
    'resultBtnY=' + (await ev('window.__rap.state.resultBtnY')));
  await shot('rk-01-result');

  const idx0 = await ev('window.__rap.state.levelIndex');
  const keptParts = await ev('Object.keys(window.__rap.state.build.cells).length');
  A.chk('结算时仍保留着拼装', keptParts > 0, keptParts + ' 格');

  // 空格 = 重试（保留拼装）
  await key(' ', 'Space', 32);
  A.chk('空格真的重开了', (await ev('window.__rap.state.phase')) === 'build',
    'phase=' + (await ev('window.__rap.state.phase')));
  A.chk('重开后关卡没变', (await ev('window.__rap.state.levelIndex')) === idx0);
  A.chk('重开后拼装保留了（不是清空）',
    (await ev('Object.keys(window.__rap.state.build.cells).length')) === keptParts,
    (await ev('Object.keys(window.__rap.state.build.cells).length')) + ' / ' + keptParts);
  await shot('rk-02-after-space');

  // N = 下一关
  A.chk('再跑一次到结算', await runToResult(0));
  await sleep(900);
  const before = await ev('window.__rap.state.levelIndex');
  await key('n', 'KeyN', 78);
  A.chk('N 键真的进下一关', (await ev('window.__rap.state.levelIndex')) === before + 1,
    before + ' → ' + (await ev('window.__rap.state.levelIndex')));
  A.chk('进下一关后回到建造', (await ev('window.__rap.state.phase')) === 'build');
  await shot('rk-03-next');

  // 最后一关：N 不该越界
  A.chk('能跑到最后一关的结算', await runToResult(4));
  await sleep(900);
  const lastIdx = await ev('window.__rap.state.levelIndex');
  await key('n', 'KeyN', 78);
  A.chk('最后一关按 N 不会越界',
    (await ev('window.__rap.state.levelIndex')) === lastIdx,
    '仍是第 ' + (await ev('window.__rap.state.levelIndex')) + ' 关');

  // 结算页仍能开选关
  await key('l', 'KeyL', 76);
  A.chk('结算页按 L 仍能开选关', (await ev('window.__rap.state.levelSelect')) === true);
  // CDP 的 key 名必须是 'Escape'（全大写）；写 'escape' 会派发一个 key='' 的空事件，
  // 页面收到的根本不是 Esc —— 第一版就是这么误判的。
  await key('Escape', 'Escape', 27);
  A.chk('再按 Esc 关掉选关', (await ev('window.__rap.state.levelSelect')) === false);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
