/* 撤销：必须撤"我上一步做的那件事"，而且必须**只**撤那件。
 *
 * 第 44 轮改之前的行为（tools/probe_undo.js 实测，真浏览器真鼠标/真键盘）：
 *
 *   1-6 基线图纸上把 (1,1) 的气球从车上卸下，按 Z →
 *     · 气球**没有**回来
 *     · 车上的小猪（4,2 的 inner）**被删了**
 *   用橡皮擦掉 (1,1) 之后按 Z → 同样的结果。
 *
 * 原因：`undo` 是 `build.order.pop()` 再删掉那一格，而 order 只在放下时 push、
 * 拆掉时 splice —— 被拆掉的东西根本不在 order 里。
 * 于是这个按钮的实际行为不是"没用"，而是**主动毁掉玩家的另一件零件**。
 *
 * 现在撤销 = 恢复上一步的整张图纸快照。这条测试守：
 *   A. 卸下 → Z：卸下的那件回来，**其他零件一个不少**
 *   B. 橡皮擦掉 → Z：擦掉的回来，其他不少
 *   C. 连按多次 Z 逐步回退（不是一步到罗马，也不是只回一步）
 *   D. 空历史按 Z：不给假希望（有提示、图纸完全不动）
 *   E. 放一件 → Z：回到放之前
 *   F. 转到方向 → Z：方向回到原值
 *   G. 拖到被占格（弹回原处，净变化为零）→ Z：**不该**同时撤掉别的零件
 *      （这一条最容易漏：那个手势什么都没改，它不能占掉一个撤销步）
 *   H. 橡皮一笔擦过 3 格 → 按一次 Z 全回来（一笔 = 一步）
 *
 * 判据一律用"图纸签名"（cells+order 的规范化字符串）比对整体，
 * 而不是逐条断言某几格 —— 因为这一轮的全部价值就是"整体回到原样"。
 */
