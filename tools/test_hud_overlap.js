/* HUD 不许自己盖自己：同一屏上的所有固定面板/按钮矩形，两两不许相交。
 *
 * 起因是一个真实的 bug：行驶期右上的计时面板（y 90..120）压住了「?」帮助按钮
 * （y 84..130）的下半圈，玩家看到的是一个缺了一块的按钮。这种重叠画面上"看着还行"，
 * 只有把矩形算出来才知道。判据就是纯几何：相交面积必须为 0。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);   // 随机端口：避免残留进程撞车
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeOv-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  // 取一屏上所有"有名有姓"的固定矩形。返回 [{name, x,y,w,h}]。
  const rectsOf = async (phase) => JSON.parse(await ev(`(()=>{
    const R=window.__rap, s=R.state, out=[];
    const add=(n,r)=>{ if(r) out.push({name:n,x:r.x,y:r.y,w:r.w,h:r.h}); };
    ['pause','restartRun','help','interact','brake','retryRun','launch','clear','undo','rotate'].forEach(n=>{
      const r=R.btnRect(n); if(r) add(n,r);
    });
    if (s.phase==='run') { const t=R.runTimeRects(); add('timer',t.timer); add('box',t.box);
      const pp=R.runProgressRect(); add('progress',pp.panel); add('infoBarRun',{x:84,y:90,w:700,h:30});
      add('challenge', R.runChallengeRect()); }
    if (s.phase==='build') {
      // 顶部信息条 / 三行说明底衬 / 整车统计卡 / 建造网格
      add('infoBar',{x:84,y:90,w:700,h:30});
      add('infoLines',{x:84,y:128,w:640,h:58});
      add('statCard',{x:1280-232,y:148,w:200,h:188});
      const o=R.buildOrigin(); add('buildGrid',{x:o.x,y:o.y,w:R.RAP.BUILD_COLS*R.BUILD_PX,h:R.RAP.BUILD_ROWS*R.BUILD_PX});
      for(let i=0;i<R.TRAY.length;i++) add('tray'+i, R.trayRect(i));
      add('tip',{x:1280/2-330,y:720-136,w:660,h:20});
    }
    return JSON.stringify(out);
  })()`));

  const overlap = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return (w > 0 && h > 0) ? +(w * h).toFixed(1) : 0;
  };

  const checkPhase = async (label, setup) => {
    await ev(setup);
    await sleep(500);
    const phase = await ev('window.__rap.state.phase');
    const rs = await rectsOf(phase);
    const bad = [];
    for (let i = 0; i < rs.length; i++) {
      for (let j = i + 1; j < rs.length; j++) {
        const a = overlap(rs[i], rs[j]);
        if (a > 0) bad.push(rs[i].name + ' × ' + rs[j].name + ' 重叠 ' + a + ' px²');
      }
    }
    A.log(label + '：' + rs.length + ' 个固定矩形，' + (bad.length ? bad.join('；') : '无重叠'));
    A.chk(label + ' 所有固定面板互不重叠', bad.length === 0, bad.join('；'));
    return rs;
  };

  await checkPhase('建造页', `(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1;
    s.phase='build'; s.run=null; s.paused=false; return 1;})()`);

  const runRects = await checkPhase('行驶页', `(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch(); s.runBanner=0; return 1;})()`);

  // 关键回归：帮助按钮与计时面板必须真的分开（这条曾经是 bug）
  const help = runRects.find(r => r.name === 'help');
  const timer = runRects.find(r => r.name === 'timer');
  A.chk('帮助按钮与计时面板确实不相交（历史 bug 回归）',
    overlap(help, timer) === 0,
    'help y[' + help.y + ',' + (help.y + help.h) + '] timer y[' + timer.y + ',' + (timer.y + timer.h) + ']');
  A.chk('帮助按钮整圆都在屏幕内',
    help.x >= 0 && help.y >= 0 && help.x + help.w <= 1280 && help.y + help.h <= 720,
    JSON.stringify(help));

  // 像素级复核：沿按钮圆周扫金圈，整圆应该是 72/72。
  // 这一条同时自证"能量出失败"：同一个同步块里先用深色矩形盖住下半圈再立刻读数，
  // 覆盖率必须掉下来。（不能在两次 evaluate 之间做——rAF 会先把它重绘回去。）
  const ringCoverage = (cover) => ev(`(()=>{
    const cv=document.querySelector('canvas');
    const dpr=cv.width/1280;
    const b=window.__rap.btnRect('help');
    const cx=(b.x+b.w/2)*dpr, cy=(b.y+b.h/2)*dpr;
    const g=cv.getContext('2d',{willReadFrequently:true});
    if(${cover ? 'true' : 'false'}){
      g.fillStyle='rgba(10,18,24,1)';
      g.fillRect(0, cy, cv.width, cv.height-cy);   // 盖住按钮的下半圈
    }
    let gold=0, N=72;
    for(let k=0;k<N;k++){
      const a=k/N*Math.PI*2;
      for(let rr=19*dpr; rr<=25*dpr; rr+=0.5*dpr){
        const d=g.getImageData(Math.round(cx+Math.cos(a)*rr), Math.round(cy+Math.sin(a)*rr),1,1).data;
        if(d[0]>110 && d[0]>d[2]+20){ gold++; break; }
      }
    }
    return gold;
  })()`);

  const full = await ringCoverage(false);
  A.chk('行驶期「?」按钮的金圈是完整的 72/72 段', full === 72, full + '/72');

  const covered = await ringCoverage(true);
  A.chk('像素度量尺能失败：盖住下半圈后金圈段数明显下降',
    covered <= 45, covered + '/72（盖住后）');

  // 测试自己盖的那一笔不需要清理：下一帧 rAF 会把画面重绘回去。
  await sleep(200);
  const restored = await ringCoverage(false);
  A.chk('重绘后金圈恢复完整（说明刚才的下降确实来自覆盖，不是渲染坏了）',
    restored === 72, restored + '/72');

  // 度量尺自证：旧版计时面板（y=90）必须被这条判据抓出来，
  // 否则"无重叠"只能说明这条判据根本不会失败。
  {
    const OLD = { name: 'timer-old', x: 1280 - 224, y: 90, w: 192, h: 30 };
    A.chk('度量尺能失败：旧的 y=90 计时面板确实被判为重叠',
      overlap(help, OLD) > 0, overlap(help, OLD) + ' px²');
  }

  // 暂停面板开着时，面板本身也不许和顶部按钮相交
  await ev(`(()=>{window.__rap.state.paused=true; return 1;})()`);
  await sleep(300);
  const P = JSON.parse(await ev(`(()=>{const p=window.__rap.pauseRowRects();
    return JSON.stringify({rows:[p.resume,p.back]});})()`));
  A.chk('暂停面板的两行按钮都在屏幕内',
    P.rows.every(r => r.x >= 0 && r.y >= 0 && r.x + r.w <= 1280 && r.y + r.h <= 720),
    JSON.stringify(P.rows));
  A.chk('暂停时两行按钮互不重叠', overlap(P.rows[0], P.rows[1]) === 0);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
