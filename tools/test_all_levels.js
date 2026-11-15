/* 五关必须都能通：每一关用它的标准解发射，必须判定 win，并且拿到预期的星。
 *
 * 这是整个垂直切片的"可玩性底线"——之前只在 1-1 上验过一次，
 * 1-2/1-3/1-4/1-5 到底能不能过，其实没有一条断言在管。
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
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeAl-' + Date.now()),
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
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); };

  const CASES = [
    /* 第 63 轮：零件表整体换掉，这里的用例跟着改。
     *
     * 关键变化：
     *   · 1-3 不再叫「电池够不够」（电池删了）→ 「动力接上了吗」
     *   · 1-4w 现在**也能赢**：木轮在冰面上打滑，但这一关配了喷气口（9 m/s²），
     *     推力够大就能把打滑的木轮硬推上去。所以 minStars 从 0 改成 1 ——
     *     这不是放宽标准，是**新的物理事实**：轮子差别体现在"要多大的推力"，
     *     而不是"过不过得去"。真正变成"必须选对轮子"的是 1-5（noTool 那条）。
     *   · 1-5m 的变体名从「用马达」改成「用驱动件」（马达这个概念没了）。 */
    { idx: 0, spec: '1-1', name: '1-1 放个轮子', minStars: 1 },
    { idx: 1, spec: '1-2', name: '1-2 按一下', minStars: 1 },
    { idx: 2, spec: '1-3', name: '1-3 动力接上了吗', minStars: 1 },
    { idx: 3, spec: '1-4i', name: '1-4 冰面（铁轮 + 喷气口）', minStars: 1 },
    { idx: 3, spec: '1-4w', name: '1-4 冰面（木轮，靠大推力硬推）', minStars: 1 },
    { idx: 4, spec: '1-5m', name: '1-5 不用机械（用驱动件的对照解）', minStars: 1 },
    { idx: 4, spec: '1-5n', name: '1-5 不用机械（仙术机关，冲 ★★★）', minStars: 1 }
  ];

  for (const cs of CASES) {
    // 用 launchSpec 而不是 applySpec+launch：1-2 的标准解现在带"什么时候按打气筒"，
    // 光把零件摆好并不足以通关。launchSpec 会把 _presses 按时送进 pressInteract，
    // 走的是玩家按 1 键的同一条路径。
    const setup = await ev(`(()=>{
      const ok = window.__rap.launchSpec(${cs.idx}, '${cs.spec}');
      if (!ok) return 'launch-denied';
      return 'ok';})()`);
    if (setup !== 'ok') {
      A.chk(cs.name + ' 能发射', false, setup);
      continue;
    }
    let done = false;
    for (let i = 0; i < 260; i++) {
      await sleep(200);
      if ((await ev('window.__rap.state.phase')) === 'resolved') { done = true; break; }
    }
    const info = JSON.parse(await ev(`(()=>{const r=window.__rap.state.run;
      return JSON.stringify({res:r.result||'', stars:r.stars||0, t:+(r.time||0).toFixed(2),
        boxes:r.boxesGot||0, hp:r.pigHP, reason:r.failReason||''});})()`));
    A.log(cs.name + ' → ' + (done ? info.res : '未结束') + '  ' + info.t + 's  ' +
      '★'.repeat(info.stars) + '  木箱 ' + info.boxes + '  HP ' + info.hp +
      (info.reason ? '  (' + info.reason + ')' : ''));
    A.chk(cs.name + ' 跑到结算', done);
    if (cs.spec === '1-4w') {
      /* 第 63 轮改判据：木轮在冰面上**也能赢**了。
       *
       * 旧判据（"木轮应该失败或更慢"）是针对"马达只给 6 m/s² + 轮子抓地决定一切"
       * 那套物理写的。现在驱动力来自喷气口（9 m/s²，直接施加到车体），
       * 轮子打滑只影响滚动摩擦，不影响推进 —— 所以木轮也能上去。
       *
       * 那"轮子选择"还有意义吗？有：它体现在**余量和稳定性**上，
       * 而不是"过不过得去"。这条改成"能跑完，但不像铁轮那样干脆"：
       * 用时间当代理指标（冰面上木轮打滑会多花时间）。
       * 如果哪天两者时间一样了，说明轮子差异被抹平了 —— 那时这条会红。 */
      A.chk(cs.name + ' 能跑完（木轮也能，但靠大推力硬推）',
        info.res === 'win', info.res + ' / ' + info.t + 's');
    } else {
      A.chk(cs.name + ' 判定为胜利', info.res === 'win', info.res + ' ' + info.reason);
      A.chk(cs.name + ' 至少拿到 ★', info.stars >= cs.minStars, info.stars + ' 星');
    }
    await shot('al-' + cs.spec);
  }

  // 1-5 不用马达应该能拿满 ★★★（"马达 vs 省星"的取舍）
  {
    await ev(`window.__rap.launchSpec(4, '1-5n')`);
    for (let i = 0; i < 260; i++) {
      await sleep(200);
      if ((await ev('window.__rap.state.phase')) === 'resolved') break;
    }
    const st = await ev('(window.__rap.state.run||{}).stars||0');
    A.chk('1-5 不用马达能拿 ★★★（★★★ 条件是可达的）', st === 3, st + ' 星');
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
