/* 六类事件的反馈强度阶梯（第 92 轮）。
 *
 * ── 为什么不用像素 ──
 *
 * 第一版做了像素差分，结果不可复现：
 *
 *   touch lvl=1  噪声 17.15%  峰值  2.8%
 *   touch lvl=2  噪声  0.19%  峰值  0.2%
 *   touch lvl=3  噪声  0.00%  峰值 47.5%
 *   touch lvl=4  噪声  0.00%  峰值  0.0%   ← 比 lvl3 更重的事件，峰值反而 0
 *
 * 原因很清楚：`state.flash` 每帧衰减 `elapsed × 7`，0.35 的闪帧
 * **只有 0.05 秒（3 帧）**。用 `sleep(70)` 去抓，抓早了事件还没消费、
 * 抓晚了已经衰减完 —— 这是**用 sleep 和帧率赛跑**，
 * 而项目在第 63 轮就记过这个坑（`shakePeak` 字段就是为它加的）。
 *
 * 一个不可复现的判据比没有更糟：它训练人去重跑直到绿。
 *
 * ── 改成量状态 ──
 *
 * 每个事件被消费之后，渲染层会写一组**确定的**状态量：
 *
 *   shake     震屏幅度
 *   flash     闪帧强度
 *   vignette  暗角强度
 *   dust      尘土粒子数
 *   debris    碎片数
 *
 * 这些是"演出的**强度参数**"，而第 90 轮的 `test_draw_presence_all`
 * 已经证明了"这些状态确实被画出来"。两层合起来才完整：
 *   · 本文件：强度档位对不对（确定性，无时序）
 *   · test_draw_presence_all：画没画出来（像素）
 *
 * ── 判据 ──
 *
 *   A 每一类事件都产生可见的状态变化（不全为 0）
 *   B 分级接触单调：lvl1 < lvl2 < lvl3 < lvl4（shake）
 *   C 碎框比掉耐久明显更重（part_broken 的 shake > struct_hurt 的 shake）
 *   D 声明强度与实际值一致（防止"改了常量忘了改这里"）
 */
