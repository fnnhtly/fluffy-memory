/* 「已装备的零件拖出拼装区 = 卸下，回到待使用」。
 *
 * 用户原话：已装备部件拖出拼装区域时直接返回待使用，从车上卸下来。
 *
 * 第 43 轮改之前的行为（tools/probe_drag_unequip.js 实测）：
 *   把一个气球从格子拖到网格左边外面松手 → `bounce: "balloon"`，
 *   格子 `stillThere: true`，待使用数量**不变**。
 *   也就是"扔到画面外"和"放回原处"是同一件事 —— 但玩家做的是两件事。
 *
 * 这条测试守四件事：
 *   1) 拖出网格松手 → 那一格清空，待使用数量**正好**回到原值（不是"变多了"）；
 *   2) 叠放的格子（n=3）拖出去 → 待使用 +3，不是 +1；
 *   3) 叠放的格子拖到**另一个空格** → 位置变了、n 还是 3、待使用不变
 *      （这是原来更隐蔽的 bug：n 在搬运途中丢了，3 个变 1 个）；
 *   4) 拖到**网格内但被占着**的格子 → 弹回原处，待使用不变（这是"移动失败"，
 *      不是"卸载" —— 两者不能混成一个结果）。
 *
 * 第 1 条里"正好回到原值"比"变多了"更值得测：如果卸下时忘了从 order 里摘掉，
 * 或者卸下后又写回某个格子，数量会算错，而"变多了"看起来像好消息。
 */
