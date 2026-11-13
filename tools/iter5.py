"""把美术方案里的"6 个 3D 手段"落到 HTML：接触阴影、雾带、石墙高光、远景压暗。"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

# 1) 石墙上沿高光 + 2) 远景压暗/加雾
old = """    band(COL.grass, 10 * cam.zoom, 4 * cam.zoom);          // 草皮
    band(COL.shadow, 4 * cam.zoom, 10 * cam.zoom);         // 草皮阴影
    band('rgba(18,26,22,.95)', 5 * cam.zoom, 14 * cam.zoom); // 重描边"""
new = """    // 石墙上沿高光（立体感第一步：受光面）
    band('rgba(160,172,186,.85)', 6 * cam.zoom, 20 * cam.zoom);
    band(COL.grass, 10 * cam.zoom, 4 * cam.zoom);          // 草皮
    band(COL.shadow, 4 * cam.zoom, 10 * cam.zoom);         // 草皮阴影
    band('rgba(18,26,22,.95)', 5 * cam.zoom, 14 * cam.zoom); // 重描边"""
assert old in t
t = t.replace(old, new)

# 3) 远景与地形之间的雾带（插在丛林之后、地形之前）
old2 = """    ctx.fillStyle = 'rgba(30,80,40,.28)';
    ctx.fillRect(0, Math.max(0, horizonY + 10), DW, DH);"""
new2 = """    ctx.fillStyle = 'rgba(30,80,40,.28)';
    ctx.fillRect(0, Math.max(0, horizonY + 10), DW, DH);

    // 雾带：远景与近景之间，制造空气透视
    const fog = ctx.createLinearGradient(0, horizonY - 10, 0, horizonY + 90);
    fog.addColorStop(0, 'rgba(226,240,164,0)');
    fog.addColorStop(0.45, 'rgba(226,240,164,.55)');
    fog.addColorStop(1, 'rgba(226,240,164,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, horizonY - 10, DW, 110);"""
assert old2 in t
t = t.replace(old2, new2)

# 4) 接触阴影：车下 + 木箱下（drawRun 内）
old3 = """    // 车
    const ca = Math.cos(car.a), sa = Math.sin(car.a);"""
new3 = """    // 接触阴影（立体感第二步：物体与地面的关系）
    const shY = st.terrain.surfaceY(car.x);
    const shP = worldToScreen(car.x, shY + 0.02, cam);
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#16211a';
    ctx.beginPath();
    ctx.ellipse(shP.x, shP.y, PPM * cam.zoom * 1.5, PPM * cam.zoom * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 车
    const ca = Math.cos(car.a), sa = Math.sin(car.a);"""
assert old3 in t
t = t.replace(old3, new3)

# 5) 木箱也加接触阴影
old4 = """      const s = PPM * cam.zoom * 0.8;
      ctx.fillStyle = COL.box; roundRect(p.x - s / 2, p.y - s / 2, s, s, 4); ctx.fill();"""
new4 = """      const s = PPM * cam.zoom * 0.8;
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#16211a';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + s * 0.55, s * 0.6, s * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = COL.box; roundRect(p.x - s / 2, p.y - s / 2, s, s, 4); ctx.fill();"""
assert old4 in t
t = t.replace(old4, new4)

p.write_text(t, encoding="utf-8")
print("3D 手段已落到 HTML（高光/雾/接触阴影）")