const A = require('./lib/asserts');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeUn-' + Date.now()),
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
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); };
  await ev('window.__rap.state.introT=1');
  await sleep(250);

  const box = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();
    return JSON.stringify({left:r.left,top:r.top,w:r.width,h:r.height});})()`));
  const toClient = (x, y) => ({ x: box.left + x * box.w / 1280, y: box.top + y * box.h / 720 });
  async function mouse(type, x, y, button) {
    const c = toClient(x, y);
    await send('Input.dispatchMouseEvent', { type, x: c.x, y: c.y,
      button: type === 'mouseMoved' ? 'none' : (button || 'left'),
      buttons: type === 'mouseMoved' ? 0 : 1, clickCount: 1 });
  }
  async function click(x, y) {
    await mouse('mouseMoved', x, y);
    await mouse('mousePressed', x, y);
    await mouse('mouseReleased', x, y);
    await sleep(170);
  }
  async function drag(from, to, steps) {
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y);
    const n = steps || 10;
    for (let i = 1; i <= n; i++) {
      await mouse('mouseMoved', from.x + (to.x - from.x) * i / n, from.y + (to.y - from.y) * i / n);
      await sleep(26);
    }
    await mouse('mouseReleased', to.x, to.y);
    await sleep(230);
  }
  async function key(name) {
    const vk = { z: 90, c: 67 }[name] || 0;
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, windowsVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: name, windowsVirtualKeyCode: vk });
    await sleep(210);
  }

  const geo = JSON.parse(await ev(`(()=>{const R=window.__rap,RAP=R.RAP,o=R.buildOrigin();
    return JSON.stringify({ox:o.x,oy:o.y,px:R.BUILD_PX,rows:RAP.BUILD_ROWS,cols:RAP.BUILD_COLS});})()`));
  const cc = (r, c) => ({ x: geo.ox + c * geo.px + geo.px / 2, y: geo.oy + r * geo.px + geo.px / 2 });
  const OUT_L = { x: geo.ox - 140, y: geo.oy + geo.px * 2 };

  /* 图纸签名：cells 排序后逐格写 part/dir/n/inner，再接 order。
   * 用它做整体比对 —— 「整体回到原样」正是这一轮要保证的东西。
   * order 必须进签名：它决定绘制顺序和"最后放下的是谁"，
   * 只比 cells 会漏掉"格子都在但叠放顺序错乱"的情况。 */
  const sig = async () => {
    const s = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
      const keys=Object.keys(s.build.cells).sort();
      const cells=keys.map(k=>{const c=s.build.cells[k];
        return k+':'+c.part+'|'+(c.dir||0)+'|'+(c.n||1)+'|'+(c.inner||'-');}).join(';');
      return JSON.stringify({cells:cells, order:s.build.order.join(',')});})()`));
    return s.cells + ' || ' + s.order;
  };
  const histLen = () => ev('(window.__rap.state.build.hist||[]).length');
  const toastOf = () => ev('window.__rap.state.toast || ""');
  const setup = async () => {
    await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[5];
      window.__rap.startLevel(5); s.welcome=0; s.introT=1;
      R.applySpec(lv,s.build,R.SPECS['1-6']);
      s.build.hist=[];                       // 用真手势开始，历史从零起
      s.build.cells['1,1']={part:'balloon',dir:0,n:1};
      if(s.build.order.indexOf('1,1')<0) s.build.order.push('1,1');
      return 1;})()`);
    await sleep(160);
  };
  /* 1-6 的零件箱被标准解**用满了**（木框 3/3、轮 2/2、气球 6/6、沙袋 3/3、猪 1/1），
   * 在它上面空手放任何零件都会被 budget 拦掉。
   * 所以"放置 / 连续放置"这两组要在**空图纸 + 有空余预算**的关卡上做 ——
   * 第一版忘了这件事，于是 E 那一项什么都没放进去，却因为
   * "签名前后一致"而**假通过**。前提断言就是为此存在的，它救了这一次。 */
  const setupEmpty = async (idx) => {
    await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[${idx}];
      window.__rap.startLevel(${idx}); s.welcome=0; s.introT=1;
      s.build.hist=[]; s.build.cells={}; s.build.order=[];
      return JSON.stringify(lv.partsBox||{});})()`);
    await sleep(160);
  };

  // ---------- A. 卸下 → Z ----------
  await setup();
  const A0 = await sig();
  await drag(cc(1, 1), OUT_L);
  A.chk('前提：拖出后气球确实不在车上了',
    !(await ev("!!window.__rap.state.build.cells['1,1']")));
  await key('z');
  const A1 = await sig();
  A.chk('A 卸下后按 Z：整张图纸回到原样（气球回来，其他一件不少）',
    A1 === A0, A1 === A0 ? '一致' : '差在这里：\n  原 ' + A0 + '\n  后 ' + A1);
  await shot('un-01-after-undo');

  // ---------- B. 橡皮擦掉 → Z ----------
  await setup();
  const B0 = await sig();
  await ev("window.__rap.state.selected='eraser'");
  await sleep(100);
  await click(cc(1, 1).x, cc(1, 1).y);
  A.chk('前提：橡皮确实擦掉了那一格',
    !(await ev("!!window.__rap.state.build.cells['1,1']")));
  await key('z');
  A.chk('B 橡皮擦掉后按 Z：整张图纸回到原样',
    (await sig()) === B0, (await sig()) === B0 ? '一致' : '不一致');

  // ---------- C. 连按 Z 逐步回退 ----------
  await setupEmpty(0);          // 1-1 空图纸，木框×3 有空余预算
  await ev("window.__rap.state.selected='wood_frame'");
  await sleep(80);
  const s0 = await sig();
  // 真手势放一件到 (4,1)，再放一件到 (4,2)（木框必须贴木框，第一块先立住）
  await click(cc(4, 1).x, cc(4, 1).y);
  const s1 = await sig();
  await click(cc(4, 2).x, cc(4, 2).y);
  const s2 = await sig();
  A.chk('前提：两次放置都成功（签名各变一次）', s1 !== s0 && s2 !== s1,
    (s1 !== s0) + ' / ' + (s2 !== s1));
  await key('z');
  A.chk('C1 一次 Z 只回一步（第二件没了，第一件还在）', (await sig()) === s1,
    (await sig()) === s1 ? '回到 s1' : '没回到 s1');
  await key('z');
  A.chk('C2 两次 Z 回到放置之前', (await sig()) === s0,
    (await sig()) === s0 ? '回到 s0' : '没回到 s0');

  // ---------- D. 空历史按 Z ----------
  const d0 = await sig();
  A.chk('前提：此时历史已空', (await histLen()) === 0, String(await histLen()));
  await key('z');
  const d1 = await sig();
  /* 附注文案必须是**条件**，不能写死 '动了' ——
   * 那是"通过时也说它动了"的假情报，看日志的人会以为出了事。 */
  A.chk('D 空历史按 Z：图纸一点不动', d1 === d0, d1 === d0 ? '一致' : '动了：' + d1);
  A.chk('D 空历史按 Z：有提示（不是静默失败）',
    (await toastOf()).indexOf('没有可撤销') >= 0, await toastOf());

  // ---------- E. 放一件 → Z ----------
  await setupEmpty(0);
  await ev("window.__rap.state.selected='wood_frame'");
  await sleep(80);
  const e0 = await sig();
  await click(cc(4, 1).x, cc(4, 1).y);
  A.chk('前提：确实放下了一件',
    (await ev("!!window.__rap.state.build.cells['4,1']")));
  await key('z');
  A.chk('E 放一件后按 Z：回到没放的状态', (await sig()) === e0,
    (await sig()) === e0 ? '一致' : '不一致');

  // ---------- F. 转方向 → Z ----------
  await setup();
  await ev("window.__rap.state.selected='wood_frame'");
  await sleep(80);
  /* (5,1) 是标准解里的木轮（可转向件没有 dir 语义但 rotateAt 照样改 dir），
   * 用它测"转动可撤销"最直接。 */
  const dir0 = await ev("window.__rap.state.build.cells['5,1'].dir|0");
  await ev("window.__rap.state.mouse.x=" + cc(5, 1).x + "; window.__rap.state.mouse.y=" + cc(5, 1).y);
  await key('r');
  const dir1 = await ev("window.__rap.state.build.cells['5,1'].dir|0");
  A.chk('前提：R 确实转了方向', dir1 !== dir0, dir0 + ' → ' + dir1);
  await key('z');
  A.chk('F 转方向后按 Z：方向回到原值',
    (await ev("window.__rap.state.build.cells['5,1'].dir|0")) === dir0,
    'dir=' + (await ev("window.__rap.state.build.cells['5,1'].dir|0")));

  // ---------- G. 拖到被占格（净变化为零）→ Z 不能多吃一步 ----------
  await setup();
  await ev(`(()=>{const s=window.__rap.state; s.build.cells['3,2']={part:'wood_frame',dir:0};
    if(s.build.order.indexOf('3,2')<0) s.build.order.push('3,2'); return 1;})()`);
  await sleep(120);
  await ev('window.__rap.state.build.hist=[]');   // 干净起点
  const g0 = await sig();
  const gHist0 = await histLen();
  await drag(cc(1, 1), cc(3, 2));                  // 目标被占 → 弹回原处
  A.chk('前提：被占格退回后图纸没变（净变化为零）',
    (await sig()) === g0, (await sig()) === g0 ? '一致' : '不一致');
  A.chk('G 前提：这一次拖动没有留下撤销步（否则按 Z 会吃掉上一步）',
    (await histLen()) === gHist0, gHist0 + ' → ' + (await histLen()));
  await key('z');
  A.chk('G 净变化为零的拖动之后按 Z：图纸仍然不动',
    (await sig()) === g0, (await sig()) === g0 ? '一致' : '不一致');

  // ---------- H. 橡皮一笔擦过 3 格 → 一次 Z 全回来 ----------
  await setup();
  const h0 = await sig();
  const hCells0 = await ev('Object.keys(window.__rap.state.build.cells).length');
  await ev("window.__rap.state.selected='eraser'");
  await sleep(80);
  /* 一笔横向划过后排三块木框 (4,1) → (4,3)：这三格都是占着的，
   * 一笔就是 3 格。判据是「这一笔至少擦掉 3 格」，然后一次 Z 全部回来 ——
   * 一笔 = 一步，否则玩家擦 5 格要按 5 次 Z。
   * （原来划 (1,1)→(3,2) 的斜线只穿过 2 格占位，前提断言先红了 ——
   *   这正是"前提断言"该干的事：先证明样例真的覆盖了被测条件。） */
  await drag(cc(4, 1), cc(4, 3), 12);
  const hCells1 = await ev('Object.keys(window.__rap.state.build.cells).length');
  A.chk('前提：一笔至少擦掉 3 格', hCells1 <= hCells0 - 3,
    hCells0 + ' → ' + hCells1);
  const hHistBump = await histLen();
  A.chk('前提：这一笔只记了 1 步（不是每格一步）', hHistBump === 1, String(hHistBump));
  await key('z');
  A.chk('H 一笔擦除后按一次 Z：整张图纸全回来（一笔=一步）',
    (await sig()) === h0, (await sig()) === h0 ? '一致' : '不一致');
  await shot('un-02-eraser-onestroke');

  A.chk('无 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
