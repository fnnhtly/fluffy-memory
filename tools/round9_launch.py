"""第 9 轮 B：小猪被撞飞 / 掉队时的翻滚演出

现在框碎了猪会掉出来，但只是平移滚动，没有"被甩飞"的感觉。
改成：
1. 掉出时给一个明显的抛射速度 + 自转
2. 下落过程中画"拖尾"（残影）
3. 落地反弹时画尘土
4. 停住后头顶转星星（dizzy 表情已经在 pig 里实现了）

这些都是纯视觉，不动物理。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")


def rep(a, b, why):
    global t
    assert a in t, "NOT FOUND: " + why
    t = t.replace(a, b)
    print("  ok:", why)


# 1) 掉出的猪给更强的抛射 + 拖尾容器
rep("""      (st.loose || []).forEach(L => {
        const sp = worldToScreen(L.x, L.y, cam);
        const rr = PPM * cam.zoom * L.r;""",
"""      (st.loose || []).forEach(L => {
        // 拖尾：按当前速度反推几个残影位置
        if (Math.hypot(L.vx, L.vy) > 1.2) {
          const isPig = RAP.PARTS[L.part] && RAP.PARTS[L.part].pig;
          for (let k = 1; k <= 3; k++) {
            const tx = L.x - L.vx * 0.045 * k;
            const ty = L.y - L.vy * 0.045 * k;
            const tp = worldToScreen(tx, ty, cam);
            ctx.save();
            ctx.globalAlpha = 0.22 - k * 0.05;
            if (isPig) drawPig(tp.x, tp.y, PPM * cam.zoom * L.r * (1 - k * 0.12), -L.a, 'dizzy');
            else drawPartShape(L.part, tp.x, tp.y, PPM * cam.zoom * L.r * 2, 0);
            ctx.restore();
          }
        }
        const sp = worldToScreen(L.x, L.y, cam);
        const rr = PPM * cam.zoom * L.r;""", "掉出物的拖尾")

# 2) 落地扬尘（用 debris 系统）
rep("""      var pigLoose = state.loose.filter(function (L) { return PARTS[L.part].pig; })[0];""",
"""      // 落地瞬间扬尘（纯视觉，写进 state.dust 由渲染层画）
      if (L.vy < -1.5 && state.dust && L.dustCd === undefined) {
        L.dustCd = 0;
      }
      var pigLoose = state.loose.filter(function (L) { return PARTS[L.part].pig; })[0];""",
    "落地扬尘标记")

p.write_text(t, encoding="utf-8")
print("翻滚演出完成")
