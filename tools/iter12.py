"""猪的受伤改成"真摔"才扣血：阈值 10 m/s + 0.6 秒冷却。

1-2 那个 1 米台阶让车头角点连续磕三次（每次 vn>8），三下就把猪撞死了——
这不是玩家能感知的"摔伤"，是接触检测的碎震。加冷却 + 提高阈值。
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")

s = s.replace("""    // 木框在的时候猪是受保护的；框碎了猪暴露，但阈值不降（避免一次落地就三连伤）
    if (vn > 8) {
      state.pigHP -= 1;
      log(state, 'pig_hurt hp=' + state.pigHP);
      if (state.pigHP <= 0) resolve(state, 'pig_dead');
    }""",
"""    // 猪只被"真摔"伤到：冲击 > 10 m/s 且 0.6 秒内只算一次（否则台阶磕碰会三连伤害）
    var now = state.time;
    if (vn > 10 && now - (state.lastPigHurt || -9) > 0.6) {
      state.lastPigHurt = now;
      state.pigHP -= 1;
      log(state, 'pig_hurt hp=' + state.pigHP);
      if (state.pigHP <= 0) resolve(state, 'pig_dead');
    }""")

g.write_text(s, encoding="utf-8")
print("猪受伤：阈值 10 + 0.6s 冷却")
