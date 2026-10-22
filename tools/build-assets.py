#!/usr/bin/env python3
"""Builds the compressed game assets in assets/ from the untouched originals in asset/.

Backgrounds are re-encoded as WebP with a water mask each; the raft is fitted into the cell
the game registers to; the title's shape fish and the natural fish of the levels are sliced
from their sheets into atlases measured into src/sprite-data.js. The generated character,
winch, net and panel art in assets/generated/ is used whole, as it is (see
tools/generated-art-prompts.txt); the game loads WebP copies of it from assets/generated-web/,
the same pictures at the same size in about a fifth of the bytes. `--generated` rebuilds only
those copies (run it whenever a file in assets/generated/ changes; tests/assets.py checks).
`--logo` rebuilds only the banner's logo.

Requires Pillow (pip install Pillow).
"""
import base64
import hashlib
import json
import math
import os
import sys
from collections import deque

from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'asset')
OUT = os.path.join(ROOT, 'assets')

BACKGROUNDS = [
    'bg6, 2026 at 02_26_02 PM-1.png',
    'bg6, 2026 at 02_26_04 PM-2.png',
    'bg6, 2026 at 02_26_06 PM-3.png',
    'bg6, 2026 at 02_26_08 PM-4.png',
]
PLAY_BUTTON = 'play-button.png'
HINT_HAND = 'hint-hand.png'
# The fish Popo nets: natural cartoon fish, six to a sheet (2 columns x 3 rows), sliced by grid
# cell. Fish too close in colour to the water vanish in it, so the blue and teal ones are left
# out (None), and the build checks every fish's body colour against the water as well. The
# last sheet repeats two fish from the first; those are left out too.
NATURAL_FISH_SHEETS = [
    ('fish-natural-1.png', [['red-dots', None], ['green-spots', 'pink-scales'], ['clownfish', 'purple-spots']]),
    ('fish-natural-2.png', [['orange-stripes', None], ['violet-scales', 'green-stripes'], [None, 'red-hearts']]),
    ('fish-natural-3.png', [[None, None], ['purple-stripes', 'orange-dots'], ['lime-waves', None]]),
    ('fish-natural-4.png', [['orange-spots', None], ['green-dots', 'pink-stripes'], [None, None]]),
]
NATURAL_FISH_SCALE = 0.42  # the sheets are drawn big; the game draws the atlas at its `scale`
# The water behind the fish is about this colour; a body colour must be at least this far away.
WATER_RGB = (1, 132, 242)
MIN_WATER_CONTRAST = 140
# The raft with its bucket (the left part of the props art), drawn under Popo. The game
# registers it inside a 418px cell: rope-to-rope width and its bottom log.
PROPS = 'props-new.png'
RAFT_CELL = dict(left=5, right=367, bottom=383)
# The shape fish that circle the play button on the title, sliced by grid cell. None marks art
# the game does not use: an irregular 9-gon, a capsule with no standard school name, and
# duplicates of shapes already present. The second sheet is drawn at about twice the scale, so
# it is halved to match.
FISH_SHEETS = [
    ('ChatGPT Image Oct 9, 2026 at 12_57_21 PM-1.png', 4, 1.0, [
        ['triangle', 'square', 'rectangle', 'circle'],
        ['rhombus', 'parallelogram', 'trapezium', 'pentagon'],
        ['hexagon', None, 'octagon', 'nonagon'],
        ['decagon', 'oval', None, 'semicircle'],
    ]),
    ('ChatGPT Image Oct 9, 2026 at 12_57_22 PM-2.png', 2, 0.5, [
        ['triangle-right', None],
        [None, None],
    ]),
]


