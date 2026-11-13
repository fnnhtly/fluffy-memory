import pathlib

t = pathlib.Path("prototype/index.html").read_text(encoding="utf-8")
i = t.find("cv.addEventListener('mousedown'")
j = t.find("cv.addEventListener('mousemove'")
print(t[i:j])
