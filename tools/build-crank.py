#!/usr/bin/env python3
"""Popo's crank in sixteen steps: python3 tools/build-crank.py

The generated operating sheet (assets/generated/popo-operating.png) has four poses of Popo
turning his handwheel, a quarter turn apart. Four poses a turn can only step, so this makes the
three in-betweens of each quarter by optical flow (OpenCV's DIS flow both ways, each pose warped
part of the way toward the next and the two mixed, as frame interpolation does). The sixteen
frames are laid out four by four in assets/sprites/popo-crank.webp, every frame with the wheel's
shaft tip at the same point, and src/popo.js plays them, mixing each into the next as the wheel
turns. Where the paws cross the wheel the in-betweens blur, as a quick movement does. Drawn
in-betweens from Codex (same layout) would replace them as they are.

Requires Pillow, numpy and OpenCV (pip install Pillow numpy opencv-python-headless).
"""
import json
import os

import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'generated', 'popo-operating.png')
OUT = os.path.join(ROOT, 'assets', 'sprites', 'popo-crank.webp')
CELL = (694, 566)
SHAFT = [(657, 355.5), (616, 355.5), (661, 293.5), (616, 293)]  # as FRAMES in src/popo.js
STEPS = 4      # frames a quarter turn: the pose and three in-betweens
SCALE = 0.6    # of the sheet's pixels: still twice the size it is drawn at
PAD = (830, 730, 725, 425)  # working canvas, with every pose's shaft tip at (725, 425)


def pose(sheet, i):
    W, H, px, py = PAD
    x0, y0 = (i % 2) * CELL[0], (i // 2) * CELL[1]
    out = np.zeros((H, W, 4), np.float32)
    ox, oy = int(round(px - SHAFT[i][0])), int(round(py - SHAFT[i][1]))
    out[oy:oy + CELL[1], ox:ox + CELL[0]] = sheet[y0:y0 + CELL[1], x0:x0 + CELL[0]]
    out[..., :3] *= out[..., 3:]  # premultiplied, so warping and mixing keep edges clean
    return out


def gray(img):
    rgb = img[..., :3] + (1 - img[..., 3:]) * 0.35
    return cv2.cvtColor((rgb * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)


def warp(img, flow):
    h, w = flow.shape[:2]
    gx, gy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    return cv2.remap(img, gx + flow[..., 0], gy + flow[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=0)


def between(a, b, t, f01, f10):
    """The frame a fraction t of the way from a to b (linear flow approximation)."""
    ft0 = -(1 - t) * t * f01 + t * t * f10
    ft1 = (1 - t) * (1 - t) * f01 - t * (1 - t) * f10
    return (1 - t) * warp(a, ft0) + t * warp(b, ft1)


def main():
    sheet = np.asarray(Image.open(SRC).convert('RGBA')).astype(np.float32) / 255
    poses = [pose(sheet, i) for i in range(4)]
    dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
    frames = []
    for i in range(4):
        a, b = poses[i], poses[(i + 1) % 4]
        ga, gb = gray(a), gray(b)
        f01, f10 = dis.calc(ga, gb, None), dis.calc(gb, ga, None)
        frames.append(a)
        frames.extend(between(a, b, s / STEPS, f01, f10) for s in range(1, STEPS))
    # crop every frame to what any of them covers, keeping the shaft tip in one place
    cover = np.max([f[..., 3] for f in frames], axis=0) > 0.01
    ys, xs = np.nonzero(cover)
    x0, y0, x1, y1 = xs.min() - 2, ys.min() - 2, xs.max() + 3, ys.max() + 3
    fw, fh = round((x1 - x0) * SCALE), round((y1 - y0) * SCALE)
    atlas = Image.new('RGBA', (fw * 4, fh * 4), (0, 0, 0, 0))
    for k, f in enumerate(frames):
        f = f[y0:y1, x0:x1]
        a = np.clip(f[..., 3:], 0, 1)
        rgb = np.where(a > 1e-4, f[..., :3] / np.maximum(a, 1e-4), 0)  # back to straight alpha
        img = Image.fromarray((np.clip(np.dstack([rgb, a]), 0, 1) * 255).astype(np.uint8))
        atlas.paste(img.resize((fw, fh), Image.LANCZOS), ((k % 4) * fw, (k // 4) * fh))
    atlas.save(OUT, 'WEBP', quality=88, alpha_quality=92, method=6)
    meta = {'frames': len(frames), 'columns': 4, 'width': fw, 'height': fh, 'scale': SCALE,
            'shaft': [round((PAD[2] - x0) * SCALE, 2), round((PAD[3] - y0) * SCALE, 2)]}
    print('crank', atlas.size, os.path.getsize(OUT) // 1024, 'KB')
    print('POPO_CRANK =', json.dumps(meta))


if __name__ == '__main__':
    main()
