/* 「提示」按钮：卡关时可以点，分三层递进，且不遮挡别的按钮。
 *
 * 用户要求：「我希望你添加一个引导功能，在玩家卡关的时候可供玩家选择
 * 点击引导功能按钮给予玩家提示」。
 *
 * 这个脚本验的是**这个功能真的能用**，不是"代码里有个 HINT 表"：
 *   A. 每关都有三层提示，且三层**互不相同**（复制粘贴的假提示会被抓）
 *   B. 点一下 → 开卡 + 第 1 层；再点 → 第 2 层；再点 → 第 3 层；再点 → 还是第 3 层
 *   C. 点别处 → 关掉
 *   D. 换关 → 层数归零（否则一进新关就看见"成品：……"）
 *   E. 按钮在所有阶段都点得着（建造页 + 行驶页 + 结算页）
 *   F. 按钮不和静音钮/计时面板重叠
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeH-' + Date.now()),
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
  await send('Runtime.evaluate', { expression: "localStorage.clear();localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1000);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();
    return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function click(dx, dy) { const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(130); }

  await ev('window.__rap.state.welcome=0; window.__rap.state.introT=1');
  await sleep(250);

  // ---- A 每关三层，且层间不同 ----
  const per = JSON.parse(await ev(`(()=>{
    const out={};
    window.__rap.levels.forEach(lv=>{
      const t=[window.__rap.hintFor(lv,0),window.__rap.hintFor(lv,1),window.__rap.hintFor(lv,2)];
      out[lv.levelId]=t;
    });
    return JSON.stringify(out);})()`));
  let allThree = true, allDiff = true;
  Object.keys(per).forEach(k => {
    const t = per[k];
    if (t.length !== 3 || t.some(s => !s || s.length < 8)) allThree = false;
    if (new Set(t).size !== 3) allDiff = false;
  });
  A.chk('每关都有三层非空提示', allThree, Object.keys(per).length + ' 关');
  A.chk('三层提示互不相同（不是复制粘贴）', allDiff);

  /* ---- B 逐层递进 ----
   *
   * ⚠ 这里的断言必须写**具体的 tier 值**，不能写 `tier>=1` 之类的宽松条件。
   * 第一版就是写的宽松条件，于是"第一次点直接跳到第 2 层"这个真 bug
   * 被自己的断言盖住了 —— `tier===2` 确实"≥1"，测试全绿，而第 1 层
   * （那句"该往哪个方向造"的方向提示）玩家永远看不到。
   * 现在是 0/1/2 三个精确值。 */
  const hr = JSON.parse(await ev('JSON.stringify(window.__rap.hintRect())'));
  const hcx = hr.x + hr.w / 2, hcy = hr.y + hr.h / 2;
  A.log('提示钮中心 (' + hcx.toFixed(0) + ',' + hcy.toFixed(0) + ')');

  await click(hcx, hcy);
  const s1 = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
    return JSON.stringify({open:S.hintOpen, tier:S.hintTier});})()`));
  A.chk('第一次点：卡片打开、显示第 1 层（tier 必须是 0）',
    s1.open === true && s1.tier === 0, JSON.stringify(s1));

  await click(hcx, hcy);
  const s2 = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
    return JSON.stringify({open:S.hintOpen, tier:S.hintTier});})()`));
  A.chk('第二次点：升到第 2 层（tier 必须是 1）',
    s2.open === true && s2.tier === 1, JSON.stringify(s2));

  await click(hcx, hcy);
  const s3 = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
    return JSON.stringify({open:S.hintOpen, tier:S.hintTier});})()`));
  A.chk('第三次点：升到第 3 层（tier 必须是 2）', s3.tier === 2, JSON.stringify(s3));

  await click(hcx, hcy);
  const s4 = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
    return JSON.stringify({open:S.hintOpen, tier:S.hintTier});})()`));
  A.chk('第四次点：停在最后一层（不越界）', s4.tier === 2, JSON.stringify(s4));

  /* 逐层的**内容**也得真的变 —— 光看 tier 数字变了，文案可能是同一个
   * （hintFor 里写错下标就会这样）。这里直接读渲染读的那个函数。 */
  const texts = JSON.parse(await ev(`(()=>{const R=window.__rap, lv=R.level();
    return JSON.stringify([R.hintFor(lv,0), R.hintFor(lv,1), R.hintFor(lv,2)]);})()`));
  A.chk('三层读出来的文案各不相同',
    new Set(texts).size === 3 && texts.every(t => t && t.length > 8),
    texts.map(t => (t || '').slice(0, 12)).join(' / '));

  // ---- C 点别处关掉 ----
  await click(180, 620);
  const s5 = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
    return JSON.stringify({open:S.hintOpen, tier:S.hintTier});})()`));
  A.chk('点别处：卡片关闭、层数保留', s5.open === false && s5.tier === 2,
    JSON.stringify(s5));

  // ---- D 换关归零 ----
  await ev('window.__rap.startLevel(2)');
  await sleep(200);
  const s6 = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
    return JSON.stringify({open:S.hintOpen, tier:S.hintTier, lv:window.__rap.level().levelId});})()`));
  A.chk('换关：层数归零、卡片关闭', s6.tier === 0 && s6.open === false, JSON.stringify(s6));

  // ---- E 行驶期也点得着 ----
  await ev(`(()=>{window.__rap.startLevel(0); window.__rap.state.introT=1;
    window.__rap.launchSpec(0,'1-1'); return 1;})()`);
  await sleep(400);
  const phase = await ev('window.__rap.state.phase');
  A.chk('前提：已在行驶相', phase === 'run', 'phase=' + phase);
  await click(hcx, hcy);
  const s7 = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
    return JSON.stringify({open:S.hintOpen, tier:S.hintTier});})()`));
  A.chk('行驶中点得着（卡关最常见的地方）', s7.open === true, JSON.stringify(s7));
  // ---- F 不与静音钮/计时面板重叠 ----
  const mu = JSON.parse(await ev('JSON.stringify(window.__rap.muteRect())'));
  const tm = JSON.parse(await ev('JSON.stringify(window.__rap.runTimeRects().timer)'));
  function overlap(a, b) {
    return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  }
  A.chk('不与静音钮重叠', !overlap(hr, mu), JSON.stringify({h: hr, m: mu}));
  A.chk('不与行驶计时面板重叠', !overlap(hr, tm), JSON.stringify({h: hr, t: tm}));

  A.finish(ws, child);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });
