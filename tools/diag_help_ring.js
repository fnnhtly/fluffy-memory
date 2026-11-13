/* 诊断：行驶阶段右上「?」帮助按钮的金线圈，有没有被计时面板盖掉一段。
 *
 * 判据：沿按钮圆周（半径 22，正好压在金色描边上）取 72 个点，
 *       统计"金色"（r>110 且 r>b+20）的点数。完整金圈 ≈ 72；
 *       被深色面板盖掉一段 → 明显少于 72。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);   // 随机端口：避免残留进程撞车
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeHg-' + Date.now()),
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
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  const ring = async (name) => {
    // 描边是一条细线，正好取 r=22 会踩到抗锯齿。改成沿半径 19..25 扫一个带，
    // 每个角度只要带内出现过金色就算"这一段金圈还在"。
    const r = JSON.parse(await ev(`(()=>{
      const cv=document.querySelector('canvas');
      const dpr=cv.width/1280;
      const b=window.__rap.btnRect('help');
      const cx=(b.x+b.w/2)*dpr, cy=(b.y+b.h/2)*dpr;
      const g=cv.getContext('2d',{willReadFrequently:true});
      let gold=0, N=72; const bad=[];
      for(let k=0;k<N;k++){
        const a=k/N*Math.PI*2;
        let hit=false;
        for(let rr=19*dpr; rr<=25*dpr; rr+=0.5*dpr){
          const d=g.getImageData(Math.round(cx+Math.cos(a)*rr), Math.round(cy+Math.sin(a)*rr),1,1).data;
          if(d[0]>110 && d[0]>d[2]+20){ hit=true; break; }
        }
        if(hit) gold++; else bad.push(Math.round(a*180/Math.PI));
      }
      return JSON.stringify({gold,N,bad});
    })()`));
    console.log(name.padEnd(14), '金圈 ' + r.gold + '/' + r.N,
      ' 缺失角度(°)', r.bad.join(','));
    return r;
  };

  // 建造阶段：按钮在建造坞里，作为"完整金圈"的对照
  await ev(`(()=>{const s=window.__rap.state; s.welcome=0; s.introT=1; s.phase='build'; s.run=null; return 1;})()`);
  await sleep(500);
  const b = await ring('建造阶段对照');

  // 行驶阶段：按钮在右上角
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch(); s.runBanner=0; return 1;})()`);
  await sleep(900);
  const r = await ring('行驶阶段');

  // 计时面板矩形（硬编码的假设要与源码一致：DW-224, 90, 192, 30）
  console.log('计时面板 = x[' + (1280 - 224) + ',' + (1280 - 32) + '] y[90,120]');
  console.log('帮助按钮 = x[' + 1210 + ',' + 1256 + '] y[84,130]  → 重叠 x[1210,1248] y[90,120]');

  ws.close(); child.kill();
})().catch(e => { console.log('FAIL', e); process.exit(1); });
