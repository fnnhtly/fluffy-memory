/* ★★★ 条件的实时状态条：必须真的随行为变化，不能是个静态牌子。
 *
 * 判据分三层：
 *   1. 纯函数：challengeStatus() 在构造的状态上给出正确的 pass/值；
 *   2. 真行为：1-2 真的按一次打气筒 → 条件立刻从"满足"翻成"不满足"；
 *   3. 像素：状态条那一行的文字颜色在满足/不满足两种状态下必须不同。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeCb-' + Date.now()),
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

  // 1) 纯函数：四种 challenge 都要有正确的 pass 语义
  const fn = JSON.parse(await ev(`(()=>{
    const R=window.__rap;
    const grab=t=>{ window.__rap.state.levelOverride=t; return 1; };
    // 直接构造 level 对象喂给 challengeStatus 不可行（它内部读 level()），
    // 所以这里用真实关卡的 challenge 逐个换关验证。
    const out=[];
    const test=(i, run, tag)=>{
      R.startLevel(i);
      const r=R.challengeStatus(run);
      out.push({tag:tag, type:r.type, label:r.label, value:r.value, pass:r.pass});
    };
    test(1, {pumpPress:0, car:{energy:100}}, '1-2 一次没按');
    test(1, {pumpPress:1, car:{energy:100}}, '1-2 按了一次');
    test(1, {pumpPress:2, car:{energy:100}}, '1-2 按了两次');
    /* ⚠ 第 71 轮：1-3 的第三星从「动力余量 >=1」改成「一颗种子都不用」
     * （容量系统被删掉了，见 docs/parts-redesign.md 第 8 节）。
     * 这两条 fixture 必须跟着改 —— 旧写法塞 car.powerSupply/powerDemand，
     * 而新分支读的是 state.seedUse，于是两个用例**都**判"满足"，
     * "余量 0 不满足"那条就红了。
     * 新用例的两侧：一颗种子都没用 / 用了两颗。
     * （这段在模板字符串里，注释中不能出现反引号。） */
    test(2, {seedUse:{anemo:0,geo:0,electro:0}, car:{}},
      '1-3 一颗种子都没用');
    test(2, {seedUse:{anemo:1,geo:1,electro:0}, car:{}},
      '1-3 用了两颗种子');
    test(3, {maxAngle:0.3, car:{energy:100}}, '1-4 倾角 17°');
    test(3, {maxAngle:1.4, car:{energy:100}}, '1-4 倾角 80°');
    // 1-5 从「不用马达」改成「不用驱动件」：noTool 读车上有没有 tool
    test(4, {car:{parts:[{def:{structure:true}}]}}, '1-5 没有驱动件');
    test(4, {car:{parts:[{def:{structure:true}},{def:{tool:true}}]}}, '1-5 装了驱动件');
    test(0, {hullBroken:false, pigEjected:false, car:{energy:100}}, '1-1 结构完好');
    test(0, {hullBroken:true, pigEjected:false, car:{energy:100}}, '1-1 木框碎了');
    return JSON.stringify(out);
  })()`));
  fn.forEach(r => A.log(r.tag + ' → ' + r.type + ' / ' + r.label + ' / ' +
    (r.value || '—') + ' / ' + (r.pass ? '满足' : '不满足')));

  const byTag = t => fn.find(r => r.tag.indexOf(t) === 0);
  A.chk('1-2 没按打气筒时条件满足（≤1 次）', byTag('1-2 一次没按').pass === true);
  A.chk('1-2 按了一次仍满足（这颗星叫「只按一下」）', byTag('1-2 按了一次').pass === true);
  A.chk('1-2 按了两次后条件不满足', byTag('1-2 按了两次').pass === false);
  A.chk('1-3 一颗种子都没用 → 满足', byTag('1-3 一颗种子都没用').pass === true);
  A.chk('1-3 用了两颗种子 → 不满足', byTag('1-3 用了两颗种子').pass === false);
  A.chk('1-4 倾角 17° 满足', byTag('1-4 倾角 17').pass === true);
  A.chk('1-4 倾角 80° 不满足（翻车了）', byTag('1-4 倾角 80').pass === false);
  A.chk('1-5 没装驱动件满足', byTag('1-5 没有驱动件').pass === true);
  A.chk('1-5 装了驱动件不满足', byTag('1-5 装了驱动件').pass === false);
  A.chk('1-1 的第三星是「不散架」，结构完好时满足', byTag('1-1 结构完好').pass === true &&
    byTag('1-1 结构完好').type === 'noBreak');
  A.chk('1-1 木框碎了时不满足', byTag('1-1 木框碎了').pass === false);

  // 2)+3) 真行为 + 像素：跑 1-2，真按一次打气筒，看状态条颜色翻面
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[1];
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-2']);
    window.__rap.launch(); s.runBanner=0; return 1;})()`);
  await sleep(600);

  // 状态条左边的星号/叉号那一小块的颜色
  const badgeColor = () => ev(`(()=>{
    const cv=document.querySelector('canvas');
    const dpr=cv.width/1280;
    const g=cv.getContext('2d',{willReadFrequently:true});
    const CR=window.__rap.runChallengeRect();
    const y=Math.round((CR.y+15)*dpr);
    let best=null;
    for(let x=Math.round((CR.x+10)*dpr); x<Math.round((CR.x+40)*dpr); x++){
      const d=g.getImageData(x,y,1,1).data;
      const lum=d[0]*0.299+d[1]*0.587+d[2]*0.114;
      if(!best || lum>best.lum) best={lum:lum, r:d[0], g:d[1], b:d[2]};
    }
    return JSON.stringify(best);
  })()`).then(JSON.parse);

  const before = await badgeColor();
  const passBefore = await ev('window.__rap.challengeStatus(window.__rap.state.run).pass');
  A.chk('1-2 刚出发时条件满足（结构上）', passBefore === true);
  A.chk('满足状态用绿字（G 明显高于 R）', before.g > before.r + 20,
    'rgb(' + before.r + ',' + before.g + ',' + before.b + ')');

  // 真按一下打气筒（走 RAP.pressInteract，就是玩家按 1 键走的那条路）。
  // 1-2 的第三星是「只按一下」（max 1），所以按**一次**应该仍然满足 ——
  // 这条本身就是一个断言：如果这颗星还是旧的 max 0，这里会立刻红。
  await ev(`(()=>{const R=window.__rap.RAP; R.pressInteract(window.__rap.state.run, 1); return 1;})()`);
  await sleep(300);
  const passOne = await ev('window.__rap.challengeStatus(window.__rap.state.run).pass');
  const cntOne = await ev('window.__rap.state.run.pumpPress');
  A.chk('按了一下后 pumpPress = 1', cntOne === 1, cntOne + ' 次');
  A.chk('按一下仍然满足（星名是「只按一下」）', passOne === true);

  // 再按一下 → 超了，状态条必须翻红
  await ev(`(()=>{const R=window.__rap.RAP; R.pressInteract(window.__rap.state.run, 1);
    R.releaseInteract(window.__rap.state.run, 1); return 1;})()`);
  await sleep(400);
  const after = await badgeColor();
  const passAfter = await ev('window.__rap.challengeStatus(window.__rap.state.run).pass');
  const cnt = await ev('window.__rap.state.run.pumpPress');
  A.log('按了两次打气筒：pumpPress=' + cnt + '，状态条 rgb(' +
    after.r + ',' + after.g + ',' + after.b + ')');
  A.chk('按过两次后 pumpPress ≥ 2', cnt >= 2, cnt + ' 次');
  A.chk('按过两次后条件不满足（结构上）', passAfter === false);
  A.chk('不满足状态用红字（R 明显高于 G）', after.r > after.g + 20,
    'rgb(' + after.r + ',' + after.g + ',' + after.b + ')');
  A.chk('两种状态的颜色确实不同（度量尺能区分）',
    Math.abs(after.r - before.r) + Math.abs(after.g - before.g) > 40,
    'Δr=' + (after.r - before.r) + ' Δg=' + (after.g - before.g));

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
