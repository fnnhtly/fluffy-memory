/* 建造页的地形预览条（第 60 轮）。
 *
 * 起因是量出来的一个事实（tools/probe_build_view.js）：
 * 建造镜头只框住起点前后 ±9.52 米，六关的终点旗**全都**在画面之外。
 * 于是玩家在拼装区看不见自己要跑的那段地形，"装轮子还是装气球"只能靠反复发射去试。
 *
 * 这条条子最容易出的三种假绿，这个脚本各配一条判据：
 *
 *  A) 画了，但比例尺不是共用的。按关卡自动归一化的话，1-3（落差 0.70 米）
 *     会被画成一整条山 —— 玩家为一个不存在的地形准备。判据：每一关的
 *     曲线像素高差必须等于 pxPerM × 实测落差，同一份 pxPerM 全部通关。
 *     被否掉的那个方案在同一组数字上会差 8 倍以上（见"量具能失败"）。
 *
 *  B) 画了，但画的是"另一条地形"。判据不看公式，看**这一帧真的交给 lineTo 的坐标**
 *     （state.previewProfile）——它的像素高差必须和从 RAP.makeTerrain 细扫出来的
 *     落差对得上。公式写错、采样用错 level，这一条会红。
 *
 *  C) 画了，但终点旗根本不在条里。判据：条内目标列附近必须有红旗像素，
 *     而同一行往左 100px 处必须一个红点都没有（否则"有红色"可能来自背景）。
 *
 * 另外两条硬约束：行驶期不许画（那时玩家已经在跑真地形），
 * 以及它不许压住任何既有面板（页签名、静音钮、顶部信息条、拼装区、托盘）。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeBP-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl);
  let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      errs.push(m.params.entry.text);
    }
  };
  const send = (m, p) => new Promise((res, rej) => {
    const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} }));
  });
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  };
  async function shot(n) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64'));
  }

  /* ---------- 0. 条子本身的几何 ---------- */
  const R = JSON.parse(await ev(`(()=>{
    const R=window.__rap, s=R.state; s.welcome=0; s.introT=1;
    const r=R.buildPreviewRect();
    return JSON.stringify({rect:r, spanM:R.PREVIEW_SPAN_M,
      mute:R.muteRect(), nLevels:R.levels.length});
  })()`));
  A.log('预览条矩形 ' + JSON.stringify(R.rect) + '，满量程 ' + R.spanM + ' m');
  A.all('预览条在屏幕内且足够宽（要能读出一条地形）', [
    ['x≥0', R.rect.x >= 0],
    ['y≥0', R.rect.y >= 0],
    ['右边界出界', R.rect.x + R.rect.w <= 1280],
    ['下边界出界', R.rect.y + R.rect.h <= 720],
    ['宽度 ≥ 1000', R.rect.w >= 1000],
    ['高度 ≥ 28（否则地形起伏只有几个像素，看不出来）', R.rect.h >= 28],
  ]);
  /* 位置的理由：顶部页签占 y 18..48、静音钮 y 16..46、顶部信息条从 y 90 起。
   * 条子必须落在这两条之间 —— 这是它能塞进建造页的唯一空档。 */
  A.all('预览条落在页签行与顶部信息条之间的空档里（不与它们相接）', [
    ['压到页签行（y<48）', R.rect.y >= 48],
    ['压到静音钮所在的拐角（y<46）', R.rect.y >= 46],
    ['压到顶部信息条（y<90 起）', R.rect.y + R.rect.h <= 90],
  ]);

  /* ---------- 1. 逐关：共用比例尺 + 画出来的线和真地形对得上 ---------- */
  /* 像素扫描必须**在切到这关的这一轮里**做。第一版把它挪到循环外面统一扫，
   * 于是六次扫描读的都是最后一关（1-6）的画面：1-6 的终点列有旗（31 个红点），
   * 其余五关在那个 x 上什么都没有（0 个）。量具本身没错，是时序错了 ——
   * 记在这里，因为"扫描的是哪一帧"是像素判据最常见的一类假红/假绿。 */
  /* 红旗红#E2574C = (226,87,76)。阈值收紧到 r>190：第一版用 r>150 时，
   * 木箱金色 (#D9A441) 在岩体上的抗锯齿边缘 (152,108,37) 也被算成了"红点"，
   * 于是"终点列有旗"和"往左 100px 没有红"这两条都可能被箱子的边骗过。
   * 条里只有红旗是这种红（天空青、岩体灰、起点绿、木箱金），所以
   * 判据可以直接升级成"整条里所有这种红都必须落在终点列的 ±10px 内" ——
   * 比"目标处有几个红点"更难被糊过去。 */
  const redsInBar = (lx, ly, w, h) => ev(`(()=>{
    const cv=document.querySelector('canvas');
    const dpr=cv.width/1280;
    const g=cv.getContext('2d',{willReadFrequently:true});
    const xs=[];
    for(let x=${lx};x<=${lx + w};x+=1){
      for(let y=${ly};y<=${ly + h};y+=1){
        const d=g.getImageData(Math.round(x*dpr),Math.round(y*dpr),1,1).data;
        if(d[0]>190 && d[1]<105 && d[2]<105) { xs.push(x); break; }
      }
    }
    return JSON.stringify(xs);
  })()`).then(s => JSON.parse(s));

  const rows = [];
  for (let i = 0; i < 6; i++) {
    await ev(`(()=>{const R=window.__rap,s=R.state; R.startLevel(${i}); s.welcome=0;
      s.introT=1; return 1;})()`);
    await sleep(320);      // 等一帧真的画过（previewProfile 每帧重置）
    const d = JSON.parse(await ev(`(()=>{
      const R=window.__rap, s=R.state, lv=R.level();
      const G=R.buildPreviewGeom(lv);
      const ter=R.RAP.makeTerrain(lv);
      /* 细扫：0.05 列步长（比绘制用的 2px 采样细得多），用来核对
       * "画出来的高差"而不是另算同一个公式 */
      let mn=1e9, mx=-1e9;
      for(let c=G.c0;c<=G.c1;c+=0.05){
        const h=ter.surfaceY(c); if(h<mn)mn=h; if(h>mx)mx=h;
      }
      const prof=s.previewProfile||[];
      let pMin=1e9, pMax=-1e9;
      for(let k=1;k<prof.length;k+=2){ if(prof[k]<pMin)pMin=prof[k]; if(prof[k]>pMax)pMax=prof[k]; }
      let boxMin=99, boxMax=-99;
      (lv.boxes||[]).forEach(b=>{ boxMin=Math.min(boxMin,b.col); boxMax=Math.max(boxMax,b.col); });
      return JSON.stringify({levelId:lv.levelId, colGap:lv.goal.col-lv.start.col,
        startCol:lv.start.col, goalCol:lv.goal.col, boxMin:boxMin, boxMax:boxMax,
        cols:lv.grid.cols, c0:G.c0, c1:G.c1, pxPerM:G.pxPerM,
        yTop:G.yTop, yBot:G.yBot, innerH:G.innerH,
        xStart:G.xOf(lv.start.col), xGoal:G.xOf(lv.goal.col), xRight:G.R.x+G.R.w,
        flagFrom:Math.max(G.yTop+2, G.yOf(ter.surfaceY(lv.goal.col+0.5))-15),
        reliefM: mx-mn, reliefPx: pMax-pMin, profN: prof.length/2,
        pMinY: pMin, pMaxY: pMax,
        drawN: s.previewDrawN});
    })()`));
    /* 这一帧就是这关的画面 → 现在扫像素 */
    const y0 = Math.floor(R.rect.y), y1 = Math.ceil(R.rect.y + R.rect.h);
    d.redXs = await redsInBar(R.rect.x, y0, R.rect.w, y1 - y0);
    d.frac = (d.xGoal - R.rect.x) / R.rect.w;
    rows.push(d);
    A.log(d.levelId + '  窗口列 ' + d.c0 + '..' + d.c1 + '（' + d.cols + ' 列）  px/m ' +
      d.pxPerM.toFixed(3) + '  实测落差 ' + d.reliefM.toFixed(2) + ' m → 应为 ' +
      (d.reliefM * d.pxPerM).toFixed(1) + ' px，曲线实际 ' + d.reliefPx.toFixed(1) +
      ' px  （采样 ' + d.profN + ' 点，终点列在 ' + (d.frac * 100).toFixed(1) + '%，' +
      '红旗像素列 ' + d.redXs.length + ' 个）');
  }

  A.chk('每一关这一帧都真的画了预览条（不是只有几何函数存在）',
    rows.every(r => r.drawN === 1), rows.map(r => r.levelId + ':' + r.drawN).join(' '));
  A.chk('每一关都采到了非空的地形曲线',
    rows.every(r => r.profN > 10), rows.map(r => r.profN).join(' '));

  /* 共用比例尺：同一份 pxPerM 六关全过 */
  A.chk('六关共用同一个竖向比例尺（pxPerM 完全一致）',
    rows.every(r => Math.abs(r.pxPerM - rows[0].pxPerM) < 1e-9),
    rows.map(r => r.pxPerM.toFixed(4)).join(' '));
  rows.forEach(r => {
    A.near(r.levelId + ' 曲线像素高差 = pxPerM × 实测落差（画的是真地形，不是另一条）',
      r.reliefPx, r.reliefM * r.pxPerM, 2.2, 'px');
  });
  A.chk('六关的起伏高差按共用比例尺单调对应（1-3 最平、1-6 最陡，而不是每关都顶满条高）', [
    ['1-3 明显比 1-6 平', rows[2].reliefPx < rows[5].reliefPx / 3],
    ['1-3 只有几个像素（没有被自动归一化成一整条山）', rows[2].reliefPx <= 8],
    ['1-6 撑满条内高（≥ 90% 内高）', rows[5].reliefPx >= rows[5].innerH * 0.90],
  ].every(p => p[1]));

  /* 曲线必须留在条内：没有采样点跑到内框之外（否则玩家看到线被裁掉一段） */
  rows.forEach(r => {
    A.chk(r.levelId + ' 地形曲线全部落在条内（不被上下裁掉）',
      r.pMinY >= r.yTop - 0.6 && r.pMaxY <= r.yBot + 0.6,
      'y ∈ [' + r.pMinY.toFixed(1) + ',' + r.pMaxY.toFixed(1) + '] 内框 [' +
      r.yTop.toFixed(1) + ',' + r.yBot.toFixed(1) + ']');
  });

  /* ---------- 2. 窗口：起点列 → 终点列，且必须圈进木箱列 ---------- */
  rows.forEach(r => {
    A.all(r.levelId + ' 视野窗口从起点列开始、把终点列和木箱列都圈进来', [
      ['窗口左边界不是起点列', r.c0 === r.startCol],
      ['窗口右边界没盖住终点列', r.c1 >= r.goalCol],
      ['木箱列在窗口外（那是第二颗星要找的东西）', r.boxMax < r.c0 || r.boxMax <= r.c1],
      ['窗口越过关卡最后一列', r.c1 <= r.cols - 1],
    ]);
  });
  /* 窗口不该在终点之后浪费太多宽度 —— 那会把整条地形压扁、把终点旗缩成一个点。
   * 判据直接量"终点到条右缘占了多少"：≤ 25%。
   * （1-6 天然偏宽：它的木箱在 18 列、终点在 15 列，为了圈住箱子必须多放 4 列，
   *  所以这里不能拿"终点必须落在 80% 之后"当条件 —— 那条对 1-6 是 77.4%，
   *  会把一个**正确的设计**判成红。） */
  rows.forEach(r => {
    const waste = (R.rect.x + R.rect.w - r.xGoal) / R.rect.w;
    A.within(r.levelId + ' 终点之后的空白不超过条宽的 25%（条没有被压扁）',
      waste, 0, 0.25, '条宽');
  });

  /* ---------- 3. 像素复核：整条里只有终点列那一处是红旗红 ---------- */
  /* 这条比"目标处有几个红点"更硬：它同时否掉了"旗没画"和"整条泛红"两种假绿，
   * 也不依赖另开一个对照窗口去猜背景色。 */
  rows.forEach(r => {
    const xs = r.redXs;
    const ok = xs.length >= 3 && xs.every(x => x >= r.xGoal - 2 && x <= r.xGoal + 10);
    A.chk(r.levelId + ' 条内所有红旗红的像素都落在终点列（旗真的画在那里）', ok,
      '红像素列 x=' + xs.join(',') + '  终点列 x≈' + r.xGoal.toFixed(1));
  });

  /* 让上面那条像素判据自证能失败：同一帧里先用深色盖住旗，再立刻读数。
   * 必须在**同一次 evaluate** 里做 —— 跨两次调用的话 rAF 会先把它重绘回去。
   * （hud_overlap 的金圈判据也是同一种写法，原因一样。） */
  {
    const r6 = rows[5];
    const covered = await ev(`(()=>{
      const cv=document.querySelector('canvas'), dpr=cv.width/1280;
      const g=cv.getContext('2d',{willReadFrequently:true});
      /* fillRect 走的是**上下文变换**（设计坐标），getImageData 走的是**设备像素**。
       * 第一版这两套坐标混着用，盖的那一块根本没盖到旗上（读数还是 8 列）。
       * 盖之前先把变换重置成 1:1，两套坐标就都是设备像素了。 */
      g.save();
      g.setTransform(1,0,0,1,0,0);
      g.fillStyle='rgba(10,18,24,1)';
      g.fillRect(Math.round((${r6.xGoal}-6)*dpr), Math.round(${R.rect.y}*dpr),
                 Math.round(24*dpr), Math.round(${R.rect.h + 4}*dpr));
      g.restore();
      const xs=[];
      for(let x=${R.rect.x};x<=${R.rect.x + R.rect.w};x+=1){
        for(let y=${Math.floor(R.rect.y)};y<=${Math.ceil(R.rect.y + R.rect.h)};y+=1){
          const d=g.getImageData(Math.round(x*dpr),Math.round(y*dpr),1,1).data;
          if(d[0]>190 && d[1]<105 && d[2]<105) { xs.push(x); break; }
        }
      }
      return xs.length;
    })()`);
    A.chk('像素度量尺能失败：盖住终点旗后条内再也扫不到红旗红',
      covered === 0, covered + ' 列（盖住前 ' + r6.redXs.length + ' 列）');
    await sleep(150);   // 下一帧 rAF 会重绘回去，无需手工清理
  }

  /* ---------- 4. 行驶期不许画 ---------- */
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch(); s.runBanner=0; return 1;})()`);
  await sleep(500);
  const run = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
    return JSON.stringify({phase:s.phase, drawN:s.previewDrawN, prof:s.previewProfile});})()`));
  A.chk('行驶期不画预览条（previewDrawN 归零）', run.drawN === 0, 'drawN=' + run.drawN);
  A.chk('行驶期不残留上一帧的曲线数据', run.prof === null,
    'profile=' + (run.prof === null ? 'null' : 'len ' + (run.prof || []).length));

  /* ---------- 5. 满量程护栏：将来加关时先红，而不是靠"看起来还行" ---------- */
  const spanM = R.spanM;
  A.chk('六关最大落差 ≤ 满量程（加关时这条会先红，不会把崖顶截平）',
    rows.every(r => r.reliefM <= spanM + 1e-9),
    '最大 ' + Math.max.apply(null, rows.map(r => r.reliefM)).toFixed(2) + ' m vs ' + spanM + ' m');

  /* ---------- 6. 量具能失败：被否掉的那个方案在这组数字上必须差得多 ---------- */
  {
    const flat = rows[2];    // 1-3：落差 0.70 米，最平的一关
    const auto = flat.innerH;                     // 按关卡自动归一化 → 顶满条内高
    const shared = flat.reliefM * flat.pxPerM;    // 共用比例尺 → 就几个像素
    A.log('同一个 1-3：共用比例尺 ' + shared.toFixed(1) + ' px，' +
      '按关卡自动归一化 ' + auto.toFixed(1) + ' px（差 ' + (auto / shared).toFixed(1) + ' 倍）');
    A.chk('量具能失败：自动归一化会让 1-3 的像素高差超出上面 ±2.2px 的容差',
      Math.abs(auto - shared) > 2.2,
      '差 ' + Math.abs(auto - shared).toFixed(1) + ' px');
  }

  await shot('build-preview');
  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
