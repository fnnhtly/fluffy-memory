"""把 HTML 演示换成"原神色调"（纯图元造景）：
深青天空 → 暖色地平线 → 冷青远山 → 青绿丛林 → 蓝灰石壁（暖高光）→ 金绿草皮 → 青蓝海面
UI 金饰点缀（原神感来自金线/深色半透明面板，而不是贴图）。
"""
import pathlib

p = pathlib.Path("prototype/index.html")
t = p.read_text(encoding="utf-8")

old_col = t[t.find("  const COL = {"):t.find("  };", t.find("  const COL = {")) + 4]
new_col = """  const COL = {
    // 原神黄昏调：天空由上到下 深青 → 青 → 暖金地平线
    skyTop: '#23405E', skyMid: '#4E7C96', skyLow: '#C9B98A',
    hillFar: '#2C4A5E', jungle: '#2F6B5A', jungle2: '#27584A',
    stone: '#7C8694', stone2: '#6E7E8C', stoneHi: '#94A3AE', stoneLo: '#4A5866',
    grass: '#7FBF5A', grassRim: '#C9E37A', shadow: '#2C5A38',
    mud: '#8A7A5A', ice: '#9FE3F2', iceEdge: '#D9F6FF',
    grid: 'rgba(120,170,130,.45)', gridSel: 'rgba(232,200,122,.85)',
    wood: '#C08A4A', woodDark: '#8A5F30', wheel: '#3A4048', iron: '#5A6672', ironRim: '#C8D2DC',
    pig: '#6FC25A', motor: '#E06A4A', battery: '#8FD66A', pump: '#4F8FB0',
    box: '#D9A94A', flag: '#E2574C', ink: '#16211A',
    gold: '#E8C87A', goldDim: '#8A7448', panel: 'rgba(18,30,40,.92)'
  };
"""
t = t.replace(old_col, new_col)

# 天空渐变改成三段
t = t.replace("""    const g = ctx.createLinearGradient(0, 0, 0, DH);
    g.addColorStop(0, '#e2f0a4');
    g.addColorStop(0.45, COL.sky);
    g.addColorStop(1, '#cfeb8e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);""",
"""    const g = ctx.createLinearGradient(0, 0, 0, DH);
    g.addColorStop(0, COL.skyTop);
    g.addColorStop(0.42, COL.skyMid);
    g.addColorStop(0.72, COL.skyLow);
    g.addColorStop(1, '#B7A87C');
    ctx.fillStyle = g; ctx.fillRect(0, 0, DW, DH);
    // 远山剪影（原神感的层峦）
    ctx.fillStyle = COL.hillFar;
    for (let i = 0; i < 5; i++) {
      const bx = i * 300 - 80, h = 90 - (i % 3) * 18;
      ctx.beginPath();
      ctx.moveTo(bx, DH * 0.42);
      ctx.lineTo(bx + 150, DH * 0.42 - h);
      ctx.lineTo(bx + 300, DH * 0.42);
      ctx.closePath(); ctx.fill();
    }""")

# 丛林色调
t = t.replace("ctx.fillStyle = COL.jungle;\n    ctx.fillRect(0, Math.max(0, horizonY), DW, DH);",
              "ctx.fillStyle = COL.jungle;\n    ctx.fillRect(0, Math.max(0, horizonY), DW, DH);")
t = t.replace("for (let k = 0; k < 6; k++) {", "for (let k = 0; k < 6; k++) {")

# 雾带改成暖金雾
t = t.replace("fog.addColorStop(0, 'rgba(226,240,164,0)');", "fog.addColorStop(0, 'rgba(232,200,122,0)');")
t = t.replace("fog.addColorStop(0.45, 'rgba(226,240,164,.55)');", "fog.addColorStop(0.45, 'rgba(232,200,122,.42)');")
t = t.replace("fog.addColorStop(1, 'rgba(226,240,164,0)');", "fog.addColorStop(1, 'rgba(232,200,122,0)');")

# 石墙纹理色 + 草皮金边
t = t.replace("ctx.fillStyle = n < 3 ? 'rgba(255,255,255,.06)' : (n < 5 ? 'rgba(0,0,0,.07)' : 'rgba(0,0,0,.03)');",
              "ctx.fillStyle = n < 3 ? 'rgba(255,255,255,.07)' : (n < 5 ? 'rgba(0,0,0,.08)' : 'rgba(0,0,0,.03)');")
t = t.replace("    band('rgba(160,172,186,.85)', 6 * cam.zoom, 20 * cam.zoom);",
              "    band('rgba(232,200,122,.55)', 3 * cam.zoom, 2 * cam.zoom);   // 草皮金边（原神感）\n"
              "    band('rgba(148,163,174,.9)', 7 * cam.zoom, 21 * cam.zoom);   // 石墙高光")
t = t.replace("band(COL.grass, 10 * cam.zoom, 4 * cam.zoom);          // 草皮",
              "band(COL.grass, 11 * cam.zoom, 5 * cam.zoom);          // 草皮")

# 海面颜色
t = t.replace("sea.addColorStop(0, '#3fb6d2');", "sea.addColorStop(0, '#2E7F9E');")
t = t.replace("sea.addColorStop(0.5, '#2fa3c4');", "sea.addColorStop(0.5, '#256B87');")
t = t.replace("sea.addColorStop(1, '#2288ad');", "sea.addColorStop(1, '#1B5468');")
t = t.replace("ctx.fillStyle = '#e0d49a';\n    ctx.fillRect(0, seaY - 16, DW, 16);",
              "ctx.fillStyle = '#D9C89A';\n    ctx.fillRect(0, seaY - 16, DW, 16);")

# UI 面板换成深青 + 金边
t = t.replace("ctx.fillStyle = 'rgba(16,22,28,.72)'; roundRect(84, 92, 520, 28, 6); ctx.fill();",
              "ctx.fillStyle = COL.panel; roundRect(84, 92, 520, 28, 8); ctx.fill();\n"
              "    ctx.strokeStyle = COL.goldDim; ctx.lineWidth = 1; ctx.stroke();")
t = t.replace("ctx.fillStyle = 'rgba(16,22,28,.72)'; roundRect(DW - 210, 92, 186, 28, 6); ctx.fill();",
              "ctx.fillStyle = COL.panel; roundRect(DW - 210, 92, 186, 28, 8); ctx.fill();\n"
              "      ctx.strokeStyle = COL.goldDim; ctx.lineWidth = 1; ctx.stroke();")

p.write_text(t, encoding="utf-8")
print("原神色调已应用")
