/* 金币必须是"最好那一次"，不能靠重刷累加。
 *
 * 起因：结算卡上画了 `×金币`，选关页有"总进度"，但金币从来没进存档——
 * 玩家看到的数字关掉页面就没了。这一轮补上存档，同时把最容易写错的
 * 那条语义钉住：**重刷同一关不许刷金币**（否则这个数字就是在骗人）。
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeCn-' + Date.now()),
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
  await send('Runtime.evaluate', { expression:
    "localStorage.setItem('rap-welcomed-v1','1');localStorage.removeItem('rap-progress-v1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  // 公式本身
  const f = JSON.parse(await ev(`(()=>{const R=window.__rap;
    return JSON.stringify({ s1b0: R.coinsOf(1,0), s1b1: R.coinsOf(1,1), s3b2: R.coinsOf(3,2) });})()`));
  A.log('coinsOf：1★0箱=' + f.s1b0 + '，1★1箱=' + f.s1b1 + '，3★2箱=' + f.s3b2);
  A.chk('coinsOf(1,0) = 50', f.s1b0 === 50, String(f.s1b0));
  A.chk('coinsOf(1,1) = 80（多拿一个箱子多 30）', f.s1b1 === 80, String(f.s1b1));
  A.chk('coinsOf(3,2) = 210', f.s3b2 === 210, String(f.s3b2));
  A.chk('刚开始时总金币为 0', (await ev('window.__rap.totalCoins()')) === 0);

  // 真跑一关拿金币
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch(); s.runBanner=0; return 1;})()`);
  let done = false;
  for (let i = 0; i < 200; i++) {
    await sleep(200);
    if ((await ev('window.__rap.state.phase')) === 'resolved') { done = true; break; }
  }
  A.chk('1-1 跑到了结算', done);
  const r1 = JSON.parse(await ev(`(()=>{const r=window.__rap.state.run;
    return JSON.stringify({win:r.result==='win', stars:r.stars, boxes:r.boxesGot});})()`));
  const saved = JSON.parse(await ev(`localStorage.getItem(window.__rap.SAVE_KEY)||'{}'`));
  A.log('1-1 结果：' + r1.stars + ' 星 / 木箱 ' + r1.boxes +
    '；存档 = ' + JSON.stringify(saved['1-1']));
  A.chk('胜利后 1-1 进了存档', !!saved['1-1']);
  A.chk('存档里的金币 = coinsOf(星, 箱)',
    saved['1-1'].coins === 50 * r1.stars + 30 * r1.boxes,
    saved['1-1'].coins + ' vs ' + (50 * r1.stars + 30 * r1.boxes));
  const total1 = await ev('window.__rap.totalCoins()');
  A.chk('总金币等于这一关的金币', total1 === saved['1-1'].coins, total1 + ' / ' + saved['1-1'].coins);

  // 重刷同一关：金币不许翻倍
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch(); s.runBanner=0; return 1;})()`);
  for (let i = 0; i < 200; i++) {
    await sleep(200);
    if ((await ev('window.__rap.state.phase')) === 'resolved') break;
  }
  const total2 = await ev('window.__rap.totalCoins()');
  A.chk('重刷同一关后总金币没有翻倍（这就是"不累加"的意思）',
    total2 === total1, total1 + ' → ' + total2);

  // 分数更低的一次不许把记录改小
  await ev(`(()=>{
    const R=window.__rap, all=JSON.parse(localStorage.getItem(R.SAVE_KEY)||'{}');
    all['1-1']={stars:1,best:99.9,coins:50};
    localStorage.setItem(R.SAVE_KEY, JSON.stringify(all));
    return 1;})()`);
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  const t3 = await ev('window.__rap.totalCoins()');
  A.chk('刷新后总金币从存档恢复', t3 === 50, String(t3));

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
