/* 静音开关（第 59 轮）。
 *
 * 起点是一个很朴素的事实：这个游戏**一个静音/音量控件都没有**。
 * 合成音效很密（放零件、发射、滚动嗡嗡声、撞击、裂框、碎框、星星、欢呼），
 * 玩家唯一的办法是去拧系统音量 —— 而这会顺带把别的声音一起关掉。
 *
 * 但"能静音"这件事在自动化里很难验：无头环境里 AudioContext 永远 suspended、
 * `currentTime` 永远是 0、`setTargetAtTime` 永远到不了目标值
 * （tools/probe_audio_env.js 量过）。于是"读一下 master 增益是不是 0"
 * 会变成一个**永远为真**的空断言 —— 和本项目踩过三次的"读一个没人写的字段"同型。
 * （另外 `AudioContext.resume()` 返回的 promise 在无头里**永远不 settle**，
 * 所以这条路径上连 `await` 都不能用：那是 probe_audio_resume.js 挂死的原因。）
 *
 * 所以判据改成**数真的建了几个发声节点**。`SFX.stats()` 同步可数：
 * 静音时 `tone()` / `noise()` / `rollStart()` 都在建节点之前就 return，
 * 计数必须停在 0；取消静音后同样的动作必须立刻让它涨。
 * 这条能真的变红 —— 见最后的"量具能失败"。
 *
 * 另外三件事一起验，因为它们是同一个开关的其它入口：
 *   · 右上角那颗钮在**欢迎页 / 暂停卡 / 行驶中**都点得动（它排在最前面）；
 *   · 键盘 M 也能切（键盘玩家够不到右上角）；
 *   · 关掉页面再进，静音状态还在（localStorage），否则每局都要重按一次。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeMu-' + Date.now()),
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
    }
  };
  const send = (m, p) => new Promise((res, rej) => {
    const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', {
    expression: "localStorage.setItem('rap-welcomed-v1','1'); localStorage.removeItem('rap-muted-v1');",
  });
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
  const muted = () => ev('window.__rap.sfxStats().muted');
  const stats = () => ev('window.__rap.sfxStats()');
  const reset = () => ev('window.__rap.sfxResetStats()');

  /* 一次"一定会响"的动作：标准解 + 发射。
   * 走的是玩家同一条路径（`launch()` 里 `SFX.launch()` 先 noise 后 tone），
   * 而且不碰静音逻辑本身 —— 用它当"有没有声音"的探针，比放零件更稳
   * （放零件要经过 UI 的落子流程，`RAP.tryPlace` 是纯引擎、不发声）。 */
  const audible = async () => {
    await ev(`(()=>{const s=window.__rap.state, R=window.__rap.RAP, lv=window.__rap.levels[0];
      window.__rap.startLevel(0); s.welcome=0; s.introT=1; s.runBanner=0;
      R.applySpec(lv, s.build, R.SPECS['1-1']);
      window.__rap.launch();
      return true;})()`);
    await sleep(500);   // 让 frameBody 里的 rollStart（持续振荡器）有机会建
  };

  /* ---------- A. 默认是"有声"，并且这个计数真的会走 ---------- */
  {
    const m0 = await muted();
    A.chk('默认不是静音（新玩家一进来就有声音）', m0 === false, 'muted=' + m0);
    await reset();
    await audible();
    const s1 = await stats();
    A.log('有声时发射一局并跑 0.5 秒：' + JSON.stringify(s1));
    A.chk('有声时真的建了发声节点（量具不是恒 0）',
      s1.tones >= 1 && s1.noises >= 1 && s1.osc >= 1, JSON.stringify(s1));
  }

  /* ---------- B. 鼠标点右上角那颗钮 ---------- */
  const m = await ev('window.__rap.muteRect()');
  const cvRect = await ev(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();
    return {left:r.left, top:r.top, width:r.width, height:r.height};})()`);
  const clickDesign = async (dx, dy) => {
    const cx = cvRect.left + dx * cvRect.width / 1280;
    const cy = cvRect.top + dy * cvRect.height / 720;
    await ev(`(()=>{const cv=document.querySelector('canvas');
      const x=${cx}, y=${cy};
      cv.dispatchEvent(new MouseEvent('mousedown',{clientX:x,clientY:y,button:0,bubbles:true}));
      cv.dispatchEvent(new MouseEvent('mouseup',{clientX:x,clientY:y,button:0,bubbles:true}));
      return 1;})()`);
  };
  const cx = m.x + m.w / 2, cy = m.y + m.h / 2;

  {
    await ev(`(()=>{const s=window.__rap.state; s.welcome=0; s.helpOpen=0;
      s.phase='build'; s.run=null; s.paused=false; return 1;})()`);
    await sleep(150);
    await clickDesign(cx, cy); await sleep(150);
    const after1 = await muted();
    A.log('点右上角钮（建造页）：muted → ' + after1);
    A.chk('点右上角的钮能静音', after1 === true, 'muted=' + after1);

    /* 静音之后，同样的动作必须一个节点都不建 */
    await reset();
    await audible();
    const s2 = await stats();
    A.log('静音时发射一局并跑 0.5 秒：' + JSON.stringify(s2));
    A.chk('静音时一个发声节点都不建（不是"建了再把音量拧到 0"）',
      s2.osc === 0 && s2.tones === 0 && s2.noises === 0, JSON.stringify(s2));

    /* 取消静音后声音立刻回来 */
    await ev('(()=>{const s=window.__rap.state; s.phase="build"; s.run=null; s.paused=false; return 1;})()');
    await sleep(100);
    await clickDesign(cx, cy); await sleep(150);
    const back = await muted();
    A.chk('再点一次就取消静音', back === false, 'muted=' + back);
    await reset();
    await audible();
    const s3 = await stats();
    A.log('取消静音后发射一局：' + JSON.stringify(s3));
    A.chk('取消静音后声音立刻回来（同一个动作又开始建节点）',
      s3.tones >= 1 && s3.noises >= 1, JSON.stringify(s3));
  }

  /* B4 欢迎页上也点得动（那颗角在最前面，不能被引导层吞掉） */
  {
    await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null;
      s.welcome=1; s.helpOpen=0; s.paused=false; return 1;})()`);
    await sleep(300);
    await shot('mu-01-welcome');
    await clickDesign(cx, cy); await sleep(180);
    const ww = await ev('(()=>({muted:window.__rap.sfxStats().muted, welcome:window.__rap.state.welcome}))()');
    A.log('欢迎页上点钮：' + JSON.stringify(ww));
    A.chk('欢迎引导页上点静音钮也生效（不被引导层吞掉）', ww.muted === true, JSON.stringify(ww));
    A.chk('点静音钮不会顺手把引导翻页', ww.welcome === 1, 'welcome=' + ww.welcome);
  }

  /* B5 暂停卡上也点得动 */
  {
    await ev(`(()=>{const s=window.__rap.state; s.welcome=0; s.helpOpen=0;
      window.__rap.startLevel(0); s.introT=1;
      window.__rap.RAP.applySpec(window.__rap.levels[0], s.build, window.__rap.RAP.SPECS['1-1']);
      window.__rap.launch(); s.paused=true; s.autoPaused=false; return 1;})()`);
    await sleep(350);
    await shot('mu-02-paused');
    await clickDesign(cx, cy); await sleep(180);
    const pp = await ev('(()=>({muted:window.__rap.sfxStats().muted, paused:window.__rap.state.paused}))()');
    A.log('暂停卡上点钮：' + JSON.stringify(pp));
    A.chk('暂停卡上点静音钮也生效', pp.muted === false, JSON.stringify(pp));
    A.chk('点静音钮不会把暂停卡关掉（它是开关，不是"点哪儿都继续"）',
      pp.paused === true, 'paused=' + pp.paused);
    await ev('(()=>{window.__rap.state.paused=false; window.__rap.state.phase="build"; window.__rap.state.run=null; return 1;})()');
  }

  /* ---------- C. 键盘 M ---------- */
  {
    const key = (type, c, k, vk) => send('Input.dispatchKeyEvent', {
      type, code: c, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await key('rawKeyDown', 'KeyM', 'm', 77);
    await key('keyUp', 'KeyM', 'm', 77);
    await sleep(180);
    const km = await muted();
    A.chk('键盘 M 也能切静音（键盘玩家够不到右上角）', km === true, 'muted=' + km);

    /* 量具自证：掀掉静音后再做同一个动作，计数必须从 0 变正。
     * 没有这一条，"静音时 osc === 0"也可能只是这个计数器坏了。 */
    await ev('window.__rap.toggleMute()');
    await sleep(80);
    const midState = await muted();
    await reset();
    await audible();
    const s4 = await stats();
    A.chk('量具能失败：掀掉静音后同一个动作的节点计数从 0 变正',
      s4.muted === false && s4.tones >= 1, JSON.stringify(s4));
    void midState;
    await ev('(()=>{const s=window.__rap.state; s.phase="build"; s.run=null; return 1;})()');
    await ev('window.__rap.toggleMute()');
    const mFin = await muted();
    A.chk('开关是二态（切两次回到静音）', mFin === true, 'muted=' + mFin);
  }

  /* ---------- D. 关掉页面再进来，静音还在 ---------- */
  {
    const before = await muted();
    await send('Page.navigate', { url: PAGE }); await sleep(1400);
    const after = await ev('window.__rap.sfxStats().muted');
    A.log('重新加载：muted ' + before + ' → ' + after);
    A.chk('重新加载页面后静音状态还在（localStorage）', after === true, 'muted=' + after);
    await reset();
    await audible();
    const s5 = await stats();
    A.chk('恢复静音后仍然一个节点都不建', s5.osc === 0 && s5.tones === 0, JSON.stringify(s5));
  }

  /* ---------- E. 那颗钮不许压住别的东西 ---------- */
  {
    const overlap = (a, b) => {
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      return (w > 0 && h > 0) ? +(w * h).toFixed(1) : 0;
    };
    const others = await ev(`(()=>{const R=window.__rap, s=R.state, out=[];
      for(let i=0;i<R.levels.length;i++) out.push({name:'tab'+i, x:24+i*86, y:18, w:80, h:30});
      const t=R.runTimeRects(); out.push(Object.assign({name:'timer'},t.timer));
      out.push(Object.assign({name:'box'},t.box));
      ['help','pause','restartRun','brake','interact'].forEach(n=>{
        const r=R.btnRect(n); if(r) out.push(Object.assign({name:n},r));
      });
      return JSON.stringify(out);})()`).then(JSON.parse);
    const bad = [];
    others.forEach(o => { const a = overlap(m, o); if (a > 0) bad.push(o.name + ' 重叠 ' + a + ' px²'); });
    A.log('静音钮 ' + JSON.stringify(m) + ' 与 ' + others.length + ' 个固定矩形：' +
      (bad.length ? bad.join('；') : '无重叠'));
    A.chk('静音钮不和页签/计时/帮助/暂停/重来/刹车/交互钮重叠',
      bad.length === 0, bad.join('；'));
    /* 反证：同一个尺寸挪到左上角就一定会压住第 1 个页签 —— 判据真的在比较位置 */
    const shifted = { x: 24, y: 18, w: 36, h: 30 };
    A.chk('量具能失败：同一个尺寸挪到左上角就压住第 1 个页签',
      overlap(shifted, { x: 24, y: 18, w: 80, h: 30 }) > 0,
      'overlap=' + overlap(shifted, { x: 24, y: 18, w: 80, h: 30 }));
  }

  /* ---------- F. 那颗钮真的画出来了，而且"静音"和"有声"画得不一样 ---------- *
   *
   * 前面所有断言都是逻辑层的（`sfxStats().muted`、rect 不重叠）。
   * 逻辑全绿但屏幕上那格是空的，本项目已经出现过（"看得见点不着"的镜像）。
   * 所以这里读像素：静音时钮里必须有一道**红斜杠**，有声时必须是**金喇叭**。
   *
   * 颜色的判据不是"这格不是空白"，而是"红色像素数会随状态翻转" ——
   * 后者才能证明这个位置画的确实是那颗钮，而不是恰好在那儿的一块面板。
   */
  {
    await ev(`(()=>{const s=window.__rap.state; s.welcome=0; s.helpOpen=0;
      s.phase='build'; s.run=null; s.paused=false; return 1;})()`);
    const probe = () => ev(`(()=>{
      const cv=document.querySelector('canvas');
      const dpr=cv.width/1280;
      const m=window.__rap.muteRect();
      const g=cv.getContext('2d',{willReadFrequently:true});
      const d=g.getImageData(Math.round(m.x*dpr),Math.round(m.y*dpr),
        Math.round(m.w*dpr),Math.round(m.h*dpr)).data;
      let red=0, gold=0, live=0;
      for(let i=0;i<d.length;i+=4){
        const r=d[i],gr=d[i+1],b=d[i+2],a=d[i+3];
        if(a<40) continue;
        if(r>140 && r-gr>45 && r-b>45) red++;          // 红斜杠 #ff6b52 / 边框
        else if(r>190 && gr>150 && b<200 && r-b>40) gold++;  // 金喇叭 #ffe9b0
        if(r+gr+b>90) live++;
      }
      return JSON.stringify({red, gold, live, total:d.length/4, muted:window.__rap.sfxStats().muted});
    })()`).then(JSON.parse);

    // 先确保是"有声"
    if (await muted()) { await ev('window.__rap.toggleMute()'); }
    await sleep(400);
    const on = await probe();
    A.log('有声时的钮：' + JSON.stringify(on));
    A.chk('有声时那颗钮真的画在屏幕上（不是一格背景）',
      on.live > on.total * 0.5, on.live + '/' + on.total + ' 个非黑像素');
    A.chk('有声时画的是金喇叭，没有红斜杠', on.red <= 4 && on.gold >= 20,
      'red=' + on.red + ' gold=' + on.gold);

    await ev('window.__rap.toggleMute()');
    await sleep(400);
    const off = await probe();
    A.log('静音时的钮：' + JSON.stringify(off));
    A.chk('静音时出现红斜杠（图标真的随状态换了）', off.red >= 20, 'red=' + off.red);
    A.chk('量具能失败：同一个像素判据在两种状态下读数不同',
      Math.abs(off.red - on.red) >= 16, 'red ' + on.red + ' → ' + off.red);

    // 回到"有声"，别把状态带给后面的用例
    await ev('window.__rap.toggleMute()');
    A.chk('收尾：静音抽屉被拉回有声', (await muted()) === false, '见 sfxStats');
    await ev('(()=>{window.__rap.toggleMute(); return 1;})()');   // 再拨回静音，测持久化用的最终态
    await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; return 1;})()`);
  }

  await shot('mu-03-final');
  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
