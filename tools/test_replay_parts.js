/* 失败回放：两个必须同时成立的判据。
 *
 *   1. 回放画的是**玩家真正造的那辆车**（不是"三个方块 + 两个圆"的示意图）；
 *   2. 回放**真的看得见** —— 结算卡不能盖在它上面。
 *
 * 第 2 条是量出来的：`drawResult` 原来和回放同时画，卡片 760×424 正好盖住屏幕中央
 * （x 260..1020, y 150..574），而回放的车就画在那儿。数像素的结果是
 * 「卡外」的气球粉只剩 293 个、摘掉气球只掉 17 个，而卡片不画时是 5283 个、
 * 摘掉气球掉 3320 个 —— **回放这一段玩家一个像素都没看见**。
 *
 * 判据为什么是"差分"而不是"绝对值"：
 *   背景（黄昏天、暖雾）本身就有几百个偏粉像素，"粉色 ≥ 30"这种绝对判据
 *   几乎必然成立，它什么都不证明。只有"摘掉气球前后差了多少"才是证据。
 * 颜色阈值为什么是蓝>绿：
 *   气球 #e0708f / 高光 #f6b6c8 的 b−g 是 18~31；而橙红（进度条 #e8816a、
 *   木框 #c99354）、暖雾（#E8A870）都是绿高于蓝。结算页会再压一层
 *   rgba(8,14,10,.58)，差值等比缩到 6~13，所以取 +5。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeRP-' + Date.now()),
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
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }

  /* 造一辆"有气球"但注定失败的车：1 木框 + 1 木轮 + 猪 + 两组气球。
   * 单轮车在 1-5 的坡上必翻 → stuck。气球让车头更轻，翻得更快。 */
  const ready = JSON.parse(await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP;
    window.__rap.startLevel(4);
    s.welcome=0; s.introT=1; s.phase='build';
    s.build.cells={};
    s.build.cells['4,2']={part:'wood_frame',dir:0};
    s.build.cells['4,2'].inner='pig';
    s.build.cells['5,2']={part:'wood_wheel',dir:0};
    s.build.cells['3,1']={part:'balloon',dir:0,n:2};
    s.build.cells['3,3']={part:'balloon',dir:0,n:2};
    s.build.order=['4,2','3,1','3,3','5,2'];
    const chk=R.canLaunch(s.build);
    if(!chk.ok) return JSON.stringify({ok:false,reason:chk.reason});
    window.__rap.launch();
    return JSON.stringify({ok:true, parts:s.run.car.parts.map(p=>p.part+':'+(p.n||1))});})()`));
  A.chk('带气球的脆弱车能发射', ready.ok, JSON.stringify(ready));
  await sleep(250);

  // 造一段失败回放，并把时间**冻结**在回放中段（这样两次采样落在同一帧）
  await ev(`(()=>{const s=window.__rap.state;
    s.run.result='fail'; s.run.failReason='stuck'; s.run.phase='resolved';
    s.phase='resolved';
    s.run.replay=[];
    for(let i=0;i<60;i++) s.run.replay.push({t:i/20,x:3+i*0.12,y:6+Math.sin(i*0.3)*0.4,a:-0.2});
    s.__frozenT = 1.0;
    Object.defineProperty(s,'replayT',{configurable:true,get(){return this.__frozenT;},set(v){}});
    s.resultT=0;
    return 1;})()`);
  await sleep(500);

  /* 采样器：整幅画面数"气球粉"。理由是气球可能被画在任何位置，
   * 数全屏就不用猜坐标 —— 而"摘掉气球后掉多少"这个差分本身
   * 就证明了"那些像素来自车上的气球"。 */
  const pinkCount = () => ev(`(()=>{const cv=document.getElementById('cv'),g=cv.getContext('2d');
    const d=g.getImageData(0,0,cv.width,cv.height).data;
    let pink=0;
    for(let i=0;i<d.length;i+=4){
      const r=d[i],gg=d[i+1],b=d[i+2];
      if(r>85 && b>gg+5 && b>55) pink++;
    }
    return pink;})()`);

  // ---------- 1. 回放可见（卡片还没来）----------
  const duringReplay = await ev('window.__rap.state.replayT');
  A.chk('采样时刻落在回放期内（< 2.8 s，结算卡还没滑入）', duringReplay < 2.8,
    'replayT=' + duringReplay);
  await shot('rp-01-replay-visible');
  const pinkWith = await pinkCount();
  await ev(`(()=>{const s=window.__rap.state;
    s.__saved=s.run.car.parts.slice();
    s.run.car.parts=s.run.car.parts.filter(p=>!p.def.liftMass); return 1;})()`);
  await sleep(360);
  const pinkWithout = await pinkCount();
  A.log(`回放期内：有气球 ${pinkWith} 个粉色像素 / 摘掉气球 ${pinkWithout} 个`);
  A.chk('回放里那辆车的气球真的被画出来了（摘掉后粉色大幅减少）',
    pinkWith - pinkWithout >= 400, `差 ${pinkWith - pinkWithout} 个像素`);
  await ev(`(()=>{const s=window.__rap.state;
    s.run.car.parts=s.__saved; return 1;})()`);
  await sleep(300);

  // ---------- 2. 回放里画的是真零件（木框的棕色是主体）----------
  const brown = await ev(`(()=>{const cv=document.getElementById('cv'),g=cv.getContext('2d');
    const d=g.getImageData(0,0,cv.width,cv.height).data;
    let n=0;
    for(let i=0;i<d.length;i+=4){
      const r=d[i],gg=d[i+1],b=d[i+2];
      if(r>90 && r<215 && gg>55 && gg<160 && b<110 && r-b>40) n++;
    }
    return n;})()`);
  A.chk('回放里木框的棕色是主体（画的是真零件，不是纯色方块）', brown >= 500, brown + ' 个像素');

  // ---------- 3. 回放期间点击 = 跳过回放（不是"点了没反应"，也不是"直接重开"） ----------
  /* 注意：上面为了定格采样，把 replayT 改成了**只读 getter + 空 setter**。
   * 跳过回放这件事本身要写 replayT —— 所以这里必须先把它换回可写，
   * 否则被测代码怎么写都写不进去，测出来永远是"没跳过"。
   * （第一版就是这么红的：replayT=1 纹丝不动。**测量装置污染了被测行为。**） */
  await ev(`(()=>{const s=window.__rap.state;
    delete s.replayT;
    s.replayT = 1.0;
    return typeof Object.getOwnPropertyDescriptor(s,'replayT');})()`);
  await sleep(300);
  const phaseBeforeSkip = await ev('window.__rap.state.phase');
  // 点在屏幕正中：那里既不是重开也不是下一关，回放期间应该是"跳过"
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 360, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 360, button: 'left', clickCount: 1 });
  await sleep(350);
  const afterSkip = await ev('window.__rap.state.replayT');
  /* 判据不能写 `≈ 2.8` —— 跳过后时间照常往前走（等 350ms 就变 3.15 了）。
   * 真正要证明的是"**跳了**"：不点时 1.0 + 0.35 = 1.35，
   * 点了就会越过 2.8 这条线。所以判 > 2.5 既容得下继续推进，也排除得了"没跳"。 */
  A.chk('回放期间点一下 = 跳过回放（replayT 越过 2.8）',
    afterSkip > 2.5, 'replayT=' + afterSkip);
  A.chk('跳过回放不会把玩家直接踢回建造页',
    (await ev('window.__rap.state.phase')) === phaseBeforeSkip, 'phase=' + phaseBeforeSkip);
  // 跳过后再点一次，才该落到真按钮上
  await sleep(500);
  A.chk('跳过之后结算卡确实出现了', (await ev('window.__rap.state.resultBtnY')) > 0);

  // ---------- 4. 回放播完之后，结算卡才出现 ----------
  await ev(`(()=>{window.__rap.state.replayT = 3.4; return 1;})()`);
  await sleep(600);
  const afterReplay = await ev('window.__rap.state.resultBtnY');
  A.chk('回放播完后结算卡仍在（按钮位置有效）', afterReplay > 0, 'resultBtnY=' + afterReplay);
  const pinkAfterCard = await pinkCount();
  A.chk('结算卡出现后把回放盖住了（粉色明显少于回放期）',
    pinkAfterCard < pinkWith * 0.75, `${pinkWith} → ${pinkAfterCard}`);
  await shot('rp-02-card-after-replay');

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
