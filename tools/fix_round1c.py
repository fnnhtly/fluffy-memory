"""修三处：
1) 内嵌电池的能量之前没算进车体（1-3 能量不够就是这个）
2) 结构伤害加 0.35s 冷却（同一段路连续磕碰把木框打穿）
3) 大冲击的判定阈值 12 → 14（只有真摔才双倍伤害）
"""
import pathlib

g = pathlib.Path("prototype/game.js")
s = g.read_text(encoding="utf-8")


def rep(a, b, why):
    global s
    assert a in s, "NOT FOUND: " + why
    s = s.replace(a, b)
    print("  ok:", why)


rep("""        mass += idf.mass;
        if (idf.pig) hasPig = true;""",
"""        mass += idf.mass;
        if (idf.energy) energy += idf.energy;     // 内嵌电池也要供电
        if (idf.pig) hasPig = true;""",
    "内嵌电池计能量")

rep("""  function damageCar(state, vn) {
    if (state.time < (state.spawnGrace || 0)) return;      // 出生落地不算摔
    if (vn < 6) return;
    var dmg = vn > 12 ? 2 : 1;""",
"""  function damageCar(state, vn) {
    if (state.time < (state.spawnGrace || 0)) return;      // 出生落地不算摔
    if (vn < 6) return;
    // 同一段路连续磕碰只算一次（0.35 秒冷却），否则木框会被接触帧打穿
    if (state.time - (state.lastStructHurt || -9) < 0.35) return;
    state.lastStructHurt = state.time;
    var dmg = vn > 14 ? 2 : 1;""",
    "结构伤害冷却")

g.write_text(s, encoding="utf-8")
print("done")
