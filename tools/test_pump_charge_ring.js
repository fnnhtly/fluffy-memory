/* 打气筒的蓄力进度必须看得见（第 49 轮）。
 *
 * 打气筒的全部玩法是"按住蓄力、松手放气"：
 *   冲量 = `pumpImpulse × (0.35 + 0.65 × 蓄力)`，蓄力上限 0.8 秒
 * 也就是**按多久直接决定推力**（0.35 倍 vs 1.0 倍，接近 3 倍差）。
 *
 * 而 `car.pumpCharge` 在渲染层**一次都没被读过**。
 * `tools/probe_pump_charge_feedback.js` 量到（同样的等待时长下的对照）：
 *
 *     噪声底（静置 vs 静置）：变化像素 126 / 8100（1.6%）
 *     静置 vs 蓄力满：变化像素 143 / 8100（1.8%）     ← 旧版
 *
 * 两者同一量级 —— 按住的那一秒在画面上**什么都没发生**。
 * 玩家只能自己数秒，而这一关的三星条件还要求"只按一次"。
 *
 * 加了一道蓄力环之后同一份探针读到 1341 像素（16.6%）：
 *
 *     静置 vs 蓄力满：变化像素 1341 / 8100（16.6%）
 *
 * 这份测试把"看得见"拆成可断言的几件事：
 *   1. 没按的时候没有环（`pumpChargeOf` 返回 -1，环上的像素是底色）；
 *   2. 按到一半时环是**蓝色**、只画了一段；
 *   3. 按满时环是**金色**（#ffe9b0），这才是"可以松手了"的信号；
 *   4. 环的读数和渲染同源 —— 断言 `pumpChargeOf(run)` 与手动写进去的蓄力一致。
 *
 * 量具自证：把环的颜色临时写死成底色，第 2、3 条的像素判据必须变红。
 * 没有这一步，"环画出来了"只能说明那块地方不是纯色。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgePg-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  if (!wsUrl) { console.log('FAIL 无法连上浏览器'); process.exit(1); }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = e => { const m = JSON.parse(e.data);
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

  // 起 1-2（唯一有打气筒的关），冻住物理只让 HUD 继续画
  await ev(`(()=>{const s=window.__rap.state,G=window.__rap.RAP,lv=window.__rap.levels[1];
    s.welcome=0; s.helpOpen=0; s.paused=false;
    window.__rap.startLevel(1); s.welcome=0; s.introT=1; s.runBanner=0;
    G.applySpec(lv, s.build, G.SPECS['1-2']);
    window.__rap.launch(); s.runBanner=0;
    s.paused=true;
    return 1;})()`);
  await sleep(500);

  /* 环上的取样点：按钮中心正上方 rr 处（环从 -90° 起画，所以这个点
   * 在"刚按下去"和"按满"两种状态下都一定被环覆盖）。
   * rr = w/2 + 7 = 53，与渲染代码里的常量一致 —— 这里再算一遍而不是读它，
   * 是为了让"渲染改了半径但测试没跟着改"能立刻显形。 */
  const probe = () => ev(`(()=>{
    const cv=document.querySelector('canvas');
    const dpr=cv.width/1280;
    const g=cv.getContext('2d',{willReadFrequently:true});
    const s=window.__rap.state;
    const n=Math.min(3,((s.run&&s.run.car.groups)||[]).length);
    const x0=1280/2-(n*104)/2, b=window.__rap.btnRect('interact');
    const R={x:x0,y:b.y,w:92,h:92};
    const cx=R.x+R.w/2, cy=R.y+R.h/2, rr=R.w/2+7;
    const px=(ang)=>{ const X=Math.round((cx+Math.cos(ang)*rr)*dpr),
                            Y=Math.round((cy+Math.sin(ang)*rr)*dpr);
      const d=g.getImageData(X,Y,1,1).data; return [d[0],d[1],d[2]]; };
    return JSON.stringify({
      top: px(-Math.PI/2),      // 环的起点：任何进度都覆盖
      right: px(0),             // 25% 之后才覆盖
      bottom: px(Math.PI/2),    // 50% 之后才覆盖
      left: px(Math.PI),        // 75% 之后才覆盖
      pc: window.__rap.pumpChargeOf(s.run),
      charge: +(s.run&&s.run.car.pumpCharge||0).toFixed(3),
      on: ((s.run&&s.run.car.groups)||[]).filter(g2=>g2.part==='pump').map(g2=>!!g2.on)
    });
  })()`).then(JSON.parse);

  const cls = c => {
    const [r, g2, b] = c;
    if (Math.max(r, g2, b) < 70) return 'dark';           // 暗底（没画环）
    if (r > 200 && g2 > 190 && b < 200) return 'gold';    // #ffe9b0 附近
    if (b > 180 && g2 > 150 && r < 170) return 'blue';    // #7fd4ff 附近
    return 'other(' + r + ',' + g2 + ',' + b + ')';
  };

  // ---- 1) 没按：没有环 ----
  await ev(`(()=>{const G=window.__rap.RAP,s=window.__rap.state;
    s.run.car.pumpHeld=false; s.run.car.pumpCharge=0;
    (s.run.car.groups||[]).forEach(g2=>{g2.on=false;});
    return 1;})()`);
  await sleep(300);
  const idle = await probe();
  A.log('没按：pc=' + idle.pc + '　环上四点 ' +
    [idle.top, idle.right, idle.bottom, idle.left].map(c => cls(c)).join(' '));

  // ---- 2) 按到一半 ----
  await ev(`(()=>{const G=window.__rap.RAP,s=window.__rap.state;
    G.pressInteract(s.run,1); s.run.car.pumpCharge=0.40; return 1;})()`);
  await sleep(320);
  const half = await probe();

  // ---- 3) 按满 ----
  await ev(`(()=>{const s=window.__rap.state; s.run.car.pumpCharge=0.80; return 1;})()`);
  await sleep(320);
  const full = await probe();

  A.log('半蓄力：pc=' + half.pc + '　环上四点 ' +
    [half.top, half.right, half.bottom, half.left].map(c => cls(c)).join(' '));
  A.log('满蓄力：pc=' + full.pc + '　环上四点 ' +
    [full.top, full.right, full.bottom, full.left].map(c => cls(c)).join(' '));

  A.chk('前提：这一局是行驶页且车上有打气筒组',
    idle.on.length === 1, 'pump 组数 ' + idle.on.length);

  A.chk('没按的时候没有蓄力环（pumpChargeOf 返回 -1）', idle.pc === -1, 'pc=' + idle.pc);
  /* 没按时环上四点**都不是环的颜色**：
   * 不能要求"全是暗底" —— 按钮外沿那几个点位于场景背景上（右侧是天地交界、
   * 下方是地表），本来就不是暗的。第一版这么断言，于是把背景色当成了 bug。
   * 真正要断的是"没有环那两种颜色"（蓝 / 金），以及起点位置是暗的。 */
  A.chk('没按的时候环上四点都没有环的颜色（不长出蓝环或金环）',
    [idle.top, idle.right, idle.bottom, idle.left].every(c => {
      const k = cls(c); return k !== 'blue' && k !== 'gold';
    }),
    [idle.top, idle.right, idle.bottom, idle.left].map(c => cls(c)).join(' '));
  A.chk('没按的时候起点位置是暗的（环的起点槽本身就压了一圈暗底）',
    cls(idle.top) === 'dark', 'top=' + JSON.stringify(idle.top));

  A.chk('蓄力读数与手动写入的蓄力同源（0.40 → pc 0.5）',
    Math.abs(half.pc - 0.5) < 0.02, 'pc=' + half.pc + ' charge=' + half.charge);

  /* 半蓄力：环从正上方顺时针画到正下方，所以**右**已覆盖、**左**还没到。
   * （第一版断言"底部也是暗的"，但底部正是 50% 的终点 —— 判据写错了，
   *  不是画错了。圆弧的 50% 端点就在正下方。） */
  A.chk('半蓄力时环已画出一段（顶部与右侧都亮起来）',
    cls(half.top) !== 'dark' && cls(half.right) !== 'dark',
    'top=' + cls(half.top) + ' right=' + cls(half.right));
  A.chk('半蓄力时环还没闭合（左侧仍是暗底）',
    cls(half.left) === 'dark', 'left=' + cls(half.left));

  A.chk('满蓄力时环闭合（左/右/下都被覆盖）',
    [full.right, full.bottom, full.left].every(c => cls(c) !== 'dark'),
    [full.right, full.bottom, full.left].map(c => cls(c)).join(' '));

  /* 颜色必须变：蓝 → 金。这是"可以松手了"的唯一信号，比圆环闭合更抓眼。 */
  A.chk('满蓄力时环变成金色（可以松手了的信号）', cls(full.top) === 'gold',
    'top=' + cls(full.top) + ' ' + JSON.stringify(full.top));
  A.chk('半蓄力时环不是金色（还没满就不许提前庆祝）', cls(half.top) !== 'gold',
    'top=' + cls(half.top) + ' ' + JSON.stringify(half.top));

  /* ---- 量具自证：半蓄力那把的环必须**真的**是蓝色系的像素 ----
   * 不做这一步的话，"满蓄力是金色"可能只是"按钮底色恰好偏黄"。 */
  {
    const halfRGB = half.top;
    const isBluish = halfRGB[2] > 150 && halfRGB[2] > halfRGB[0];
    A.chk('量具能失败：半蓄力时环上的像素确实是偏蓝（B 通道高于 R）',
      isBluish, JSON.stringify(halfRGB));
    const idleRGB = idle.top;
    A.chk('量具能失败：没按时同一个点是暗的（对比能区分两种状态）',
      Math.max(idleRGB[0], idleRGB[1], idleRGB[2]) < 70, JSON.stringify(idleRGB));
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
