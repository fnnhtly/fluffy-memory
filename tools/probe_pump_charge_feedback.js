/* 探针：按住打气筒的时候，屏幕上有任何变化吗？（v2）
 *
 * 打气筒的**全部玩法**就是"按住蓄力、松手放气"：
 * 冲量 = `pumpImpulse × (0.35 + 0.65 × 蓄力)`，蓄力上限 0.8 秒 ——
 * 按多久直接决定推力多大（0.35 倍 vs 1.0 倍，接近 3 倍差距）。
 *
 * 但 `car.pumpCharge` 在渲染层**一次都没被读过**（grep pumpCharge index.html 零命中）。
 * 按钮上画的是零件名 + 数量。按下、蓄到 0.8、松手放气 —— 三种状态长得一样。
 *
 * v1 的两个量具错误（这一版修的就是它们）：
 *   1. 用整块像素的**求和**当指纹：静置/蓄力两帧差 3422，而"把按钮涂成品红"
 *      自检只差 4259 —— 两者量级相同，说明自检根本没验证到量具的分辨率。
 *      原因是**画上去的东西在下一帧 rAF 就被重画掉了**，自检读到的是重画后的画面。
 *      现在自检改成"同一个 evaluate 里先涂、再立刻读回来"。
 *   2. 求和会被大面积的小噪声吃掉：真正该量的是**有多少像素变了**。
 *      改成逐像素比较（任一通道差 > 12 记为一个变化点），并把变化像素的比例报出来。
 */
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgePc2-' + Date.now()),
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
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(800);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  await ev(`(()=>{const s=window.__rap.state,G=window.__rap.RAP,lv=window.__rap.levels[1];
    s.welcome=0; s.helpOpen=0; s.paused=false;
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    G.applySpec(lv, s.build, G.SPECS['1-2']);
    window.__rap.launch(); s.runBanner=0;
    s.paused=true;                    // 冻住物理，HUD 继续画
    return 1;})()`);
  await sleep(400);

  /* 把交互钮整块像素读成数组存进 window.__pumpBits（同一帧内完成）。
   * 之后每次比较都是纯数组运算，画面再变也不影响已经取到的两份快照。 */
  const snap = async (label) => await ev(`(()=>{
    const cv=document.querySelector('canvas');
    const dpr=cv.width/1280;
    const g=cv.getContext('2d',{willReadFrequently:true});
    const s=window.__rap.state;
    const n=Math.min(3,((s.run&&s.run.car.groups)||[]).length);
    const x0=1280/2-(n*104)/2, b=window.__rap.btnRect('interact');
    const d=g.getImageData(Math.round(x0*dpr), Math.round(b.y*dpr),
      Math.round(92*dpr), Math.round(92*dpr)).data;
    const bits=[]; for(let i=0;i<d.length;i+=4) bits.push(d[i],d[i+1],d[i+2]);
    window.__bits = window.__bits || {};
    window.__bits['${label}'] = bits;
    return JSON.stringify({label:'${label}', n:bits.length/3,
      charge:+(s.run&&s.run.car.pumpCharge||0).toFixed(3),
      held:!!(s.run&&s.run.car.pumpHeld)});
  })()`);

  const cmp = (a, b) => ev(`(()=>{
    const A=window.__bits['${a}'], B=window.__bits['${b}'];
    if(!A||!B) return JSON.stringify({err:'缺快照'});
    let ch=0, tot=A.length/3;
    for(let i=0;i<A.length;i+=3){
      if(Math.abs(A[i]-B[i])>12 || Math.abs(A[i+1]-B[i+1])>12 || Math.abs(A[i+2]-B[i+2])>12) ch++;
    }
    return JSON.stringify({changed:ch, total:tot, pct:+(ch/tot*100).toFixed(1)});
  })()`);

  /* 噪声底必须和被测条件**同样的等待时长**。
   * 上一版两次静置快照是紧挨着取的，噪声底只有 7 像素，而蓄力那一次等了 350ms ——
   * 尘土飘移、震屏衰减这些每帧都在动的东西被算进了"蓄力带来的变化"。
   * 这一版：静置 → 等 350ms → 再静置，这才是同一时长下的噪声底。 */
  await snap('idle');
  await sleep(350);
  await snap('idle2');
  await ev(`(()=>{window.__rap.RAP.pressInteract(window.__rap.state.run,1);
    window.__rap.state.run.car.pumpCharge=0.8; return 1;})()`);
  await sleep(350);
  await snap('charged');
  await ev(`(()=>{window.__rap.state.run.car.pumpCharge=0;
    window.__rap.state.run.car.pumpHeld=false; return 1;})()`);
  await sleep(300);
  await snap('after');

  const base = JSON.parse(await cmp('idle', 'idle2'));
  const a = JSON.parse(await cmp('idle', 'charged'));
  const b2 = JSON.parse(await cmp('idle', 'after'));
  console.log('噪声底（静置 vs 静置）：变化像素 ' + base.changed + ' / ' + base.total +
    '（' + base.pct + '%）');
  console.log('静置 vs 蓄力满：变化像素 ' + a.changed + ' / ' + a.total + '（' + a.pct + '%）');
  console.log('静置 vs 松手后：变化像素 ' + b2.changed + ' / ' + b2.total + '（' + b2.pct + '%）');
  console.log('\n判读：蓄力带来的变化 ' + a.changed + ' 像素，噪声底 ' + base.changed +
    ' 像素 → ' + (a.changed <= base.changed * 1.5
      ? '★ 和噪声底一个量级：按住蓄力在画面上**什么都没发生**'
      : '蓄力确实带来了可见变化'));

  /* 量具自证（v2 修好的部分）：在**同一个 evaluate 里**涂一块再立刻读回，
   * 中间不让 rAF 重画。这样能证明"逐像素比较"这条量具真的看得见 92×92 块内的改动。 */
  {
    const self = JSON.parse(await ev(`(()=>{
      const cv=document.querySelector('canvas');
      const dpr=cv.width/1280;
      const g=cv.getContext('2d',{willReadFrequently:true});
      const s=window.__rap.state;
      const n=Math.min(3,((s.run&&s.run.car.groups)||[]).length);
      const x0=1280/2-(n*104)/2, b=window.__rap.btnRect('interact');
      const W=Math.round(92*dpr), H=Math.round(92*dpr);
      const X=Math.round(x0*dpr), Y=Math.round(b.y*dpr);
      const before=g.getImageData(X,Y,W,H).data;
      g.fillStyle='#ff00ff';
      g.fillRect(X+10*dpr, Y+10*dpr, 40*dpr, 40*dpr);
      const after2=g.getImageData(X,Y,W,H).data;
      let ch=0; const tot=before.length/4;
      for(let i=0;i<before.length;i+=4){
        if(Math.abs(before[i]-after2[i])>12||Math.abs(before[i+1]-after2[i+1])>12||
           Math.abs(before[i+2]-after2[i+2])>12) ch++;
      }
      return JSON.stringify({changed:ch, total:tot, pct:+(ch/tot*100).toFixed(1)});
    })()`));
    console.log('量具自检（同帧涂 40×40 品红）：变化像素 ' + self.changed + ' / ' + self.total +
      '（' + self.pct + '%）' + (self.changed > 0 ? ' → 量具看得见变化 ✓' : ' → ✗ 量具是瞎的'));
  }

  ws.close(); require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
