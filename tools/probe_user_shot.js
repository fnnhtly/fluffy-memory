/* 把用户截图里那辆车按"木色填充 / 深色描边 / 其它"三分类画成 ASCII。
 * 描边单独一类，这样"哪条边没画"看得出来。
 *
 * 用法：node tools/probe_user_shot.js <png> [x0 y0 x1 y1] [step]
 */
const fs = require('fs');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const png = args[0] || process.env.TEMP + '\\user-shot.png';
const box = args.length >= 5 ? args.slice(1, 5).map(Number) : [700, 600, 1000, 830];
const step = args[5] ? Number(args[5]) : 3;

/* 用 Python + Pillow 读像素（Node 没有内置 PNG 解码）。 */
const py = String.raw`
import sys
from PIL import Image
im = Image.open(r"${png}").convert("RGB")
px = im.load()
x0,y0,x1,y1,step = ${box[0]},${box[1]},${box[2]},${box[3]},${step}
def cls(c):
    r,g,b = c
    # 木框填充：#c99354 (201,147,84) 上边 / #b57f42 (181,127,66) 下边
    if abs(r-201)<44 and abs(g-147)<44 and abs(b-84)<50: return 'F'
    if abs(r-181)<44 and abs(g-127)<44 and abs(b-66)<50: return 'F'
    # 深描边 / 木纹：#7a4f22 (122,79,34) 与 #6e4822
    if abs(r-122)<40 and abs(g-79)<40 and abs(b-34)<46: return 'O'
    if abs(r-110)<34 and abs(g-72)<34 and abs(b-34)<40: return 'o'
    # 内壁阴影 rgba(58,38,18,.55) 压暗后大约 (60..90, 60..80, 40..60)
    if 45<r<105 and 45<g<95 and 30<b<75 and r>g>b: return 's'
    return '.'
lines=[]
for y in range(y0,y1,step):
    row=''
    for x in range(x0,x1,step):
        row += cls(px[x,y])
    lines.append(row)
print('\n'.join(lines))
`;
fs.writeFileSync(process.env.TEMP + '\\_shotascii.py', py, 'utf8');
const out = execFileSync('python', [process.env.TEMP + '\\_shotascii.py'], { encoding: 'utf8' });
console.log(out);
console.log('图例：F=木色填充  O=深描边  o=暗描边  s=内壁阴影  .=其它');
console.log('区域 x[' + box[0] + '..' + box[2] + '] y[' + box[1] + '..' + box[3] + ']  每字符 ' + step + 'px');
