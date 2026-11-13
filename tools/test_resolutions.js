/* 多分辨率：五种横屏画布下，UI 必须完整可见（关键元素都在可视区内）且不出异常。
 *
 * 原来只把 canvas 尺寸打印出来，exit 0 —— 换个宽高比按钮跑到屏幕外也"通过"。
 * 现在按 canvas 的实际情况验证：
 *   1. 设计区 1280×720 必须被完整覆盖（不留黑边）；
 *   2. 关键 UI 锚点（出发钮、暂停钮、零件槽）换算到屏幕后都落在画面内；
 *   3. 每种分辨率下都 0 异常。
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
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeZ-' + Date.now()),
    '--window-size=1600,1000', '--force-device-scale-factor=1', '--no-first-run',
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
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }

  await ev('window.__rap.state.introT=1'); await sleep(250);

  const presets = [
    ['1280x720', 'mobile-16-9'],
    ['1600x900', 'pc-16-9'],
    ['1560x720', 'mobile-19.5-9'],
    ['1280x960', 'mobile-4-3'],
    ['2100x900', 'pc-21-9']
  ];

  for (const [size, name] of presets) {
    const [w, h] = size.split('x').map(Number);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(520);
    const info = JSON.parse(await ev(`(()=>{const c=document.getElementById('cv');const r=c.getBoundingClientRect();
      const v = window.__view || {};
      return JSON.stringify({cw:c.width, ch:c.height, cssW:Math.round(r.width), cssH:Math.round(r.height),
        dpr:+(window.devicePixelRatio||1).toFixed(2),
        VW:v.W, VH:v.H, OFFX:v.offX, OFFY:v.offY, scale:v.scale});})()`));
    await shot('res-' + size);

    A.chk(size + ' 画布不拉伸（宽高比与设备一致）',
      Math.abs(info.cw / info.ch - w / h) < 0.02,
      (info.cw / info.ch).toFixed(3) + ' vs ' + (w / h).toFixed(3));

    // cover 的含义：设计区 1280×720 必须整块落在可视((VW×VH))范围内
    A.chk(size + ' 设计区完整可见（cover 而不是裁切）',
      info.VW >= 1280 - 1 && info.VH >= 720 - 1 && info.OFFX >= -0.5 && info.OFFY >= -0.5,
      '可视 ' + info.VW + 'x' + info.VH + '，偏移 ' + info.OFFX + ',' + info.OFFY);

    // 关键锚点：换算成"设计坐标"，必须都在 0..1280 / 0..720 之内
    const anchors = JSON.parse(await ev(`(() => {
      const s = window.__rap.state, pts = [];
      const add = (n, r) => r && pts.push({ n: n, x: r.x, y: r.y, w: r.w, h: r.h });
      add('launch', window.__rap.btnRect('launch'));
      add('clear', window.__rap.btnRect('clear'));
      add('help', window.__rap.btnRect('help'));
      for (let i = 0; i < window.__rap.TRAY.length; i++) add('tray' + i, window.__rap.trayRect(i));
      const o = window.__rap.buildOrigin(), B = window.__rap.BUILD_PX;
      pts.push({ n: 'grid0', x: o.x, y: o.y, w: B, h: B });
      pts.push({ n: 'gridLast', x: o.x + 7 * B, y: o.y + 5 * B, w: B, h: B });
      return JSON.stringify(pts);
    })()`));
    const bad = anchors.filter(a => a.x < -2 || a.y < -2 || a.x + a.w > 1282 || a.y + a.h > 722);
    A.chk(size + ' 关键 UI 都在设计区内', bad.length === 0,
      bad.length ? bad.map(a => a.n).join(',') : anchors.length + ' 个锚点');

    A.log(size + ' canvas=' + info.cw + 'x' + info.ch + ' 可视设计区 ' +
      info.VW + 'x' + info.VH + ' 偏移 ' + info.OFFX.toFixed(0) + ',' + info.OFFY.toFixed(0));
  }

  // 复位，确认还能回到 1280 排版正常
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(500);
  const back = await ev('window.__rap.btnRect("launch").x');
  A.chk('复位后布局回到标准位置', Math.abs(back - 790) < 3, 'launch.x=' + back);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
