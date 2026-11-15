/* 探针：存在"赢但超过 60 秒"的合法局吗？
 *
 * 这决定 `timeout`（60 秒硬上限）到底是一条**活规则**还是死代码。
 *
 * 上一份随机抽样（1440 局）里 timeout 一次没触发、最慢的赢局只有 7.95 秒 ——
 * 但那是因为随机造法的车要么很快赢、要么很快卡住。真正会撞上上限的是
 * 另一种玩法：**慢而稳定地推进**。看门狗只要求"8 秒内更靠近终点 2 米"，
 * 一辆每 7 秒爬 2 米的车完全合格 —— 终点离起点 24 米，那就是 12 × 7 = 84 秒。
 *
 * 也就是说上限**不是**死代码，它是悬在"慢车流"头上的一把刀：
 * 玩家明明一直在前进、HUD 上的秒表也一直在涨、看门狗一次都没警告，
 * 到 60 秒突然判「超时」。这比"卡住了"更难理解，因为它和玩家的观察相反。
 *
 * 这份探针用**降低推力/加速度**的方式造出慢车流，量清楚：
 *   1. 慢车流最短能慢到多少秒才通关；
 *   2. 把上限放回去（60 秒），它会误杀多少这样的局。
 */
const fs = require('fs');
const path = require('path');
const R = require('../prototype/game.js');
const levelsDir = path.join(__dirname, '..', 'levels');
const levels = fs.readdirSync(levelsDir).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(levelsDir, f), 'utf8')));
const KEYS = ['1-1', '1-2', '1-3', '1-4i', '1-5m', '1-6'];

/* 造一辆"慢车"：标准解，但马达加速度和打气筒冲量都调小。
 * 注意：按住打气筒的自动重复动作要自己喂（_presses），否则没有推力。 */
function slowSpec(key) {
  const spec = JSON.parse(JSON.stringify(R.SPECS[key]));
  return spec;
}

console.log('=== 1. 降低马达加速度 / 打气筒冲量后的通关时间 ===');
const rows = [];
for (const acc of [6.0, 4.0, 3.0, 2.5, 2.0, 1.6, 1.4, 1.2]) {
  for (const imp of [6.0, 4.0, 2.5, 1.8]) {
    let best = null;
    levels.forEach((lv, i) => {
      const r = R.simulate(lv, slowSpec(KEYS[i]), {
        maxTime: 600,
        params: { motorAccel: acc, pumpImpulse: imp, demoTimeLimit: 600, progressWindow: 1e9 }
      });
      if (r.result === 'win' && (!best || r.time > best.t)) best = { lv: lv.levelId, t: r.time };
    });
    if (best) {
      rows.push({ acc, imp, lv: best.lv, t: best.t });
      console.log(`  加速度 ${acc} 冲量 ${imp}：最慢的赢局 ${best.lv} @ ${best.t.toFixed(2)} s`);
    }
  }
}
const maxT = Math.max.apply(null, rows.map(r => r.t));
console.log(`\n最慢的合法通关：${maxT.toFixed(2)} s（上限 60 s）`);
console.log(maxT > 60
  ? `→ 上限**会被合法局撞上**：余量不足，需要处理`
  : `→ 慢车流也在 60 秒内能通关，上限只是兜底`);
console.log(`超过 60 s 的组合：${rows.filter(r => r.t > 60).length} / ${rows.length}`);
