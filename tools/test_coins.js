/* 金币与累计星：金币不再是存档里一个独立的数字，而是从**永久星标记**推导出来的。
 *
 * 为什么要改：从《捣蛋猪》抄来的累计三星（见 docs/reference-badpiggies.md §3）意味着
 * 星是"点亮过就永久亮"的标记，而金币如果还单独存一个数，两者迟早会漂移
 * （改公式、旧存档、作弊写入都会让它们对不上）。
 * 现在金币 = f(已点亮星, 最好木箱数)，只有一处真相。
 *
 * 这一版同时验证：旧格式存档（只有 stars 数字）能迁移，不会显示成 0 星。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeCo-' + Date.now()),
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
  await send('Runtime.evaluate', { expression: "localStorage.clear(); localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  const runLevel = async (idx, spec) => {
    await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[${idx}];
      window.__rap.startLevel(${idx}); s.welcome=0; s.introT=1;
      R.applySpec(lv, s.build, R.SPECS['${spec}']);
      window.__rap.launch(); s.runBanner=0; return 1;})()`);
    for (let i = 0; i < 250; i++) {
      await sleep(200);
      if ((await ev('window.__rap.state.phase')) === 'resolved') return true;
    }
    return false;
  };

  // ---- 1) 纯函数 ----
  const f = JSON.parse(await ev(`(()=>{const R=window.__rap;return JSON.stringify({
    s1b0:R.coinsOf(1,0), s1b1:R.coinsOf(1,1), s3b2:R.coinsOf(3,2)});})()`));
  A.chk('coinsOf(1,0) = 50', f.s1b0 === 50, String(f.s1b0));
  A.chk('coinsOf(1,1) = 80（多一个箱子多 30）', f.s1b1 === 80, String(f.s1b1));
  A.chk('coinsOf(3,2) = 210', f.s3b2 === 210, String(f.s3b2));
  A.chk('刚开始时总金币为 0', (await ev('window.__rap.totalCoins()')) === 0);

  // ---- 2) 真跑一关 ----
  A.chk('1-1 跑到结算', await runLevel(0, '1-1'));
  const r1 = JSON.parse(await ev(`(()=>{const r=window.__rap.state.run;
    return JSON.stringify({win:r.result==='win', stars:r.stars, boxes:r.boxesGot,
      goals:r.starGoals});})()`));
  const saved = JSON.parse(await ev(`localStorage.getItem(window.__rap.SAVE_KEY)||'{}'`));
  A.log('1-1 结果：' + r1.stars + ' 星 / 木箱 ' + r1.boxes + '；存档 = ' + JSON.stringify(saved['1-1']));
  A.chk('胜利后 1-1 进了存档', !!saved['1-1']);
  A.chk('存档里记的是三个星标记（不是单个数字）',
    !!(saved['1-1'] && saved['1-1'].goals && typeof saved['1-1'].goals.arrive === 'boolean'),
    JSON.stringify(saved['1-1'] && saved['1-1'].goals));
  A.chk('1-1 拿满木箱 → boxes 标记点亮', saved['1-1'].goals.boxes === true);
  // 1-1 的第三颗星是「不散架」（noBreak）。标准解一路开得很稳，
  // 所以这颗也该亮 —— 如果这里变 false，说明木框在正常通关路径上就碎了，
  // 那这颗星就变成了"不可能"，必须当失败处理。
  A.chk('1-1 的「不散架」星在正常通关时点亮', saved['1-1'].goals.challenge === true,
    JSON.stringify(saved['1-1'].goals));

  // 金币由标记推导：3 个星标记里亮了几个 ×50 + 木箱 ×30
  const expectCoins = 50 * (['arrive', 'boxes', 'challenge']
    .filter(k => saved['1-1'].goals[k]).length) + 30 * (saved['1-1'].boxes || 0);
  const total1 = await ev('window.__rap.totalCoins()');
  A.chk('存档里不再单独存金币数字（只有一处真相）',
    saved['1-1'].coins === undefined, 'coins=' + saved['1-1'].coins);
  A.chk('总金币 = 已点亮星 ×50 + 最好木箱 ×30', total1 === expectCoins,
    total1 + ' vs ' + expectCoins);

  // ---- 3) 重刷不累加 ----
  A.chk('重刷 1-1 也能跑完', await runLevel(0, '1-1'));
  const total2 = await ev('window.__rap.totalCoins()');
  A.chk('重刷同一关后总金币没有翻倍', total2 === total1, total1 + ' → ' + total2);

  // ---- 4) 旧格式存档要能迁移 ----
  await ev(`(()=>{
    const R=window.__rap;
    localStorage.setItem(R.SAVE_KEY, JSON.stringify({'1-1':{stars:1,best:99.9,coins:50}}));
    return 1;})()`);
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  const mig = JSON.parse(await ev(`(()=>{const R=window.__rap;return JSON.stringify({
    stars:R.totalStars(), coins:R.totalCoins()});})()`));
  A.log('旧存档 {stars:1} → 迁移后 ' + mig.stars + ' 星 / ' + mig.coins + ' 金币');
  A.chk('旧格式存档不会显示成 0 星（stars:1 → arrive 标记）', mig.stars === 1, String(mig.stars));
  A.chk('旧格式存档的金币由迁移后的标记算出，而不是读旧的 coins 字段',
    mig.coins === 50, String(mig.coins));

  // ---- 5) 累计：一次只拿一颗星也算数 ----
  await ev(`(()=>{
    const R=window.__rap;
    localStorage.setItem(R.SAVE_KEY, JSON.stringify({
      '1-1':{goals:{arrive:true,boxes:false,challenge:false},best:9.1,boxes:0}}));
    return 1;})()`);
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  const before = await ev('window.__rap.totalStars()');
  A.chk('前置：只有 arrive 时是 1 星', before === 1, String(before));
  // 再跑一次、这一局只要木箱（模拟"分两次拿"）
  await ev(`(()=>{
    const R=window.__rap, all=JSON.parse(localStorage.getItem(R.SAVE_KEY)||'{}');
    // 直接走 saveProgress：模拟"另一局点亮了 boxes"
    R.saveProgress('1-1', {arrive:true,boxes:true,challenge:false}, 8.0, 1);
    return 1;})()`);
  const after = JSON.parse(await ev(`(()=>{const R=window.__rap;return JSON.stringify({
    stars:R.totalStars(), rec:JSON.parse(localStorage.getItem(R.SAVE_KEY))['1-1']});})()`));
  A.chk('分两次拿：先 arrive、再 boxes → 累计 2 星（不会互相覆盖）',
    after.stars === 2, JSON.stringify(after.rec.goals));
  A.chk('分两次拿之后 best 仍取更快的那次', after.rec.best === 8.0, String(after.rec.best));

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
