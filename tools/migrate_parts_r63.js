/* 第 63 轮：把六关的 partsBox / challenge 改成新零件表。
 *
 * 为什么写脚本而不是手改六个 JSON：
 *   1. JSON 里有中文（关卡名），PowerShell 文本往返会把它们变成乱码
 *      （本项目已经踩过三次，见 records/playtest.md 的教训列表）；
 *   2. 六个文件的改法完全同构，手改六遍只会引入偶然不一致。
 *
 * 这个脚本**只改两件事**：`partsBox` 和 `challenge`。
 * 地形、起点、终点、木箱位置一律不碰 —— 那是关卡设计，不是零件迁移。
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'levels');

/* 每关的新预算与第三星条件。
 *
 * 预算原则：给够标准解 + 一点试错空间，但不足以"堆满"。
 *   · 驱动件要那种"装两个就超载"的量（逼玩家理解容量）；
 *   · 气球/沙袋按参考的 1/2/3 堆叠给（3 是 maxStack）。 */
const UPDATE = {
  '01.json': {
    partsBox: { wood_frame: 3, wood_wheel: 2, pig: 1 },
    // 1-1 教"框+轮+猪"，第三星仍然是不散架
    challenge: { type: 'noBreak' }
  },
  '02.json': {
    // 仙术机关是手动件，不耗容量 —— 所以这一关一个动力源都不给，
    // 强迫玩家用"按一下"解决问题（而不是堆驱动件）
    partsBox: { wood_frame: 3, wood_wheel: 2, pump: 2, pig: 1 },
    challenge: { type: 'pumpPress', max: 1 }
  },
  '03.json': {
    // 教动力源 + 驱动件 + 连通性。风种 2 点容量，风车桨占 1 → 余量 1。
    // 第三星「余量 ≥ 1」意思是：装第二个驱动件就没了。
    partsBox: { wood_frame: 3, wood_wheel: 2, anemo_core: 1, propeller: 2, pig: 1 },
    challenge: { type: 'powerSpare', min: 1 }
  },
  '04.json': {
    // 冰面：教换轮子。铁轮抓地 0.8 vs 木轮 0.15。
    // 预算里必须给喷气口（9 m/s²）—— 风车桨 5.0 爬不上 0.44 的冰坡
    // （沿坡重力 6.44），见 game.js SPECS['1-4i'] 的注释。
    partsBox: { wood_frame: 4, wood_wheel: 2, iron_wheel: 2, anemo_core: 1,
                jet: 2, pig: 1 },
    challenge: { type: 'noFlip', maxAngle: 0.785 }
  },
  '05.json': {
    // 第三星「不用驱动件」：所以要给驱动件（诱导），但用了就拿不到三星。
    partsBox: { wood_frame: 4, wood_wheel: 2, pump: 2, anemo_core: 1,
                propeller: 2, pig: 1 },
    challenge: { type: 'noTool' }
  },
  '06.json': {
    /* 浮力关：气球必须挂在框上方、沙袋挂在框下方（否则一个飘走一个落地）。
     *
     * ⚠ 必须同时给 anemo_core + propeller。
     * 气球只提供**垂直**力，一点水平分量都没有 —— 只给气球的话
     * 车会原地垂直起飞然后飞出地图（实测 fail=flew_away，vx 恒为 0）。
     * 参考里气球关也是"气球管高度 + 螺旋桨管前进"。
     * （这个 partsBox 会被 tools/gen_level_06_r63.js 覆盖，
     *   那个脚本生成地形时写的是同一份预算。） */
    partsBox: { wood_frame: 3, wood_wheel: 2, anemo_core: 1, propeller: 2,
                balloon: 3, sandbag: 3, pig: 1 },
    challenge: { type: 'allSandbags' }
  }
};

let changed = 0;
Object.keys(UPDATE).forEach(f => {
  const p = path.join(dir, f);
  const lv = JSON.parse(fs.readFileSync(p, 'utf8'));
  const u = UPDATE[f];
  const before = JSON.stringify(lv.partsBox);
  lv.partsBox = u.partsBox;
  lv.challenge = u.challenge;
  fs.writeFileSync(p, JSON.stringify(lv, null, 2) + '\n', 'utf8');
  console.log(f + '  ' + lv.levelId + '  partsBox ' + before + ' → ' +
              JSON.stringify(u.partsBox) + '  challenge ' + u.challenge.type);
  changed++;
});
console.log('\n改了 ' + changed + ' 个关卡文件');