def body_colour(piece):
    # the average of the vivid body pixels (pale fins, white eyes and dark outlines left out)
    px = [p for p in piece.resize((max(1, piece.size[0] // 4), max(1, piece.size[1] // 4))).getdata()
          if p[3] > 220 and max(p[:3]) > 60 and (max(p[:3]) - min(p[:3])) / max(p[:3]) > 0.5]
    return tuple(sum(p[i] for p in px) / len(px) for i in range(3)) if px else WATER_RGB


def largest_part(im):
    """Keep only the largest opaque piece of a cell, dropping stray specks around the fish."""
    w, h = im.size
    alpha = im.getchannel('A').load()
    seen = bytearray(w * h)
    best = []
    for sy in range(h):
        for sx in range(w):
            if alpha[sx, sy] <= 20 or seen[sy * w + sx]:
                continue
            part, q = [], deque([(sx, sy)])
            seen[sy * w + sx] = 1
            while q:
                x, y = q.popleft()
                part.append((x, y))
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < w and 0 <= ny < h and alpha[nx, ny] > 20 and not seen[ny * w + nx]:
                            seen[ny * w + nx] = 1
                            q.append((nx, ny))
            if len(part) > len(best):
                best = part
    keep = Image.new('L', (w, h), 0)
    kp = keep.load()
    for x, y in best:
        kp[x, y] = 255
    # keep the soft edge pixels around the piece, nothing further out
    keep = keep.filter(ImageFilter.MaxFilter(3))
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(im, (0, 0), keep)
    return out.crop(keep.getbbox())


def slice_cell(sheet, cols, rows, col, row):
    """One fish from a gridded sheet. Fish can poke past their grid cell (the rhombus does), so
    the cell is sliced with a margin; bits of neighbouring fish in the margin are smaller
    pieces and get dropped."""
    cw, ch = sheet.size[0] // cols, sheet.size[1] // rows
    m = min(cw, ch) // 8
    window = (max(0, col * cw - m), max(0, row * ch - m), min(sheet.size[0], (col + 1) * cw + m), min(sheet.size[1], (row + 1) * ch + m))
    return largest_part(sheet.crop(window))


def shrink(piece, k):
    # premultiplied, so colour kept under fully transparent pixels can't bleed into the edges
    return piece.convert('RGBa').resize((round(piece.size[0] * k), round(piece.size[1] * k)), Image.LANCZOS).convert('RGBA')


def pack(sprites, pad=8, width=2048):
    """Packs (key, image) sprites into rows of one atlas; returns the atlas and each key's box."""
    x = y = row_h = 0
    places = []
    for key, piece in sprites:
        if x + piece.size[0] + pad > width:
            x, y, row_h = 0, y + row_h + pad, 0
        places.append((key, piece, x, y))
        x += piece.size[0] + pad
        row_h = max(row_h, piece.size[1])
    atlas = Image.new('RGBA', (width, y + row_h), (0, 0, 0, 0))
    boxes = {}
    for key, piece, px_, py_ in places:
        atlas.alpha_composite(piece, (px_, py_))
        boxes[key] = [px_, py_, px_ + piece.size[0], py_ + piece.size[1]]
    return atlas, boxes


def build_fish_atlas():
    sprites = []
    for name, grid, scale, names in FISH_SHEETS:
        sheet = Image.open(os.path.join(SRC, name)).convert('RGBA')
        for row in range(grid):
            for col in range(grid):
                key = names[row][col]
                if key:
                    piece = slice_cell(sheet, grid, grid, col, row)
                    sprites.append((key, shrink(piece, scale) if scale != 1 else piece))
    atlas, boxes = pack(sprites)
    atlas.save(os.path.join(OUT, 'sprites', 'fish.webp'), 'WEBP', quality=90, method=6)
    print('shape fish', len(boxes), atlas.size)
    return dict(width=atlas.size[0], height=atlas.size[1], boxes=boxes)


def build_natural_fish():
    sprites = []
    for name, names in NATURAL_FISH_SHEETS:
        sheet = Image.open(os.path.join(SRC, name)).convert('RGBA')
        for row, keys in enumerate(names):
            for col, key in enumerate(keys):
                if not key:
                    continue
                piece = slice_cell(sheet, len(keys), len(names), col, row)
                contrast = math.dist(body_colour(piece), WATER_RGB)
                if contrast < MIN_WATER_CONTRAST:
                    print(f'  left out {key}: too close to the water colour ({contrast:.0f})')
                    continue
                sprites.append((key, shrink(piece, NATURAL_FISH_SCALE)))
    atlas, boxes = pack(sprites)
    atlas.save(os.path.join(OUT, 'sprites', 'fish-natural.webp'), 'WEBP', quality=90, method=6)
    print('natural fish', len(boxes), atlas.size)
    return dict(width=atlas.size[0], height=atlas.size[1], scale=0.44, boxes=boxes)


def water_mask(im):
    """Where the surface waves may move the painting: open water, not the snow, ice shelves and
    icebergs along the shoreline. Light pixels in the shoreline band that join the snow above are
    land; thin foam on the waves is not. Feathered so the waves fade out before the ice."""
    w, h = im.size
    band = (0, 250, w, 440)
    r = im.crop(band).getchannel('R')
    light = r.point(lambda v: 255 if v > 105 else 0).filter(ImageFilter.MinFilter(9)).filter(ImageFilter.MaxFilter(9))
    lp = light.load()
    bw, bh = light.size
    land = Image.new('L', light.size, 0)
    seen = set()
    q = deque((x, 0) for x in range(bw) if lp[x, 0])
    seen.update(q)
    while q:
        x, y = q.popleft()
        land.putpixel((x, y), 255)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < bw and 0 <= ny < bh and (nx, ny) not in seen and lp[nx, ny]:
                seen.add((nx, ny))
                q.append((nx, ny))
    land = land.filter(ImageFilter.MaxFilter(31)).filter(ImageFilter.GaussianBlur(8))
    mask = Image.new('L', (w, h), 0)
    mask.paste(255, (0, band[3], w, h))
    mask.paste(Image.eval(land, lambda v: 255 - v), (0, band[1]))
    return mask.resize((w // 2, h // 2), Image.LANCZOS)


def build_props():
    """Fit the raft from the props art into its 418px cell (see RAFT_CELL)."""
    art = Image.open(os.path.join(SRC, PROPS)).convert('RGBA')
    raft_art = art.crop((0, 0, art.size[0] * 5 // 8, art.size[1]))
    px = raft_art.load()
    w, h = raft_art.size
    wide = [y for y in range(h) if sum(1 for x in range(0, w, 2) if px[x, y][3] > 128) * 2 > w * 0.4]
    band = [x for y in wide for x in range(w) if px[x, y][3] > 128]
    left, right, bottom = min(band), max(band), max(wide)
    k = (RAFT_CELL['right'] - RAFT_CELL['left']) / (right - left)
    raft = raft_art.resize((round(w * k), round(h * k)), Image.LANCZOS)
    cell = Image.new('RGBA', (418, 418), (0, 0, 0, 0))
    cell.alpha_composite(raft, (round(RAFT_CELL['left'] - left * k), round(RAFT_CELL['bottom'] - bottom * k)))
    cell.save(os.path.join(OUT, 'sprites', 'popo-props.webp'), lossless=True)


# The banner's logo (painted, transparent), trimmed and scaled for the stage. `--logo` rebuilds
# it alone and prints the top of its snow for LOGO_TOP in src/title.js (the fish peek over it).
LOGO = 'fishing-frenzy-2-logo.png'
LOGO_WIDTH = 1500


def build_logo():
    art = Image.open(os.path.join(SRC, LOGO)).convert('RGBA')
    box = art.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    art = art.crop((box[0] - 6, box[1] - 6, box[2] + 6, box[3] + 6))
    logo = art.resize((LOGO_WIDTH, round(art.height * LOGO_WIDTH / art.width)), Image.LANCZOS)
    path = os.path.join(OUT, 'sprites', 'logo.webp')
    logo.save(path, 'WEBP', quality=88, alpha_quality=92, method=6)
    alpha = logo.getchannel('A').load()
    top = []
    for x in range(40, logo.width - 40, 30):
        y = next((y for y in range(logo.height) if alpha[x, y] > 140), None)
        if y is not None:
            top.append([x, y])
    print('logo', logo.size, os.path.getsize(path) // 1024, 'KB')
    print('LOGO_TOP =', json.dumps(top).replace(' ', ''))


# The generated art the game draws on the canvas (the panel is the CSS cards' background and is
# loaded as it is).
GENERATED = ['popo-operating', 'winch-arched', 'rope', 'rope-connector', 'net']


def build_generated():
    """WebP copies of the generated art, same pixels in size, and the fingerprint of each source."""
    out = os.path.join(OUT, 'generated-web')
    os.makedirs(out, exist_ok=True)
    sources = {}
    for name in GENERATED:
        path = os.path.join(OUT, 'generated', f'{name}.png')
        with open(path, 'rb') as fh:
            sources[name] = hashlib.sha1(fh.read()).hexdigest()
        im = Image.open(path).convert('RGBA')
        im.save(os.path.join(out, f'{name}.webp'), 'WEBP', quality=92, alpha_quality=100, method=6)
        print('generated', name, im.size, os.path.getsize(os.path.join(out, f'{name}.webp')) // 1024, 'KB')
    with open(os.path.join(out, 'sources.json'), 'w') as fh:
        json.dump(sources, fh, indent=1, sort_keys=True)
        fh.write('\n')


def main():
    if '--generated' in sys.argv[1:]:
        build_generated()
        return
    if '--logo' in sys.argv[1:]:
        build_logo()
        return
    build_generated()
    os.makedirs(os.path.join(OUT, 'backgrounds'), exist_ok=True)
    os.makedirs(os.path.join(OUT, 'sprites'), exist_ok=True)
    for i, name in enumerate(BACKGROUNDS, start=1):
        im = Image.open(os.path.join(SRC, name)).convert('RGB')
        im.save(os.path.join(OUT, 'backgrounds', f'location-{i}.webp'), 'WEBP', quality=86, method=6)
        water_mask(im).save(os.path.join(OUT, 'backgrounds', f'water-{i}.png'), optimize=True)
        print('background', i, im.size)
    hand = Image.open(os.path.join(SRC, HINT_HAND)).convert('RGBA')
    hand.thumbnail((180, 216), Image.LANCZOS)
    hand.save(os.path.join(OUT, 'sprites', 'hint-hand.webp'), 'WEBP', quality=92, method=6)
    play = largest_part(Image.open(os.path.join(SRC, PLAY_BUTTON)).convert('RGBA'))
    play.thumbnail((512, 512), Image.LANCZOS)
    play.save(os.path.join(OUT, 'sprites', 'play.webp'), 'WEBP', quality=92, method=6)

    build_props()
    build_logo()
    fish = build_fish_atlas()
    natural = build_natural_fish()

    with open(os.path.join(ROOT, 'src', 'background-data.js'), 'w') as fh:
        fh.write('// Generated by tools/build-assets.py: the four backgrounds as data URLs so WebGL can use\n')
        fh.write('// them even when the game is opened straight from the file system.\n')
        fh.write('window.PopoGame = window.PopoGame || {};\nPopoGame.BACKGROUND_DATA = [\n')
        for i in range(1, len(BACKGROUNDS) + 1):
            with open(os.path.join(OUT, 'backgrounds', f'location-{i}.webp'), 'rb') as img:
                fh.write("  'data:image/webp;base64," + base64.b64encode(img.read()).decode() + "',\n")
        fh.write('];\nPopoGame.WATER_MASKS = [\n')
        for i in range(1, len(BACKGROUNDS) + 1):
            with open(os.path.join(OUT, 'backgrounds', f'water-{i}.png'), 'rb') as img:
                fh.write("  'data:image/png;base64," + base64.b64encode(img.read()).decode() + "',\n")
        fh.write('];\n')
        with open(os.path.join(OUT, 'sprites', 'play.webp'), 'rb') as img:
            fh.write("PopoGame.PLAY_DATA = 'data:image/webp;base64," + base64.b64encode(img.read()).decode() + "';\n")

    with open(os.path.join(ROOT, 'src', 'sprite-data.js'), 'w') as fh:
        fh.write('// Generated by tools/build-assets.py from the original sheets. Do not edit by hand.\n')
        fh.write('window.PopoGame = window.PopoGame || {};\n')
        fh.write('PopoGame.FISH_ATLAS = ' + json.dumps(fish) + ';\n')
        fh.write('PopoGame.FISH_NATURAL_ATLAS = ' + json.dumps(natural) + ';\n')
    print('wrote src/sprite-data.js')


if __name__ == '__main__':
    sys.exit(main())
