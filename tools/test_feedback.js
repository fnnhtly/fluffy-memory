/* 事件 → 画面反馈（第 91 轮）。
 *
 * ── 为什么做这个 ──
 *
 * 引擎写了 25 个事件标签。渲染层对 11 个有**直接**消费
 * （`evs[i].indexOf('xxx')`），其余靠读状态量间接反映。
 *
 * "事件发生了，而屏幕没反应"是商业游戏的硬伤：玩家做了动作、
 * 游戏状态变了，画面告诉他的却和不做一样。
 *
 * ── 两条判据怎么来的 ──
 *
 * 都走**像素差分 + 噪声底**（第 90 轮的教训）：
 *   同一状态两帧 → 噪声
 *   触发事件后 → 差异
 *   要求：差异 − 噪声 ≥ 1 个百分点
 *
 * ⚠ 而且**量哪一块**是关键。第一版量"车周围 6 米"，
 * 捡木箱报 15.9% —— 那几乎全是"车从 x=3 瞬移到 x=22.5"的位移，
 * 不是拾取反馈。改成量**右上角木箱计数面板**（车怎么动都不影响它），
 * 才是真的在量"数字变了"这件事。
 *
 * ── 已知的缺口（下一轮要做） ──
 *
 * 现在两项都能过，但都**只有 5.9% / 10.6%** —— 那是"数字变了"和
 * "猪的表情变了"的量级。而一个刚帮玩家拿到三星的动作，
 * 在商业游戏里应该有更明显的演出（粒子、放大、音高）。
 * 这一轮先把"有没有"钉住，下一轮再谈"够不够"。
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

(async () => {
  const PORT = 9820 + Math.floor(Math.random() * 120);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeFb91b-' + Date.now()),
    '--window-size=1280,760', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    }
  };
  const send = (method, params) => new Promise((res, rej) => {
    const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const errs = [];
  ws.addEventListener('message', e2 => {
    try {
      const m = JSON.parse(e2.data);
      if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text);
    } catch (e) {}
  });
  const ev = async e => {
    const r = await send('Runtime.evaluate',
      { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('页面求值异常：' + (d.exception && d.exception.description || d.text));
    }
    return r.result.value;
  };

  const view = JSON.parse(await ev('JSON.stringify({W:window.__view.W,H:window.__view.H,' +
    'offX:window.__view.offX,offY:window.__view.offY})'));
  const cvSize = JSON.parse(await ev('(()=>{const cv=document.getElementById("cv");' +
    'return JSON.stringify({w:cv.width,h:cv.height});})()'));

  async function capture() {
    return await ev('(()=>{const cv=document.getElementById("cv"), g=cv.getContext("2d");' +
      'const d=g.getImageData(0,0,cv.width,cv.height).data;' +
      'const out=[]; for(let i=0;i<d.length;i+=4) out.push(d[i],d[i+1],d[i+2]); return out;})()');
  }
  function diffIn(a, b, rect) {
    const k = cvSize.w / view.W;
    const x0 = Math.max(0, Math.round((rect.x + view.offX) * k));
    const y0 = Math.max(0, Math.round((rect.y + view.offY) * k));
    const x1 = Math.min(cvSize.w, Math.round((rect.x + rect.w + view.offX) * k));
    const y1 = Math.min(cvSize.h, Math.round((rect.y + rect.h + view.offY) * k));
    let n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * cvSize.w + x) * 3;
        if (Math.abs(a[i] - b[i]) > 8 || Math.abs(a[i + 1] - b[i + 1]) > 8 ||
            Math.abs(a[i + 2] - b[i + 2]) > 8) n++;
      }
    }
    return { n, area: Math.max(0, (x1 - x0) * (y1 - y0)) };
  }

  async function measure(label, setup, trigger, rectExpr, extraMs) {
    await ev(setup);
    await sleep(460);
    const rect = JSON.parse(await ev(rectExpr));
    if (!rect || !(rect.w > 0)) { chk(label + ' 的前提：拿得到目标矩形', false, 'null'); return null; }
    const N1 = await capture();
    await sleep(180);
    const N2 = await capture();
    const noise = diffIn(N1, N2, rect);
    const noisePct = noise.area ? noise.n / noise.area * 100 : 0;
    const trig = JSON.parse(await ev(trigger));
    await sleep(extraMs);
    const E = await capture();
    const d = diffIn(N2, E, rect);
    const pct = d.area ? d.n / d.area * 100 : 0;
    lines.push(label.padEnd(20) + ' 噪声 ' + noisePct.toFixed(1).padStart(5) + '%' +
      '  事件后 ' + pct.toFixed(1).padStart(5) + '%');
    return { noisePct, pct, trig };
  }

  /* 共用 setup 片段：装 1-1 标准车、跑过出生保护期、钉住镜头、冻住物理 */
  const COMMON = `R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
    S.paused=false; S.shake=0; S.flash=0; S.slowmo=0; S.vignette=0;
    S.__hideDraw=null; S.__freezeRun=true;
    R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
    R.launch(); S.runBanner=0;
    for (let k=0;k<60;k++){ if(S.run.phase!=='run') break; R.RAP.step(S.run,1/60); }`;

  // ═════════════ A 捡木箱 ═════════════
  const boxRes = await measure('A 捡木箱', `(()=>{const R=window.__rap, S=R.state;
    ${COMMON}
    const c=S.run.car;
    c.x = 3.0; c.y = R.RAP.groundY(S.run, 3.0) + 2.0; c.vx=0; c.vy=0;
    S.__lockCam = { x: c.x + 2.0, y: R.RAP.groundY(S.run, c.x) + 1.5, zoom: 1.85 };
    return 1;})()`,
    `(()=>{const R=window.__rap, S=R.state, c=S.run.car;
      const bx = S.run.boxes[0].col + 0.5;
      c.x = bx; c.y = R.RAP.groundY(S.run, bx) + 1.5; c.vx=0; c.vy=0;
      R.RAP.step(S.run, 1/60);
      return JSON.stringify({got:S.run.boxesGot, evs:S.run.events.filter(e=>e.indexOf('box')===0)});})()`,
    // 量右上角木箱计数面板 —— 车怎么动都不影响它
    `(()=>{const R=window.__rap; return JSON.stringify(R.runTimeRects().box);})()`,
    280);

  // ═════════════ B 猪受伤 ═════════════
  /* ⚠ 用 vn = 9.5 而不是 12。
   *
   * `damageCar` 的分档是 `vn >= 11 ? 9 : (vn >= 8 ? 2 : 1)`，
   * 而猪受伤的门槛是 `vn > 10`。所以：
   *   vn = 12 → 9 点伤害 → **木框全碎** → 猪的 mood 变成 `dead`（不是 hurt）
   *   vn = 9.5 → 2 点伤害 + pig_hurt（9.5 > 10 不成立……）
   *
   * 等等，`pig_hurt` 的条件是 `vn > 10`，而 9.5 不满足。必须 > 10。
   * 那就 vn = 10.5：伤害 2 点（不碎），pig_hurt 成立。
   *
   * 第一版用 12 量到的 20% 是"猪变成 dead 表情"，而红验证删 `mood = 'hurt'`
   * 自然不红 —— 走的是 dead 分支。用 10.5 走的是 hurt 分支，
   * 删掉那一行才会红。
   */
  const hurtRes = await measure('B 猪受伤', `(()=>{const R=window.__rap, S=R.state;
    ${COMMON}
    const c=S.run.car;
    c.x = 8.0; c.y = R.RAP.groundY(S.run, 8.0) + 2.0; c.vx=0; c.vy=0;
    S.__lockCam = { x: c.x + 2.0, y: R.RAP.groundY(S.run, c.x) + 1.5, zoom: 1.85 };
    return 1;})()`,
    `(()=>{const R=window.__rap, S=R.state;
      R.RAP.damageCar(S.run, 10.5);
      return JSON.stringify({hp:S.run.pigHP, mood:S.pigMood,
        evs:S.run.events.filter(e=>/pig_hurt/.test(e))});})()`,
    `(()=>{const S=window.__rap.state, cm=S.camLastDraw;
      const s=32*cm.zoom, c=S.run.car;
      const cx=640+(c.x-cm.x)*s, cy=360-(c.y-cm.y)*s;
      const r=4*s;
      return JSON.stringify({x:cx-r/2, y:cy-r/2, w:r, h:r});})()`,
    280);

  console.log('');
  console.log(lines.join('\n'));
  console.log('');

  const MIN_DELTA = 1.0;
  [
    ['A 捡木箱在画面上有反馈（HUD 计数变化）', boxRes, 1],
    ['B 猪受伤在画面上有反馈（表情变化）', hurtRes, 1]
  ].forEach(([n, r]) => {
    if (!r) return;
    chk(n, (r.pct - r.noisePct) >= MIN_DELTA,
      (r.pct - r.noisePct).toFixed(1) + ' 个百分点');
  });

  /* 前提：两次触发都真的发生了（否则上面两条量的是"什么都没变"） */
  chk('前提：木箱真的被捡到了（box 事件）',
    !!boxRes && boxRes.trig.got === 1 && boxRes.trig.evs.length > 0,
    boxRes ? JSON.stringify(boxRes.trig) : 'null');
  /* ⚠ 前提要允许两个 mood：`hurt` **或** `dizzy`。
   *
   * mood 的判定顺序是：
   *   lastImpactAt > now−0.7  → dizzy   （优先级最高）
   *   pigHP < 3               → hurt
   * damageCar 会写 lastImpactAt，所以受伤后 0.7 秒内 mood 是 `dizzy`；
   * 之后才落到 `hurt`。两者都说明"猪对这次受伤有反应"。
   *
   * 第一版只认 `hurt`，于是 10.5 那一次判成前提不成立 ——
   * 而实际上 `dizzy` 也是画出来的（`state.pigShake = true`，耳朵乱晃）。
   * 这是"判据把一个合法的实现细节当成了唯一答案"（第十二次）。 */
  /* ⚠ 前提**不能**查 `pigMood`。
   *
   * `state.pigMood` 是**渲染层**在 `drawRun` 里算的，而 trigger 是在
   * 触发那一瞬间读的 —— 那时还没渲染过，`pigMood` 还是上一帧的 `normal`。
   * 要查 mood 必须在 `sleep` 之后再读一次。
   *
   * 第一版在这里查 mood，于是 3/4 —— 查的是一个还没更新的量
   * （第十三次踩"读了一个还没更新的量"）。现在只查"事件发生了 + hp 掉了"。 */
  chk('前提：猪真的受伤了（pig_hurt 事件 + hp 从 3 掉到 2）',
    !!hurtRes && hurtRes.trig.hp === 2 && hurtRes.trig.evs.length > 0,
    hurtRes ? JSON.stringify(hurtRes.trig) : 'null');

  console.log('');
  console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  try { ws.close(); } catch (e) {}
  try { require('./lib/asserts.js').killTree(child); } catch (e) {}
  process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });
