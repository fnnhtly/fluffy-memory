/* 暗场景还看得清吗（第 85 轮）。
 *
 * ── 为什么单独查这一条 ──
 *
 * 八关截图体检里，1-3（`cave` 洞穴）的亮度分布和其余七关差一个数量级：
 *
 *   1-3  亮度 < 40 的像素占 **67.7%**
 *   1-1  亮度 < 40 的像素占   3.6%
 *
 * "洞穴关本来就该暗"是设计意图，但"暗到看不清地形"就是缺陷。
 * 这两件事必须分开量。
 *
 * ── 判据 ──
 *
 *   A 暗场景的"全黑占比"必须有上限（< 40%），否则玩家在摸黑玩
 *   B 车必须和背景**可分辨**：车身区域的平均亮度与周围背景的差 ≥ 20
 *   C 地形轮廓必须可辨：竖直扫描线上亮度要有足够的**跳变次数**
 *     （全是同一个暗色 = 看不出地面在哪）
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SPEC_OF = require('./lib/specmap.js').SPEC_OF;

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

(async () => {
  const PORT = 9600 + Math.floor(Math.random() * 300);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeDark85-' + Date.now()),
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

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  /* 八关逐关量三件事 */
  const rows = [];
  const LEVELS = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8'];
  for (let i = 0; i < LEVELS.length; i++) {
    const key = SPEC_OF[LEVELS[i]];
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(${i}); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
      S.runBanner=0; S.shake=0;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS[${JSON.stringify(key)}]);
      S.phase='build'; S.run=null;
      R.launch(); S.runBanner=0;
      R.RAP.applySpecRuntime(S.run, R.RAP.SPECS[${JSON.stringify(key)}]);
      for (let k = 0; k < 72; k++) {
        if (S.run.phase !== 'run') break;
        window.__rap.RAP.step(S.run, 1/60);
      }
      S.runBanner = 0; S.shake = 0;
      /* 把镜头钉住（第 71 轮为测试建的 state.__lockCam）。
       *
       * 不钉的话 camLastDraw 取决于 sleep 期间渲染了几帧 ——
       * 缓动没收敛时车在屏幕上的位置偏几十像素，采样框就采到旁边的草地。
       * 实测同一份代码两次跑，1-1 的"车与背景亮度差"一次报 3、一次报 29.9。
       *
       * 钉住之后位置是确定的。这是项目反复出现的同一个教训：
       * 量具要读一个确定的量。
       * 注意：这段在模板字符串内部，注释里不能出现反引号。 */
      const c = S.run.car, ter = S.run.terrain;
      S.__lockCam = { x: c.x + 2.0,
        y: Math.max(c.y, ter.surfaceY(c.x)) + 1.5, zoom: 1.85 };
      return 1;})()`);
    await sleep(320);

    const m = JSON.parse(await ev(`(()=>{
      const S=window.__rap.state, car=S.run.car, cm=S.camLastDraw;
      const cv=document.getElementById('cv'), g=cv.getContext('2d'), v=window.__view;
      const W=cv.width, H=cv.height;
      const d=g.getImageData(0,0,W,H).data;
      const lum=(x,y)=>{ const j=(y*W+x)*4; return 0.299*d[j]+0.587*d[j+1]+0.114*d[j+2]; };
      /* A 全黑占比 */
      let dark=0, tot=0;
      for(let k=0;k<d.length;k+=16){
        const L=0.299*d[k]+0.587*d[k+1]+0.114*d[k+2];
        tot++; if(L<40) dark++;
      }
      /* B 车身 vs 背景的亮度差：车身中心一小块 vs 车上方 2.5 格 */
      const s=32*cm.zoom;
      const sx=640+((car.x-cm.x))*s, sy=360-((car.y-cm.y))*s;
      const toDev=(px_,py_)=>({X:Math.round((px_-v.offX)*(W/v.W)),Y:Math.round((py_-v.offY)*(H/v.H))});
      const avgBox=(cx,cy,r)=>{
        let sum=0,n=0;
        for(let dy=-r;dy<=r;dy+=2) for(let dx=-r;dx<=r;dx+=2){
          const q=toDev(cx+dx,cy+dy);
          if(q.X<0||q.Y<0||q.X>=W||q.Y>=H) continue;
          sum+=lum(q.X,q.Y); n++;
        }
        return n?sum/n:0;
      };
      const carLum=avgBox(sx, sy, Math.round(s*0.35));
      const bgLum=avgBox(sx, sy - s*2.5, Math.round(s*0.35));
      /* C 竖直扫描线上的亮度跳变次数（地形轮廓） */
      let jumps=0, last=lum(Math.round(W/2), 4);
      for(let y=6;y<H-4;y+=2){
        const cur=lum(Math.round(W/2), y);
        if(Math.abs(cur-last)>12) jumps++;
        last=cur;
      }
      return JSON.stringify({ darkPct:+(dark/tot*100).toFixed(1),
        carLum:+carLum.toFixed(1), bgLum:+bgLum.toFixed(1),
        contrast:+Math.abs(carLum-bgLum).toFixed(1), jumps:jumps });
    })()`));
    rows.push({ id: LEVELS[i], ...m });
    console.log(LEVELS[i] + '  全黑 ' + String(m.darkPct).padStart(5) + '%' +
      '  车 ' + String(m.carLum).padStart(5) + ' / 背景 ' + String(m.bgLum).padStart(5) +
      '  差 ' + String(m.contrast).padStart(5) +
      '  竖向跳变 ' + String(m.jumps).padStart(3));
    await sleep(60);
  }

  console.log('');
  /* A 全黑占比上限 */
  {
    const over = rows.filter(r => r.darkPct > 40);
    chk('A 每关的全黑像素（亮度 < 40）不超过 40%', over.length === 0,
      over.length ? over.map(r => r.id + '=' + r.darkPct + '%').join(' ') :
        '最高 ' + Math.max(...rows.map(r => r.darkPct)) + '%');
  }
  /* B 车与背景可分辨 */
  {
    const low = rows.filter(r => r.contrast < 20);
    chk('B 车身与背景的亮度差 ≥ 20（看得见车）', low.length === 0,
      low.length ? low.map(r => r.id + '=' + r.contrast).join(' ') :
        '最低 ' + Math.min(...rows.map(r => r.contrast)));
  }
  /* C 地形轮廓可辨 */
  {
    const flat = rows.filter(r => r.jumps < 6);
    chk('C 竖直扫描线的亮度跳变 ≥ 6 次（看得出地形）', flat.length === 0,
      flat.length ? flat.map(r => r.id + '=' + r.jumps).join(' ') :
        '最低 ' + Math.min(...rows.map(r => r.jumps)) + ' 次');
  }

  console.log(lines.join('\n'));
  console.log('');
  console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  try { ws.close(); } catch (e) {}
  /* 走共享的收尾（第 75 轮建的规矩）：杀进程树 + 删浏览器配置目录。
   * 第 85 轮 audit_profile_leaks 抓到的：这个脚本原来只 child.kill()，
   * 于是每跑一次就留一个 edge* 目录。 */
  try { require('./lib/asserts.js').killTree(child); } catch (e) { try { child.kill(); } catch (x) {} }
  process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });
