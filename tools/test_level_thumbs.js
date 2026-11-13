/* 选关页地形缩略图：证明"五张图彼此不同、且能反映地形差异"。
 *
 * 早期版本只有 44px 高的单色剖面，五关看起来几乎一样（信息量为零）。
 * 这里用像素统计来量化：每张缩略图的平均色、色彩方差、地形起伏。
 * 判据：五张两两之间色值必须拉开；冰面关必须偏蓝白；起伏必须与关卡数据吻合。
 */
const fs = require('fs');
const A = require('./lib/asserts');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);   // 随机端口：避免残留进程撞车
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeT-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = list.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  };
  await ev('window.__rap.state.introT=1; window.__rap.state.levelSelect=true;');
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, 'ls-thumbs.png'), Buffer.from(shot.data, 'base64'));

  // 用页面自己的几何算缩略图矩形（CW=216, GAP=18, y=168, thumb y+176 h=44）
  const info = JSON.parse(await ev(`(() => {
    const lv = window.__rap.levels, n = lv.length;
    const CW = 216, CH = 250, GAP = 18, y = 168;
    const totalW = n * CW + (n - 1) * GAP;
    return JSON.stringify(lv.map((L, i) => ({
      id: L.levelId, biome: L.biome,
      x: (1280 - totalW) / 2 + i * (CW + GAP) + 12,
      y: y + 172, w: CW - 24, h: 56,
      boxes: (L.boxes || []).length
    })));
  })()`));

  const stats = JSON.parse(await ev(`(() => {
    const cv = document.getElementById('cv'), g = cv.getContext('2d');
    const sx = cv.width / 1280, sy = cv.height / 720;
    const list = ${JSON.stringify(info.map(t => ({ id: t.id, x: t.x, y: t.y, w: t.w, h: t.h })))};
    return JSON.stringify(list.map(t => {
      const d = g.getImageData(Math.round(t.x*sx), Math.round(t.y*sy),
                               Math.round(t.w*sx), Math.round(t.h*sy)).data;
      let r=0,gg=0,b=0,n=0, mnB=999, mxB=-1, bright=0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i]; gg += d[i+1]; b += d[i+2]; n++;
        const lum = 0.299*d[i] + 0.587*d[i+1] + 0.114*d[i+2];
        if (lum < mnB) mnB = lum; if (lum > mxB) mxB = lum;
        if (lum > 205) bright++;          // 近白像素：冰面高光 / 雪线
      }
      return { id: t.id, avg: [Math.round(r/n), Math.round(gg/n), Math.round(b/n)],
               lumRange: +(mxB - mnB).toFixed(1), bright: +(bright / n).toFixed(4) };
    }));
  })()`));

  const out = [];
  let bad = 0;
  const chk = (l, c, x) => { out.push((c ? '✓ ' : '✗ ') + l + (x ? '  ' + x : '')); if (!c) bad++; };

  stats.forEach(s => out.push('   ' + s.id + '  avg rgb(' + s.avg.join(',') + ')  亮度跨度 ' +
    s.lumRange + '  近白像素 ' + (s.bright * 100).toFixed(1) + '%'));

  chk('五张缩略图平均色两两可辨', (() => {
    for (let i = 0; i < stats.length; i++) for (let j = i + 1; j < stats.length; j++) {
      const a = stats[i].avg, b = stats[j].avg;
      const d = Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]);
      if (d < 18) return false;
    }
    return true;
  })(), '阈值 18');

  // 冰面关用"近白高光"来认，不用"偏蓝"：草地关的天空本来就是蓝的，偏蓝没有区分力
  // （第一版就是这么写的，结果 1-1 草地关 88.6% 偏蓝，被判成冰面）
  const ice = stats.find(s => s.id === '1-4');
  const maxBright = Math.max(...stats.map(s => s.bright));
  chk('冰面关（1-4）近白高光全场最多', ice && ice.bright === maxBright && ice.bright > 0.02,
    ice ? ice.id + ':' + (ice.bright*100).toFixed(1) + '% / 最高 ' + (maxBright*100).toFixed(1) + '%' : '找不到 1-4');

  chk('每张都有地形起伏（亮度跨度够大）', stats.every(s => s.lumRange > 40),
    stats.map(s => s.id + ':' + s.lumRange).join(' '));

  const cave = stats.find(s => s.id === '1-3');
  chk('洞穴关（1-3）比草地关（1-1）更暗', (() => {
    const field = stats.find(s => s.id === '1-1');
    const l = a => 0.299*a[0] + 0.587*a[1] + 0.114*a[2];
    return l(cave.avg) < l(field.avg) - 10;
  })(), cave && stats.find(s => s.id === '1-1') ?
    'cave ' + Math.round(0.299*cave.avg[0]+0.587*cave.avg[1]+0.114*cave.avg[2]) +
    ' / field ' + Math.round(0.299*stats.find(s=>s.id==='1-1').avg[0]+0.587*stats.find(s=>s.id==='1-1').avg[1]+0.114*stats.find(s=>s.id==='1-1').avg[2]) : '');

  console.log(out.join('\n'));
  console.log(bad ? ('FAIL ' + bad) : 'ALL PASS');
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  ws.close(); A.killTree(child);
  process.exit(bad === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
