import pathlib

q = pathlib.Path("tools/play_feedback.js")
s = q.read_text(encoding="utf-8")
s = s.replace("await sleep(2500);", "await sleep(4000);")
q.write_text(s, encoding="utf-8")
print("wait longer ok")
