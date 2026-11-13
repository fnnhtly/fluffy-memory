"""导出 damageCar 并给"分段损坏 + 掉猪"补断言。"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")
s = s.replace("    createRun: createRun, step: step, stepLoose: stepLoose, pressInteract: pressInteract,",
              "    createRun: createRun, step: step, stepLoose: stepLoose, damageCar: damageCar, pressInteract: pressInteract,")
g.write_text(s, encoding="utf-8")
print("导出 damageCar:", "damageCar: damageCar" in s)

c = pathlib.Path("prototype/check_html_logic.js")
k = c.read_text(encoding="utf-8")
k = k.replace("// ---------------- 方向件：切换方向 + 冲量跟随朝向 ----------------",
"""// ---------------- 分段损坏 + 掉猪 ----------------
{
  RAP.resetParams();
  const lv = byId['1-1'];
  const b = RAP.newBuild();
  ['wood_frame:4,1', 'wood_frame:4,2', 'wood_frame:4,3', 'wood_wheel:5,1', 'wood_wheel:5,3'].forEach(s => {
    const [p, rc] = s.split(':');
    RAP.tryPlace(lv, b, p, +rc.split(',')[0], +rc.split(',')[1]);
  });
  RAP.tryPlace(lv, b, 'pig', 4, 2);
  const st = RAP.createRun(lv, b);
  const host = st.car.parts.filter(p => p.def.structure)[1];   // 中间那个（装猪的）
  ok('木框初始耐久 3', host.hp === 3, 'hp=' + host.hp);
  st.spawnGrace = 0;
  st.time = 1;
  RAP.damageCar(st, 20);
  ok('大冲击后耐久 3 → 1（掉 2）', host.hp === 1, 'hp=' + host.hp);
  st.time = 2;
  RAP.damageCar(st, 20);
  ok('耐久归零 → part_broken', st.events.some(e => e.indexOf('part_broken') === 0), st.events.join('|'));
  ok('框碎了 → 小猪变成自由体掉出来', (st.loose || []).length === 1 && st.loose[0].part === 'pig',
    JSON.stringify(st.loose));
  ok('车体不再有猪（hasPig=false）', st.car.hasPig === false, 'hasPig=' + st.car.hasPig);
  // 让小猪落地停住 → pig_lost
  let guard = 0;
  while (st.phase === 'run' && guard++ < 600) { st.time += 1 / 60; RAP.stepLoose(st, 1 / 60); }
  ok('掉出来的小猪停住 = pig_lost', st.failReason === 'pig_lost', st.failReason || st.result);
}

// ---------------- 方向件：切换方向 + 冲量跟随朝向 ----------------""")
c.write_text(k, encoding="utf-8")
print("断言已加")
