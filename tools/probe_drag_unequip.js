/* 探针：把"已经放好的零件"拖出拼装区，现在到底会发生什么？
 *
 * 用户的诉求（第 43 轮）："已装备部件拖出拼装区域时直接返回待使用，从车上卸下来"。
 * 也就是说这个手势应当 = 卸下，而不是"弹回原处"。
 *
 * 但改之前必须先量两件事：
 *   A. 现在的行为是什么（拖出 → 弹回原处？还是别的）；
 *   B. 拖动**叠放的格子**（3 个气球）时，数量 n 会不会丢。
 *
 * B 是我在代码里看到的疑点：`state.dragMove` 里没有 `n` 字段，落子时
 * 写的是 `{ part, dir }`。如果属实，那么"把 3 个气球挪一个格子"会变成 1 个，
 * 另外 2 个静悄悄回到待使用 —— 一次拖动既改位置又改数量，而且没有任何提示。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeDU-' + Date.now()),
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

  // 屏幕坐标（设计坐标 → 画布像素）。headless 是 1280×800，画布铺满宽 1280。
  const box = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();
    return JSON.stringify({left:r.left,top:r.top,w:r.width,h:r.height});})()`));
  const VW = await ev('window.__rap.state ? 1 : 1');
  const toClient = (x, y) => ({ x: box.left + x * box.w / 1280, y: box.top + y * box.h / 720 });
  async function mouse(type, x, y) {
    const c = toClient(x, y);
    await send('Input.dispatchMouseEvent', {
      type, x: c.x, y: c.y, button: type === 'mouseMoved' ? 'none' : 'left',
      buttons: type === 'mouseMoved' ? 0 : 1, clickCount: 1
    });
  }
  async function drag(from, to, steps) {
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y);
    const n = steps || 8;
    for (let i = 1; i <= n; i++) {
      await mouse('mouseMoved', from.x + (to.x - from.x) * i / n, from.y + (to.y - from.y) * i / n);
      await sleep(30);
    }
    await mouse('mouseReleased', to.x, to.y);
    await sleep(220);
  }

  // 建造区几何（和页面共用一份，不自己算）
  const geo = JSON.parse(await ev(`(()=>{const R=window.__rap,RAP=R.RAP,o=R.buildOrigin();
    return JSON.stringify({ox:o.x,oy:o.y,px:R.BUILD_PX,cols:RAP.BUILD_COLS,rows:RAP.BUILD_ROWS,
      origin:o});})()`));
  const cellCenter = (r, c) => ({ x: geo.ox + c * geo.px + geo.px / 2, y: geo.oy + r * geo.px + geo.px / 2 });
  console.log('建造区：x ' + geo.ox + '…' + (geo.ox + geo.cols * geo.px) +
    '  y ' + geo.oy + '…' + (geo.oy + geo.rows * geo.px));

  const snap = async () => JSON.parse(await ev(`(()=>{const s=window.__rap.state;
    const cells=Object.keys(s.build.cells).length;
    return JSON.stringify({cells:cells, n:s.build.cells[Object.keys(s.build.cells)[0]]&&s.build.cells[Object.keys(s.build.cells)[0]].n,
      bounce: s.bounce ? s.bounce.part : null, dragMove: s.dragMove ? s.dragMove.part : null});})()`));

  // ---------- A. 拖出一个已放的零件 ----------
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP;
    window.__rap.startLevel(5); s.welcome=0; s.introT=1;
    const lv=window.__rap.levels[5];
    R.applySpec(lv,s.build,R.SPECS['1-6']);
    /* 1-6 的气球预算正好被 SPECS 用光，budgetLeft 从 0 起。
     * 为了看出"卸下之后待使用有没有回来"，先把一格气球放成 2 个 ——
     * 这样这一格卸掉之后待使用应该是 2（而不是 0），能区分
     * "数量真的回来了" 和 "本来就该是 0"。 */
    const k=Object.keys(s.build.cells).find(k=>s.build.cells[k].part==='balloon');
    if(k) s.build.cells[k].n = 2;
    return 1;})()`);
  await sleep(200);
  const before = JSON.parse(await ev(`(()=>{const R=window.__rap.RAP,lv=window.__rap.levels[5],s=window.__rap.state;
    return JSON.stringify({balloonLeft:R.budgetLeft(lv,'balloon',s.build),
      sandbagLeft:R.budgetLeft(lv,'sandbag',s.build),
      cells:Object.keys(s.build.cells).length});})()`));
  console.log('\n[A] 拖动前：' + JSON.stringify(before));

  // 找一个真实存在的格子（气球）
  const key = await ev(`(()=>{const s=window.__rap.state;
    const k=Object.keys(s.build.cells).find(k=>s.build.cells[k].part==='balloon');
    return k||'none';})()`);
  console.log('  找到气球格：' + key);
  if (key !== 'none') {
    const [r, c] = key.split(',').map(Number);
    const from = cellCenter(r, c);
    const out = { x: geo.ox - 160, y: geo.oy + geo.px };   // 网格左边外面
    console.log('  从 (' + from.x.toFixed(0) + ',' + from.y.toFixed(0) + ') 拖到 (' +
      out.x.toFixed(0) + ',' + out.y.toFixed(0) + ')（网格外）');
    await drag(from, out, 10);
    const after = JSON.parse(await ev(`(()=>{const R=window.__rap.RAP,lv=window.__rap.levels[5],s=window.__rap.state;
      return JSON.stringify({balloonLeft:R.budgetLeft(lv,'balloon',s.build),
        cells:Object.keys(s.build.cells).length,
        stillThere: !!s.build.cells['${key}'],
        bounce: s.bounce ? s.bounce.part : null});})()`));
    console.log('[A] 拖动后：' + JSON.stringify(after));
    console.log('  判定：' + (after.balloonLeft > before.balloonLeft
      ? '**零件已卸下并回到待使用**（符合用户诉求）'
      : '零件没回到待使用 —— 拖出网格被当成"弹回原处"'));
    console.log('  格子里还在吗：' + (after.stillThere ? '**还占着**' : '已清空'));
  }

  // ---------- B. 拖动叠放格（n=3） ----------
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP;
    window.__rap.startLevel(5); s.welcome=0; s.introT=1;
    const lv=window.__rap.levels[5];
    R.applySpec(lv,s.build,R.SPECS['1-6']);
    /* 把所有气球格清掉，再人为在 '1,1' 放一格 3 个 —— 这样 budgetLeft 从 3 起，
     * 拖动之后还是 3 才说明"数量跟着走了"，不会和"本来就没预算"混在一起。 */
    Object.keys(s.build.cells).forEach(k=>{ if(s.build.cells[k].part==='balloon') delete s.build.cells[k]; });
    s.build.order = s.build.order.filter(k=>s.build.cells[k]);
    s.build.cells['1,1']={part:'balloon',dir:0,n:3};
    s.build.order.push('1,1');
    return 1;})()`);
  await sleep(200);
  const nb = await ev(`window.__rap.RAP.budgetLeft(window.__rap.levels[5],'balloon',window.__rap.state.build)`);
  console.log('\n[B] 叠放格 3 个气球，气球待使用 = ' + nb);
  const from2 = cellCenter(1, 1);
  const to2 = cellCenter(3, 2);
  await drag(from2, to2, 10);
  const r2 = JSON.parse(await ev(`(()=>{const g=window.__rap.state.build.cells['3,2'];
    return JSON.stringify({n: g?g.n:null, part:g?g.part:null,
      left:window.__rap.RAP.budgetLeft(window.__rap.levels[5],'balloon',window.__rap.state.build),
      oldStill: !!window.__rap.state.build.cells['1,1']});})()`));
  console.log('[B] 拖动后：' + JSON.stringify(r2));
  console.log('  判定：' + (r2.n === 3 ? '数量保住了' :
    '**数量丢了**：3 个变 ' + r2.n + ' 个，另外 ' + (3 - (r2.n || 0)) + ' 个静悄悄回到待使用'));

  console.log('\nerrors:', errs.length ? errs.slice(0, 3) : '(none)');
  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
