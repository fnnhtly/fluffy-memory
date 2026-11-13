import pathlib

# play_feedback 的 1-2 采样改成轮询到 resolved
q = pathlib.Path("tools/play_feedback.js")
s = q.read_text(encoding="utf-8")
old = """  await sleep(4000);
  out.push('  1-2 结算: ' + await run());"""
new = """  for (let w = 0; w < 40; w++) {
    await sleep(300);
    if ((await ev('window.__rap.state.phase')) === 'resolved') break;
  }
  await sleep(400);
  out.push('  1-2 结算: ' + await run());"""
if old in s:
    s = s.replace(old, new)
    q.write_text(s, encoding="utf-8")
    print("1-2 采样改为轮询")
else:
    print("anchor miss:", old[:40])
