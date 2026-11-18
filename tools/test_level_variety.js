/* 八关建造页的可辨识度（第 96 轮）。
 *
 * ── 这是"肯定性"判据 ──
 *
 * 前几轮守的都是否定性的（别越界、别重叠、别残留）。
 * 而目标里的「商业 2D 游戏水准」还需要肯定性的判断：
 * **八个关卡长得像不像八个地方？**
 *
 * ── 为什么必须排除 UI ──
 *
 * 第一版直接量整个建造页，报出两个"太像"：
 *   1-1 vs 1-4  平均色距 13（阈值 18）
 *   1-2 vs 1-7  签名差 3.5%（阈值 6%）
 * 但肉眼看这两对**明显不同**（1-1 绿草坡 vs 1-4 白冰台；
 * 1-2 浅橙峡谷 vs 1-7 深红岩窟）。
 *
 * 原因是采样区里有大量**八关完全一样**的 UI：顶栏、右上三块面板、
 * 拼装区、托盘、按钮。它们稀释了"不同"的像素。
 * 1-1 vs 1-4 那个 13 更是巧合：深绿森林把均值往下拉、白冰往上拉，刚好抵平。
 *
 * 修法不是放松阈值，而是**换个区域量** —— 用 `test_hud_geometry` 那张
 * UI 矩形表把 UI 遮掉，只量剩下的像素（也就是"关卡本身"）。
 *
 * ── 遮掉 UI 之后又发现两对卡线 ──
 *
 *   1-4 vs 1-8  平均色距 18（阈值 18）
 *   1-2 vs 1-7  签名差 5.8%（阈值 6%）
 *
 * 两对都太薄 —— 换个随机种子就报红，那就成了"有时红有时绿"的判据。
 * 各推了一档配色（都往语义上更对的方向）：
 *
 * · `ice`（1-4）往更冷更白推：rock [150,178,198] → [176,204,218]
 * · `gorge`（1-7）的天空与远山压深两档：[#C8807A] → [#8E5A56]
 *
 * 现在：平均色距最小 **27**，签名差最小 **6.3%**。
 *
 * ── 判据 ──
 *
 *   A 两两平均色距 ≥ 18（和选关缩略图同一条阈值）
 *   B 两两签名差 ≥ 6%
 *   C 没有一对 < 3%（几乎一样）
 *   D 没有两关平均色完全相同
 */