const A = require('./lib/asserts');
const gridLib = require('./lib/grid');
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeDE-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page');
      if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
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

  /* 抓 fillText：拖到网格外时，光标旁边要出现「松手卸下」。
   * 这条必须是**拖拽中途**抓，落手之后提示就没了 ——
   * 所以下面专门有一段"按住不放、把光标移到网格外"的步骤。 */
  await ev(`(() => {
    if (window.__txt) return 'already';
    const C = CanvasRenderingContext2D.prototype;
    const o = C.fillText;
    window.__txt = [];
    C.fillText = function (t) { window.__txt.push(String(t)); return o.apply(this, arguments); };
    return 'ok';
  })()`);

  const box = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();
    return JSON.stringify({left:r.left,top:r.top,w:r.width,h:r.height});})()`));
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
    const n = steps || 10;
    for (let i = 1; i <= n; i++) {
      await mouse('mouseMoved', from.x + (to.x - from.x) * i / n, from.y + (to.y - from.y) * i / n);
      await sleep(28);
    }
    await mouse('mouseReleased', to.x, to.y);
    await sleep(240);
  }

  /* 单击 = 移过去 + 按下 + 松开。grid helper 需要一个 click(设计x, 设计y)，
   * 而本脚本原来只有 mouse()/drag()。 */
  async function click(x, y) {
    await mouse('mouseMoved', x, y);
    await mouse('mousePressed', x, y);
    await mouse('mouseReleased', x, y);
    await sleep(160);
  }

  /* 几何一律走 tools/lib/grid.js 现读。
   * 第 64 轮世界锚定之后 buildOrigin() 是**活的**：这个脚本的 setup()
   * 用 applySpec 铺 1-6 标准解（里面有 2 个轮子），轮子一进来锚点就抬，
   * 缓存下来的 ox/oy 就作废 —— 于是每一次 drag 的起点都落在空格上，
   * 拖拽根本没开始（`state.pendingClick` 不成立），格子自然原封不动。
   * 症状就是十几条"没清空 / 待使用没涨 / 没提示"一起红。 */
  const G = gridLib.make(ev, click);
  const cc = (r, c) => G.cell(r, c);
  const outL = () => G.out('left');            // 网格左边
  const outB = () => G.out('bottom');          // 网格下方

  // 1-6 造好标准解，但把所有气球格都清掉，只在 (1,1) 放一格 —— 基线干净
  async function setup(n) {
    await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[5];
      window.__rap.startLevel(5); s.welcome=0; s.introT=1;
      R.applySpec(lv,s.build,R.SPECS['1-6']);
      Object.keys(s.build.cells).forEach(k=>{ if(s.build.cells[k].part==='balloon') delete s.build.cells[k]; });
      s.build.order = s.build.order.filter(k=>s.build.cells[k]);
      s.build.cells['1,1']={part:'balloon',dir:0,n:${n}};
      s.build.order.push('1,1');
      return 1;})()`);
    await sleep(160);
  }
  const st = async () => JSON.parse(await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[5];
    return JSON.stringify({left:R.budgetLeft(lv,'balloon',s.build),
      cell11:s.build.cells['1,1']?(s.build.cells['1,1'].n||1):0,
      cell32:s.build.cells['3,2']?(s.build.cells['3,2'].n||1):0,
      order:s.build.order.length,
      toast:s.toast||''});})()`));

  /* 断言全部用**前后差**，不写死绝对值。
   * 第一版把"待使用 0 / 1 / 3"写死了，结果满盘红 —— 因为 1-6 的零件箱给了 6 个气球，
   * 而基线造法只挂 6 个、删掉其它气球格之后待使用本来就是 6，不是 0。
   * 写死绝对值等于把「这一关给了几个气球」这个无关事实也拖进了断言里；
   * 用差值只测「拖出这一格，待使用涨了几个」—— 那才是要守的东西。 */
  const delta = (a, b) => b.left - a.left;

  // ---------- 1. 单件拖出网格 ----------
  await setup(1);
  const a0 = await st();
  await drag(await cc(1, 1), await outL());
  const a1 = await st();
  A.chk('拖出网格后那一格清空了', a1.cell11 === 0, 'n=' + a1.cell11);
  A.chk('待使用正好 +1（拖出去的正好 1 个）', delta(a0, a1) === 1, a0.left + ' → ' + a1.left);
  A.chk('卸下时给了提示', a1.toast.indexOf('已卸下') >= 0, a1.toast || '没有提示');
  A.chk('order 也同步摘掉了那一格', a1.order === a0.order - 1, a0.order + ' → ' + a1.order);
  await shot('du-01-drag-out');

  // ---------- 2. 叠放 3 个拖出 ----------
  await setup(3);
  const b0 = await st();
  await drag(await cc(1, 1), await outB());
  const b1 = await st();
  A.chk('叠放 3 个拖出后那一格清空', b1.cell11 === 0, 'n=' + b1.cell11);
  A.chk('待使用 +3（不是 +1）', delta(b0, b1) === 3, b0.left + ' → ' + b1.left);
  A.chk('提示里写明数量 ×3', b1.toast.indexOf('×3') >= 0, b1.toast || '');
  await shot('du-02-stack-out');

  // ---------- 3. 叠放 3 个拖到另一空格 ----------
  await setup(3);
  const c0 = await st();
  await drag(await cc(1, 1), await cc(3, 2));
  const c1 = await st();
  A.chk('拖到另一空格：原格清空', c1.cell11 === 0, 'n=' + c1.cell11);
  A.chk('拖到另一空格：新格拿到 3 个（数量没丢）', c1.cell32 === 3, 'n=' + c1.cell32);
  A.chk('拖到另一空格：待使用不变（没多也没少）', delta(c0, c1) === 0, c0.left + ' → ' + c1.left);
  await shot('du-03-stack-move');

  // ---------- 4. 拖到网格内但被占着 ----------
  await setup(3);
  // 在 (3,2) 放一块木框占住
  await ev(`(()=>{const s=window.__rap.state; s.build.cells['3,2']={part:'wood_frame',dir:0};
    if(s.build.order.indexOf('3,2')<0) s.build.order.push('3,2'); return 1;})()`);
  const d0 = await st();
  await drag(await cc(1, 1), await cc(3, 2));
  const d1 = await st();
  A.chk('拖到被占的格子：零件弹回原处', d1.cell11 === 3, 'n=' + d1.cell11);
  A.chk('拖到被占的格子：待使用不变（这不是卸载）', delta(d0, d1) === 0, d0.left + ' → ' + d1.left);
  A.chk('拖到被占的格子：占位件没被覆盖',
    (await ev(`window.__rap.state.build.cells['3,2'].part`)) === 'wood_frame',
    await ev(`window.__rap.state.build.cells['3,2'].part`));
  A.chk('拖到被占的格子：提示说"放回原处"',
    d1.toast.indexOf('放回原处') >= 0, d1.toast || '');
  await shot('du-04-blocked');

  // ---------- 5. 拖出去之后车还能发射（状态没被弄坏） ----------
  await setup(1);
  await drag(await cc(1, 1), await outL());
  const chk = JSON.parse(await ev(`(()=>{const R=window.__rap.RAP,s=window.__rap.state;
    const c=R.canLaunch(s.build);return JSON.stringify(c);})()`));
  A.chk('卸下后车仍然可以发射（拆零件不等拆车）', chk.ok === true, JSON.stringify(chk));

  // ---------- 6. 拖到网格外时，光标旁提前说"松手卸下" ----------
  await setup(1);
  {
    const A1 = await cc(1, 1), OUT_L = await outL();
    await mouse('mouseMoved', A1.x, A1.y);
    await mouse('mousePressed', A1.x, A1.y);
    for (let i = 1; i <= 10; i++) {
      await mouse('mouseMoved', A1.x + (OUT_L.x - A1.x) * i / 10,
        A1.y + (OUT_L.y - A1.y) * i / 10);
      await sleep(28);
    }
    await sleep(200);                 // 让主循环画一帧
    await ev('window.__txt.length = 0');
    await sleep(260);
    const live = JSON.parse(await ev('JSON.stringify(window.__txt)'));
    A.chk('拖动到网格外时，光标旁出现「松手卸下」',
      live.some(t => t.indexOf('松手卸下') >= 0),
      live.filter(t => t.indexOf('松手') >= 0).join(' ') || '一帧里没这句');
    await shot('du-05-drop-hint');
    await mouse('mouseReleased', OUT_L.x, OUT_L.y);
    await sleep(240);
  }
  const afterHint = await st();
  A.chk('真的松手之后确实卸下了', afterHint.left > (await st()).left - 1 &&
    afterHint.cell11 === 0, 'n=' + afterHint.cell11 + ' left=' + afterHint.left);

  // ---------- 7. 网格内部拖动时**不**出现这句（否则变成常驻噪音） ----------
  await setup(3);
  {
    const A1 = await cc(1, 1), T2 = await cc(3, 2);
    await mouse('mouseMoved', A1.x, A1.y);
    await mouse('mousePressed', A1.x, A1.y);
    for (let i = 1; i <= 10; i++) {
      await mouse('mouseMoved', A1.x + (T2.x - A1.x) * i / 10,
        A1.y + (T2.y - A1.y) * i / 10);
      await sleep(28);
    }
    await sleep(200);
    await ev('window.__txt.length = 0');
    await sleep(260);
    const inGrid = JSON.parse(await ev('JSON.stringify(window.__txt)'));
    A.chk('网格内部拖动时不出现「松手卸下」（否则是常驻噪音）',
      !inGrid.some(t => t.indexOf('松手卸下') >= 0),
      inGrid.filter(t => t.indexOf('松手') >= 0).join(' '));
    await mouse('mouseReleased', T2.x, T2.y);
    await sleep(240);
  }

  A.chk('无 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
