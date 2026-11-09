"""把 Codex 生成的原始素材（项目根目录的 assets/）处理成游戏用的素材（prototype/assets/）。

做的事：
  1. 按游戏里实际显示的大小缩小（原图是 2 倍，游戏画布最多 1.25 倍）
  2. 裁掉透明的空白边（序列帧、背景层、地面、剧情图除外）
  3. 从三视图里切出侧面像（守画人和张不管用侧面像做身体）
  4. 统一转成 WebP，并生成 assets/index.js（游戏按它加载）

用法（在 prototype 目录下）：
  python tools/build_assets.py
需要 Pillow：pip install pillow
重新生成某张图后，重跑一次即可。
"""
import json, os, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', '..', 'assets'))
DST = os.path.normpath(os.path.join(HERE, '..', 'assets'))

# 各类素材的缩放比例（相对 2 倍原图）和处理方式
# scale：0.625 = 显示 1.25 倍；远景本来就虚，用 0.5
RULES = [
    # 前缀,                 缩放,   裁边,  质量
    ('bg/far1', 0.5, False, 78),
    ('bg/far2', 0.5, False, 78),
    ('bg/far3', 0.625, False, 80),
    ('bg/mid', 0.625, False, 80),
    ('bg/near', 0.625, False, 82),
    ('bg/fg_', 0.625, True, 80),
    ('tile/ground', 0.625, False, 85),
    ('tile/', 0.625, True, 85),
    ('prop/', 0.625, True, 84),
    ('hero/', 1.0, True, 88),      # 拆件本来就小，保留原尺寸
    ('enemy/', 0.75, True, 86),
    ('boss/', 0.75, True, 86),
    ('fx/', 0.625, False, 85),     # 序列帧不能裁边（会打乱帧格）
    ('ui/chapter_thumb', 0.625, False, 84),
    ('ui/', 0.625, True, 86),
    ('story/moye', 0.75, True, 86),
    ('story/', 0.75, False, 80),
]
SKIP = ('promo/',)                  # 宣传图不进游戏
FRAMES = {}                         # 序列帧信息，从 动画帧配置.json 读


def rule_for(rel):
    for prefix, scale, trim, q in RULES:
        if rel.startswith(prefix):
            return scale, trim, q
    return 0.625, True, 85


def side_view(im):
    """三视图：按透明列切出三个人，取中间那个（朝右的侧面）。"""
    a = im.getchannel('A'); w, h = a.size; px = a.load()
    cols = [any(px[x, y] > 40 for y in range(0, h, 2)) for x in range(w)]
    segs, start = [], None
    for x, c in enumerate(cols + [False]):
        if c and start is None: start = x
        if not c and start is not None:
            if x - start > 15: segs.append((start, x))
            start = None
    s = segs[1] if len(segs) >= 3 else segs[len(segs) // 2]
    side = im.crop((s[0], 0, s[1], h))
    return side.crop(side.getchannel('A').getbbox())


def save(img, rel_out, q, index, extra=None):
    out = os.path.join(DST, rel_out + '.webp')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    has_alpha = img.mode == 'RGBA' and img.getchannel('A').getextrema()[0] < 255
    img.save(out, 'WEBP', quality=q, method=6, **({} if has_alpha else {}))
    entry = {'src': 'assets/' + rel_out.replace(os.sep, '/') + '.webp', 'w': img.width, 'h': img.height}
    if extra: entry.update(extra)
    index[rel_out.replace(os.sep, '/')] = entry


def main():
    if not os.path.isdir(SRC):
        sys.exit(f'找不到原始素材目录：{SRC}')
    cfg = os.path.join(SRC, '动画帧配置.json')
    if os.path.exists(cfg):
        for f in json.load(open(cfg, encoding='utf8')):
            FRAMES[f['file'][:-4]] = f
    index, total_in, total_out = {}, 0, 0
    for root, _, files in os.walk(SRC):
        for fn in sorted(files):
            if not fn.lower().endswith('.png'): continue
            path = os.path.join(root, fn)
            rel = os.path.relpath(path, SRC).replace(os.sep, '/')[:-4]
            if rel.startswith(SKIP): continue
            total_in += os.path.getsize(path)
            im = Image.open(path).convert('RGBA')
            scale, trim, q = rule_for(rel)
            if rel.endswith('turnaround'):
                # 只要侧面像，存成 side
                side = side_view(im)
                h = 360 if rel.startswith('boss') else 320
                side = side.resize((max(1, round(side.width * h / side.height)), h), Image.LANCZOS)
                # 脚底中心：最下面 12% 行里不透明像素的平均横坐标（背篓、长袍会让人物不在正中）
                a = side.getchannel('A'); px = a.load(); xs = []
                for y in range(int(side.height * 0.88), side.height):
                    xs += [x for x in range(side.width) if px[x, y] > 128]
                foot = (sum(xs) / len(xs) / side.width) if xs else 0.5
                save(side, rel.replace('turnaround', 'side'), 88, index, {'footX': round(foot, 3)})
                continue
            extra = None
            if rel in FRAMES:
                f = FRAMES[rel]
                fw, fh = round(f['frameWidth'] * scale), round(f['frameHeight'] * scale)
                im = im.resize((fw * f['frameCount'], fh), Image.LANCZOS)
                extra = {'frames': f['frameCount'], 'fw': fw, 'fh': fh}
            else:
                if trim:
                    bb = im.getchannel('A').getbbox()
                    if bb: im = im.crop(bb)
                if scale != 1.0:
                    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
            save(im, rel, q, index, extra)
    # 小游戏 / 网页图标
    icon = os.path.join(SRC, 'ui', 'app_icon.png')
    if os.path.exists(icon):
        Image.open(icon).convert('RGB').resize((192, 192), Image.LANCZOS).save(os.path.join(DST, 'ui', 'favicon.png'))
    with open(os.path.join(DST, 'index.js'), 'w', encoding='utf8') as fp:
        fp.write('// 由 tools/build_assets.py 生成，不要手改\nwindow.ASSET_LIST = ')
        json.dump(index, fp, ensure_ascii=False, indent=1)
        fp.write(';\n')
    for root, _, files in os.walk(DST):
        for fn in files: total_out += os.path.getsize(os.path.join(root, fn))
    print(f'处理 {len(index)} 个素材：{total_in / 1e6:.1f} MB → {total_out / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