const path = require('path');
const os = require('os');
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
  const PORT = 9700 + Math.floor(Math.random() * 60);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeVar96c-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(900);
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
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  };
  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  const LEVELS = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8'];

  /* 建造页要遮掉的 UI 区（设计坐标）。
   * 遮多了一点不影响结论（剩下的仍是关卡），遮少了会把 UI 算进"关卡长相"。 */
  const UI_MASKS = [
    { x: 0, y: 0, w: 1280, h: 250 },      // 顶栏：信息条 / 进度条 / 目标条 / 页签 / 静音
    { x: 1040, y: 240, w: 240, h: 180 },  // 右上「整车」统计卡
    { x: 60, y: 280, w: 120, h: 240 },    // 左侧圆钮列
    { x: 480, y: 170, w: 320, h: 290 },   // 中间拼装区
    { x: 620, y: 230, w: 120, h: 120 },   // 出发钮
    { x: 420, y: 560, w: 460, h: 160 },   // 底部托盘
    { x: 900, y: 500, w: 260, h: 220 },   // 观察/回中钮
    { x: 0, y: 690, w: 1280, h: 30 },     // 底部提示行
    { x: 20, y: 180, w: 60, h: 70 }       // 提示键
  ];
  const GW = 16, GH = 8;

  const rows = [];
  for (let i = 0; i < LEVELS.length; i++) {
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(${i}); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
      S.paused=false; S.helpOpen=false; S.levelSelect=false;
      S.hintOpen=false; S.shake=0; S.flash=0;
      R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS[${JSON.stringify(SPEC_OF[LEVELS[i]])}]);
      return 1;})()`);
    await sleep(1500);      // 入场推镜 1.2 秒，多等一点
    const stat = JSON.parse(await ev(`(()=>{
      const cv=document.getElementById('cv'), g=cv.getContext('2d');
      const v=window.__view, W=cv.width, H=cv.height;
      const d=g.getImageData(0,0,W,H).data;
      const k=W/v.W;
      const MASKS=${JSON.stringify(UI_MASKS)};
      const masked=(dx,dy)=>!MASKS.some(m=>dx>=m.x&&dx<m.x+m.w&&dy>=m.y&&dy<m.y+m.h);
      let r=0,gg=0,b=0,n=0;
      const acc=[];
      for(let gy=0;gy<${GH};gy++) for(let gx=0;gx<${GW};gx++) acc.push([0,0,0,0]);
      for(let y=0;y<H;y+=2) for(let x=0;x<W;x+=2){
        const dx=(x/k)+v.offX, dy=(y/k)+v.offY;
        if(dy<0||dy>=720) continue;
        if(!masked(dx,dy)) continue;
        const j=(y*W+x)*4;
        r+=d[j]; gg+=d[j+1]; b+=d[j+2]; n++;
        const gx=Math.min(${GW}-1, Math.floor(dx/1280*${GW}));
        const gy2=Math.min(${GH}-1, Math.floor(dy/720*${GH}));
        const a=acc[gy2*${GW}+gx];
        a[0]+=d[j]; a[1]+=d[j+1]; a[2]+=d[j+2]; a[3]++;
      }
      const sig=acc.map(a=>a[3]?[Math.round(a[0]/a[3]),Math.round(a[1]/a[3]),Math.round(a[2]/a[3])]:[0,0,0]);
      return JSON.stringify({ avg:[Math.round(r/n),Math.round(gg/n),Math.round(b/n)],
        n: n, sig: sig });})()`));
    rows.push({ id: LEVELS[i], avg: stat.avg, sig: stat.sig });
  }

  function sigDiff(a, b) {
    let sum = 0, cnt = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i][0] === 0 && a[i][1] === 0 && a[i][2] === 0 &&
          b[i][0] === 0 && b[i][1] === 0 && b[i][2] === 0) continue;
      sum += Math.abs(a[i][0] - b[i][0]) + Math.abs(a[i][1] - b[i][1]) +
        Math.abs(a[i][2] - b[i][2]);
      cnt++;
    }
    return cnt ? sum / (cnt * 765) * 100 : 0;
  }
  const avgDist = (a, b) =>
    Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

  console.log('=== 排除 UI 之后的八关平均色 ===');
  rows.forEach(r => console.log('  ' + r.id + '  rgb(' + r.avg.join(',') + ')'));

  const pairs = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      pairs.push({ a: rows[i].id, b: rows[j].id,
        ad: avgDist(rows[i].avg, rows[j].avg),
        sd: sigDiff(rows[i].sig, rows[j].sig) });
    }
  }
  const wAvg = pairs.slice().sort((x, y) => x.ad - y.ad)[0];
  const wSig = pairs.slice().sort((x, y) => x.sd - y.sd)[0];
  console.log('');
  console.log('平均色最接近：' + wAvg.a + '/' + wAvg.b + '  ' + wAvg.ad);
  console.log('签名最接近：  ' + wSig.a + '/' + wSig.b + '  ' + wSig.sd.toFixed(1) + '%');

  chk('A 八关建造页两两平均色距 ≥ 18（颜色上分得开）',
    wAvg.ad >= 18, '最小 ' + wAvg.ad + '（' + wAvg.a + '/' + wAvg.b + '）');
  chk('B 八关建造页两两签名差 ≥ 6%（构图上分得开）',
    wSig.sd >= 6, '最小 ' + wSig.sd.toFixed(1) + '%（' + wSig.a + '/' + wSig.b + '）');
  {
    const twins = pairs.filter(p => p.sd < 3);
    chk('C 没有两关几乎一模一样（签名差 < 3%）', twins.length === 0,
      twins.length ? twins.map(p => p.a + '/' + p.b).join(' ') :
        '最接近 ' + wSig.sd.toFixed(1) + '%');
  }
  {
    const keys = rows.map(r => r.avg.join(','));
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
    chk('D 没有两关平均色完全相同', dup.length === 0,
      dup.length ? dup.join(' ') : '8 关各不相同');
  }

  console.log('');
  console.log(lines.join('\n'));
  console.log('');
  console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  try { ws.close(); } catch (e) {}
  try { require('./lib/asserts.js').killTree(child); } catch (e) {}
  process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });
