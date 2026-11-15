/* 地下纹理是不是**世界锚定**的？
 *
 * 用户反馈原话：「地下的纹理都不随车的移动而改变，没有移动相对运动，看着非常难受」。
 *
 * 这条缺陷很容易"看着像修好了"：地形轮廓本来就在动，草叶和碎石也在动，
 * 所以随便截两帧对比都会有很多像素不同 —— 但石头纹理可以一动不动地贴在镜头上。
 * 所以这个探针**只在"地面以下"取样**，用互相关看图案是不是跟着镜头平移。
 *
 * ── 量具自己踩过的五个坑（都留在这里，别再踩） ──
 * 1) 取样区是纯色 → score 恒为 0、bestK 卡在搜索边界。那不是"纹理不动"，是没量到东西。
 * 2) 纯色的原因是 `state.paused = true`：暂停叠一层暗化遮罩，把整块压成同一灰度。
 *    改用 `run.phase='frozen'`（step 早退、但没有遮罩）。
 * 3) 手动 `createRun` 不够：正常局里镜头由 frameBody 每帧写 camState，
 *    手造的局 car 为 undefined、镜头停在初始值，画面全黑。正确入口是 `launchSpec`。
 * 4) **最隐蔽的一个**：在同一段 evaluate 里"设镜头 + getImageData"读到的是上一帧
 *    （rAF 还没跑）。必须分成两次调用，中间让出一帧。
 *    另外画布宽是 1254 而不是 1280，取样坐标要乘 canvasW/1280。
 * 5) **直接覆盖 camState 没用**：drawRun 每帧把它缓动到"车的位置 + 2"，我设的值
 *    一帧就被拉回去。正确做法是**动车** —— 车动镜头才动，这才是真实路径。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeTex-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
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

  // 走真正的入口：装 1-1 标准解并发射，然后冻结物理（不加遮罩）
  await ev(`(()=>{window.__rap.launchSpec(0,'1-1');
    const S=window.__rap.state; S.run.phase='frozen'; S.paused=false;
    S.fx=[]; S.particles=[]; S.replay=null; S.runBanner=0; return 1;})()`);
  await sleep(500);

  const scale = await ev(`(()=>{const c=document.getElementById('cv');
    return c.width / 1280;})()`);
  A.log('画布宽/设计宽 = ' + scale.toFixed(5));

  /* 把车放到某个世界 x 上（run.phase=frozen 所以它不会动），
   * 等镜头缓动收敛 —— 镜头是"慢跟随"，约 800 ms 内到位。 */
  const putCar = async (wx) => {
    await ev(`(()=>{const S=window.__rap.state, c=S.run.car;
      c.x=${wx}; c.vx=0; c.vy=0;
      c.y = S.run.terrain.surfaceY(${wx}) + 1.6;
      return 1;})()`);
    await sleep(900);
  };
  const camNow = async () => JSON.parse(await ev(
    'JSON.stringify(window.__rap.state.camState)'));

  const grab = async () => {
    const data = await ev(`(()=>{
      const cv=document.getElementById('cv'), g=cv.getContext('2d');
      const k = cv.width / 1280;
      const S=window.__rap.state, cam=S.camState;
      /* 取样带的位置必须**从地形算出来**，不能写死。
       * 写死过一次 y=430..600，而车在 x=20 时地表在屏幕 y≈543、
       * 镜头 y≈9.1 —— 那条带子整个落在**天空**里，读到的是天空渐变的
       * 每行均匀灰度（64、123…），互相关当然给 k=0。
       * 那不是"纹理不动"，是量具在量天。
       * 现在从"镜头中心那一列的地表"往下 70 px 开始取，高 110 px。 */
      const surfY = S.run.terrain.surfaceY(cam.x);
      const surfScr = 720/2 - (surfY - cam.y) * (32 * cam.zoom);
      const x0 = 220, w = 840;
      const y0 = Math.max(0, Math.min(720 - 130, surfScr + 70));
      const h = 110;
      const img=g.getImageData(Math.round(x0*k),Math.round(y0*k),
                               Math.round(w*k),Math.round(h*k));
      const out=[]; const d=img.data; const W=img.width, H=img.height;
      let mn=255,mx=0;
      for(let y=0;y<H;y+=4){ for(let x=0;x<W;x+=4){
        const i=(y*W+x)*4; const v=Math.round(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]);
        if(v<mn)mn=v; if(v>mx)mx=v; out.push(v);
      }}
      return JSON.stringify({w:Math.ceil(W/4), h:Math.ceil(H/4), px:out,
        mn:mn, mx:mx, surfScr:Math.round(surfScr), y0:Math.round(y0)});})()`);
    return JSON.parse(data);
  };

  await putCar(20); const camA = await camNow(); const a = await grab();
  await putCar(23); const camB = await camNow(); const b = await grab();

  const moved = camB.x - camA.x;
  A.log('镜头 x：' + camA.x.toFixed(2) + ' → ' + camB.x.toFixed(2) +
        '，实际移动 ' + moved.toFixed(2) + ' m');
  A.chk('镜头真的移动了（前提）', Math.abs(moved) > 2.0, moved.toFixed(2) + ' m');

  A.log('取样 ' + a.w + ' × ' + a.h + ' 点（地表在屏幕 y=' + a.surfScr +
        '，取样带 y=' + a.y0 + '..' + (a.y0 + 110) + '），灰度范围 ' +
        a.mn + '..' + a.mx + '（跨度 ' + (a.mx - a.mn) + '）');
  A.chk('取样区有内容（不是纯色）', a.mx - a.mn >= 25, '灰度跨度 ' + (a.mx - a.mn));

  // 用**实测的镜头位移**和**实测的缩放**算期望位移，不靠假设
  const zoom = camB.zoom;
  const ptsPerMeter = 32 * zoom * scale / 4;
  const expectShift = moved * ptsPerMeter;
  A.log('zoom=' + zoom.toFixed(3) + '，每米约 ' + ptsPerMeter.toFixed(2) +
        ' 采样点，期望位移约 ' + expectShift.toFixed(1));

  function score(pa, pb, k) {
    let s = 0, n = 0;
    for (let y = 0; y < pa.h; y++) {
      for (let x = Math.max(0, -k); x < pa.w && x + k < pa.w; x++) {
        const d = pa.px[y * pa.w + x] - pb.px[y * pa.w + (x + k)];
        s += d * d; n++;
      }
    }
    return n ? -s / n : -1e9;
  }
  let bestK = 0, bestS = -1e18;
  for (let k = -80; k <= 80; k++) {
    const s = score(a, b, k);
    if (s > bestS) { bestS = s; bestK = k; }
  }

  A.log('互相关最佳位移 k = ' + bestK);
  A.log('零位移匹配度 = ' + score(a, b, 0).toFixed(1) + '，最佳处 = ' + bestS.toFixed(1));

  A.chk('纹理随世界平移（k 的绝对值接近镜头位移）',
    Math.abs(Math.abs(bestK) - expectShift) <= expectShift * 0.4 + 2,
    'k=' + bestK + ' 期望约 ' + expectShift.toFixed(1));
  A.chk('零位移明显差于最佳位移（说明真的在动）',
    bestS > score(a, b, 0) + 20,
    'best=' + bestS.toFixed(1) + ' k0=' + score(a, b, 0).toFixed(1));

  A.finish(ws, child);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });
