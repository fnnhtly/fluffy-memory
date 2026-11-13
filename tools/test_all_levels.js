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
    { idx: 0, spec: '1-1', name: '1-1 放个轮子', minStars: 1 },
    { idx: 1, spec: '1-2', name: '1-2 按一下', minStars: 1 },
    { idx: 2, spec: '1-3', name: '1-3 电池够不够', minStars: 1 },
    { idx: 3, spec: '1-4i', name: '1-4 冰面（铁轮）', minStars: 1 },
    { idx: 3, spec: '1-4w', name: '1-4 冰面（木轮，应失败或更慢）', minStars: 0 },
    { idx: 4, spec: '1-5m', name: '1-5 第一道坎（用马达）', minStars: 1 },
    { idx: 4, spec: '1-5n', name: '1-5 第一道坎（不用马达，冲 ★★★）', minStars: 1 }
  ];

  for (const cs of CASES) {
    const setup = await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[${cs.idx}];
      window.__rap.startLevel(${cs.idx}); s.welcome=0; s.introT=1;
      R.applySpec(lv, s.build, R.SPECS['${cs.spec}']);
      const chk = R.canLaunch(s.build);
      if (!chk.ok) return 'launch-denied:' + chk.reason;
      window.__rap.launch();
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
      // 木轮上冰面应该跑不动（这是 1-4 的设计意图：逼玩家换铁轮）
      A.chk(cs.name + ' 木轮在冰面上失败（体现了轮子选择的意义）',
        info.res === 'fail' || info.stars < 3 || info.t > 8,
        info.res + ' / ' + info.t + 's');
    } else {
      A.chk(cs.name + ' 判定为胜利', info.res === 'win', info.res + ' ' + info.reason);
      A.chk(cs.name + ' 至少拿到 ★', info.stars >= cs.minStars, info.stars + ' 星');
    }
    await shot('al-' + cs.spec);
  }

  // 1-5 不用马达应该能拿满 ★★★（"马达 vs 省星"的取舍）
  {
    await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[4];
      window.__rap.startLevel(4); s.welcome=0; s.introT=1;
      R.applySpec(lv, s.build, R.SPECS['1-5n']);
      window.__rap.launch(); return 1;})()`);
    for (let i = 0; i < 260; i++) {
      await sleep(200);
      if ((await ev('window.__rap.state.phase')) === 'resolved') break;
    }
    const st = await ev('(window.__rap.state.run||{}).stars||0');
    A.chk('1-5 不用马达能拿 ★★★（★★★ 条件是可达的）', st === 3, st + ' 星');
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
