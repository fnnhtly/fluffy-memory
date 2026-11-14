/* 探针：1-3 电池用光之后，玩家在画面上看到什么？
 *
 * `motor_out` 是引擎写的事件（game.js:952/958），但渲染层**没有任何消费者**
 * （`grep motor_out index.html` 零命中）。也就是说马达断电这一瞬间
 * 画面上什么都不发生：车不再被推动，玩家只看到它慢慢停住。
 *
 * 更糟的是失败文案：车停下 → 8 秒没进展 → `no_progress` →
 * 「一直在原地打转：8 秒没能更靠近终点」。而这辆车的真实原因是**电池用光了**。
 * 玩家照着这句话会去改重心、改配重 —— 全都白费劲。
 *
 * 这正是第 47 轮那个 `failCulprit` 的同一类问题：诊断说错了原因，
 * 玩家会朝错误方向修车。
 *
 * 本探针只量"有没有任何反馈"：断电前后取 HUD 顶栏与车身区域的像素指纹。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeMO-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(800);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  await ev(`(()=>{const s=window.__rap.state,G=window.__rap.RAP,lv=window.__rap.levels[2];
    s.welcome=0; s.helpOpen=0; s.paused=false;
    window.__rap.startLevel(2); s.welcome=0; s.introT=1;
    G.applySpec(lv, s.build, G.SPECS['1-3']);
    window.__rap.launch(); s.runBanner=0;
    s.paused=true;
    window.__realNow = performance.now.bind(performance);
    performance.now = function () { return 12345.678; };
    s.dust=[]; s.bursts=[]; s.confetti=[]; s.debris=[];
    return 1;})()`);
  await sleep(600);

  /* 抓"文案"：fillText 补丁，只记录不改变绘制 */
  await ev(`(()=>{if(window.__txt) return 1;
    const C=CanvasRenderingContext2D.prototype, o=C.fillText;
    window.__txt=[]; window.__clear=[];
    C.fillText=function(t){ window.__txt.push(String(t)); return o.apply(this,arguments); };
    const oc=C.clearRect;
    C.clearRect=function(){ window.__txt.length=0; return oc.apply(this,arguments); };
    return 1;})()`);

  const probe = async () => JSON.parse(await ev(`(()=>{
    const cv=document.querySelector('canvas');
    const dpr=cv.width/1280;
    const g=cv.getContext('2d',{willReadFrequently:true});
    const s=window.__rap.state;
    // 顶栏能量那一行（runTimeRects 之外，直接用屏幕坐标取样）
    const d1=g.getImageData(Math.round(700*dpr), Math.round(138*dpr),
      Math.round(180*dpr), Math.round(30*dpr)).data;
    const a1=[]; for(let i=0;i<d1.length;i+=4) a1.push(d1[i],d1[i+1],d1[i+2]);
    window.__snapA=a1;
    const carw=window.__txt.slice();
    return JSON.stringify({energy:+s.run.car.energy.toFixed(1),
      events:(s.run.events||[]).filter(e=>e.indexOf('motor')===0),
      toast:s.toast||null,
      texts:carw.filter(t=>/电|能量|马达|停/.test(t))});
  })()`));

  // 满电
  const a = await probe();
  console.log('满电：' + JSON.stringify(a));

  // 断电
  await ev(`(()=>{const s=window.__rap.state; s.run.car.energy=0;
    s.run.energyZeroAt=s.time; return 1;})()`);
  await sleep(400);
  const b = await probe();
  console.log('断电：' + JSON.stringify(b));

  // 再等一秒
  await sleep(900);
  const c = await probe();
  console.log('断电 1.3 秒后：' + JSON.stringify(c));

  /* 像素：顶栏与车身有没有变 */
  const diff = JSON.parse(await ev(`(()=>{
    const cv=document.querySelector('canvas');
    const dpr=cv.width/1280;
    const g=cv.getContext('2d',{willReadFrequently:true});
    const d=g.getImageData(Math.round(700*dpr), Math.round(138*dpr),
      Math.round(180*dpr), Math.round(30*dpr)).data;
    let ch=0;
    for(let i=0;i<d.length;i+=4){
      const j=i/4*3;
      if(Math.abs(d[i]-window.__snapA[j])>12||Math.abs(d[i+1]-window.__snapA[j+1])>12||
         Math.abs(d[i+2]-window.__snapA[j+2])>12) ch++;
    }
    return JSON.stringify({changed:ch, total:d.length/4});
  })()`));
  console.log('顶栏能量区像素变化：' + diff.changed + ' / ' + diff.total);

  ws.close(); require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
