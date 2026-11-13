"""天空与光照：参考视频的天空是**淡黄绿 → 白 → 淡蓝**的明亮渐变，有云，整体偏亮。
现在偏暗偏蓝，像个黄昏。改成明亮的白天 + 云带 + 远景热雾。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 色板：明亮白天
old_col = """    skyTop: '#23405E', skyMid: '#4E7C96', skyLow: '#C9B98A',
    hillFar: '#2C4A5E', jungle: '#2F6B5A', jungle2: '#27584A',"""
new_col = """    skyTop: '#8FC4E0', skyMid: '#CFE6D8', skyLow: '#F2F0C0',
    hillFar: '#7FA8B8', jungle: '#2F6B5A', jungle2: '#27584A',"""
assert old_col in t
t = t.replace(old_col, new_col)

# 天空渐变 + 云
old_sky = """    const g = ctx.createLinearGradient(0, 0, 0, DH);
    g.addColorStop(0, COL.skyTop);
    g.addColorStop(0.42, COL.skyMid);
    g.addColorStop(0.72, COL.skyLow);
    g.addColorStop(1, '#B7A87C');
    ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);"""
new_sky = """    const g = ctx.createLinearGradient(0, 0, 0, DH * 0.62);
    g.addColorStop(0, COL.skyTop);
    g.addColorStop(0.45, COL.skyMid);
    g.addColorStop(1, COL.skyLow);
    ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);

    // 云：几团叠加的柔和白云（带一点暖边）
    function cloud(cx0, cy0, sc, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#ffffff';
      for (const [ox, oy, rr] of [[-30, 4, 22], [0, -6, 30], [30, 2, 24], [56, 8, 18], [-54, 9, 17]]) {
        ctx.beginPath();
        ctx.arc(cx0 + ox * sc, cy0 + oy * sc, rr * sc, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,246,214,.5)';
      for (const [ox, oy, rr] of [[-20, 14, 16], [22, 15, 14], [44, 13, 11]]) {
        ctx.beginPath();
        ctx.arc(cx0 + ox * sc, cy0 + oy * sc, rr * sc, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    cloud(DW * 0.16, 120, 1.25, 0.88);
    cloud(DW * 0.52, 78, 1.55, 0.8);
    cloud(DW * 0.86, 132, 1.05, 0.82);
    cloud(DW * 0.36, 190, 0.85, 0.6);

    // 地平线光晕（暖）
    const glow = ctx.createRadialGradient(DW * 0.5, DH * 0.5, 80, DW * 0.5, DH * 0.5, DW * 0.62);
    glow.addColorStop(0, 'rgba(255,248,196,.32)');
    glow.addColorStop(1, 'rgba(255,248,196,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, DW, DH);"""
assert old_sky in t
t = t.replace(old_sky, new_sky)

# 远山颜色适配亮天空
t = t.replace("    ctx.fillStyle = '#33566b';", "    ctx.fillStyle = COL.hillFar;")
p.write_text(t, encoding="utf-8")
print("天空与云完成")