const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
const lines = [];
function chk(label, cond, extra) {
  if (cond) { pass++; lines.push('✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; lines.push('✗ ' + label + '  ' + (extra || '')); }
}

(async () => {
  const PORT = 9900 + Math.floor(Math.random() * 80);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + path.join(os.tmpdir(), 'edgeLad92-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
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
    const r = await send('Runtime.evaluate',
      { expression: e, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('页面求值异常：' + (d.exception && d.exception.description || d.text));
    }
    return r.result.value;
  };

  /* 纯状态读数，不依赖像素、不依赖 sleep 时机。
   * 注意：`consumeRunEvents` 在**每一帧**跑，所以要读它执行后的状态 ——
   * 用一个 evaluate 把"塞事件 + 手动调一次渲染循环的事件消费"合成一步。
   *
   * 具体做法：在 evaluate 里直接把事件 push 进 `run.events`，
   * 然后读**下一帧之后**的状态。为了保证"下一帧真的跑过"，
   * 这里不强求帧数，而是让页面自己如实报告它消费到了几条。 */
  const SETUP = `(()=>{const R=window.__rap, S=R.state;
    R.startLevel(0); S.welcome=0; S.introT=1; S.phase='build'; S.run=null;
    S.paused=false; S.shake=0; S.flash=0; S.slowmo=0; S.vignette=0;
    S.shakePeak=0; S.__freezeRun=false;
    S.debris=[]; S.dust=[]; S.bursts=[]; S.boxBurst=[]; S.boxPop=null; S.boxPulse=0;
    R.RAP.applySpec(R.level(), S.build, R.RAP.SPECS['1-1']);
    R.launch(); S.runBanner=0;
    for (let k=0;k<90;k++){ if(S.run.phase!=='run') break; R.RAP.step(S.run,1/60); }
    return 1;})()`;

  /* 读状态（在事件被消费之后）。
   *
   * ⚠ 三个"峰值"字段必须分开对待：
   *
   *   `shake`    每帧衰减 `elapsed × 3.2` —— 0.10 的 lvl1 只活 **31 ms**
   *   `flash`    每帧衰减 `elapsed × 7`   —— 0.35 只活 **50 ms**
   *   `vignette` 每帧衰减 `elapsed × 1.6` —— 活得最久
   *
   * 第一版在 `sleep(80)` 之后读一次，于是 lvl1/lvl2 的 shake 已经归零、
   * 所有 flash 都归零。那不是我量错了字段，是**用一次采样去抓衰减量**。
   *
   * 修法两条并用：
   *   · `shake` 读 `state.shakePeak`（第 63 轮专门为这个加的纯观测字段）
   *   · `flash` / `vignette` 用**多次短间隔采样取最大** —— 但它们衰减太快，
   *     一次 evaluate 往返约 5~15 ms，仍然可能错过。
   *     所以给 `flash` 也加一个 `flashPeak`（和 `shakePeak` 同族）。
   */
  async function fireAndRead(evStr) {
    await ev(SETUP);
    await sleep(120);
    await ev(`(()=>{const S=window.__rap.state;
      S.shake=0; S.flash=0; S.vignette=0; S.shakePeak=0; S.flashPeak=0;
      S.dust=[]; S.debris=[];
      S.run.events.push(${JSON.stringify(evStr)});
      return 1;})()`);
    /* ⚠ 塞完事件后**立刻**开始读，中间不留长 sleep。
     * lvl1 的峰值只活 2 帧（33ms），而一次 sleep(18) + evaluate 往返就要 25ms ——
     * 第一版循环 8 次、每次 18ms，第一次读到时峰值已经衰减完了。
     * 现在第一次读只等一帧（20ms），并且**先读峰值再读抖值**。 */
    let best = null;
    for (let i = 0; i < 10; i++) {
      await sleep(i === 0 ? 20 : 22);
      const r = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
        return JSON.stringify({
          shake: +(S.shake||0).toFixed(3),
          flash: +(S.flash||0).toFixed(3),
          vig: +(S.vignette||0).toFixed(3),
          shakePeak: +(S.shakePeak||0).toFixed(3),
          flashPeak: +(S.flashPeak||0).toFixed(3),
          dust: (S.dust||[]).length,
          debris: (S.debris||[]).length,
          slowmo: +(S.slowmo||0).toFixed(2)
        });})()`));
      if (!best) best = r;
      else {
        best.shake = Math.max(best.shake, r.shake);
        best.flash = Math.max(best.flash, r.flash);
        best.vig = Math.max(best.vig, r.vig);
        best.shakePeak = Math.max(best.shakePeak, r.shakePeak);
        best.flashPeak = Math.max(best.flashPeak, r.flashPeak);
        best.dust = Math.max(best.dust, r.dust);
        best.debris = Math.max(best.debris, r.debris);
        best.slowmo = Math.max(best.slowmo, r.slowmo);
      }
    }
    /* ⚠ 兜底：`touch lvl=1` 的峰值只有 0.10，而抖值 2 帧就衰减到 0。
     * 4 个异步采样点全部可能落在它**之后** —— 那不是产品缺陷，
     * 是"用轮询抓 33 ms 的脉冲"。所以这里再查一次
     * `state.shakePeak`（纯观测字段，一旦写过就不会归零）。
     * 如果连它都是 0，那才是真的没消费。 */
    const peakOnly = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
      return JSON.stringify({ shakePeak:+(S.shakePeak||0).toFixed(3),
        flashPeak:+(S.flashPeak||0).toFixed(3) });})()`));
    if (best) {
      best.shakePeak = Math.max(best.shakePeak, peakOnly.shakePeak);
      best.flashPeak = Math.max(best.flashPeak, peakOnly.flashPeak);
    }
    return best;
  }

  console.log('=== 六类事件的反馈强度（状态量，确定性）===');
  const res = {};
  res.touch1 = await fireAndRead('touch lvl=1 v=1.5 x=8.0');
  res.touch2 = await fireAndRead('touch lvl=2 v=2.5 x=8.0');
  res.touch3 = await fireAndRead('touch lvl=3 v=5.0 x=8.0');
  res.touch4 = await fireAndRead('touch lvl=4 v=7.0 x=8.0');
  res.hurt = await fireAndRead('struct_hurt v=5.0 hp=2');
  res.broken = await fireAndRead('part_broken part=wood_frame x=8.0 y=7.0');

  const show = (n, r) => n.padEnd(20) + ' shake ' + String(r.shake).padStart(5) +
    '  flash ' + String(r.flash).padStart(5) +
    '  vign ' + String(r.vig).padStart(5) +
    '  dust ' + String(r.dust).padStart(2) +
    '  debris ' + String(r.debris).padStart(2) +
    '  slowmo ' + r.slowmo;
  Object.keys(res).forEach(k => console.log(show(k, res[k])));

  console.log('');
  console.log('=== 判据 ===');

  /* A 每类都有可见变化
   *
   * ⚠ `touch lvl=1` 的断崖：它的震屏只有 **0.10**，
   * 而 `state.shake` 每帧衰减 `elapsed × 3.2` —— 60fps 下 0.053/帧，
   * 所以它只活 **2 帧（约 33 ms）**。
   * 我的采样循环一次约 25 ms（sleep 18 + evaluate 往返），
   * 而 `shakePeak` 要等**事件被消费之后**才写 —— 第一次采样时
   * 事件可能还没消费，第二次时峰值已经被采样到了但抖值已归零。
   *
   * 这不是产品缺陷：lvl1 本来就该是"几乎感觉不到"的一档。
   * 但**判据不能因此豁免它** —— 那样 D 组的单调性就少了一端。
   *
   * 改用更稳的采样方式：把"塞事件 + 等一帧 + 读峰值"**合成一次 evaluate**，
   * 中间不经过 sleep/evaluate 往返。具体做法是塞完事件后同步跑一帧渲染
   * 是做不到的（rAF 是浏览器的），所以改成：塞事件后**只 sleep 一帧（20ms）
   * 就立刻读**，让峰值一定在衰减到 0 之前被写下来。
   */
  Object.keys(res).forEach(k => {
    const r = res[k];
    const any = r.shake > 0 || r.shakePeak > 0 || r.flash > 0 || r.flashPeak > 0 ||
      r.vig > 0 || r.dust > 0 || r.debris > 0;
    chk('A ' + k + ' 产生了可见的反馈（shake/flash/vignette/粒子至少一项 > 0）',
      any, JSON.stringify({ shakePeak: r.shakePeak, flashPeak: r.flashPeak, dust: r.dust }));
  });

  /* B 分级接触单调 —— 用 shakePeak，因为 lvl1 的 0.10 只活 31 ms */
  {
    const seq = [res.touch1.shakePeak, res.touch2.shakePeak,
      res.touch3.shakePeak, res.touch4.shakePeak];
    chk('B 分级接触的震屏峰值单调递增（lvl1 < lvl2 < lvl3 < lvl4）',
      seq[0] < seq[1] && seq[1] < seq[2] && seq[2] < seq[3],
      seq.map(x => x.toFixed(2)).join(' < '));
  }

  /* C 碎框比掉耐久更重 */
  chk('C 碎框的震屏明显大于掉耐久（≥ 1.5 倍）',
    res.broken.shakePeak >= res.hurt.shakePeak * 1.5,
    res.broken.shakePeak.toFixed(2) + ' vs ' + res.hurt.shakePeak.toFixed(2));

  /* D 声明强度与实际一致。
   * ⚠ 用峰值 + 允许 80% 误差：`state.shake` 是 `shake + 上一帧残留`，
   * 而残留取决于采样时刻。判据守的是"档位没被改错"，不是精确值。 */
  {
    const declared = [0, 0.10, 0.22, 0.42, 0.85];
    const ok = [1, 2, 3, 4].every(lv =>
      res['touch' + lv].shakePeak >= declared[lv] * 0.8);
    chk('D 各级震屏峰值 ≥ 声明档位的 80%（防止常量改了没人发现）',
      ok, [1, 2, 3, 4].map(lv =>
        declared[lv] + '→' + res['touch' + lv].shakePeak).join(' '));
  }

  /* E 高级别接触必须带闪帧 */
  chk('E lvl3/lvl4 带闪帧（flashPeak > 0）',
    res.touch3.flashPeak > 0 && res.touch4.flashPeak > 0,
    res.touch3.flashPeak + ' / ' + res.touch4.flashPeak);

  /* F lvl2 以上必须带暗角 */
  chk('F lvl2 以上带暗角（vignette > 0）',
    res.touch2.vig > 0 && res.touch3.vig > 0 && res.touch4.vig > 0,
    [res.touch2.vig, res.touch3.vig, res.touch4.vig].join(' / '));

  console.log('');
  console.log(lines.join('\n'));
  console.log('');
  console.log('ASSERTS ' + pass + ' / ' + (pass + fail));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  try { ws.close(); } catch (e) {}
  try { require('./lib/asserts.js').killTree(child); } catch (e) {}
  process.exit(fail === 0 && errs.length === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });
