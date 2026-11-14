/* 探针：建造页「文字墙」有多宽 + 发射瞬间到底发生了什么。
 *
 * 两个问题，一次量清：
 *  1) 建造页那两行"说明书"（底部键位行、零件箱+分数行）实测像素宽度是多少？
 *     1280 宽的画布上，一行字超过 700px 就是一面墙，读不下去。
 *  2) 按「出发」之后 0.0~1.0 秒，画面和镜头分别是什么状态？
 *     商业游戏这里有一个"车落位、镜头跟上"的过场；我们要确认自己有没有。
 */
const fs = require('fs');
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeTW-' + Date.now()),
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

  await ev('window.__rap.state.introT=1');
  await ev('window.__rap.startLevel(0); window.__rap.state.welcome=0; window.__rap.state.introT=1');
  await sleep(300);

  // ---- 1. 两行"说明书"的实测宽度 ----
  const widths = JSON.parse(await ev(`(()=>{
    const c=document.getElementById('cv').getContext('2d');
    const out=[];
    const probe=(label,txt,px,weight)=>{
      c.font=(weight||'')+' '+px+'px "Microsoft YaHei", sans-serif';
      out.push({label,txt,px,w:Math.round(c.measureText(txt).width),chars:txt.length});
    };
    probe('底部键位行','左键放件 · 拖动可移动 · 右键/R 换方向 · Z 撤销 · C 清空 · 空格出发 · T 调参 · H 零件说明 · L 选关',10.5);
    probe('零件箱+分数行','零件箱：木框×3　木轮×2　气球×6　沙袋×3　小猪×1　　分数：★★ 拿木箱　★★★ 沙袋全扔',12);
    probe('重心行','重心 前后+0.42　轮上高度 0.88 m',12);
    probe('顶栏标题行','1-6 抬个头　总重 9.0 kg　能量 0　交互键 1/3',14);
    return JSON.stringify(out);})()`));
  console.log('===== 建造页文字墙实测（画布 1280 宽）=====');
  widths.forEach(w => console.log(
    '  ' + w.label.padEnd(12) + ' ' + String(w.px).padStart(5) + 'px  宽 ' +
    String(w.w).padStart(4) + 'px  占屏 ' + (w.w / 1280 * 100).toFixed(0) + '%  ' +
    w.chars + ' 字  → ' + (w.w > 700 ? '★ 一面墙' : 'OK')));

  // ---- 2. 发射瞬间 ----
  await ev(`(()=>{const s=window.__rap.state, R=window.__rap.RAP;
    R.applySpec(window.__rap.levels[0], s.build, R.SPECS['1-1']);
    window.__rap.state.build.__t0 = performance.now();
    return 1;})()`);
  await ev('window.__rap.launch()');
  console.log('\n===== 按「出发」之后（墙钟 / run.time / 镜头）=====');
  for (let i = 0; i < 8; i++) {
    await sleep(150);
    const d = JSON.parse(await ev(`(()=>{const s=window.__rap.state, c=s.camState||{};
      return JSON.stringify({wall:+((performance.now()-s.build.__t0)/1000).toFixed(2),
        t:s.run?s.run.time:null, phase:s.phase,
        cx:c.x||0, cy:c.y||0, z:c.zoom||0,
        introT:s.introT||0, banner:s.runBanner||0});})()`));
    console.log('  ' + (d.wall + 's').padStart(7) +
      '  run.t=' + (d.t === null ? '-' : d.t.toFixed(2).padStart(5)) +
      '  phase=' + d.phase.padEnd(9) +
      '  cam x=' + d.cx.toFixed(1) + ' y=' + d.cy.toFixed(1) + ' zoom=' + d.z.toFixed(2) +
      '  introT=' + d.introT.toFixed(2) + '  横幅=' + d.banner.toFixed(2));
  }

  console.log('\nerrors:', errs.length ? errs.slice(0, 4) : '(none)');
  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
